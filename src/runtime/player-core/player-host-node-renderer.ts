import type { PublishNode } from '../../shared/types.js'
import { resolveSurfaceCameraLayout } from './surface-camera.js'
import type PlayerCore from './player-core.js'
import type { HtmlIframeManager } from './player-host-html.js'
import type { SurfaceController } from './player-host-surface.js'
import type { AnnotationRenderer } from './player-host-annotation-renderer.js'
import type { HtmlNodeBridge } from './html-node-bridge.js'

export interface NodeRendererEnv {
  refs: {
    container: HTMLElement
    nodeImage: HTMLImageElement
    nodeIframe: HTMLIFrameElement
    hotspots: HTMLElement
  }
  engine: PlayerCore
  surface: SurfaceController
  htmlIframe: HtmlIframeManager
  annotations: AnnotationRenderer
  htmlNodeBridge: HtmlNodeBridge
  getNodeKind: (node: PublishNode | null | undefined) => 'surface' | 'image' | 'html'
  getNodeImageSource: (node: PublishNode | null | undefined) => string | undefined
  getNodeAspectRatio: (node: PublishNode | null | undefined) => number | null
  applyPendingRouteSelection: (currentNode: PublishNode | null) => void
  get imageOffset(): { x: number; y: number }
  set imageOffset(v: { x: number; y: number })
  get activeContentType(): 'image' | 'html'
  set activeContentType(v: 'image' | 'html')
  get activeHtmlIframeUrl(): string
  set activeHtmlIframeUrl(v: string)
}

export class NodeRenderer {
  constructor(private env: NodeRendererEnv) {}

  renderHtmlNode(currentNode: PublishNode, transitioning: boolean): void {
    this.env.surface.pinchState.active = false
    this.env.surface.clearScrollSettleTimer()
    this.env.surface.activeLayout = null
    this.env.surface.activeNodeId = null
    this.env.surface.activeLayerId = null
    this.env.surface.activeCardId = null
    this.env.surface.sheetOpen = false
    this.env.surface.currentCamera = null
    this.env.activeContentType = 'html'
    const htmlUrl = currentNode.htmlUrl ?? ''
    const entry = this.env.htmlIframe.ensure(htmlUrl)
    this.env.htmlIframe.activate(htmlUrl)

    this.env.refs.nodeImage.style.visibility = 'hidden'
    this.env.refs.nodeImage.style.opacity = '0'
    this.env.refs.nodeImage.style.pointerEvents = 'none'
    this.env.refs.nodeIframe.style.visibility = entry.ready && !transitioning ? 'visible' : 'hidden'
    this.env.refs.nodeIframe.style.opacity = entry.ready && !transitioning ? '1' : '0'
    this.env.refs.nodeIframe.style.pointerEvents = entry.ready && !transitioning ? 'auto' : 'none'
    if (entry.ready && !transitioning) {
      this.env.htmlNodeBridge.activateNode({
        iframe: entry.iframe,
        node: currentNode,
      })
    } else {
      this.env.htmlNodeBridge.deactivateNode()
    }

    this.env.annotations.renderAnnotations(currentNode, transitioning)
    this.env.refs.hotspots.style.left = '0px'
    this.env.refs.hotspots.style.top = '0px'
    this.env.refs.hotspots.style.width = '100%'
    this.env.refs.hotspots.style.height = '100%'
    this.env.refs.hotspots.style.opacity = transitioning ? '0' : '1'
    requestAnimationFrame(() => {
      this.env.annotations.updateHotspotViewport()
    })
    this.env.applyPendingRouteSelection(currentNode)
  }

  renderImageNode(currentNode: PublishNode, transitioning: boolean): void {
    const fitMode = currentNode.imageFitMode ?? 'fill'
    this.env.surface.pinchState.active = false
    this.env.surface.activeLayout = null
    this.env.surface.activeNodeId = null
    this.env.surface.activeLayerId = null
    this.env.surface.activeCardId = null
    this.env.surface.sheetOpen = false
    this.env.surface.currentCamera = null
    this.env.activeContentType = 'image'
    this.env.activeHtmlIframeUrl = ''
    this.env.htmlNodeBridge.deactivateNode()

    this.env.refs.nodeImage.style.visibility = 'visible'
    this.env.refs.nodeImage.style.pointerEvents = transitioning ? 'none' : 'auto'
    this.env.htmlIframe.hideAll()
    this.env.refs.nodeImage.src = currentNode.imageUrl ?? ''
    this.env.refs.nodeImage.alt = currentNode.title ?? currentNode.id
    this.env.refs.nodeImage.style.opacity = transitioning ? '0' : '1'

    this.applyImageFitMode(fitMode)

    this.env.annotations.renderAnnotations(currentNode, transitioning)
    this.env.refs.hotspots.style.left = '0px'
    this.env.refs.hotspots.style.top = '0px'
    this.env.refs.hotspots.style.width = '100%'
    this.env.refs.hotspots.style.height = '100%'
    this.env.refs.hotspots.style.opacity = transitioning ? '0' : '1'

    requestAnimationFrame(() => {
      if (fitMode !== 'fill') {
        this.applyImageTransform(0, 0)
      }
      this.env.annotations.updateHotspotViewport()
    })
  }

