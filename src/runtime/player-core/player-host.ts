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

const HOTSPOT_SIZE = 28

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
    this.applyBaseStyles()
    this.emitState()
  }

  loadManifest(manifest: PublishManifest): void {
    this.engine.loadManifest(manifest)
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
    this.updateLayout()
    this.render()
  }

  getState(): PlayerHostState {
    return {
      manifest: this.engine.getManifest(),
      currentNode: this.engine.getCurrentNode(),
      currentNodeId: this.engine.getCurrentNodeId(),
      transitioning: this.engine.isTransitioning(),
      preloading: this.engine.isPreloading(),
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
    this.engine.destroy()
  }

  private bindEvents(): void {
    this.engine.on('stateChange', this.handleEngineStateChange)
    this.engine.on('error', this.handleEngineError)
    this.destroyers.push(() => this.engine.off('stateChange', this.handleEngineStateChange))
    this.destroyers.push(() => this.engine.off('error', this.handleEngineError))

    this.refs.nodeImage.addEventListener('load', this.handleNodeImageLoad)
    this.refs.nodeIframe.addEventListener('load', this.handleNodeIframeLoad)
    this.refs.nodeImage.addEventListener('pointerdown', this.handleNodeImagePointerDown)
    window.addEventListener('message', this.handleWindowMessage)
    window.addEventListener('resize', this.handleWindowResize)

    this.destroyers.push(() => this.refs.nodeImage.removeEventListener('load', this.handleNodeImageLoad))
    this.destroyers.push(() => this.refs.nodeIframe.removeEventListener('load', this.handleNodeIframeLoad))
    this.destroyers.push(() => this.refs.nodeImage.removeEventListener('pointerdown', this.handleNodeImagePointerDown))
    this.destroyers.push(() => window.removeEventListener('message', this.handleWindowMessage))
    this.destroyers.push(() => window.removeEventListener('resize', this.handleWindowResize))
    this.destroyers.push(() => this.detachDragListeners())
  }

  private handleEngineStateChange = (): void => {
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

  private handleNodeIframeLoad = (): void => {
    this.updateHotspotViewport()
    requestAnimationFrame(() => {
      this.confirmHostVisualCommitIfReady('node-iframe:onLoad:next-frame')
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
      display: 'block',
    })

    Object.assign(nodeIframe.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      border: 'none',
      background: '#000',
      display: 'none',
    })

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

  private render(): void {
    const state = this.getState()
    const { currentNode, preloading, transitioning } = state
    if (!currentNode) {
      this.emitState()
      return
    }

    if (this.refs.stage) {
      this.refs.stage.hidden = preloading
    }

    if (preloading) {
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

    this.emitState()
  }

  private renderHtmlNode(currentNode: PublishNode, transitioning: boolean): void {
    if (currentNode.imageUrl) {
      this.refs.nodeImage.src = currentNode.imageUrl
      this.refs.nodeImage.alt = currentNode.title ?? currentNode.id
    } else {
      this.refs.nodeImage.removeAttribute('src')
      this.refs.nodeImage.alt = ''
    }

    this.refs.nodeImage.style.display = 'none'
    this.refs.nodeIframe.style.display = 'block'
    this.refs.nodeIframe.style.opacity = transitioning ? '0' : '1'
    this.refs.nodeIframe.src = currentNode.htmlUrl ?? 'about:blank'

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

    this.refs.nodeImage.style.display = 'block'
    this.refs.nodeIframe.style.display = 'none'
    this.refs.nodeIframe.style.opacity = '0'
    this.refs.nodeIframe.src = 'about:blank'
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
      this.refs.hotspots.appendChild(this.createHotspotButton(hotspot))
    }
    requestAnimationFrame(() => {
      this.updateHotspotViewport()
    })
  }

  private createHotspotButton(hotspot: PublishHotspot): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.title = hotspot.label || hotspot.targetNodeId
    button.style.position = 'absolute'
    button.style.left = `${hotspot.normalizedX * 100}%`
    button.style.top = `${hotspot.normalizedY * 100}%`
    button.style.width = `${HOTSPOT_SIZE}px`
    button.style.height = `${HOTSPOT_SIZE}px`
    button.style.transform = 'translate(-50%, -50%)'
    button.style.borderRadius = '999px'
    button.style.border = '1px solid rgba(255,255,255,0.86)'
    button.style.background = 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.98) 0%, rgba(223,239,255,0.96) 36%, rgba(107,177,255,0.84) 70%, rgba(33,105,255,0.46) 100%)'
    button.style.boxShadow = '0 0 12px rgba(131,194,255,0.7), 0 0 28px rgba(87,162,255,0.4), inset 0 0 10px rgba(255,255,255,0.88)'
    button.style.cursor = 'pointer'
    button.style.pointerEvents = 'auto'
    button.style.padding = '0'
    button.style.zIndex = '1'

    const innerGlow = document.createElement('span')
    innerGlow.style.position = 'absolute'
    innerGlow.style.inset = '5px'
    innerGlow.style.borderRadius = 'inherit'
    innerGlow.style.background = 'radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(214,238,255,0.94) 42%, rgba(148,206,255,0.2) 100%)'
    button.appendChild(innerGlow)

    button.addEventListener('click', () => {
      this.engine.handleHotspotClick(hotspot)
    })

    return button
  }

  private updateHotspotViewport(): void {
    const { container, nodeImage, nodeIframe, hotspots, stage } = this.refs
    if (stage.hidden) return

    const mediaRect = container.getBoundingClientRect()
    const contentEl = nodeIframe.style.display !== 'none' ? nodeIframe : nodeImage
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
      return
    }

    if (currentNode.contentType === 'html') {
      const expectedSrc = this.toAbsoluteUrl(currentNode.htmlUrl ?? '')
      if (this.refs.nodeIframe.src !== expectedSrc) return
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
