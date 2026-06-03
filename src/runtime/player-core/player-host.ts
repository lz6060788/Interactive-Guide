import type {
  HtmlIframePreloadStrategy,
  PublishManifest,
  PublishHotspot,
  PublishNode,
  RegionOverlayCard,
  RuntimeAction,
  RuntimeConfig,
} from '../../shared/types.js'
import { getResolutionDimensions } from '../../shared/utils.js'
import {
  HtmlNodeBridge,
  type HtmlNodeBackRequestPayload,
  type HtmlNodeBackResponsePayload,
  type HtmlNodeBridgeHostPort,
  type HtmlNodeBridgeHtmlRouteOpenMode,
  type HtmlNodeRouteRequestPayload,
  type HtmlNodeRouteResponsePayload,
} from './html-node-bridge.js'
import PlayerCore from './player-core.js'
import {
  clampRegionOffsetX,
  resolveInitialRegionViewport,
  type RegionViewportSolveResult,
} from './region-viewport.js'

export interface PlayerHostRefs {
  viewport: HTMLElement
  stage: HTMLElement
  container: HTMLElement
  nodeImage: HTMLImageElement
  nodeIframe: HTMLIFrameElement
  video: HTMLVideoElement
  hotspots: HTMLElement
}

export interface PlayerHostState {
  manifest: PublishManifest | null
  currentNode: PublishNode | null
  currentNodeId: string
  transitioning: boolean
  preloading: boolean
  history: string[]
}

interface PlayerHostOptions {
  onStateChange?: (state: PlayerHostState) => void
  onError?: (error: Error) => void
  onHtmlRouteRequest?: (payload: {
    route: string
    reason?: string
    openMode: HtmlNodeBridgeHtmlRouteOpenMode
    resolvedUrl: string
  }) => boolean | void
  layout?: {
    mode?: 'contain-center' | 'immersive-mobile'
    getViewport?: () => { width: number; height: number }
  }
  runtimeConfig?: RuntimeConfig
}

type DragState = {
  active: boolean
  pointerId: number | null
  startX: number
  startY: number
  startOffsetX: number
  startOffsetY: number
  moved: boolean
}

type HtmlIframeEntry = {
  iframe: HTMLIFrameElement
  ready: boolean
  readyPromise: Promise<void>
  preloadSettled: boolean
  cleanup: () => void
}

