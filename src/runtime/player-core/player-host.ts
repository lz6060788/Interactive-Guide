import type {
  HtmlIframePreloadStrategy,
  PublishManifest,
  PublishHotspot,
  PublishNode,
  CameraState,
  SurfaceCard,
  SurfaceConfig,
  SurfaceFocusLayer,
  SurfaceHotspot,
  InfoOverlayConfig,
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
  clampSurfaceCamera,
  interpolateCamera,
  projectSurfacePoint,
  resolveVisibleSurfaceAnnotations,
  resolveSurfaceCameraLayout,
  type SurfaceCameraLayout,
} from './surface-camera.js'

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
  maxOffsetX: number
  maxOffsetY: number
  moved: boolean
}

type HtmlIframeEntry = {
  iframe: HTMLIFrameElement
  ready: boolean
  readyPromise: Promise<void>
  preloadSettled: boolean
  cleanup: () => void
}

type TouchPinchState = {
  active: boolean
  startDistance: number
  startCamera: CameraState | null
  anchorNormX: number
  anchorNormY: number
  baseWidth: number
  baseHeight: number
}

const HOTSPOT_SIZE = 28
const BACK_ICON_SVG = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M15.25 5.5L8.75 12L15.25 18.5" stroke="#231815" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
const SHEET_BACK_ICON_SVG = `
<svg width="16" height="13" viewBox="0 0 16 13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M10.5065 2.13333H7.11988V0L2.50655 3.46339L7.11988 6.33333V4.2H10.4799C12.7999 4.2 13.5 4.35339 13.6665 7.38667C13.6665 9.70667 12.7999 10.5733 10.4799 10.5733H0.826546C0.533213 10.5733 0 10.5733 0 11.3534C0 12.8534 0.5 12.64 0.826546 12.64H10.5065C13.4132 12.64 15.7599 10.8534 15.7599 7.38667C15.7599 3.35339 13.3865 2.13333 10.5065 2.13333Z" fill="black" fill-opacity="0.84"/>
</svg>
`
const INFO_ICON_SVG = `
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M7.00977 0.00878906C10.5322 0.187363 13.333 3.10017 13.333 6.66699L13.3242 7.00977C13.1456 10.5321 10.2337 13.3328 6.66699 13.333L6.32324 13.3242C2.91459 13.1512 0.181596 10.4185 0.00878906 7.00977L0 6.66699C0 2.98509 2.98509 0 6.66699 0L7.00977 0.00878906ZM6.66699 1C3.53738 1 1 3.53738 1 6.66699C1.00018 9.79646 3.53749 12.333 6.66699 12.333C9.79635 12.3328 12.3328 9.79635 12.333 6.66699C12.333 3.53749 9.79646 1.00018 6.66699 1ZM7.16699 5.33301V10H6.16699V5.33301H7.16699ZM6.66699 3.33301C7.03503 3.33318 7.33301 3.63192 7.33301 4C7.33301 4.36808 7.03503 4.66682 6.66699 4.66699C6.2988 4.66699 6 4.36819 6 4C6 3.63181 6.2988 3.33301 6.66699 3.33301Z" fill="black" fill-opacity="0.4"/>
</svg>
`
const INFO_SHEET_DEFAULT_TITLE = '说明'
const INFO_SHEET_FALLBACK_CONFIG: InfoOverlayConfig = {
  title: INFO_SHEET_DEFAULT_TITLE,
  sections: [
    {
      heading: '资料来源',
      body: '本产业链图谱基于民生证券、华泰证券、国信证券等公开研报，以及行业公开资料、网络公开信息整理。节点分类、层级关系、说明文案及部分可视化形式由 AI 辅助归纳、生成和编辑，可能存在遗漏、简化或不准确之处。',
    },
    {
      heading: '免责声明',
      body: '相关内容仅用于产业链结构理解和产品功能展示，不构成投资建议、采购建议、技术选型建议或商业决策依据。如需用于正式研究或决策，请以权威机构、企业公告、原始研报及人工核验结果为准。页面中的场景图、设备图和空间关系为 AI 生成示意图，不代表真实基地、设备比例或企业布局。',
    },
  ],
}
const SHARE_ICON_SVG = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M18.332 21.2057H5.39898C3.97063 21.2057 2.81152 20.0466 2.81152 18.6183V5.6844C2.81152 4.25605 4.01466 2.79468 5.44301 2.79468H12.6737V4.11042H5.44301C4.72756 4.11042 4.12726 4.71072 4.12726 5.42616L4.1061 18.6183C4.1061 19.3337 4.68607 19.9112 5.39898 19.9112L18.5928 19.89C19.3057 19.89 19.906 19.2897 19.906 18.5743V11.3436H21.2217V18.5743C21.2226 20.0043 19.7629 21.2057 18.332 21.2057ZM20.5656 8.71213C20.1922 8.71382 19.9068 8.41156 19.9068 8.0551L19.8882 4.91307L9.8813 14.456C9.61883 14.7066 9.19295 14.7066 8.93048 14.456C8.6697 14.2054 8.6697 13.799 8.93048 13.5492L18.8519 4.08925L15.9622 4.11042C15.5888 4.11042 15.3051 3.80815 15.3051 3.4534C15.3051 3.09694 15.5888 2.79637 15.9622 2.79468H20.5512C20.9246 2.79468 21.2226 3.08001 21.2226 3.43646V8.0551C21.2226 8.41156 20.9364 8.71213 20.5656 8.71213Z" fill="#231815"/>
</svg>
`
const SURFACE_MARKER_SVG = `
<svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <circle cx="10.5" cy="10.5" r="10.25" fill="white" fill-opacity="0.1" stroke="white" stroke-width="0.5"/>
  <circle cx="10.5" cy="10.5" r="4.5" fill="white"/>
