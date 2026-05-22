import type { PublishManifest, PublishHotspot, PublishNode } from '../../shared/types.js'
import { getResolutionDimensions } from '../../shared/utils.js'
import PlayerCore from './player-core.js'

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
  layout?: {
    mode?: 'contain-center' | 'immersive-mobile'
    getViewport?: () => { width: number; height: number }
  }
}

type DragState = {
  active: boolean
  pointerId: number | null
  startX: number
  startY: number
  startOffsetX: number
  startOffsetY: number
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
  private dragState: DragState = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  }
  private imageOffset = { x: 0, y: 0 }
  private destroyers: Array<() => void> = []
  private chromeRoot = document.createElement('div')
  private backControlEl = document.createElement('div')
  private backButtonEl = document.createElement('button')
  private backLabelEl = document.createElement('div')
  private dragHintEl = document.createElement('div')
  private activeContentType: 'image' | 'html' = 'image'
  private htmlIframeLayer = document.createElement('div')
  private htmlIframeEntries = new Map<string, HtmlIframeEntry>()
  private htmlIframePreloading = false
  private htmlIframePreloadStarted = false
  private activeHtmlIframeUrl = ''

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

    this.bindEvents()
    this.buildChrome()
    this.applyBaseStyles()
    this.emitState()
  }

  loadManifest(manifest: PublishManifest): void {
    this.engine.loadManifest(manifest)
    this.htmlIframePreloadStarted = false
    this.htmlIframePreloading = false
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
    this.engine.handleHotspotById(edgeId)
  }

  navigateByEdge(edgeId: string): boolean {
    const manifest = this.engine.getManifest()
    if (!manifest || this.engine.isTransitioning()) return false
    if (!manifest.edgeMap[edgeId]) return false
    this.engine.handleHotspotById(edgeId)
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
      this.engine.handleHotspotById(directEdge.id)
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
    window.addEventListener('message', this.handleWindowMessage)
    window.addEventListener('resize', this.handleWindowResize)

    this.destroyers.push(() => this.refs.nodeImage.removeEventListener('load', this.handleNodeImageLoad))
    this.destroyers.push(() => this.refs.nodeImage.removeEventListener('pointerdown', this.handleNodeImagePointerDown))
    this.destroyers.push(() => window.removeEventListener('message', this.handleWindowMessage))
    this.destroyers.push(() => window.removeEventListener('resize', this.handleWindowResize))
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

  private handleWindowMessage = (event: MessageEvent): void => {
    if (event.data?.type === 'hotspot-click' && event.data?.edgeId) {
      this.engine.handleHotspotById(event.data.edgeId)
    }
  }

  private handleWindowResize = (): void => {
    this.updateLayout()
  }

  private handleNodeImagePointerDown = (event: PointerEvent): void => {
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode) return

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

    const currentNode = this.engine.getCurrentNode()
    if (!currentNode) return

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

    if (currentNode.contentType === 'html') {
      this.renderHtmlNode(currentNode, transitioning)
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
    const showHorizontalDragHint = currentNode?.imageFitMode === 'fitHeight'
    const chromeVisible = !!currentNode && !state.transitioning && !state.preloading

    this.backControlEl.style.display = hasBack ? 'flex' : 'none'
    this.backControlEl.style.opacity = hasBack && chromeVisible ? '1' : '0'
    this.backControlEl.style.pointerEvents = hasBack && chromeVisible ? 'auto' : 'none'
    this.backLabelEl.textContent = currentNode?.title ?? currentNode?.id ?? ''

    this.dragHintEl.style.display = showHorizontalDragHint ? 'block' : 'none'
    this.dragHintEl.style.opacity = showHorizontalDragHint && chromeVisible ? '1' : '0'
  }

  private renderHtmlNode(currentNode: PublishNode, transitioning: boolean): void {
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

    this.renderHotspots()
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
    this.activeContentType = 'image'
    this.activeHtmlIframeUrl = ''

    this.refs.nodeImage.style.visibility = 'visible'
    this.refs.nodeImage.style.pointerEvents = transitioning ? 'none' : 'auto'
    this.hideAllManagedIframes()
    this.refs.nodeImage.src = currentNode.imageUrl ?? ''
    this.refs.nodeImage.alt = currentNode.title ?? currentNode.id
    this.refs.nodeImage.style.opacity = transitioning ? '0' : '1'

    this.applyImageFitMode(fitMode)

    this.renderHotspots()
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

  private applyImageTransform(offsetX: number, offsetY: number): void {
    const currentNode = this.engine.getCurrentNode()
    const fitMode = currentNode?.imageFitMode ?? 'fill'
    const nextX = fitMode === 'fitHeight' ? offsetX : 0
    const nextY = fitMode === 'fitWidth' ? offsetY : 0
    this.imageOffset = { x: nextX, y: nextY }
    this.refs.nodeImage.style.transform = `translate(-50%, -50%) translate(${nextX}px, ${nextY}px)`
  }

  private detachDragListeners(): void {
    document.removeEventListener('pointermove', this.handleDragMove)
    document.removeEventListener('pointerup', this.handleDragEnd)
    document.removeEventListener('pointercancel', this.handleDragEnd)
  }

  private renderHotspots(): void {
    const currentNode = this.engine.getCurrentNode()
    this.refs.hotspots.innerHTML = ''
    for (const hotspot of currentNode?.hotspots ?? []) {
      this.refs.hotspots.appendChild(this.createHotspotButton(hotspot, currentNode))
    }
    requestAnimationFrame(() => {
      this.updateHotspotViewport()
    })
  }

  private createHotspotButton(hotspot: PublishHotspot, _node?: PublishNode | null): HTMLButtonElement {
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
    button.style.opacity = '1'
    button.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.16)'
    button.style.cursor = 'pointer'
    button.style.pointerEvents = 'auto'
    button.style.whiteSpace = 'nowrap'
    button.style.zIndex = '1'
    button.style.maxWidth = '180px'

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
      this.engine.handleHotspotClick(hotspot)
    })

    return button
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
      if (currentNode.contentType !== 'html' || !this.isActiveHtmlIframeReady()) {
        return
      }
    }

    if (currentNode.contentType === 'html') {
      if (!this.isActiveHtmlIframeReady()) return
    } else {
      const expectedSrc = this.toAbsoluteUrl(currentNode.imageUrl ?? '')
      const actualSrc = this.refs.nodeImage.currentSrc || this.refs.nodeImage.src
      if (!this.refs.nodeImage.complete || actualSrc !== expectedSrc) return
    }

    this.engine.confirmHostVisualCommitted()
  }

  private toAbsoluteUrl(url: string): string {
    return new URL(url, window.location.href).href
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

  private isLoading(): boolean {
    const currentNode = this.engine.getCurrentNode()
    const waitingForActiveHtml = currentNode?.contentType === 'html' && !this.isActiveHtmlIframeReady()
    return this.engine.isPreloading() || this.htmlIframePreloading || waitingForActiveHtml
  }

  private async preloadHtmlIframes(manifest: PublishManifest): Promise<void> {
    const htmlUrls = Array.from(new Set(
      manifest.nodes
        .filter(node => node.contentType === 'html' && node.htmlUrl)
        .map(node => this.toAbsoluteUrl(node.htmlUrl as string)),
    ))
    if (htmlUrls.length === 0) return

    this.htmlIframePreloading = true
    this.render()

    try {
      await Promise.allSettled(htmlUrls.map(url => this.ensureHtmlIframe(url).readyPromise))
    } finally {
      this.htmlIframePreloading = false
      this.render()
    }
  }

  private maybeStartHtmlIframePreload(): void {
    const manifest = this.engine.getManifest()
    if (!manifest) return
    if (this.engine.isPreloading()) return
    if (this.htmlIframePreloading || this.htmlIframePreloadStarted) return

    this.htmlIframePreloadStarted = true
    void this.preloadHtmlIframes(manifest)
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