const HOTSPOT_SIZE = 28
const BACK_ICON_SVG = `
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M512 78.769231c240.246154 0 433.230769 192.984615 433.230769 433.230769s-192.984615 433.230769-433.230769 433.230769S78.769231 752.246154 78.769231 512 271.753846 78.769231 512 78.769231m0-78.769231C228.430769 0 0 228.430769 0 512s228.430769 512 512 512 512-228.430769 512-512S795.569231 0 512 0z" fill="#2c2c2c"></path>
  <path d="M315.076923 468.676923h433.230769v78.769231H315.076923z" fill="#2c2c2c"></path>
  <path d="M236.859077 501.051077l275.692308-275.692308 55.72923 55.650462-275.692307 275.692307z" fill="#2c2c2c"></path>
  <path d="M294.203077 444.297846l275.731692 275.692308-55.689846 55.729231-275.692308-275.692308z" fill="#2c2c2c"></path>
</svg>
`
export class PlayerHost {
  private engine: PlayerCore
  private htmlNodeBridge: HtmlNodeBridge
  private dragState: DragState = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    moved: false,
  }
  private imageOffset = { x: 0, y: 0 }
  private destroyers: Array<() => void> = []
  private chromeRoot = document.createElement('div')
  private backControlEl = document.createElement('div')
  private backButtonEl = document.createElement('button')
  private backLabelEl = document.createElement('div')
  private dragHintEl = document.createElement('div')
  private activeContentType: 'image' | 'html' = 'image'
  private activeRegionLayout: RegionViewportSolveResult | null = null
  private htmlIframeLayer = document.createElement('div')
  private htmlIframeEntries = new Map<string, HtmlIframeEntry>()
  private htmlIframePreloading = false
  private htmlIframePreloadedScopes = new Set<string>()
  private activeHtmlIframeUrl = ''
  private viewportPointerDownTarget: EventTarget | null = null

  constructor(
    private refs: PlayerHostRefs,
    private options: PlayerHostOptions = {},
  ) {
    this.engine = new PlayerCore({
      container: refs.container,
      nodeImage: refs.nodeImage,
      nodeIframe: refs.nodeIframe,
      video: refs.video,
    })
    const htmlNodeBridgeHostPort: HtmlNodeBridgeHostPort = {
      getRuntimeSnapshot: this.getHtmlNodeBridgeRuntimeSnapshot,
      handleBackRequest: this.handleHtmlNodeBackRequest,
      handleRouteRequest: this.handleHtmlNodeRouteRequest,
      handleLegacyHotspotClick: edgeId => this.engine.handleHotspotById(edgeId),
    }
    this.htmlNodeBridge = new HtmlNodeBridge(htmlNodeBridgeHostPort)

    this.bindEvents()
    this.buildChrome()
    this.applyBaseStyles()
    this.emitState()
  }

  loadManifest(manifest: PublishManifest): void {
    this.engine.loadManifest(manifest)
    this.htmlIframePreloading = false
    this.htmlIframePreloadedScopes.clear()
    this.updateLayout()
    this.render()
  }

  updateRefs(nextRefs: Partial<PlayerHostRefs>): void {
    this.refs = {
      ...this.refs,
      ...nextRefs,
    }
    this.engine.updateRefs({
      container: this.refs.container,
      nodeImage: this.refs.nodeImage,
      nodeIframe: this.refs.nodeIframe,
      video: this.refs.video,
    })
    this.applyBaseStyles()
    this.mountChrome()
    this.updateLayout()
    this.render()
  }

  getState(): PlayerHostState {
    return {
      manifest: this.engine.getManifest(),
      currentNode: this.engine.getCurrentNode(),
      currentNodeId: this.engine.getCurrentNodeId(),
      transitioning: this.engine.isTransitioning(),
      preloading: this.isLoading(),
      history: this.engine.getHistory(),
    }
  }

  handleBack(): void {
    this.engine.handleBack()
  }

  handleHotspotById(edgeId: string): void {
    this.primeHtmlIframeForEdgeId(edgeId)
    this.engine.handleHotspotById(edgeId)
  }

  navigateByEdge(edgeId: string): boolean {
    const manifest = this.engine.getManifest()
    if (!manifest || this.engine.isTransitioning()) return false
    if (!manifest.edgeMap[edgeId]) return false
    this.handleHotspotById(edgeId)
    return true
  }

  navigateToNode(nodeId: string): boolean {
    const manifest = this.engine.getManifest()
    if (!manifest || this.engine.isTransitioning()) return false
    if (!manifest.nodeMap[nodeId]) return false

    const currentNodeId = this.engine.getCurrentNodeId()
    if (currentNodeId === nodeId) return true

    const directEdge = manifest.edges.find(edge =>
      edge.fromNodeId === currentNodeId && edge.toNodeId === nodeId)

    if (directEdge) {
      this.handleHotspotById(directEdge.id)
      return true
    }

    this.engine.navigateTo(nodeId)
    return true
  }

  updateLayout(): void {
    this.applyStageLayout()
    this.updateHotspotViewport()
  }

  destroy(): void {
    this.destroyers.forEach(dispose => dispose())
    this.destroyers = []
    this.htmlNodeBridge.destroy()
    this.htmlIframeEntries.forEach(entry => {
      entry.cleanup()
      entry.iframe.remove()
    })
    this.htmlIframeEntries.clear()
    this.htmlIframeLayer.remove()
    this.chromeRoot.remove()
    this.engine.destroy()
  }

  private bindEvents(): void {
    this.engine.on('stateChange', this.handleEngineStateChange)
    this.engine.on('error', this.handleEngineError)
    this.destroyers.push(() => this.engine.off('stateChange', this.handleEngineStateChange))
    this.destroyers.push(() => this.engine.off('error', this.handleEngineError))

    this.refs.nodeImage.addEventListener('load', this.handleNodeImageLoad)
    this.refs.nodeImage.addEventListener('pointerdown', this.handleNodeImagePointerDown)
    window.addEventListener('resize', this.handleWindowResize)
    this.refs.viewport.addEventListener('pointerdown', this.handleViewportPointerDown)
    this.refs.viewport.addEventListener('click', this.handleViewportClick)

    this.destroyers.push(() => this.refs.nodeImage.removeEventListener('load', this.handleNodeImageLoad))
    this.destroyers.push(() => this.refs.nodeImage.removeEventListener('pointerdown', this.handleNodeImagePointerDown))
    this.destroyers.push(() => window.removeEventListener('resize', this.handleWindowResize))
    this.destroyers.push(() => this.refs.viewport.removeEventListener('pointerdown', this.handleViewportPointerDown))
    this.destroyers.push(() => this.refs.viewport.removeEventListener('click', this.handleViewportClick))
    this.destroyers.push(() => this.detachDragListeners())
  }

  private handleEngineStateChange = (): void => {
    this.maybeStartHtmlIframePreload()
    this.render()
    requestAnimationFrame(() => {
      this.confirmHostVisualCommitIfReady('engine:stateChange:next-frame')
    })
  }

  private handleEngineError = (error: Error): void => {
    this.options.onError?.(error)
  }

  private handleNodeImageLoad = (): void => {
    this.updateHotspotViewport()
    requestAnimationFrame(() => {
      this.confirmHostVisualCommitIfReady('node-image:onLoad:next-frame')
    })
  }

  private handleWindowResize = (): void => {
    this.updateLayout()
  }

  private handleViewportPointerDown = (event: PointerEvent): void => {
    this.viewportPointerDownTarget = event.target
  }

  private handleViewportClick = (event: MouseEvent): void => {
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode || this.getNodeKind(currentNode) !== 'region') return
    if (this.engine.isTransitioning()) return
    if (this.dragState.moved) {
      this.dragState.moved = false
      return
    }

    const pointerDownTarget = this.viewportPointerDownTarget
    this.viewportPointerDownTarget = null
    if (this.isInteractiveRegionTarget(pointerDownTarget) || this.isInteractiveRegionTarget(event.target)) {
      return
    }

    if (this.engine.getHistory().length > 0) {
      this.engine.handleBack()
    }
  }

  private handleHtmlNodeBackRequest = (
    _payload: HtmlNodeBackRequestPayload | undefined,
  ): HtmlNodeBackResponsePayload => {
    const handled = this.engine.getHistory().length > 0
    if (handled) {
      this.engine.handleBack()
    }
    return {
      handled,
      runtime: this.getHtmlNodeBridgeRuntimeSnapshot(),
    }
  }

  private handleHtmlNodeRouteRequest = (
    payload: HtmlNodeRouteRequestPayload | undefined,
  ): HtmlNodeRouteResponsePayload => {
    const route = payload?.route?.trim()
    if (!route) {
      throw new Error('缺少可跳转的 route')
    }

    const openMode = payload?.openMode === 'new-tab' ? 'new-tab' : 'current-tab'
    const resolvedUrl = this.resolveHtmlRouteUrl(route)

    let handled = false
    const callbackResult = this.options.onHtmlRouteRequest?.({
      route,
      reason: payload?.reason,
      openMode,
      resolvedUrl,
    })

    if (typeof callbackResult === 'boolean') {
      handled = callbackResult
    } else if (this.options.onHtmlRouteRequest) {
      handled = true
    } else {
      handled = this.performDefaultHtmlRouteNavigation(resolvedUrl, openMode)
    }

    return {
      handled,
      route: resolvedUrl,
      openMode,
    }
  }

  private handleNodeImagePointerDown = (event: PointerEvent): void => {
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode) return

    if (this.getNodeKind(currentNode) === 'region') {
      if (!this.activeRegionLayout?.canPanHorizontally || !event.isPrimary) return
      event.preventDefault()
      this.dragState = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: this.imageOffset.x,
        startOffsetY: this.imageOffset.y,
        moved: false,
      }
      this.refs.nodeImage.style.cursor = 'grabbing'
      this.refs.nodeImage.setPointerCapture?.(event.pointerId)
      document.addEventListener('pointermove', this.handleDragMove)
      document.addEventListener('pointerup', this.handleDragEnd)
      document.addEventListener('pointercancel', this.handleDragEnd)
      return
    }

    const fitMode = currentNode.imageFitMode ?? 'fill'
    if (fitMode === 'fill') return
    if (!event.isPrimary) return

    event.preventDefault()
    this.dragState = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: this.imageOffset.x,
      startOffsetY: this.imageOffset.y,
      moved: false,
    }

    this.refs.nodeImage.style.cursor = 'grabbing'
    this.refs.nodeImage.setPointerCapture?.(event.pointerId)
    document.addEventListener('pointermove', this.handleDragMove)
    document.addEventListener('pointerup', this.handleDragEnd)
    document.addEventListener('pointercancel', this.handleDragEnd)
  }

  private handleDragMove = (event: PointerEvent): void => {
    if (!this.dragState.active) return
    if (this.dragState.pointerId !== null && event.pointerId !== this.dragState.pointerId) return

    if (
      Math.abs(event.clientX - this.dragState.startX) > 3
      || Math.abs(event.clientY - this.dragState.startY) > 3
    ) {
      this.dragState.moved = true
    }

    const currentNode = this.engine.getCurrentNode()
    if (!currentNode) return

    if (this.getNodeKind(currentNode) === 'region' && this.activeRegionLayout) {
      let nextX = this.dragState.startOffsetX + (event.clientX - this.dragState.startX)
      nextX = clampRegionOffsetX(nextX, this.activeRegionLayout)
      this.applyRegionImageTransform(nextX)
      requestAnimationFrame(() => {
        this.updateHotspotViewport()
      })
      return
    }

    const fitMode = currentNode.imageFitMode ?? 'fill'
    const containerRect = this.refs.container.getBoundingClientRect()
    const imageRect = this.refs.nodeImage.getBoundingClientRect()

    let nextX = this.dragState.startOffsetX
    let nextY = this.dragState.startOffsetY

    if (fitMode === 'fitHeight') {
      nextX += event.clientX - this.dragState.startX
      if (imageRect.width > containerRect.width) {
        const maxOffsetX = (imageRect.width - containerRect.width) / 2
        nextX = Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX))
      } else {
        nextX = 0
      }
      nextY = 0
    } else if (fitMode === 'fitWidth') {
      nextY += event.clientY - this.dragState.startY
      if (imageRect.height > containerRect.height) {
        const maxOffsetY = (imageRect.height - containerRect.height) / 2
        nextY = Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY))
      } else {
        nextY = 0
      }
      nextX = 0
    }

    this.applyImageTransform(nextX, nextY)
    requestAnimationFrame(() => {
      this.updateHotspotViewport()
    })
  }

  private handleDragEnd = (): void => {
    const pointerId = this.dragState.pointerId
    this.dragState.active = false
    this.dragState.pointerId = null
    this.detachDragListeners()
    if (pointerId !== null && this.refs.nodeImage.hasPointerCapture?.(pointerId)) {
      this.refs.nodeImage.releasePointerCapture(pointerId)
    }

    const currentNode = this.engine.getCurrentNode()
    if (this.getNodeKind(currentNode) === 'region') {
      this.refs.nodeImage.style.cursor = this.activeRegionLayout?.canPanHorizontally ? 'grab' : 'default'
      return
    }

    const fitMode = currentNode?.imageFitMode ?? 'fill'
    this.refs.nodeImage.style.cursor = fitMode === 'fill' ? 'default' : 'grab'
  }

  private emitState(): void {
    this.options.onStateChange?.(this.getState())
  }

  private buildChrome(): void {
    this.chromeRoot.dataset.playerHostChrome = 'true'
    this.chromeRoot.setAttribute('aria-hidden', 'false')

    this.backButtonEl.type = 'button'
    this.backButtonEl.setAttribute('aria-label', '返回上一页')
    this.backButtonEl.innerHTML = BACK_ICON_SVG
    this.backButtonEl.addEventListener('click', () => this.handleBack())

    this.backControlEl.appendChild(this.backButtonEl)
    this.backControlEl.appendChild(this.backLabelEl)
    this.chromeRoot.appendChild(this.backControlEl)
    this.chromeRoot.appendChild(this.dragHintEl)
  }

  private applyBaseStyles(): void {
    const { viewport, stage, container, nodeImage, nodeIframe, video, hotspots } = this.refs

    Object.assign(viewport.style, {
      position: 'relative',
      overflow: 'hidden',
      background: '#000',
    })

    Object.assign(stage.style, {
      position: 'absolute',
      overflow: 'hidden',
      background: '#000',
    })

    Object.assign(this.htmlIframeLayer.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '1',
      pointerEvents: 'none',
    })

    this.mountChrome()

    Object.assign(this.chromeRoot.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      zIndex: '50',
      overflow: 'hidden',
      pointerEvents: 'none',
      fontFamily: '"Noto Sans SC", "Noto Sans S Chinese", "PingFang SC", "Microsoft YaHei", sans-serif',
    })

    Object.assign(this.backControlEl.style, {
      position: 'absolute',
      left: '20px',
      top: '20px',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '10px',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 220ms ease',
    })

    Object.assign(this.backButtonEl.style, {
      width: '24px',
      height: '24px',
      minWidth: '24px',
      borderRadius: '0',
      border: 'none',
      background: 'transparent',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      cursor: 'pointer',
      pointerEvents: 'auto',
    })
    const backIcon = this.backButtonEl.querySelector('svg')
    if (backIcon) {
      ;(backIcon as SVGElement).style.width = '18px'
      ;(backIcon as SVGElement).style.height = '18px'
      ;(backIcon as SVGElement).style.display = 'block'
    }

    Object.assign(this.backLabelEl.style, {
      minHeight: '24px',
      maxWidth: '240px',
      fontStyle: 'normal',
      fontWeight: '700',
      fontSize: '16px',
      lineHeight: '24px',
      color: 'rgba(0, 0, 0, 0.84)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      textShadow: [
        '0 1px 0 rgba(255, 255, 255, 0.72)',
        '0 -1px 0 rgba(255, 255, 255, 0.72)',
        '1px 0 0 rgba(255, 255, 255, 0.72)',
        '-1px 0 0 rgba(255, 255, 255, 0.72)',
      ].join(', '),
      pointerEvents: 'none',
    })

    Object.assign(this.dragHintEl.style, {
      position: 'absolute',
      left: '50%',
      bottom: '28px',
      transform: 'translateX(-50%)',
      display: 'none',
      fontFamily: '"MiSans", "PingFang SC", "Microsoft YaHei", sans-serif',
      fontStyle: 'normal',
      fontWeight: '400',
      fontSize: '11px',
      lineHeight: '15px',
      textAlign: 'center',
      color: '#FFFFFF',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 220ms ease',
    })
    this.dragHintEl.textContent = '左右滑动查看完整场景'

    container.style.position = 'relative'
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.overflow = 'hidden'

    Object.assign(nodeImage.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      background: '#000',
      userSelect: 'none',
      visibility: 'visible',
      opacity: '1',
      pointerEvents: 'auto',
    })

    this.applyManagedIframeBaseStyle(nodeIframe)

    Object.assign(video.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      zIndex: '20',
      opacity: '0',
      pointerEvents: 'none',
    })

    Object.assign(hotspots.style, {
      position: 'absolute',
      zIndex: '10',
      left: '0px',
      top: '0px',
      width: '100%',
      height: '100%',
      opacity: '1',
      pointerEvents: 'none',
      transition: 'opacity 180ms ease',
    })

    if (this.htmlIframeLayer.parentElement !== container) {
      this.htmlIframeLayer.remove()
      container.appendChild(this.htmlIframeLayer)
    }
    if (nodeIframe.parentElement !== this.htmlIframeLayer) {
      this.htmlIframeLayer.appendChild(nodeIframe)
    }
  }

  private mountChrome(): void {
    if (this.chromeRoot.parentElement !== this.refs.viewport) {
      this.chromeRoot.remove()
      this.refs.viewport.appendChild(this.chromeRoot)
    }
  }

  private applyStageLayout(): void {
    const manifest = this.engine.getManifest()
    if (!manifest) return

    const viewportSize = this.resolveViewportSize()
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return

    const { width: designWidth, height: designHeight } = getResolutionDimensions(manifest.resolution)
    const designAspect = designWidth / Math.max(designHeight, 1)
    const viewportAspect = viewportSize.width / Math.max(viewportSize.height, 1)
    const layoutMode = this.options.layout?.mode ?? 'immersive-mobile'

    let stageWidth = viewportSize.width
    let stageHeight = viewportSize.width / Math.max(designAspect, 0.0001)
    let stageLeft = 0
    let stageTop = 0

    if (layoutMode === 'contain-center') {
      if (viewportAspect > designAspect) {
        stageHeight = viewportSize.height
        stageWidth = stageHeight * designAspect
      }
      stageLeft = (viewportSize.width - stageWidth) / 2
      stageTop = (viewportSize.height - stageHeight) / 2
    } else if (viewportAspect > designAspect) {
      stageTop = viewportSize.height - stageHeight
    } else {
      stageTop = (viewportSize.height - stageHeight) / 2
    }

    Object.assign(this.refs.stage.style, {
      left: `${stageLeft}px`,
      top: `${stageTop}px`,
      width: `${stageWidth}px`,
      height: `${stageHeight}px`,
      aspectRatio: `${designWidth} / ${designHeight}`,
    })
    this.updateChromeFrame(viewportSize.width, viewportSize.height, stageLeft, stageTop, stageWidth, stageHeight)
  }

  private resolveViewportSize(): { width: number; height: number } {
    const customViewport = this.options.layout?.getViewport?.()
    if (customViewport) {
      return customViewport
    }
    const rect = this.refs.viewport.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
    }
  }

  private updateChromeFrame(
    viewportWidth: number,
    viewportHeight: number,
    stageLeft: number,
    stageTop: number,
    stageWidth: number,
    stageHeight: number,
  ): void {
    const visibleLeft = Math.max(stageLeft, 0)
    const visibleTop = Math.max(stageTop, 0)
    const visibleRight = Math.min(stageLeft + stageWidth, viewportWidth)
    const visibleBottom = Math.min(stageTop + stageHeight, viewportHeight)
    const visibleWidth = Math.max(visibleRight - visibleLeft, 0)
    const visibleHeight = Math.max(visibleBottom - visibleTop, 0)

    Object.assign(this.chromeRoot.style, {
      left: `${visibleLeft}px`,
      top: `${visibleTop}px`,
      width: `${visibleWidth}px`,
      height: `${visibleHeight}px`,
      overflow: 'hidden',
    })
  }

  private render(): void {
    const state = this.getState()
    const { currentNode, preloading, transitioning } = state
    const corePreloading = this.engine.isPreloading()
    if (!currentNode) {
      this.renderChrome(state)
      this.emitState()
      return
    }

    if (this.refs.stage) {
      this.refs.stage.hidden = corePreloading
    }

    if (corePreloading) {
      this.renderChrome(state)
      this.emitState()
      return
    }

    const nodeKind = this.getNodeKind(currentNode)
    if (nodeKind === 'html') {
      this.renderHtmlNode(currentNode, transitioning)
    } else if (nodeKind === 'region') {
      this.renderRegionNode(currentNode, transitioning)
    } else {
      this.renderImageNode(currentNode, transitioning)
    }

    requestAnimationFrame(() => {
      this.confirmHostVisualCommitIfReady('render:next-frame')
    })

    this.renderChrome(state)
    this.emitState()
  }

  private renderChrome(state: PlayerHostState): void {
    const currentNode = state.currentNode
    const hasBack = state.history.length > 0
    const nodeKind = this.getNodeKind(currentNode)
    const showHorizontalDragHint = nodeKind === 'region'
      ? !!this.activeRegionLayout?.canPanHorizontally
      : currentNode?.imageFitMode === 'fitHeight'
    const chromeVisible = !!currentNode && !state.transitioning && !state.preloading

    this.backControlEl.style.display = hasBack ? 'flex' : 'none'
    this.backControlEl.style.opacity = hasBack && chromeVisible ? '1' : '0'
    this.backControlEl.style.pointerEvents = hasBack && chromeVisible ? 'auto' : 'none'
    this.backLabelEl.textContent = currentNode?.title ?? currentNode?.id ?? ''

    this.dragHintEl.style.display = showHorizontalDragHint ? 'block' : 'none'
    this.dragHintEl.style.opacity = showHorizontalDragHint && chromeVisible ? '1' : '0'
  }

  private renderHtmlNode(currentNode: PublishNode, transitioning: boolean): void {
    this.activeRegionLayout = null
    this.activeContentType = 'html'
    const htmlUrl = currentNode.htmlUrl ?? ''
    const entry = this.ensureHtmlIframe(htmlUrl)
    this.activateHtmlIframe(htmlUrl)

    this.refs.nodeImage.style.visibility = 'hidden'
    this.refs.nodeImage.style.opacity = '0'
    this.refs.nodeImage.style.pointerEvents = 'none'
    this.refs.nodeIframe.style.visibility = entry.ready && !transitioning ? 'visible' : 'hidden'
    this.refs.nodeIframe.style.opacity = entry.ready && !transitioning ? '1' : '0'
    this.refs.nodeIframe.style.pointerEvents = entry.ready && !transitioning ? 'auto' : 'none'
    this.htmlIframeLayer.style.pointerEvents = entry.ready && !transitioning ? 'auto' : 'none'
    if (entry.ready && !transitioning) {
      this.htmlNodeBridge.activateNode({
        iframe: entry.iframe,
        node: currentNode,
      })
    } else {
      this.htmlNodeBridge.deactivateNode()
    }

    this.renderAnnotations(currentNode, transitioning)
    this.refs.hotspots.style.left = '0px'
    this.refs.hotspots.style.top = '0px'
    this.refs.hotspots.style.width = '100%'
    this.refs.hotspots.style.height = '100%'
    this.refs.hotspots.style.opacity = transitioning ? '0' : '1'
    requestAnimationFrame(() => {
      this.updateHotspotViewport()
    })
  }

  private renderImageNode(currentNode: PublishNode, transitioning: boolean): void {
    const fitMode = currentNode.imageFitMode ?? 'fill'
    this.activeRegionLayout = null
    this.activeContentType = 'image'
    this.activeHtmlIframeUrl = ''
    this.htmlNodeBridge.deactivateNode()

    this.refs.nodeImage.style.visibility = 'visible'
    this.refs.nodeImage.style.pointerEvents = transitioning ? 'none' : 'auto'
    this.hideAllManagedIframes()
    this.refs.nodeImage.src = currentNode.imageUrl ?? ''
    this.refs.nodeImage.alt = currentNode.title ?? currentNode.id
    this.refs.nodeImage.style.opacity = transitioning ? '0' : '1'

    this.applyImageFitMode(fitMode)

    this.renderAnnotations(currentNode, transitioning)
    this.refs.hotspots.style.left = '0px'
    this.refs.hotspots.style.top = '0px'
    this.refs.hotspots.style.width = '100%'
    this.refs.hotspots.style.height = '100%'
    this.refs.hotspots.style.opacity = transitioning ? '0' : '1'

    requestAnimationFrame(() => {
      if (fitMode !== 'fill') {
        this.applyImageTransform(0, 0)
      }
      this.updateHotspotViewport()
    })
  }

  private renderRegionNode(currentNode: PublishNode, transitioning: boolean): void {
    const manifest = this.engine.getManifest()
    const sourceNode = currentNode.regionViewport
      ? manifest?.nodeMap[currentNode.regionViewport.sourceNodeId]
      : undefined

    if (!manifest || !currentNode.regionViewport || !sourceNode?.imageUrl) {
      this.activeRegionLayout = null
      this.renderImageNode(currentNode, transitioning)
      return
    }

    this.activeContentType = 'image'
    this.activeHtmlIframeUrl = ''
    this.htmlNodeBridge.deactivateNode()
    this.hideAllManagedIframes()

    this.activeRegionLayout = resolveInitialRegionViewport({
      viewportWidth: this.refs.container.clientWidth,
      viewportHeight: this.refs.container.clientHeight,
      sourceAspect: this.engine.getSourceNodeAspectRatio(sourceNode) ?? (sourceNode.imageUrl === this.refs.nodeImage.currentSrc || sourceNode.imageUrl === this.refs.nodeImage.src
        ? this.refs.nodeImage.naturalWidth / Math.max(this.refs.nodeImage.naturalHeight, 1)
        : 1),
      regionViewport: currentNode.regionViewport,
      imageFitMode: currentNode.imageFitMode,
    })

    this.refs.nodeImage.style.visibility = 'visible'
    this.refs.nodeImage.style.pointerEvents = transitioning ? 'none' : 'auto'
    this.refs.nodeImage.src = sourceNode.imageUrl
    this.refs.nodeImage.alt = currentNode.title ?? currentNode.id
    this.refs.nodeImage.style.opacity = transitioning ? '0' : '1'

    this.applyRegionImageLayout(this.activeRegionLayout)
    this.renderAnnotations(currentNode, transitioning)

    this.refs.hotspots.style.opacity = transitioning ? '0' : '1'
    requestAnimationFrame(() => {
      this.updateHotspotViewport()
    })
  }

  private applyImageFitMode(fitMode: string): void {
    const { nodeImage, container } = this.refs
    this.imageOffset = { x: 0, y: 0 }

    nodeImage.style.maxWidth = 'none'
    nodeImage.style.maxHeight = 'none'
    nodeImage.style.cursor = fitMode === 'fill' ? 'default' : 'grab'
    nodeImage.style.touchAction = fitMode === 'fill' ? 'auto' : 'none'
    nodeImage.style.position = 'absolute'
    nodeImage.style.left = ''
    nodeImage.style.top = ''
    nodeImage.style.width = '100%'
    nodeImage.style.height = '100%'
    nodeImage.style.objectFit = 'fill'
    nodeImage.style.objectPosition = '50% 50%'
    nodeImage.style.transform = ''
    nodeImage.style.clipPath = ''
    container.style.overflow = fitMode === 'fill' ? 'visible' : 'hidden'

    if (fitMode === 'fitHeight') {
      nodeImage.style.left = '50%'
      nodeImage.style.top = '50%'
      nodeImage.style.width = 'auto'
      nodeImage.style.height = '100%'
      nodeImage.style.objectFit = ''
      nodeImage.style.objectPosition = ''
      nodeImage.style.transform = 'translate(-50%, -50%)'
    } else if (fitMode === 'fitWidth') {
      nodeImage.style.left = '50%'
      nodeImage.style.top = '50%'
      nodeImage.style.width = '100%'
      nodeImage.style.height = 'auto'
      nodeImage.style.objectFit = ''
      nodeImage.style.objectPosition = ''
      nodeImage.style.transform = 'translate(-50%, -50%)'
    }
  }

  private applyRegionImageLayout(layout: RegionViewportSolveResult): void {
    const { nodeImage, container } = this.refs
    this.imageOffset = { x: layout.offsetX, y: layout.offsetY }

    container.style.overflow = 'hidden'
    nodeImage.style.position = 'absolute'
    nodeImage.style.left = '0'
    nodeImage.style.top = '0'
    nodeImage.style.width = `${layout.scaledImageWidth}px`
    nodeImage.style.height = `${layout.scaledImageHeight}px`
    nodeImage.style.maxWidth = 'none'
    nodeImage.style.maxHeight = 'none'
    nodeImage.style.objectFit = 'fill'
    nodeImage.style.objectPosition = '50% 50%'
    nodeImage.style.transform = `translate(${layout.offsetX}px, ${layout.offsetY}px)`
    nodeImage.style.clipPath = layout.clipPath
    nodeImage.style.cursor = layout.canPanHorizontally ? 'grab' : 'default'
    nodeImage.style.touchAction = layout.canPanHorizontally ? 'none' : 'auto'
  }

  private applyImageTransform(offsetX: number, offsetY: number): void {
    const currentNode = this.engine.getCurrentNode()
    const fitMode = currentNode?.imageFitMode ?? 'fill'
    const nextX = fitMode === 'fitHeight' ? offsetX : 0
    const nextY = fitMode === 'fitWidth' ? offsetY : 0
    this.imageOffset = { x: nextX, y: nextY }
    this.refs.nodeImage.style.transform = `translate(-50%, -50%) translate(${nextX}px, ${nextY}px)`
  }

  private applyRegionImageTransform(offsetX: number): void {
    if (!this.activeRegionLayout) return
    this.imageOffset = { x: offsetX, y: this.activeRegionLayout.offsetY }
    this.refs.nodeImage.style.transform = `translate(${offsetX}px, ${this.activeRegionLayout.offsetY}px)`
  }

  private getImageHorizontalPanRange(): { min: number; max: number } {
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode || (currentNode.imageFitMode ?? 'fill') !== 'fitHeight') {
      return { min: 0, max: 0 }
    }

    const containerRect = this.refs.container.getBoundingClientRect()
    const imageRect = this.refs.nodeImage.getBoundingClientRect()
    if (imageRect.width <= containerRect.width) {
      return { min: 0, max: 0 }
    }

    const maxOffsetX = (imageRect.width - containerRect.width) / 2
    return {
      min: -maxOffsetX,
      max: maxOffsetX,
    }
  }

  private detachDragListeners(): void {
    document.removeEventListener('pointermove', this.handleDragMove)
    document.removeEventListener('pointerup', this.handleDragEnd)
    document.removeEventListener('pointercancel', this.handleDragEnd)
  }

  private renderAnnotations(currentNode: PublishNode | null, transitioning: boolean): void {
    this.refs.hotspots.innerHTML = ''
    for (const hotspot of currentNode?.hotspots ?? []) {
      this.refs.hotspots.appendChild(this.createHotspotButton(hotspot, currentNode))
    }
    if (!transitioning && this.getNodeKind(currentNode) === 'region' && currentNode?.regionOverlay) {
      for (const card of currentNode.regionOverlay.cards) {
        this.refs.hotspots.appendChild(this.createRegionOverlayCard(card))
      }
    }
    requestAnimationFrame(() => {
      this.updateHotspotViewport()
    })
  }

  private ensureHotspotAnimationStyle(): void {
    const styleId = 'hotspot-pulse-animation'
    if (document.getElementById(styleId)) return
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes hotspot-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `
    document.head.appendChild(style)
  }

  private createHotspotButton(hotspot: PublishHotspot, _node?: PublishNode | null): HTMLButtonElement {
    this.ensureHotspotAnimationStyle()

    const button = document.createElement('button')
    const label = document.createElement('span')

    button.type = 'button'
    button.title = hotspot.label
    button.style.position = 'absolute'
    button.style.left = `${hotspot.normalizedX * 100}%`
    button.style.top = `${hotspot.normalizedY * 100}%`
    button.style.transform = 'translate(-50%, -50%)'
    button.style.display = 'flex'
    button.style.flexDirection = 'row'
    button.style.alignItems = 'center'
    button.style.justifyContent = 'center'
    button.style.minWidth = '80px'
    button.style.height = '28px'
    button.style.padding = '5px 10px'
    button.style.borderRadius = '6px'
    button.style.border = '1px solid #000000'
    button.style.background = 'rgba(255, 255, 255, 0.9)'
    button.style.color = 'rgba(0, 0, 0, 0.84)'
    button.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.16)'
    button.style.cursor = 'pointer'
    button.style.pointerEvents = 'auto'
    button.style.whiteSpace = 'nowrap'
    button.style.zIndex = '1'
    button.style.maxWidth = '180px'
    button.style.animation = 'hotspot-pulse 2.5s ease-in-out infinite'

    label.textContent = hotspot.label
    label.style.display = 'block'
    label.style.overflow = 'hidden'
    label.style.textOverflow = 'ellipsis'
    label.style.fontFamily = '"Noto Sans SC", "Noto Sans S Chinese", "PingFang SC", "Microsoft YaHei", sans-serif'
    label.style.fontStyle = 'normal'
    label.style.fontWeight = '400'
    label.style.fontSize = '12px'
    label.style.lineHeight = '18px'
    label.style.textAlign = 'center'
    label.style.color = 'inherit'
    button.appendChild(label)

    if (hotspot.style?.trim()) {
      button.style.cssText += `;${hotspot.style}`
    }

    button.addEventListener('click', () => {
      this.handleHotspotNavigation(hotspot)
    })

    return button
  }

  private createRegionOverlayCard(card: RegionOverlayCard): HTMLDivElement {
    const root = document.createElement('div')
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    const title = document.createElement('div')

    root.style.position = 'absolute'
    root.style.left = `${card.anchor.x * 100}%`
    root.style.top = `${card.anchor.y * 100}%`
    root.style.transform = 'translate(-50%, -50%)'
    root.style.pointerEvents = 'auto'
    root.style.zIndex = '2'
    root.dataset.regionOverlayCard = 'true'

    outer.style.boxSizing = 'border-box'
    outer.style.background = 'rgba(255, 255, 255, 0.92)'
    outer.style.border = '1px solid #000'
    outer.style.borderRadius = '6px'
    outer.style.padding = '5px 10px'
    outer.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.16)'

    inner.style.display = 'flex'
    inner.style.flexDirection = 'column'
    inner.style.alignItems = 'center'
    inner.style.justifyContent = 'center'
    inner.style.gap = '2px'

    title.textContent = card.title
    title.style.fontFamily = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'
    title.style.fontSize = '12px'
    title.style.fontWeight = '400'
    title.style.lineHeight = '18px'
    title.style.color = 'rgba(0, 0, 0, 0.84)'
    title.style.textAlign = 'center'
    title.style.whiteSpace = 'nowrap'
    inner.appendChild(title)

    const distinctTags = (card.tags ?? []).filter(tagText =>
      !(card.stocks ?? []).some(stock => stock.label === tagText))

    if (distinctTags.length) {
      const tagRow = document.createElement('div')
      tagRow.style.display = 'flex'
      tagRow.style.flexDirection = 'row'
      tagRow.style.alignItems = 'flex-start'
      tagRow.style.gap = '4px'
      for (const tagText of distinctTags) {
        const tag = document.createElement('span')
        tag.textContent = tagText
        Object.assign(tag.style, {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3px 10px',
          borderRadius: '8px',
          background: '#FF2436',
          fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: '10px',
          fontWeight: '500',
          lineHeight: '15px',
          color: '#fff',
          whiteSpace: 'nowrap',
        })
        tagRow.appendChild(tag)
      }
      inner.appendChild(tagRow)
    }

    if (card.stocks?.length) {
      const stockRow = document.createElement('div')
      stockRow.style.display = 'flex'
      stockRow.style.flexDirection = 'row'
      stockRow.style.alignItems = 'flex-start'
      stockRow.style.gap = '4px'
      stockRow.style.flexWrap = 'wrap'
      for (const stock of card.stocks) {
        const stockBtn = document.createElement(stock.action ? 'button' : 'span')
        stockBtn.textContent = stock.label
        ;(stockBtn as HTMLElement).dataset.regionOverlayStock = 'true'
        Object.assign(stockBtn.style, {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3px 10px',
          borderRadius: '8px',
          background: '#FF2436',
          fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: '10px',
          fontWeight: '500',
          lineHeight: '15px',
          color: '#fff',
          whiteSpace: 'nowrap',
          border: 'none',
        })
        if (stock.action) {
          ;(stockBtn as HTMLButtonElement).type = 'button'
          stockBtn.style.cursor = 'pointer'
          stockBtn.addEventListener('click', event => {
            event.preventDefault()
            event.stopPropagation()
            this.executeRuntimeAction(stock.action as RuntimeAction)
          })
        }
        stockRow.appendChild(stockBtn)
      }
      inner.appendChild(stockRow)
    }

    outer.appendChild(inner)
    root.appendChild(outer)
    return root
  }

  private updateHotspotViewport(): void {
    const { container, nodeImage, nodeIframe, hotspots, stage } = this.refs
    if (stage.hidden) return

    const mediaRect = container.getBoundingClientRect()
    const contentEl = this.activeContentType === 'html' ? nodeIframe : nodeImage
    const contentRect = contentEl.getBoundingClientRect()

    if (!mediaRect.width || !mediaRect.height || !contentRect.width || !contentRect.height) {
      return
    }

    hotspots.style.left = `${contentRect.left - mediaRect.left}px`
    hotspots.style.top = `${contentRect.top - mediaRect.top}px`
    hotspots.style.width = `${contentRect.width}px`
    hotspots.style.height = `${contentRect.height}px`
    hotspots.style.clipPath = this.activeRegionLayout?.clipPath ?? ''
  }

  private confirmHostVisualCommitIfReady(reason: string): void {
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode) return

    const pendingKind = this.engine.getPendingVisualCommitKind()
    if (this.engine.isTransitioning() && !pendingKind) return
    if (
      pendingKind === 'builtin'
      && reason !== 'node-image:onLoad:next-frame'
      && reason !== 'node-iframe:onLoad:next-frame'
    ) {
      if (this.getNodeKind(currentNode) !== 'html' || !this.isActiveHtmlIframeReady()) {
        return
      }
    }

    if (this.getNodeKind(currentNode) === 'html') {
      if (!this.isActiveHtmlIframeReady()) return
    } else {
      const expectedNode = this.getNodeKind(currentNode) === 'region'
        ? this.getRegionSourceNode(currentNode)
        : currentNode
      const expectedSrc = this.toAbsoluteUrl(expectedNode?.imageUrl ?? '')
      const actualSrc = this.refs.nodeImage.currentSrc || this.refs.nodeImage.src
      if (!this.refs.nodeImage.complete || actualSrc !== expectedSrc) return
    }

    this.engine.confirmHostVisualCommitted()
  }

  private toAbsoluteUrl(url: string): string {
    return new URL(url, window.location.href).href
  }

  private isInteractiveRegionTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return !!target.closest('[data-region-overlay-card="true"], [data-region-overlay-stock="true"], button')
  }

  private resolveHtmlRouteUrl(route: string): string {
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(route)) {
      return new URL(route).toString()
    }

    if (route.startsWith('/')) {
      return new URL(route, window.location.origin).toString()
    }

    if (
      route.startsWith('./')
      || route.startsWith('../')
      || route.startsWith('?')
      || route.startsWith('#')
    ) {
      return new URL(route, window.location.href).toString()
    }

    return new URL(`/${route.replace(/^\/+/, '')}`, window.location.origin).toString()
  }

  private performDefaultHtmlRouteNavigation(
    resolvedUrl: string,
    openMode: HtmlNodeBridgeHtmlRouteOpenMode,
  ): boolean {
    if (openMode === 'new-tab') {
      return !!window.open(resolvedUrl, '_blank', 'noopener,noreferrer')
    }

    window.open(resolvedUrl, '_self')
    return true
  }

  private applyManagedIframeBaseStyle(iframe: HTMLIFrameElement): void {
    Object.assign(iframe.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      border: 'none',
      background: '#000',
      display: 'block',
      visibility: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
    })
  }

  private hideAllManagedIframes(): void {
    this.htmlIframeEntries.forEach(entry => {
      entry.iframe.style.visibility = 'hidden'
      entry.iframe.style.opacity = '0'
      entry.iframe.style.pointerEvents = 'none'
    })
    this.htmlIframeLayer.style.pointerEvents = 'none'
  }

  private activateHtmlIframe(htmlUrl: string): void {
    const absoluteUrl = this.toAbsoluteUrl(htmlUrl)
    const entry = this.htmlIframeEntries.get(absoluteUrl)
    if (!entry) return
    this.activeHtmlIframeUrl = absoluteUrl
    this.refs.nodeIframe = entry.iframe
    this.hideAllManagedIframes()
  }

  private isActiveHtmlIframeReady(): boolean {
    const entry = this.htmlIframeEntries.get(this.activeHtmlIframeUrl)
    return !!entry?.ready
  }

  private getHtmlNodeBridgeRuntimeSnapshot = (): {
    currentNodeId: string
    historyDepth: number
    canGoBack: boolean
  } => {
    const history = this.engine.getHistory()
    return {
      currentNodeId: this.engine.getCurrentNodeId(),
      historyDepth: history.length,
      canGoBack: history.length > 0,
    }
  }

  private isLoading(): boolean {
    const currentNode = this.engine.getCurrentNode()
    const waitingForActiveHtml = this.getNodeKind(currentNode) === 'html' && !this.isActiveHtmlIframeReady()
    return this.engine.isPreloading() || waitingForActiveHtml
  }

  private async preloadHtmlIframes(urls: string[]): Promise<void> {
    const htmlUrls = Array.from(new Set(urls.map(url => this.toAbsoluteUrl(url))))
    if (htmlUrls.length === 0) return

    this.htmlIframePreloading = true

    try {
      await Promise.allSettled(htmlUrls.map(url => this.ensureHtmlIframe(url).readyPromise))
    } finally {
      this.htmlIframePreloading = false
      this.maybeStartHtmlIframePreload()
    }
  }

  private maybeStartHtmlIframePreload(): void {
    const manifest = this.engine.getManifest()
    if (!manifest) return
    if (this.engine.isPreloading()) return
    if (this.htmlIframePreloading) return

    const strategy = this.resolveHtmlIframePreloadStrategy(manifest)
    if (strategy === 'on-demand') return

    const scope = this.getHtmlIframePreloadScope(manifest, strategy)
    if (!scope) return
    if (this.htmlIframePreloadedScopes.has(scope.key)) return

    this.htmlIframePreloadedScopes.add(scope.key)
    void this.preloadHtmlIframes(scope.urls)
  }

  private resolveHtmlIframePreloadStrategy(manifest: PublishManifest): HtmlIframePreloadStrategy {
    return this.options.runtimeConfig?.htmlIframePreloadStrategy
      ?? manifest.runtimeConfig?.htmlIframePreloadStrategy
      ?? 'all'
  }

  private getHtmlIframePreloadScope(
    manifest: PublishManifest,
    strategy: Exclude<HtmlIframePreloadStrategy, 'on-demand'>,
  ): { key: string, urls: string[] } | null {
    if (strategy === 'all') {
      const urls = manifest.nodes
        .filter(node => this.getNodeKind(node) === 'html' && node.htmlUrl)
        .map(node => node.htmlUrl as string)
      return {
        key: 'all',
        urls,
      }
    }

    const currentNodeId = this.engine.getCurrentNodeId()
    const urls = manifest.edges
      .filter(edge => edge.fromNodeId === currentNodeId)
      .map(edge => manifest.nodeMap[edge.toNodeId])
      .filter((node): node is PublishNode => !!node && this.getNodeKind(node) === 'html' && !!node.htmlUrl)
      .map(node => node.htmlUrl as string)

    return {
      key: `current-node:${currentNodeId}`,
      urls,
    }
  }

  private primeHtmlIframeForEdgeId(edgeId: string): void {
    const manifest = this.engine.getManifest()
    const edge = manifest?.edgeMap[edgeId]
    if (!edge) return
    this.primeHtmlIframeForNodeId(edge.toNodeId)
  }

  private primeHtmlIframeForNodeId(nodeId: string): void {
    const manifest = this.engine.getManifest()
    const node = manifest?.nodeMap[nodeId]
    if (!node || this.getNodeKind(node) !== 'html' || !node.htmlUrl) return
    void this.ensureHtmlIframe(node.htmlUrl).readyPromise
  }

  private executeRuntimeAction(action: RuntimeAction): void {
    if (action.type === 'navigate-edge') {
      this.navigateByEdge(action.edgeId)
      return
    }
    if (action.type === 'open-route') {
      const resolvedUrl = this.resolveHtmlRouteUrl(action.route)
      this.performDefaultHtmlRouteNavigation(resolvedUrl, action.openMode ?? 'current-tab')
      return
    }
    if (action.type === 'open-url') {
      window.open(action.url, action.target ?? '_blank', 'noopener,noreferrer')
    }
  }

  private getNodeKind(node: PublishNode | null | undefined): 'image' | 'region' | 'html' {
    if (!node) return 'image'
    return node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')
  }

  private getRegionSourceNode(node: PublishNode): PublishNode | null {
    const manifest = this.engine.getManifest()
    if (!manifest || this.getNodeKind(node) !== 'region') return null
    const sourceNodeId = node.regionViewport?.sourceNodeId
    if (!sourceNodeId) return null
    return manifest.nodeMap[sourceNodeId] ?? null
  }

  private handleHotspotNavigation(hotspot: PublishHotspot): void {
    this.primeHtmlIframeForNodeId(hotspot.targetNodeId)
    this.engine.handleHotspotClick(hotspot)
  }

  private ensureHtmlIframe(url: string): HtmlIframeEntry {
    const absoluteUrl = this.toAbsoluteUrl(url)
    const existing = this.htmlIframeEntries.get(absoluteUrl)
    if (existing) return existing

    const iframe = this.htmlIframeEntries.size === 0
      ? this.refs.nodeIframe
      : document.createElement('iframe')
    if (this.htmlIframeEntries.size !== 0) {
      iframe.sandbox.value = this.refs.nodeIframe.sandbox.value
      this.htmlIframeLayer.appendChild(iframe)
    }
    this.applyManagedIframeBaseStyle(iframe)

    let preloadResolved = false
    let timeoutId = 0
    let entry!: HtmlIframeEntry
    const readyPromise = new Promise<void>((resolve) => {
      const settlePreloadWait = () => {
        if (preloadResolved) return
        preloadResolved = true
        entry.preloadSettled = true
        window.clearTimeout(timeoutId)
        resolve()
      }

      const handleLoad = () => {
        entry.ready = true
        iframe.removeEventListener('load', handleLoad)
        settlePreloadWait()
        if (this.refs.nodeIframe === iframe) {
          this.render()
          this.updateHotspotViewport()
          requestAnimationFrame(() => {
            this.confirmHostVisualCommitIfReady('node-iframe:onLoad:next-frame')
          })
        }
      }

      iframe.addEventListener('load', handleLoad)
      timeoutId = window.setTimeout(() => {
        settlePreloadWait()
      }, 12000)
      iframe.src = absoluteUrl
    })

    entry = {
      iframe,
      ready: false,
      readyPromise,
      preloadSettled: false,
      cleanup: () => {
        window.clearTimeout(timeoutId)
      },
    }
    this.htmlIframeEntries.set(absoluteUrl, entry)
    return entry
  }
}

declare global {
  interface Window {
    InteractiveGuidePlayerHost?: typeof PlayerHost
  }
}

if (typeof window !== 'undefined') {
  window.InteractiveGuidePlayerHost = PlayerHost
}

export default PlayerHost