</svg>
`
const SURFACE_MARKER_SELECTED_SVG = `
<svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <circle cx="10.5" cy="10.5" r="10.25" fill="#FF2436" fill-opacity="0.1" stroke="#FF2436" stroke-width="0.5"/>
  <circle cx="10.5" cy="10.5" r="5.5" fill="#FF2436" stroke="white"/>
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
    maxOffsetX: 0,
    maxOffsetY: 0,
    moved: false,
  }
  private imageOffset = { x: 0, y: 0 }
  private destroyers: Array<() => void> = []
  private chromeRoot = document.createElement('div')
  private backControlEl = document.createElement('div')
  private backButtonEl = document.createElement('button')
  private headerCenterEl = document.createElement('div')
  private packageTitleEl = document.createElement('div')
  private infoButtonEl = document.createElement('button')
  private shareButtonEl = document.createElement('button')
  private bottomSheetEl = document.createElement('div')
  private bottomSheetHeaderEl = document.createElement('div')
  private bottomSheetBreadcrumbEl = document.createElement('div')
  private bottomSheetActionsEl = document.createElement('div')
  private bottomSheetResetButtonEl = document.createElement('button')
  private bottomSheetCloseButtonEl = document.createElement('button')
  private bottomSheetCardsEl = document.createElement('div')
  private infoSheetBackdropEl = document.createElement('div')
  private infoSheetEl = document.createElement('div')
  private infoSheetHeaderEl = document.createElement('div')
  private infoSheetTitleEl = document.createElement('div')
  private infoSheetCloseButtonEl = document.createElement('button')
  private infoSheetContentEl = document.createElement('div')
  private dragHintEl = document.createElement('div')
  private activeContentType: 'image' | 'html' = 'image'
  private activeSurfaceLayout: SurfaceCameraLayout | null = null
  private activeSurfaceNodeId: string | null = null
  private activeSurfaceLayerId: string | null = null
  private activeSurfaceCardId: string | null = null
  private surfaceSheetOpen = false
  private infoSheetOpen = false
  private currentSurfaceCamera: CameraState | null = null
  private surfaceAnimationFrameId: number | null = null
  private htmlIframeLayer = document.createElement('div')
  private htmlIframeEntries = new Map<string, HtmlIframeEntry>()
  private htmlIframePreloading = false
  private htmlIframePreloadedScopes = new Set<string>()
  private htmlIframeWarmupQueue: Promise<void> = Promise.resolve()
  private activeHtmlIframeUrl = ''
  private viewportPointerDownTarget: EventTarget | null = null
  private hotspotViewportFrameId: number | null = null
  private pinchState: TouchPinchState = {
    active: false,
    startDistance: 0,
    startCamera: null,
    anchorNormX: 0.5,
    anchorNormY: 0.5,
    baseWidth: 1,
    baseHeight: 1,
  }

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
    this.htmlIframeWarmupQueue = Promise.resolve()
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
    this.handleBackAction()
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
    const currentNode = this.engine.getCurrentNode()
    if (currentNode && this.getNodeKind(currentNode) === 'surface') {
      this.applySurfaceImageLayout(currentNode)
      this.renderAnnotations(currentNode, this.engine.isTransitioning())
    }
    this.updateHotspotViewport()
  }

  destroy(): void {
    if (this.hotspotViewportFrameId !== null) {
      cancelAnimationFrame(this.hotspotViewportFrameId)
      this.hotspotViewportFrameId = null
    }
    if (this.surfaceAnimationFrameId !== null) {
      cancelAnimationFrame(this.surfaceAnimationFrameId)
      this.surfaceAnimationFrameId = null
    }
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
    this.refs.viewport.addEventListener('wheel', this.handleViewportWheel, { passive: false })
    this.refs.viewport.addEventListener('touchstart', this.handleViewportTouchStart, { passive: false })
    this.refs.viewport.addEventListener('touchmove', this.handleViewportTouchMove, { passive: false })
    this.refs.viewport.addEventListener('touchend', this.handleViewportTouchEnd)
    this.refs.viewport.addEventListener('touchcancel', this.handleViewportTouchEnd)

    this.destroyers.push(() => this.refs.nodeImage.removeEventListener('load', this.handleNodeImageLoad))
    this.destroyers.push(() => this.refs.nodeImage.removeEventListener('pointerdown', this.handleNodeImagePointerDown))
    this.destroyers.push(() => window.removeEventListener('resize', this.handleWindowResize))
    this.destroyers.push(() => this.refs.viewport.removeEventListener('pointerdown', this.handleViewportPointerDown))
    this.destroyers.push(() => this.refs.viewport.removeEventListener('click', this.handleViewportClick))
    this.destroyers.push(() => this.refs.viewport.removeEventListener('wheel', this.handleViewportWheel))
    this.destroyers.push(() => this.refs.viewport.removeEventListener('touchstart', this.handleViewportTouchStart))
    this.destroyers.push(() => this.refs.viewport.removeEventListener('touchmove', this.handleViewportTouchMove))
    this.destroyers.push(() => this.refs.viewport.removeEventListener('touchend', this.handleViewportTouchEnd))
    this.destroyers.push(() => this.refs.viewport.removeEventListener('touchcancel', this.handleViewportTouchEnd))
    this.destroyers.push(() => this.detachDragListeners())
  }

  private handleEngineStateChange = (): void => {
    this.infoSheetOpen = false
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
    if (!currentNode || this.getNodeKind(currentNode) !== 'surface') return
    if (this.engine.isTransitioning()) return
    if (this.dragState.moved) {
      this.dragState.moved = false
      return
    }

    const pointerDownTarget = this.viewportPointerDownTarget
    this.viewportPointerDownTarget = null
    if (this.isInteractiveSurfaceTarget(pointerDownTarget) || this.isInteractiveSurfaceTarget(event.target)) {
      return
    }
    if (this.activeSurfaceCardId) {
      this.setActiveSurfaceCard(null)
    }
  }

  private handleViewportWheel = (event: WheelEvent): void => {
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode || this.getNodeKind(currentNode) !== 'surface' || !this.currentSurfaceCamera) return
    if (this.engine.isTransitioning()) return
    event.preventDefault()

    const surfaceConfig = currentNode.surfaceConfig
    const layout = this.activeSurfaceLayout
    if (!surfaceConfig || !layout) return

    const rect = this.refs.container.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const imageNormX = (pointerX - layout.originX - layout.translateX) / Math.max(layout.scaledWidth, 1)
    const imageNormY = (pointerY - layout.originY - layout.translateY) / Math.max(layout.scaledHeight, 1)
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    const nextZoom = this.currentSurfaceCamera.zoom * zoomFactor
    const nextCamera = clampSurfaceCamera(
      {
        centerX: imageNormX - (pointerX - rect.width / 2) / Math.max(layout.baseWidth * nextZoom, 1),
        centerY: imageNormY - (pointerY - rect.height / 2) / Math.max(layout.baseHeight * nextZoom, 1),
        zoom: nextZoom,
      },
      rect.width,
      rect.height,
      this.getNodeAspectRatio(currentNode) ?? 1,
      surfaceConfig.bounds,
    )

    this.setSurfaceCamera(nextCamera, false)
  }

  private handleViewportTouchStart = (event: TouchEvent): void => {
    if (event.touches.length < 2) return
    if (!this.canHandleSurfacePinch()) return
    event.preventDefault()
    this.beginSurfacePinch(event.touches)
  }

  private handleViewportTouchMove = (event: TouchEvent): void => {
    if (event.touches.length < 2) return
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode || this.getNodeKind(currentNode) !== 'surface' || !currentNode.surfaceConfig) return
    if (!this.canHandleSurfacePinch()) return

    if (!this.pinchState.active) {
      this.beginSurfacePinch(event.touches)
    }
    if (!this.pinchState.active || !this.pinchState.startCamera) return

    event.preventDefault()
    const first = event.touches[0]
    const second = event.touches[1]
    const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
    const nextZoom = this.pinchState.startCamera.zoom * (distance / Math.max(this.pinchState.startDistance, 1))
    const rect = this.refs.container.getBoundingClientRect()
    const midpointX = (first.clientX + second.clientX) / 2 - rect.left
    const midpointY = (first.clientY + second.clientY) / 2 - rect.top
    const nextCamera = clampSurfaceCamera(
      {
        centerX: this.pinchState.anchorNormX - (midpointX - rect.width / 2) / Math.max(this.pinchState.baseWidth * nextZoom, 1),
        centerY: this.pinchState.anchorNormY - (midpointY - rect.height / 2) / Math.max(this.pinchState.baseHeight * nextZoom, 1),
        zoom: nextZoom,
      },
      rect.width,
      rect.height,
      this.getNodeAspectRatio(currentNode) ?? 1,
      currentNode.surfaceConfig.bounds,
    )

    this.dragState.moved = true
    this.setSurfaceCamera(nextCamera, false)
  }

  private handleViewportTouchEnd = (event: TouchEvent): void => {
    if (!this.pinchState.active) return
    if (event.touches.length >= 2) {
      this.beginSurfacePinch(event.touches)
      return
    }
    this.pinchState.active = false
    if (this.getNodeKind(this.engine.getCurrentNode()) === 'surface') {
      this.refs.nodeImage.style.cursor = 'grab'
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

    if (this.getNodeKind(currentNode) === 'surface') {
      if (this.pinchState.active) return
      if (!event.isPrimary || !this.currentSurfaceCamera) return
      event.preventDefault()
      this.dragState = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: this.currentSurfaceCamera.centerX,
        startOffsetY: this.currentSurfaceCamera.centerY,
        maxOffsetX: 0,
        maxOffsetY: 0,
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
    const containerRect = this.refs.container.getBoundingClientRect()
    const imageRect = this.refs.nodeImage.getBoundingClientRect()
    const maxOffsetX = imageRect.width > containerRect.width
      ? (imageRect.width - containerRect.width) / 2
      : 0
    const maxOffsetY = imageRect.height > containerRect.height
      ? (imageRect.height - containerRect.height) / 2
      : 0
    this.dragState = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: this.imageOffset.x,
      startOffsetY: this.imageOffset.y,
      maxOffsetX,
      maxOffsetY,
      moved: false,
    }

    this.refs.nodeImage.style.cursor = 'grabbing'
    this.refs.nodeImage.setPointerCapture?.(event.pointerId)
    document.addEventListener('pointermove', this.handleDragMove)
    document.addEventListener('pointerup', this.handleDragEnd)
    document.addEventListener('pointercancel', this.handleDragEnd)
  }

  private handleDragMove = (event: PointerEvent): void => {
    if (this.pinchState.active) return
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

    if (this.getNodeKind(currentNode) === 'surface' && this.activeSurfaceLayout && this.currentSurfaceCamera && currentNode.surfaceConfig) {
      const rect = this.refs.container.getBoundingClientRect()
      const nextCamera = clampSurfaceCamera(
        {
          centerX: this.dragState.startOffsetX - (event.clientX - this.dragState.startX) / Math.max(this.activeSurfaceLayout.baseWidth * this.currentSurfaceCamera.zoom, 1),
          centerY: this.dragState.startOffsetY - (event.clientY - this.dragState.startY) / Math.max(this.activeSurfaceLayout.baseHeight * this.currentSurfaceCamera.zoom, 1),
          zoom: this.currentSurfaceCamera.zoom,
        },
        rect.width,
        rect.height,
        this.getNodeAspectRatio(currentNode) ?? 1,
        currentNode.surfaceConfig.bounds,
      )
      this.setSurfaceCamera(nextCamera, false)
      return
    }

    const fitMode = currentNode.imageFitMode ?? 'fill'

    let nextX = this.dragState.startOffsetX
    let nextY = this.dragState.startOffsetY

    if (fitMode === 'fitHeight') {
      nextX += event.clientX - this.dragState.startX
      nextX = this.dragState.maxOffsetX > 0
        ? Math.max(-this.dragState.maxOffsetX, Math.min(this.dragState.maxOffsetX, nextX))
        : 0
      nextY = 0
    } else if (fitMode === 'fitWidth') {
      nextY += event.clientY - this.dragState.startY
      nextY = this.dragState.maxOffsetY > 0
        ? Math.max(-this.dragState.maxOffsetY, Math.min(this.dragState.maxOffsetY, nextY))
        : 0
      nextX = 0
    }

    this.applyImageTransform(nextX, nextY)
    this.scheduleHotspotViewportUpdate()
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
    if (this.getNodeKind(currentNode) === 'surface') {
      this.refs.nodeImage.style.cursor = 'grab'
      return
    }

    const fitMode = currentNode?.imageFitMode ?? 'fill'
    this.refs.nodeImage.style.cursor = fitMode === 'fill' ? 'default' : 'grab'
  }

  private canHandleSurfacePinch(): boolean {
    const currentNode = this.engine.getCurrentNode()
    return !!currentNode
      && this.getNodeKind(currentNode) === 'surface'
      && !!currentNode.surfaceConfig
      && !!this.currentSurfaceCamera
      && !!this.activeSurfaceLayout
      && !this.engine.isTransitioning()
  }

  private beginSurfacePinch(touches: TouchList): void {
    if (touches.length < 2 || !this.currentSurfaceCamera || !this.activeSurfaceLayout) return
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode || this.getNodeKind(currentNode) !== 'surface') return

    const first = touches[0]
    const second = touches[1]
    const rect = this.refs.container.getBoundingClientRect()
    const midpointX = (first.clientX + second.clientX) / 2 - rect.left
    const midpointY = (first.clientY + second.clientY) / 2 - rect.top
    const layout = this.activeSurfaceLayout

    this.cancelSurfacePointerDrag()
    this.pinchState = {
      active: true,
      startDistance: Math.max(Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY), 1),
      startCamera: { ...this.currentSurfaceCamera },
      anchorNormX: (midpointX - layout.originX - layout.translateX) / Math.max(layout.scaledWidth, 1),
      anchorNormY: (midpointY - layout.originY - layout.translateY) / Math.max(layout.scaledHeight, 1),
      baseWidth: layout.baseWidth,
      baseHeight: layout.baseHeight,
    }
    this.dragState.moved = true
    this.refs.nodeImage.style.cursor = 'grabbing'
  }

  private cancelSurfacePointerDrag(): void {
    if (!this.dragState.active) return
    const pointerId = this.dragState.pointerId
    this.dragState.active = false
    this.dragState.pointerId = null
    this.detachDragListeners()
    if (pointerId !== null && this.refs.nodeImage.hasPointerCapture?.(pointerId)) {
      this.refs.nodeImage.releasePointerCapture(pointerId)
    }
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
    this.backButtonEl.addEventListener('click', () => this.handleBackAction())

    this.infoButtonEl.type = 'button'
    this.infoButtonEl.setAttribute('aria-label', '提示信息')
    this.infoButtonEl.innerHTML = INFO_ICON_SVG
    this.infoButtonEl.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.toggleInfoSheet()
    })

    this.shareButtonEl.type = 'button'
    this.shareButtonEl.setAttribute('aria-label', '分享')
    this.shareButtonEl.innerHTML = SHARE_ICON_SVG
    this.shareButtonEl.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      void this.handleShareAction()
    })
    this.bottomSheetResetButtonEl.type = 'button'
    this.bottomSheetResetButtonEl.setAttribute('aria-label', '返回总图')
    this.bottomSheetResetButtonEl.innerHTML = SHEET_BACK_ICON_SVG
    this.bottomSheetResetButtonEl.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.handleBackAction()
    })
    this.bottomSheetCloseButtonEl.type = 'button'
    this.bottomSheetCloseButtonEl.setAttribute('aria-label', '关闭底部浮层')
    this.bottomSheetCloseButtonEl.textContent = '×'
    this.bottomSheetCloseButtonEl.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.closeSurfaceSheet()
    })
    this.infoSheetCloseButtonEl.type = 'button'
    this.infoSheetCloseButtonEl.setAttribute('aria-label', '关闭说明弹窗')
    this.infoSheetCloseButtonEl.textContent = '×'
    this.infoSheetCloseButtonEl.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.closeInfoSheet()
    })
    this.infoSheetBackdropEl.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.closeInfoSheet()
    })

    this.backControlEl.appendChild(this.backButtonEl)
    this.headerCenterEl.appendChild(this.packageTitleEl)
    this.headerCenterEl.appendChild(this.infoButtonEl)
    this.bottomSheetActionsEl.appendChild(this.bottomSheetCloseButtonEl)
    this.bottomSheetHeaderEl.appendChild(this.bottomSheetBreadcrumbEl)
    this.bottomSheetHeaderEl.appendChild(this.bottomSheetActionsEl)
    this.bottomSheetEl.appendChild(this.bottomSheetHeaderEl)
    this.bottomSheetEl.appendChild(this.bottomSheetCardsEl)
    this.infoSheetHeaderEl.appendChild(this.infoSheetTitleEl)
    this.infoSheetHeaderEl.appendChild(this.infoSheetCloseButtonEl)
    this.infoSheetEl.appendChild(this.infoSheetHeaderEl)
    this.infoSheetEl.appendChild(this.infoSheetContentEl)
    this.chromeRoot.appendChild(this.backControlEl)
    this.chromeRoot.appendChild(this.headerCenterEl)
    this.chromeRoot.appendChild(this.shareButtonEl)
    this.chromeRoot.appendChild(this.bottomSheetResetButtonEl)
    this.chromeRoot.appendChild(this.bottomSheetEl)
    this.chromeRoot.appendChild(this.infoSheetBackdropEl)
    this.chromeRoot.appendChild(this.infoSheetEl)
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
      left: '16px',
      top: '14px',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      pointerEvents: 'auto',
      opacity: '0',
      transition: 'opacity 220ms ease',
    })

    Object.assign(this.backButtonEl.style, {
      width: '32px',
      height: '32px',
      minWidth: '32px',
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
      ;(backIcon as SVGElement).style.width = '24px'
      ;(backIcon as SVGElement).style.height = '24px'
      ;(backIcon as SVGElement).style.display = 'block'
    }

    Object.assign(this.headerCenterEl.style, {
      position: 'absolute',
      left: '50%',
      top: '14px',
      transform: 'translateX(-50%)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      maxWidth: 'calc(100% - 120px)',
      pointerEvents: 'auto',
      opacity: '0',
      transition: 'opacity 220ms ease',
    })

    Object.assign(this.packageTitleEl.style, {
      minHeight: '24px',
      maxWidth: '220px',
      fontStyle: 'normal',
      fontWeight: '700',
      fontSize: '17px',
      lineHeight: '24px',
      color: 'rgba(0, 0, 0, 0.84)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      pointerEvents: 'none',
    })

    const topIconButtonStyle = {
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
    } as const
    Object.assign(this.infoButtonEl.style, topIconButtonStyle)
    Object.assign(this.shareButtonEl.style, {
      ...topIconButtonStyle,
      position: 'absolute',
      right: '16px',
      top: '14px',
      display: 'none',
      opacity: '0',
      transition: 'opacity 220ms ease',
    })
    for (const iconButton of [this.infoButtonEl, this.shareButtonEl]) {
      const svg = iconButton.querySelector('svg')
      if (svg) {
        ;(svg as SVGElement).style.width = iconButton === this.shareButtonEl ? '24px' : '14px'
        ;(svg as SVGElement).style.height = iconButton === this.shareButtonEl ? '24px' : '14px'
        ;(svg as SVGElement).style.display = 'block'
      }
    }
    Object.assign(this.bottomSheetEl.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '0',
      display: 'none',
      flexDirection: 'column',
      gap: '14px',
      padding: '14px 16px 18px',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '8px',
      borderBottomLeftRadius: '0',
      borderBottomRightRadius: '0',
      background: 'linear-gradient(360deg, #F5F5F5 0%, rgba(255, 255, 255, 0.64) 100%)',
      backdropFilter: 'blur(6px)',
      boxShadow: '0 -10px 36px rgba(15, 23, 42, 0.12)',
      pointerEvents: 'auto',
      opacity: '0',
      transition: 'opacity 220ms ease',
      zIndex: '2',
    })
    Object.assign(this.bottomSheetHeaderEl.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
    })
    Object.assign(this.bottomSheetBreadcrumbEl.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      flex: '1',
      minWidth: '0',
      fontSize: '14px',
      lineHeight: '18px',
      fontWeight: '400',
      color: 'rgba(0, 0, 0, 0.6)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    })
    Object.assign(this.bottomSheetActionsEl.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      flexShrink: '0',
    })
    Object.assign(this.bottomSheetResetButtonEl.style, {
      position: 'absolute',
      right: '16px',
      bottom: '210px',
      width: '32px',
      height: '32px',
      minWidth: '32px',
      border: 'none',
      borderRadius: '6.85714px',
      background: 'rgba(255, 255, 255, 0.8)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      cursor: 'pointer',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 220ms ease',
      zIndex: '3',
    })
    const sheetBackIcon = this.bottomSheetResetButtonEl.querySelector('svg')
    if (sheetBackIcon) {
      ;(sheetBackIcon as SVGElement).style.width = '16px'
      ;(sheetBackIcon as SVGElement).style.height = '13px'
      ;(sheetBackIcon as SVGElement).style.display = 'block'
    }
    Object.assign(this.bottomSheetCloseButtonEl.style, {
      width: '28px',
      height: '28px',
      minWidth: '28px',
      border: 'none',
      borderRadius: '999px',
      background: 'transparent',
      color: 'rgba(0, 0, 0, 0.72)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      fontSize: '26px',
      lineHeight: '1',
      cursor: 'pointer',
    })
    Object.assign(this.bottomSheetCardsEl.style, {
      display: 'flex',
      flexDirection: 'row',
      gap: '12px',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollSnapType: 'x proximity',
      paddingBottom: '4px',
      scrollbarWidth: 'none',
    })
    Object.assign(this.infoSheetBackdropEl.style, {
      position: 'absolute',
      inset: '0',
      display: 'none',
      background: 'rgba(0, 0, 0, 0.8)',
      opacity: '0',
      transition: 'opacity 220ms ease',
      pointerEvents: 'none',
      zIndex: '2',
    })
    Object.assign(this.infoSheetEl.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '0',
      display: 'none',
      flexDirection: 'column',
      gap: '16px',
      padding: '18px 22px 24px',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '8px',
      background: '#FFFFFF',
      boxShadow: '0 -10px 36px rgba(15, 23, 42, 0.12)',
      pointerEvents: 'auto',
      opacity: '0',
      transition: 'opacity 220ms ease',
      maxHeight: '50vh',
      overflow: 'hidden',
      boxSizing: 'border-box',
      zIndex: '3',
    })
    Object.assign(this.infoSheetHeaderEl.style, {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '28px',
      flexShrink: '0',
    })
    Object.assign(this.infoSheetTitleEl.style, {
      fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
      fontStyle: 'normal',
      fontWeight: '600',
      fontSize: '16px',
      lineHeight: '22px',
      color: 'rgba(0, 0, 0, 0.84)',
      textAlign: 'center',
    })
    Object.assign(this.infoSheetCloseButtonEl.style, {
      position: 'absolute',
      right: '0',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '28px',
      height: '28px',
      minWidth: '28px',
      border: 'none',
      borderRadius: '999px',
      background: 'transparent',
      color: 'rgba(0, 0, 0, 0.36)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      cursor: 'pointer',
      fontSize: '24px',
      lineHeight: '1',
    })
    Object.assign(this.infoSheetContentEl.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
      overflowY: 'auto',
      minHeight: '0',
      paddingRight: '2px',
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
      zIndex: '1',
    })
    this.dragHintEl.innerHTML = [
      '<span style="color:rgba(255,255,255,0.45)">&lt;</span>',
      '<span style="color:#FFFFFF">&lt;&lt;&nbsp;&nbsp;左右滑动查看完整场景&nbsp;&nbsp;&gt;&gt;</span>',
      '<span style="color:rgba(255,255,255,0.45)">&gt;</span>',
    ].join('')

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
      willChange: 'transform',
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
      willChange: 'transform,left,top,width,height',
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
    const { currentNode, transitioning } = state
    if (!currentNode) {
      this.renderChrome(state)
      this.emitState()
      return
    }

    this.refs.stage.hidden = false

    const nodeKind = this.getNodeKind(currentNode)
    if (nodeKind === 'html') {
      this.renderHtmlNode(currentNode, transitioning)
    } else if (nodeKind === 'surface') {
      this.renderSurfaceNode(currentNode, transitioning)
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
    const manifestTitle = state.manifest?.title ?? ''
    const hasBack = state.history.length > 0 || this.hasActiveSurfaceFocus(currentNode)
    const nodeKind = this.getNodeKind(currentNode)
    const showHorizontalDragHint = nodeKind === 'surface'
      ? true
      : currentNode?.imageFitMode === 'fitHeight'
    const chromeVisible = !!currentNode && !state.transitioning && !state.preloading
    const canShare = chromeVisible && this.canUseNativeShare()
    const canShowInfo = chromeVisible && !!this.getInfoOverlayConfig(state.manifest)

    this.backControlEl.style.display = hasBack ? 'flex' : 'none'
    this.backControlEl.style.opacity = hasBack && chromeVisible ? '1' : '0'
    this.backControlEl.style.pointerEvents = hasBack && chromeVisible ? 'auto' : 'none'
    this.headerCenterEl.style.display = chromeVisible ? 'flex' : 'none'
    this.headerCenterEl.style.opacity = chromeVisible ? '1' : '0'
    this.infoButtonEl.style.display = canShowInfo ? 'flex' : 'none'
    this.infoButtonEl.style.pointerEvents = canShowInfo ? 'auto' : 'none'
    this.shareButtonEl.style.display = canShare ? 'flex' : 'none'
    this.shareButtonEl.style.opacity = canShare ? '1' : '0'
    this.shareButtonEl.style.pointerEvents = canShare ? 'auto' : 'none'
    this.packageTitleEl.textContent = manifestTitle
    this.renderBottomSheet(currentNode, chromeVisible)
    this.renderInfoSheet(state.manifest, chromeVisible)

    this.dragHintEl.style.display = showHorizontalDragHint ? 'block' : 'none'
    this.dragHintEl.style.opacity = showHorizontalDragHint && chromeVisible ? '1' : '0'
  }

  private renderBottomSheet(currentNode: PublishNode | null, chromeVisible: boolean): void {
    const layer = this.getActiveSurfaceLayer(currentNode)
    const shouldShow = !!layer && chromeVisible && this.surfaceSheetOpen && !this.infoSheetOpen
    this.bottomSheetEl.style.display = shouldShow ? 'flex' : 'none'
    this.bottomSheetEl.style.opacity = shouldShow ? '1' : '0'
    this.bottomSheetResetButtonEl.style.display = shouldShow ? 'flex' : 'none'
    this.bottomSheetResetButtonEl.style.opacity = shouldShow ? '1' : '0'
    this.bottomSheetResetButtonEl.style.pointerEvents = shouldShow ? 'auto' : 'none'
    if (!shouldShow || !layer) {
      this.bottomSheetBreadcrumbEl.replaceChildren()
      this.bottomSheetCardsEl.replaceChildren()
      return
    }

    this.bottomSheetBreadcrumbEl.replaceChildren()
    if (layer.primaryCategory?.trim()) {
      const primaryEl = document.createElement('span')
      primaryEl.textContent = layer.primaryCategory
      Object.assign(primaryEl.style, {
        fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        fontStyle: 'normal',
        fontWeight: '600',
        fontSize: '14px',
        lineHeight: '18px',
        color: 'rgba(0, 0, 0, 0.84)',
        flexShrink: '0',
      })
      const separatorEl = document.createElement('span')
      separatorEl.textContent = '>'
      Object.assign(separatorEl.style, {
        fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        fontStyle: 'normal',
        fontWeight: '600',
        fontSize: '14px',
        lineHeight: '18px',
        color: 'rgba(0, 0, 0, 0.84)',
        flexShrink: '0',
      })
      this.bottomSheetBreadcrumbEl.appendChild(primaryEl)
      this.bottomSheetBreadcrumbEl.appendChild(separatorEl)
    }
    const titleEl = document.createElement('span')
    titleEl.textContent = layer.title
    Object.assign(titleEl.style, {
      minWidth: '0',
      fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
      fontStyle: 'normal',
      fontWeight: '400',
      fontSize: '14px',
      lineHeight: '18px',
      color: 'rgba(0, 0, 0, 0.6)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    })
    this.bottomSheetBreadcrumbEl.appendChild(titleEl)
    this.bottomSheetCardsEl.replaceChildren()

    for (const card of layer.cards) {
      const cardEl = document.createElement('button')
      const titleEl = document.createElement('div')
      const descEl = document.createElement('div')
      const selected = card.id === this.activeSurfaceCardId
      cardEl.type = 'button'
      cardEl.dataset.surfaceSheetCardId = card.id
      Object.assign(cardEl.style, {
        flex: '0 0 260px',
        minHeight: '108px',
        padding: '14px 16px',
        borderRadius: '12px',
        border: selected ? '2px solid #3366FF' : '1px solid rgba(15, 23, 42, 0.08)',
        background: selected ? 'rgba(51, 102, 255, 0.10)' : '#FFFFFF',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: '8px',
        textAlign: 'left',
        cursor: 'pointer',
        scrollSnapAlign: 'start',
      })
      Object.assign(titleEl.style, {
        fontSize: '16px',
        lineHeight: '22px',
        fontWeight: '700',
        color: 'rgba(0, 0, 0, 0.88)',
      })
      titleEl.textContent = card.title
      Object.assign(descEl.style, {
        fontSize: '14px',
        lineHeight: '22px',
        color: 'rgba(0, 0, 0, 0.72)',
      })
      descEl.textContent = card.description ?? ''
      cardEl.appendChild(titleEl)
      cardEl.appendChild(descEl)
      cardEl.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        this.focusSurfaceCard(card.id, true)
      })
      this.bottomSheetCardsEl.appendChild(cardEl)
    }
    this.bottomSheetResetButtonEl.style.bottom = `${this.bottomSheetEl.offsetHeight + 16}px`
    this.scrollActiveSheetCardIntoView()
  }

  private renderInfoSheet(manifest: PublishManifest | null, chromeVisible: boolean): void {
    const infoOverlay = this.getInfoOverlayConfig(manifest)
    const shouldShow = !!infoOverlay && chromeVisible && this.infoSheetOpen
    this.infoSheetBackdropEl.style.display = shouldShow ? 'block' : 'none'
    this.infoSheetBackdropEl.style.opacity = shouldShow ? '1' : '0'
    this.infoSheetBackdropEl.style.pointerEvents = shouldShow ? 'auto' : 'none'
    this.infoSheetEl.style.display = shouldShow ? 'flex' : 'none'
    this.infoSheetEl.style.opacity = shouldShow ? '1' : '0'
    this.infoSheetEl.style.pointerEvents = shouldShow ? 'auto' : 'none'
    if (!shouldShow || !infoOverlay) {
      this.infoSheetContentEl.replaceChildren()
      return
    }

    this.infoSheetTitleEl.textContent = infoOverlay.title?.trim() || INFO_SHEET_DEFAULT_TITLE
    this.infoSheetContentEl.replaceChildren()

    for (const section of infoOverlay.sections) {
      const sectionEl = document.createElement('section')
      const headingEl = document.createElement('div')
      const bodyEl = document.createElement('div')
      headingEl.textContent = section.heading
      bodyEl.textContent = section.body
      Object.assign(sectionEl.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      })
      Object.assign(headingEl.style, {
        fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        fontStyle: 'normal',
        fontWeight: '600',
        fontSize: '16px',
        lineHeight: '22px',
        color: 'rgba(0, 0, 0, 0.84)',
      })
      Object.assign(bodyEl.style, {
        fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        fontStyle: 'normal',
        fontWeight: '400',
        fontSize: '14px',
        lineHeight: '20px',
        color: 'rgba(0, 0, 0, 0.6)',
        whiteSpace: 'pre-wrap',
      })
      sectionEl.appendChild(headingEl)
      sectionEl.appendChild(bodyEl)
      this.infoSheetContentEl.appendChild(sectionEl)
    }
  }

  private getInfoOverlayConfig(manifest: PublishManifest | null | undefined): InfoOverlayConfig | null {
    const title = manifest?.infoOverlay?.title
    const sections = manifest?.infoOverlay?.sections?.filter(section => {
      return typeof section?.heading === 'string' && section.heading.trim()
        && typeof section?.body === 'string' && section.body.trim()
    }) ?? []
    if (sections.length === 0) {
      return INFO_SHEET_FALLBACK_CONFIG
    }
    return {
      title: typeof title === 'string' ? title : undefined,
      sections,
    }
  }

  private toggleInfoSheet(): void {
    if (this.infoSheetOpen) {
      this.closeInfoSheet()
      return
    }
    const manifest = this.engine.getManifest()
    if (!this.getInfoOverlayConfig(manifest)) return
    this.surfaceSheetOpen = false
    this.activeSurfaceCardId = null
    this.infoSheetOpen = true
    this.renderChrome(this.getState())
  }

  private closeInfoSheet(): void {
    if (!this.infoSheetOpen) return
    this.infoSheetOpen = false
    this.renderChrome(this.getState())
  }

  private async handleShareAction(): Promise<void> {
    const browserNavigator = globalThis.navigator as Navigator & {
      share?: (data: { title?: string, text?: string, url?: string }) => Promise<void>
    }
    if (typeof browserNavigator.share !== 'function') return
    try {
      await browserNavigator.share({
        title: this.engine.getManifest()?.title ?? '',
        url: window.location.href,
      })
    } catch {
      // Ignore abort and unsupported platform share failures.
    }
  }

  private renderHtmlNode(currentNode: PublishNode, transitioning: boolean): void {
    this.pinchState.active = false
    this.activeSurfaceLayout = null
    this.activeSurfaceNodeId = null
    this.activeSurfaceLayerId = null
    this.activeSurfaceCardId = null
    this.surfaceSheetOpen = false
    this.currentSurfaceCamera = null
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
    this.pinchState.active = false
    this.activeSurfaceLayout = null
    this.activeSurfaceNodeId = null
    this.activeSurfaceLayerId = null
    this.activeSurfaceCardId = null
    this.surfaceSheetOpen = false
    this.currentSurfaceCamera = null
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

  private renderSurfaceNode(currentNode: PublishNode, transitioning: boolean): void {
    if (!currentNode.surfaceConfig) {
      this.renderImageNode(currentNode, transitioning)
      return
    }
    this.activeContentType = 'image'
    this.activeHtmlIframeUrl = ''
    this.htmlNodeBridge.deactivateNode()
    this.hideAllManagedIframes()
    const previousSurfaceNodeId = this.activeSurfaceNodeId
    this.activeSurfaceNodeId = currentNode.id
    if (!this.currentSurfaceCamera || previousSurfaceNodeId !== currentNode.id) {
      this.currentSurfaceCamera = currentNode.surfaceConfig.initialCamera
    }
    if (previousSurfaceNodeId !== currentNode.id) {
      this.activeSurfaceLayerId = null
      this.activeSurfaceCardId = null
      this.surfaceSheetOpen = false
    }

    this.refs.nodeImage.style.visibility = 'visible'
    this.refs.nodeImage.style.pointerEvents = transitioning ? 'none' : 'auto'
    this.refs.nodeImage.src = currentNode.surfaceConfig.sourceImageUrl
    this.refs.nodeImage.alt = currentNode.title ?? currentNode.id
    this.refs.nodeImage.style.opacity = transitioning ? '0' : '1'
    this.applySurfaceImageLayout(currentNode)
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

  private applySurfaceImageLayout(currentNode: PublishNode): void {
    const surfaceConfig = currentNode.surfaceConfig
    if (!surfaceConfig || !this.currentSurfaceCamera) return
    const { nodeImage, container } = this.refs
    const layout = resolveSurfaceCameraLayout({
      viewportWidth: container.clientWidth,
      viewportHeight: container.clientHeight,
      sourceAspect: this.getNodeAspectRatio(currentNode) ?? 1,
      camera: this.currentSurfaceCamera,
      bounds: surfaceConfig.bounds,
    })
    this.activeSurfaceLayout = layout
    this.currentSurfaceCamera = layout.camera
    this.imageOffset = { x: layout.translateX + layout.originX, y: layout.translateY + layout.originY }

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

  private applyImageTransform(offsetX: number, offsetY: number): void {
    const currentNode = this.engine.getCurrentNode()
    const fitMode = currentNode?.imageFitMode ?? 'fill'
    const nextX = fitMode === 'fitHeight' ? offsetX : 0
    const nextY = fitMode === 'fitWidth' ? offsetY : 0
    this.imageOffset = { x: nextX, y: nextY }
    this.refs.nodeImage.style.transform = `translate(-50%, -50%) translate(${nextX}px, ${nextY}px)`
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

  private scheduleHotspotViewportUpdate(): void {
    if (this.hotspotViewportFrameId !== null) return
    this.hotspotViewportFrameId = requestAnimationFrame(() => {
      this.hotspotViewportFrameId = null
      this.updateHotspotViewport()
    })
  }

  private renderAnnotations(currentNode: PublishNode | null, transitioning: boolean): void {
    this.refs.hotspots.innerHTML = ''
    if (!currentNode) return

    if (this.getNodeKind(currentNode) === 'surface') {
      const annotations = resolveVisibleSurfaceAnnotations(
        currentNode.surfaceLayers,
        this.currentSurfaceCamera ?? currentNode.surfaceConfig?.initialCamera ?? { centerX: 0.5, centerY: 0.5, zoom: 1 },
      )
      for (const hotspot of annotations.hotspots) {
        this.refs.hotspots.appendChild(this.createSurfaceHotspotButton(hotspot, currentNode))
      }
      if (!transitioning) {
        for (const card of annotations.cards) {
          this.refs.hotspots.appendChild(this.createSurfaceCard(card))
        }
      }
      requestAnimationFrame(() => {
        this.updateHotspotViewport()
      })
      return
    }

    for (const hotspot of currentNode.hotspots ?? []) {
      this.refs.hotspots.appendChild(this.createHotspotButton(hotspot, currentNode))
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

  private createHotspotButton(
    hotspot: PublishHotspot,
    _node?: PublishNode | null,
    onClick?: () => void,
  ): HTMLElement {
    this.ensureHotspotAnimationStyle()

    const root = this.createAnchoredAnnotationRoot(hotspot.normalizedX, hotspot.normalizedY)
    const button = document.createElement('button')
    const label = document.createElement('span')

    button.type = 'button'
    button.title = hotspot.label
    this.applyAnnotationChipStyles(button, false)
    button.style.animation = 'hotspot-pulse 2.5s ease-in-out infinite'

    label.textContent = hotspot.label
    label.style.display = 'block'
    label.style.overflow = 'hidden'
    label.style.textOverflow = 'ellipsis'
    label.style.fontFamily = '"PingFang SC", "Noto Sans SC", "Noto Sans S Chinese", "Microsoft YaHei", sans-serif'
    label.style.fontStyle = 'normal'
    label.style.fontWeight = '600'
    label.style.fontSize = '16px'
    label.style.lineHeight = '20px'
    label.style.textAlign = 'center'
    label.style.color = 'inherit'
    button.appendChild(label)

    if (hotspot.style?.trim()) {
      button.style.cssText += `;${hotspot.style}`
    }

    const markerConfig = this.resolveMarkerConfig(hotspot.style)
    this.appendMarkerAndButton(root, button, this.createAnnotationMarker(false), markerConfig)

    button.addEventListener('click', () => {
      if (onClick) {
        onClick()
      } else {
        this.handleHotspotNavigation(hotspot)
      }
    })

    return root
  }

  private createSurfaceCard(card: SurfaceCard): HTMLDivElement {
    const root = this.createAnchoredAnnotationRoot(card.anchor.x, card.anchor.y)
    const button = document.createElement('button')
    const label = document.createElement('span')
    const selected = this.activeSurfaceCardId === card.id

    root.dataset.surfaceCard = 'true'

    this.applyAnnotationChipStyles(button, selected)
    button.type = 'button'
    button.style.minWidth = '88px'
    button.style.maxWidth = '180px'
    button.style.contain = 'layout paint style'
    button.style.willChange = 'left,top'

    label.textContent = card.title
    label.style.display = 'block'
    label.style.overflow = 'hidden'
    label.style.textOverflow = 'ellipsis'
    label.style.fontFamily = '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif'
    label.style.fontStyle = 'normal'
    label.style.fontWeight = '600'
    label.style.fontSize = '16px'
    label.style.lineHeight = '20px'
    label.style.textAlign = 'center'
    label.style.color = 'inherit'
    button.appendChild(label)

    this.appendMarkerAndButton(root, button, this.createAnnotationMarker(selected), {
      visible: true,
      position: 'top',
      gapPx: 6,
    })
    root.style.zIndex = selected ? '3' : '2'

    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.focusSurfaceCard(card.id, false)
    })
    return root
  }

  private createSurfaceHotspotButton(hotspot: SurfaceHotspot, currentNode: PublishNode): HTMLElement {
    const button = this.createHotspotButton({
      edgeId: hotspot.target.type === 'edge' ? hotspot.target.edgeId : hotspot.id,
      targetNodeId: hotspot.target.type === 'edge'
        ? this.engine.getManifest()?.edgeMap[hotspot.target.edgeId]?.toNodeId ?? currentNode.id
        : currentNode.id,
      label: hotspot.label,
      normalizedX: hotspot.anchor.x,
      normalizedY: hotspot.anchor.y,
      radius: 12,
      markerType: 'dot',
      style: hotspot.style,
    }, currentNode, () => this.handleSurfaceHotspotNavigation(hotspot, currentNode))
    ;(button as HTMLElement).dataset.surfaceAnchorX = String(hotspot.anchor.x)
    ;(button as HTMLElement).dataset.surfaceAnchorY = String(hotspot.anchor.y)
    return button
  }

  private updateHotspotViewport(): void {
    const { container, nodeImage, nodeIframe, hotspots, stage } = this.refs
    if (stage.hidden) return

    const currentNode = this.engine.getCurrentNode()
    if (currentNode && this.getNodeKind(currentNode) === 'surface' && this.activeSurfaceLayout) {
      hotspots.style.left = '0px'
      hotspots.style.top = '0px'
      hotspots.style.width = '100%'
      hotspots.style.height = '100%'
      hotspots.style.clipPath = ''
      this.positionSurfaceAnnotations(hotspots, this.activeSurfaceLayout)
      return
    }

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
    hotspots.style.clipPath = ''
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
      const expectedNode = currentNode
      const expectedSrc = this.toAbsoluteUrl(this.getNodeImageSource(expectedNode) ?? '')
      const actualSrc = this.refs.nodeImage.currentSrc || this.refs.nodeImage.src
      if (!this.refs.nodeImage.complete || actualSrc !== expectedSrc) return
    }

    this.engine.confirmHostVisualCommitted()
  }

  private toAbsoluteUrl(url: string): string {
    return new URL(url, window.location.href).href
  }

  private isInteractiveSurfaceTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return !!target.closest('[data-surface-card="true"], [data-surface-stock="true"], button')
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
    const waitingForEnginePreload = this.engine.isPreloading()
    const waitingForActiveImage = this.getNodeKind(currentNode) !== 'html' && !this.isActiveNodeImageReady(currentNode)
    return waitingForEnginePreload || waitingForActiveImage
  }

  private isActiveNodeImageReady(node: PublishNode | null | undefined): boolean {
    const imageUrl = this.getNodeImageSource(node)
    if (!imageUrl) return true
    const expectedSrc = this.toAbsoluteUrl(imageUrl)
    const actualSrc = this.refs.nodeImage.currentSrc || this.refs.nodeImage.src
    return this.refs.nodeImage.complete && actualSrc === expectedSrc && this.refs.nodeImage.naturalWidth > 0
  }

  private async preloadHtmlIframes(urls: string[]): Promise<void> {
    const htmlUrls = Array.from(new Set(urls.map(url => this.toAbsoluteUrl(url))))
    if (htmlUrls.length === 0) return

    for (const url of htmlUrls) {
      await this.runHtmlWarmupWhenIdle(() => this.ensureHtmlIframe(url).readyPromise)
      await this.yieldToBrowser()
    }
  }

  private maybeStartHtmlIframePreload(): void {
    const manifest = this.engine.getManifest()
    if (!manifest) return
    if (this.htmlIframePreloading) return

    const strategy = this.resolveHtmlIframePreloadStrategy(manifest)
    if (strategy === 'on-demand') return

    const scope = this.getHtmlIframePreloadScope(manifest, strategy)
    if (!scope) return
    if (this.htmlIframePreloadedScopes.has(scope.key)) return

    this.htmlIframePreloadedScopes.add(scope.key)
    this.htmlIframePreloading = true
    this.htmlIframeWarmupQueue = this.htmlIframeWarmupQueue
      .then(() => this.preloadHtmlIframes(scope.urls))
      .finally(() => {
        this.htmlIframePreloading = false
      })
  }

  private resolveHtmlIframePreloadStrategy(manifest: PublishManifest): HtmlIframePreloadStrategy {
    return this.options.runtimeConfig?.htmlIframePreloadStrategy
      ?? manifest.runtimeConfig?.htmlIframePreloadStrategy
      ?? 'current-node'
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

  private runHtmlWarmupWhenIdle(task: () => Promise<void>): Promise<void> {
    return new Promise(resolve => {
      const execute = () => {
        task().finally(resolve)
      }

      const browserWindow = globalThis as typeof globalThis & Window
      if (typeof browserWindow.requestIdleCallback === 'function') {
        browserWindow.requestIdleCallback(() => execute(), { timeout: 1200 })
        return
      }

      window.setTimeout(execute, 0)
    })
  }

  private yieldToBrowser(): Promise<void> {
    return new Promise(resolve => {
      window.setTimeout(resolve, 0)
    })
  }

  private handleBackAction(): void {
    if (this.infoSheetOpen) {
      this.closeInfoSheet()
      return
    }
    const currentNode = this.engine.getCurrentNode()
    if (this.hasActiveSurfaceFocus(currentNode)) {
      this.resetSurfaceFocus(true)
      return
    }
    this.engine.handleBack()
  }

  private canResetSurfaceCamera(node: PublishNode | null | undefined): boolean {
    if (!node || this.getNodeKind(node) !== 'surface' || !node.surfaceConfig || !this.currentSurfaceCamera) {
      return false
    }
    const initial = node.surfaceConfig.initialCamera
    return (
      Math.abs(this.currentSurfaceCamera.centerX - initial.centerX) > 0.0001
      || Math.abs(this.currentSurfaceCamera.centerY - initial.centerY) > 0.0001
      || Math.abs(this.currentSurfaceCamera.zoom - initial.zoom) > 0.0001
    )
  }

  private hasActiveSurfaceFocus(node: PublishNode | null | undefined): boolean {
    if (!node || this.getNodeKind(node) !== 'surface' || !node.surfaceConfig) {
      return false
    }
    return this.surfaceSheetOpen
      || !!this.activeSurfaceLayerId
      || !!this.activeSurfaceCardId
      || this.canResetSurfaceCamera(node)
  }

  private resetSurfaceFocus(animated: boolean): void {
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode || this.getNodeKind(currentNode) !== 'surface' || !currentNode.surfaceConfig) {
      return
    }
    this.surfaceSheetOpen = false
    this.activeSurfaceLayerId = null
    this.activeSurfaceCardId = null
    this.setSurfaceCamera(currentNode.surfaceConfig.initialCamera, animated)
  }

  private setSurfaceCamera(camera: CameraState, animated: boolean): void {
    const currentNode = this.engine.getCurrentNode()
    if (!currentNode || this.getNodeKind(currentNode) !== 'surface' || !currentNode.surfaceConfig) return

    const apply = (nextCamera: CameraState) => {
      this.currentSurfaceCamera = nextCamera
      this.applySurfaceImageLayout(currentNode)
      this.renderAnnotations(currentNode, this.engine.isTransitioning())
      this.updateHotspotViewport()
      this.renderChrome(this.getState())
      this.emitState()
    }

    if (!animated || !this.currentSurfaceCamera) {
      if (this.surfaceAnimationFrameId !== null) {
        cancelAnimationFrame(this.surfaceAnimationFrameId)
        this.surfaceAnimationFrameId = null
      }
      apply(camera)
      return
    }

    const from = this.currentSurfaceCamera
    const to = camera
    const startTime = performance.now()
    const duration = 260
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - (1 - progress) * (1 - progress)
      apply(interpolateCamera(from, to, eased))
      if (progress < 1) {
        this.surfaceAnimationFrameId = requestAnimationFrame(step)
      } else {
        this.surfaceAnimationFrameId = null
      }
    }

    if (this.surfaceAnimationFrameId !== null) {
      cancelAnimationFrame(this.surfaceAnimationFrameId)
    }
    this.surfaceAnimationFrameId = requestAnimationFrame(step)
  }

  private handleSurfaceHotspotNavigation(hotspot: SurfaceHotspot, currentNode: PublishNode): void {
    if (hotspot.target.type === 'edge') {
      this.navigateByEdge(hotspot.target.edgeId)
      return
    }
    if (hotspot.target.type === 'camera-preset') {
      this.setSurfaceCamera(hotspot.target.camera, true)
      return
    }
    if (hotspot.target.type === 'focus-layer') {
      const { layerId } = hotspot.target
      const layer = currentNode.surfaceLayers?.find(item => item.id === layerId)
      this.activeSurfaceLayerId = layerId
      this.activeSurfaceCardId = null
      this.surfaceSheetOpen = true
      if (layer?.cameraPreset) {
        this.setSurfaceCamera({
          ...layer.cameraPreset,
          zoom: layer.visibility.minZoom,
        }, true)
      } else {
        this.render()
      }
    }
  }

  private positionSurfaceAnnotations(
    hotspots: HTMLElement,
    layout: SurfaceCameraLayout,
  ): void {
    hotspots.querySelectorAll<HTMLElement>('[data-surface-anchor-x]').forEach(el => {
      const x = Number(el.dataset.surfaceAnchorX ?? '0')
      const y = Number(el.dataset.surfaceAnchorY ?? '0')
      const point = projectSurfacePoint({ x, y }, layout)
      el.style.left = `${point.x}px`
      el.style.top = `${point.y}px`
      el.style.transform = 'translate(-50%, -50%)'
    })
  }

  private createAnchoredAnnotationRoot(normalizedX: number, normalizedY: number): HTMLDivElement {
    const root = document.createElement('div')
    root.style.position = 'absolute'
    root.style.left = `${normalizedX * 100}%`
    root.style.top = `${normalizedY * 100}%`
    root.style.transform = 'translate(-50%, -50%)'
    root.style.display = 'flex'
    root.style.flexDirection = 'column'
    root.style.alignItems = 'center'
    root.style.justifyContent = 'center'
    root.style.gap = '6px'
    root.style.pointerEvents = 'none'
    root.style.zIndex = '2'
    root.dataset.surfaceAnchorX = String(normalizedX)
    root.dataset.surfaceAnchorY = String(normalizedY)
    return root
  }

  private createAnnotationMarker(selected: boolean): HTMLSpanElement {
    const marker = document.createElement('span')
    marker.style.display = 'inline-flex'
    marker.style.alignItems = 'center'
    marker.style.justifyContent = 'center'
    marker.style.width = '21px'
    marker.style.height = '21px'
    marker.style.pointerEvents = 'none'
    marker.innerHTML = selected ? SURFACE_MARKER_SELECTED_SVG : SURFACE_MARKER_SVG
    return marker
  }

  private appendMarkerAndButton(
    root: HTMLDivElement,
    button: HTMLButtonElement,
    marker: HTMLSpanElement,
    config: { visible: boolean, position: 'top' | 'bottom', gapPx: number },
  ): void {
    root.style.gap = `${config.gapPx}px`
    if (config.visible && config.position === 'top') {
      root.appendChild(marker)
    }
    root.appendChild(button)
    if (config.visible && config.position === 'bottom') {
      root.appendChild(marker)
    }
  }

  private applyAnnotationChipStyles(button: HTMLButtonElement, selected: boolean): void {
    button.style.display = 'flex'
    button.style.flexDirection = 'row'
    button.style.alignItems = 'center'
    button.style.justifyContent = 'center'
    button.style.minWidth = '80px'
    button.style.height = '36px'
    button.style.padding = '8px 12px'
    button.style.borderRadius = '30px'
    button.style.border = selected ? 'none' : '1px solid rgba(255, 255, 255, 0.36)'
    button.style.background = selected ? '#3366FF' : 'rgba(255, 255, 255, 0.8)'
    button.style.color = selected ? '#FFFFFF' : 'rgba(0, 0, 0, 0.84)'
    button.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.08)'
    button.style.cursor = 'pointer'
    button.style.pointerEvents = 'auto'
    button.style.whiteSpace = 'nowrap'
    button.style.zIndex = '1'
  }

  private resolveMarkerConfig(styleText?: string): { visible: boolean, position: 'top' | 'bottom', gapPx: number } {
    const markerDisplay = styleText?.match(/--hotspot-marker-display\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase()
    const markerPosition = styleText?.match(/--hotspot-marker-position\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase()
    const markerGapRaw = styleText?.match(/--hotspot-marker-gap\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() ?? ''
    const markerGapParsed = Number.parseFloat(markerGapRaw.replace(/px$/i, '').trim())
    return {
      visible: markerDisplay !== 'none',
      position: markerPosition === 'bottom' ? 'bottom' : 'top',
      gapPx: Number.isFinite(markerGapParsed) ? Math.max(markerGapParsed, 0) : 6,
    }
  }

  private setActiveSurfaceCard(cardId: string | null): void {
    if (this.activeSurfaceCardId === cardId) return
    this.activeSurfaceCardId = cardId
    if (this.getNodeKind(this.engine.getCurrentNode()) === 'surface') {
      this.render()
    }
  }

  private focusSurfaceCard(cardId: string, moveCamera: boolean): void {
    const currentNode = this.engine.getCurrentNode()
    const cardContext = this.findSurfaceCardContext(currentNode, cardId)
    if (!cardContext) return
    this.activeSurfaceLayerId = cardContext.layer.id
    this.surfaceSheetOpen = true
    this.setActiveSurfaceCard(cardId)
    if (moveCamera && this.currentSurfaceCamera) {
      this.setSurfaceCamera({
        centerX: cardContext.card.anchor.x,
        centerY: cardContext.card.anchor.y,
        zoom: this.currentSurfaceCamera.zoom,
      }, true)
    } else {
      this.scrollActiveSheetCardIntoView()
    }
  }

  private closeSurfaceSheet(): void {
    this.surfaceSheetOpen = false
    this.activeSurfaceCardId = null
    if (this.getNodeKind(this.engine.getCurrentNode()) === 'surface') {
      this.render()
    }
  }

  private getActiveSurfaceLayer(node: PublishNode | null | undefined): SurfaceFocusLayer | null {
    if (!node || this.getNodeKind(node) !== 'surface' || !this.activeSurfaceLayerId) return null
    return node.surfaceLayers?.find(layer => layer.id === this.activeSurfaceLayerId) ?? null
  }

  private canUseNativeShare(): boolean {
    const browserNavigator = globalThis.navigator as Navigator & {
      share?: (data: { title?: string, text?: string, url?: string }) => Promise<void>
    }
    return typeof browserNavigator.share === 'function'
  }

  private findSurfaceCardContext(
    node: PublishNode | null | undefined,
    cardId: string,
  ): { layer: SurfaceFocusLayer, card: SurfaceCard } | null {
    if (!node || this.getNodeKind(node) !== 'surface') return null
    for (const layer of node.surfaceLayers ?? []) {
      const card = layer.cards.find(item => item.id === cardId)
      if (card) return { layer, card }
    }
    return null
  }

  private scrollActiveSheetCardIntoView(): void {
    if (!this.activeSurfaceCardId) return
    requestAnimationFrame(() => {
      const activeCard = this.bottomSheetCardsEl.querySelector<HTMLElement>(`[data-surface-sheet-card-id="${this.activeSurfaceCardId}"]`)
      activeCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
  }

  private getNodeImageSource(node: PublishNode | null | undefined): string | undefined {
    if (!node) return undefined
    if (this.getNodeKind(node) === 'surface') {
      return node.surfaceConfig?.sourceImageUrl ?? node.imageUrl
    }
    return node.imageUrl
  }

  private getNodeAspectRatio(node: PublishNode | null | undefined): number | null {
    const imageUrl = this.getNodeImageSource(node)
    if (!imageUrl) return null
    const absoluteUrl = this.toAbsoluteUrl(imageUrl)
    const currentSrc = this.refs.nodeImage.currentSrc || this.refs.nodeImage.src
    if ((currentSrc && absoluteUrl === currentSrc) && this.refs.nodeImage.naturalWidth > 0 && this.refs.nodeImage.naturalHeight > 0) {
      return this.refs.nodeImage.naturalWidth / this.refs.nodeImage.naturalHeight
    }
    return this.engine.getSourceNodeAspectRatio(node)
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

  private getNodeKind(node: PublishNode | null | undefined): 'surface' | 'image' | 'html' {
    if (!node) return 'image'
    return node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')
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