  renderSurfaceNode(currentNode: PublishNode, transitioning: boolean): void {
    if (!currentNode.surfaceConfig) {
      this.renderImageNode(currentNode, transitioning)
      return
    }
    this.env.activeContentType = 'image'
    this.env.activeHtmlIframeUrl = ''
    this.env.htmlNodeBridge.deactivateNode()
    this.env.htmlIframe.hideAll()
    const previousSurfaceNodeId = this.env.surface.activeNodeId
    this.env.surface.activeNodeId = currentNode.id
    if (!this.env.surface.currentCamera || previousSurfaceNodeId !== currentNode.id) {
      this.env.surface.currentCamera = currentNode.surfaceConfig.initialCamera
    }
    if (previousSurfaceNodeId !== currentNode.id) {
      this.env.surface.activeLayerId = null
      this.env.surface.activeCardId = null
      this.env.surface.sheetOpen = false
    }

    this.env.refs.nodeImage.style.visibility = 'visible'
    this.env.refs.nodeImage.style.pointerEvents = transitioning ? 'none' : 'auto'
    this.env.refs.nodeImage.src = currentNode.surfaceConfig.sourceImageUrl
    this.env.refs.nodeImage.alt = currentNode.title ?? currentNode.id
    this.env.refs.nodeImage.style.opacity = transitioning ? '0' : '1'
    this.applySurfaceImageLayout(currentNode)
    this.env.annotations.renderAnnotations(currentNode, transitioning)

    this.env.refs.hotspots.style.opacity = transitioning ? '0' : '1'
    requestAnimationFrame(() => {
      this.env.annotations.updateHotspotViewport()
    })
    this.env.applyPendingRouteSelection(currentNode)
  }

  applyImageFitMode(fitMode: string): void {
    const { nodeImage, container } = this.env.refs
    this.env.imageOffset = { x: 0, y: 0 }

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

  applySurfaceImageLayout(currentNode: PublishNode): void {
    const surfaceConfig = currentNode.surfaceConfig
    if (!surfaceConfig || !this.env.surface.currentCamera) return
    const { nodeImage, container } = this.env.refs
    const layout = resolveSurfaceCameraLayout({
      viewportWidth: container.clientWidth,
      viewportHeight: container.clientHeight,
      sourceAspect: this.env.getNodeAspectRatio(currentNode) ?? 1,
      camera: this.env.surface.currentCamera,
      bounds: surfaceConfig.bounds,
    })
    this.env.surface.activeLayout = layout
    this.env.surface.currentCamera = layout.camera
    this.env.imageOffset = { x: layout.translateX + layout.originX, y: layout.translateY + layout.originY }

    container.style.overflow = 'hidden'
    nodeImage.style.position = 'absolute'
    nodeImage.style.left = '0'
    nodeImage.style.top = '0'
    nodeImage.style.width = `${layout.scaledWidth}px`
    nodeImage.style.height = `${layout.scaledHeight}px`
    nodeImage.style.maxWidth = 'none'
    nodeImage.style.maxHeight = 'none'
    nodeImage.style.objectFit = 'fill'
    nodeImage.style.objectPosition = '50% 50%'
    nodeImage.style.transform = `translate(${layout.translateX + layout.originX}px, ${layout.translateY + layout.originY}px)`
    nodeImage.style.clipPath = ''
    nodeImage.style.cursor = 'grab'
    nodeImage.style.touchAction = 'none'
  }

  applyImageTransform(offsetX: number, offsetY: number): void {
    const currentNode = this.env.engine.getCurrentNode()
    const fitMode = currentNode?.imageFitMode ?? 'fill'
    const nextX = fitMode === 'fitHeight' ? offsetX : 0
    const nextY = fitMode === 'fitWidth' ? offsetY : 0
    this.env.imageOffset = { x: nextX, y: nextY }
    this.env.refs.nodeImage.style.transform = `translate(-50%, -50%) translate(${nextX}px, ${nextY}px)`
  }

  getImageHorizontalPanRange(): { min: number; max: number } {
    const currentNode = this.env.engine.getCurrentNode()
    if (!currentNode || (currentNode.imageFitMode ?? 'fill') !== 'fitHeight') {
      return { min: 0, max: 0 }
    }

    const containerRect = this.env.refs.container.getBoundingClientRect()
    const imageRect = this.env.refs.nodeImage.getBoundingClientRect()
    if (imageRect.width <= containerRect.width) {
      return { min: 0, max: 0 }
    }

    const maxOffsetX = (imageRect.width - containerRect.width) / 2
    return {
      min: -maxOffsetX,
      max: maxOffsetX,
    }
  }
}
