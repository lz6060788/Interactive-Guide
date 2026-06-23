import type {
  PublishManifest,
  PublishHotspot,
  PublishNode,
  CameraState,
  RuntimeConfig,
} from '../../shared/types.js'
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
import type { SurfaceCameraLayout } from './surface-camera.js'
import kingfisherBridgeUmdScript from './vendor/kingfisher-bridge.umd.js?raw'
import kingfisherFalconUmdScript from './vendor/kingfisher-falcon.umd.js?raw'
import { PageTracker } from './player-host-tracking.js'
import { SurfaceController, type SurfaceControllerEnv } from './player-host-surface.js'
import { HtmlIframeManager, type HtmlIframeManagerEnv, type HtmlIframeEntry } from './player-host-html.js'
import { AnnotationRenderer, type AnnotationRendererEnv } from './player-host-annotation-renderer.js'
import { NodeRenderer, type NodeRendererEnv } from './player-host-node-renderer.js'
import { EventManager, type EventManagerEnv } from './player-host-event-manager.js'
import { NavigationHandler, type NavigationEnv } from './player-host-navigation.js'
import { ChromeRenderer, type ChromeRendererEnv, buildChromeStructure } from './player-host-chrome-render.js'
import { ShareManager, type F10ShareUtils } from './player-host-share.js'
import { applyBaseStyles } from './player-host-styles.js'
import type { ChromeElements } from './player-host-styles.js'
import {
  toAbsoluteUrl,
  parseRuntimeRouteSelection,
  type RuntimeRouteSelection,
} from './player-host-routing.js'
import { ensureExternalScriptLoaded, confirmHostVisualCommitIfReady } from './player-host-utils.js'
import { applyStageLayout } from './player-host-stage-layout.js'

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

export interface PlayerHostOptions {
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

export type DragState = {
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

type TouchPinchState = {
  active: boolean
  startDistance: number
  startCamera: CameraState | null
  anchorNormX: number
  anchorNormY: number
  baseWidth: number
  baseHeight: number
}

export type SheetCardDragState = {
  pointerId: number
  startX: number
  startScrollLeft: number
  moved: boolean
}

export type WeblogApi = {
  report?: (payload?: Record<string, unknown>) => void
  setConfig?: (payload?: Record<string, unknown>) => void
}

export type PlayerHostWindow = Window & typeof globalThis & {
  F10Utils?: F10ShareUtils
  _f?: F10ShareUtils
  weblog?: WeblogApi
  __interactiveGuideF10UtilsPromise?: Promise<F10ShareUtils | null>
  __interactiveGuideWeblogPromise?: Promise<WeblogApi | null>
  __interactiveGuideWeblogConfigured?: boolean
  Bridge?: unknown
  'kingfisher-bridge'?: unknown
  _falcon?: unknown
  FalconJavaInterface?: unknown
}

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
  private headerBackdropEl = document.createElement('div')
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
  private dragHintBackdropEl = document.createElement('div')
  private dragHintEl = document.createElement('div')
  private activeContentType: 'image' | 'html' = 'image'
  private get activeSurfaceLayout(): SurfaceCameraLayout | null { return this.surface.activeLayout }
  private set activeSurfaceLayout(v: SurfaceCameraLayout | null) { this.surface.activeLayout = v }
  private get activeSurfaceNodeId(): string | null { return this.surface.activeNodeId }
  private set activeSurfaceNodeId(v: string | null) { this.surface.activeNodeId = v }
  private get activeSurfaceLayerId(): string | null { return this.surface.activeLayerId }
  private set activeSurfaceLayerId(v: string | null) { this.surface.activeLayerId = v }
  private get activeSurfaceCardId(): string | null { return this.surface.activeCardId }
  private set activeSurfaceCardId(v: string | null) { this.surface.activeCardId = v }
  private get surfaceSheetOpen(): boolean { return this.surface.sheetOpen }
  private set surfaceSheetOpen(v: boolean) { this.surface.sheetOpen = v }
  private infoSheetOpen = false
  private get currentSurfaceCamera(): CameraState | null { return this.surface.currentCamera }
  private set currentSurfaceCamera(v: CameraState | null) { this.surface.currentCamera = v }
  private get surfaceAnimationFrameId(): number | null { return this.surface.animationFrameId }
  private set surfaceAnimationFrameId(v: number | null) { this.surface.animationFrameId = v }
  private htmlIframeLayer = document.createElement('div')
  private get htmlIframeEntries(): Map<string, HtmlIframeEntry> { return this.htmlIframe.entries }
  private get htmlIframePreloading(): boolean { return this.htmlIframe.preloading }
  private set htmlIframePreloading(v: boolean) { this.htmlIframe.preloading = v }
  private get htmlIframePreloadedScopes(): Set<string> { return this.htmlIframe.preloadedScopes }
  private get htmlIframeWarmupQueue(): Promise<void> { return this.htmlIframe.warmupQueue }
  private set htmlIframeWarmupQueue(v: Promise<void>) { this.htmlIframe.warmupQueue = v }
  private get activeHtmlIframeUrl(): string { return this.htmlIframe.activeUrl }
  private set activeHtmlIframeUrl(v: string) { this.htmlIframe.activeUrl = v }
  private activeHtmlRouteSelection: RuntimeRouteSelection | null = null
  private pendingRouteSelection: RuntimeRouteSelection | null = null
  private renderedBottomSheetNodeId: string | null = null
  private renderedBottomSheetLayerId: string | null = null
  private renderedBottomSheetCardId: string | null = null
  private viewportPointerDownTarget: EventTarget | null = null
  private get surfaceCardScrollSettleTimer(): number | null { return this.surface.cardScrollSettleTimer }
  private set surfaceCardScrollSettleTimer(v: number | null) { this.surface.cardScrollSettleTimer = v }
  private get surfaceCardScrollSyncTimer(): number | null { return this.surface.cardScrollSyncTimer }
  private set surfaceCardScrollSyncTimer(v: number | null) { this.surface.cardScrollSyncTimer = v }
  private get surfaceCardScrollSyncLocked(): boolean { return this.surface.cardScrollSyncLocked }
  private set surfaceCardScrollSyncLocked(v: boolean) { this.surface.cardScrollSyncLocked = v }
  private bottomSheetCardsDragState: SheetCardDragState | null = null
  private ignoreBottomSheetCardClick = false
  private pageTracker = new PageTracker()
  private shareManager = new ShareManager()
  private surface!: SurfaceController
  private htmlIframe!: HtmlIframeManager
  private chrome!: ChromeRenderer
  private annotations!: AnnotationRenderer
  private nodeRenderer!: NodeRenderer
  private events!: EventManager
  private navigation!: NavigationHandler
  private get pinchState(): TouchPinchState { return this.surface.pinchState }
  private set pinchState(v: TouchPinchState) { this.surface.pinchState = v }

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
      getRuntimeSnapshot: () => this.navigation.getHtmlNodeBridgeRuntimeSnapshot(),
      handleBackRequest: this.handleHtmlNodeBackRequest,
      handleRouteRequest: this.handleHtmlNodeRouteRequest,
      handleLegacyHotspotClick: edgeId => this.engine.handleHotspotById(edgeId),
    }
    this.htmlNodeBridge = new HtmlNodeBridge(htmlNodeBridgeHostPort)

    this.pageTracker.ensureExternalScriptLoaded = this.ensureExternalScriptLoaded

    this.shareManager.ensureExternalScriptLoaded = this.ensureExternalScriptLoaded
    this.shareManager.getInlineScriptText = (name) =>
      name === 'kingfisher-bridge' ? kingfisherBridgeUmdScript : kingfisherFalconUmdScript
    this.shareManager.getManifestTitle = () => this.engine.getManifest()?.title ?? ''
    this.shareManager.reportShare = () => this.pageTracker.reportShare()

    const surfaceEnv: SurfaceControllerEnv = {
      refs: this.refs,
      engine: this.engine,
      pageTracker: this.pageTracker,
      getNodeKind: (node) => this.getNodeKind(node),
      getNodeAspectRatio: (node) => this.getNodeAspectRatio(node),
      dragState: this.dragState,
      cancelPointerDrag: () => this.cancelSurfacePointerDrag(),
      navigateByEdge: (edgeId) => this.navigateByEdge(edgeId),
      applySurfaceImageLayout: (node) => this.nodeRenderer.applySurfaceImageLayout(node),
      requestRender: () => this.render(),
      renderChrome: () => this.renderChrome(this.getState()),
      emitState: () => this.emitState(),
      renderAnnotations: (node, transitioning) => this.annotations.renderAnnotations(node, transitioning),
      updateHotspotViewport: () => this.annotations.updateHotspotViewport(),
      getBottomSheetCardsEl: () => this.bottomSheetCardsEl,
    }
    this.surface = new SurfaceController(surfaceEnv)

    const htmlIframeEnv: HtmlIframeManagerEnv = {
      refs: this.refs,
      engine: this.engine,
      getNodeKind: (node) => this.getNodeKind(node),
      toAbsoluteUrl,
      htmlIframeLayer: this.htmlIframeLayer,
      requestRender: () => this.render(),
      updateHotspotViewport: () => this.annotations.updateHotspotViewport(),
      confirmHostVisualCommitIfReady: (reason) => this.confirmHostVisualCommitIfReady(reason),
      postHtmlNodeRouteSelection: (node) => this.navigation.postHtmlNodeRouteSelection(node),
      getRuntimeConfig: () => this.options.runtimeConfig,
    }
    this.htmlIframe = new HtmlIframeManager(htmlIframeEnv)

    const self = this
    const chromeEnv: ChromeRendererEnv = {
      chromeRoot: this.chromeRoot,
      headerBackdropEl: this.headerBackdropEl,
      headerCenterEl: this.headerCenterEl,
      packageTitleEl: this.packageTitleEl,
      infoButtonEl: this.infoButtonEl,
      shareButtonEl: this.shareButtonEl,
      bottomSheetEl: this.bottomSheetEl,
      bottomSheetBreadcrumbEl: this.bottomSheetBreadcrumbEl,
      bottomSheetCardsEl: this.bottomSheetCardsEl,
      bottomSheetResetButtonEl: this.bottomSheetResetButtonEl,
      infoSheetBackdropEl: this.infoSheetBackdropEl,
      infoSheetEl: this.infoSheetEl,
      infoSheetTitleEl: this.infoSheetTitleEl,
      infoSheetContentEl: this.infoSheetContentEl,
      dragHintBackdropEl: this.dragHintBackdropEl,
      dragHintEl: this.dragHintEl,
      get infoSheetOpen() { return self.infoSheetOpen },
      set infoSheetOpen(v: boolean) { self.infoSheetOpen = v },
      get surfaceSheetOpen() { return self.surfaceSheetOpen },
      set surfaceSheetOpen(v: boolean) { self.surfaceSheetOpen = v },
      get activeSurfaceCardId() { return self.activeSurfaceCardId },
      set activeSurfaceCardId(v: string | null) { self.activeSurfaceCardId = v },
      get renderedBottomSheetNodeId() { return self.renderedBottomSheetNodeId },
      set renderedBottomSheetNodeId(v: string | null) { self.renderedBottomSheetNodeId = v },
      get renderedBottomSheetLayerId() { return self.renderedBottomSheetLayerId },
      set renderedBottomSheetLayerId(v: string | null) { self.renderedBottomSheetLayerId = v },
      get renderedBottomSheetCardId() { return self.renderedBottomSheetCardId },
      set renderedBottomSheetCardId(v: string | null) { self.renderedBottomSheetCardId = v },
      get bottomSheetCardsDragState() { return self.bottomSheetCardsDragState },
      set bottomSheetCardsDragState(v: SheetCardDragState | null) { self.bottomSheetCardsDragState = v },
      get ignoreBottomSheetCardClick() { return self.ignoreBottomSheetCardClick },
      set ignoreBottomSheetCardClick(v: boolean) { self.ignoreBottomSheetCardClick = v },
      get surfaceCardScrollSyncLocked() { return self.surfaceCardScrollSyncLocked },
      set surfaceCardScrollSyncLocked(v: boolean) { self.surfaceCardScrollSyncLocked = v },
      getNodeKind: (node) => this.getNodeKind(node),
      getActiveSurfaceLayer: (node) => this.surface.getActiveLayer(node),
      canShare: () => this.shareManager.canShare(),
      focusSurfaceCard: (cardId, moveCamera) => this.focusSurfaceCard(cardId, moveCamera),
      scrollActiveSheetCardIntoView: () => this.surface.scrollActiveCardIntoView(),
      scheduleSurfaceCardScrollCommit: () => this.scheduleSurfaceCardScrollCommit(),
      clearSurfaceCardScrollSettleTimer: () => this.clearSurfaceCardScrollSettleTimer(),
      getManifest: () => this.engine.getManifest(),
      onChromeStateChanged: () => {
        this.renderChrome(this.getState())
        this.emitState()
      },
    }
    this.chrome = new ChromeRenderer(chromeEnv)

    const annotationRendererEnv: AnnotationRendererEnv = {
      refs: this.refs,
      engine: this.engine,
      getNodeKind: (node) => this.getNodeKind(node),
      getCurrentSurfaceCamera: () => this.surface.currentCamera,
      getActiveSurfaceLayout: () => this.surface.activeLayout,
      getActiveSurfaceCardId: () => this.surface.activeCardId,
      getActiveContentType: () => this.activeContentType,
      focusSurfaceCard: (cardId, moveCamera) => this.focusSurfaceCard(cardId, moveCamera),
      handleSurfaceHotspotNavigation: (hotspot, currentNode) => this.surface.handleHotspotNavigation(hotspot, currentNode),
      handleHotspotNavigation: (hotspot) => {
        void this.pageTracker.reportClick()
        this.htmlIframe.primeForNodeId(hotspot.targetNodeId)
        this.engine.handleHotspotClick(hotspot)
      },
      requestHotspotViewportUpdate: () => this.annotations.scheduleHotspotViewportUpdate(),
    }
    this.annotations = new AnnotationRenderer(annotationRendererEnv)

    const nodeRendererEnv: NodeRendererEnv = {
      refs: this.refs,
      engine: this.engine,
      surface: this.surface,
      htmlIframe: this.htmlIframe,
      annotations: this.annotations,
      htmlNodeBridge: this.htmlNodeBridge,
      getNodeKind: (node) => this.getNodeKind(node),
      getNodeImageSource: (node) => this.getNodeImageSource(node),
      getNodeAspectRatio: (node) => this.getNodeAspectRatio(node),
      applyPendingRouteSelection: (node) => this.navigation.applyPendingRouteSelection(node),
      get imageOffset() { return self.imageOffset },
      set imageOffset(v) { self.imageOffset = v },
      get activeContentType() { return self.activeContentType },
      set activeContentType(v) { self.activeContentType = v },
      get activeHtmlIframeUrl() { return self.activeHtmlIframeUrl },
      set activeHtmlIframeUrl(v) { self.activeHtmlIframeUrl = v },
    }
    this.nodeRenderer = new NodeRenderer(nodeRendererEnv)

    const eventManagerEnv: EventManagerEnv = {
      engine: this.engine,
      refs: this.refs,
      surface: this.surface,
      annotations: this.annotations,
      nodeRenderer: this.nodeRenderer,
      htmlNodeBridge: this.htmlNodeBridge,
      get dragState() { return self.dragState },
      set dragState(v) { self.dragState = v },
      get viewportPointerDownTarget() { return self.viewportPointerDownTarget },
      set viewportPointerDownTarget(v) { self.viewportPointerDownTarget = v },
      get infoSheetOpen() { return self.infoSheetOpen },
      set infoSheetOpen(v) { self.infoSheetOpen = v },
      get bottomSheetCardsDragState() { return self.bottomSheetCardsDragState },
      set bottomSheetCardsDragState(v) { self.bottomSheetCardsDragState = v },
      get ignoreBottomSheetCardClick() { return self.ignoreBottomSheetCardClick },
      set ignoreBottomSheetCardClick(v) { self.ignoreBottomSheetCardClick = v },
      get pinchState() { return self.pinchState },
      get imageOffset() { return self.imageOffset },
      get bottomSheetCardsEl() { return self.bottomSheetCardsEl },
      get activeSurfaceLayout() { return self.activeSurfaceLayout },
      get currentSurfaceCamera() { return self.currentSurfaceCamera },
      get activeSurfaceCardId() { return self.activeSurfaceCardId },
      get surfaceSheetOpen() { return self.surfaceSheetOpen },
      get surfaceCardScrollSyncLocked() { return self.surfaceCardScrollSyncLocked },
      options: this.options,
      getNodeKind: (node) => this.getNodeKind(node),
      getNodeAspectRatio: (node) => this.getNodeAspectRatio(node),
      getHtmlNodeBridgeRuntimeSnapshot: () => this.navigation.getHtmlNodeBridgeRuntimeSnapshot(),
      render: () => this.render(),
      emitState: () => this.emitState(),
      updateLayout: () => this.updateLayout(),
      confirmHostVisualCommitIfReady: (reason) => this.confirmHostVisualCommitIfReady(reason),
      tryHandleBackAction: () => this.navigation.tryHandleBackAction(),
      setSurfaceCamera: (camera, animated) => this.surface.setCamera(camera, animated),
      setActiveSurfaceCard: (cardId) => this.surface.setActiveCard(cardId),
      scheduleSurfaceCardScrollCommit: () => this.scheduleSurfaceCardScrollCommit(),
      clearSurfaceCardScrollSettleTimer: () => this.clearSurfaceCardScrollSettleTimer(),
      clearSurfaceCardScrollSyncTimer: () => this.clearSurfaceCardScrollSyncTimer(),
      maybeStartHtmlIframePreload: () => this.maybeStartHtmlIframePreload(),
    }
    this.events = new EventManager(eventManagerEnv)

    const navigationEnv: NavigationEnv = {
      engine: this.engine,
      getNodeKind: (node) => this.getNodeKind(node),
      focusSurfaceCard: (cardId, moveCamera) => this.focusSurfaceCard(cardId, moveCamera),
      isActiveHtmlIframeReady: () => this.isActiveHtmlIframeReady(),
      closeInfoSheet: () => this.closeInfoSheet(),
      navigateByEdge: (edgeId) => this.navigateByEdge(edgeId),
      getNodeIframeContentWindow: () => this.refs.nodeIframe.contentWindow,
      resetSurfaceFocus: (animated) => this.surface.resetFocus(animated),
      hasActiveSurfaceFocus: (node) => this.surface.hasActiveFocus(node),
      get pendingRouteSelection() { return self.pendingRouteSelection },
      set pendingRouteSelection(v) { self.pendingRouteSelection = v },
      get activeHtmlRouteSelection() { return self.activeHtmlRouteSelection },
      set activeHtmlRouteSelection(v) { self.activeHtmlRouteSelection = v },
      get infoSheetOpen() { return self.infoSheetOpen },
    }
    this.navigation = new NavigationHandler(navigationEnv)

    this.events.bindEvents(this.destroyers)
    this.buildChrome()
    this.shareManager.prime()
    this.pageTracker.start()
    this.applyBaseStyles()
    this.emitState()
  }

  loadManifest(manifest: PublishManifest): void {
    this.engine.loadManifest(manifest)
    this.activeHtmlRouteSelection = null
    this.htmlIframePreloading = false
    this.htmlIframePreloadedScopes.clear()
    this.htmlIframeWarmupQueue = Promise.resolve()
    this.updateLayout()
    this.render()
  }

  applyRouteSelection(search: string | URLSearchParams): void {
    const params = typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search
    this.pendingRouteSelection = parseRuntimeRouteSelection(params)
    this.activeHtmlRouteSelection = null
    if (!this.pendingRouteSelection) return
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
    this.navigation.handleBackAction()
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
      this.nodeRenderer.applySurfaceImageLayout(currentNode)
      this.annotations.renderAnnotations(currentNode, this.engine.isTransitioning())
    }
    this.annotations.updateHotspotViewport()
  }

  destroy(): void {
    if (this.annotations.hotspotViewportFrameId !== null) {
      cancelAnimationFrame(this.annotations.hotspotViewportFrameId)
      this.annotations.hotspotViewportFrameId = null
    }
    if (this.surfaceAnimationFrameId !== null) {
      cancelAnimationFrame(this.surfaceAnimationFrameId)
      this.surfaceAnimationFrameId = null
    }
    this.clearSurfaceCardScrollSettleTimer()
    this.clearSurfaceCardScrollSyncTimer()
    this.destroyers.forEach(dispose => dispose())
    this.destroyers = []
    this.htmlNodeBridge.destroy()
    this.htmlIframe.destroy()
    this.htmlIframeLayer.remove()
    this.pageTracker.destroy()
    this.chromeRoot.remove()
    this.engine.destroy()
  }

  private handleHtmlNodeBackRequest = (
    _payload: HtmlNodeBackRequestPayload | undefined,
  ): HtmlNodeBackResponsePayload => this.events.handleHtmlNodeBackRequest(_payload)

  private handleHtmlNodeRouteRequest = (
    payload: HtmlNodeRouteRequestPayload | undefined,
  ): HtmlNodeRouteResponsePayload => this.events.handleHtmlNodeRouteRequest(payload)

  private cancelSurfacePointerDrag(): void {
    this.events.cancelSurfacePointerDrag()
  }

  private emitState(): void {
    this.options.onStateChange?.(this.getState())
  }

  private buildChrome(): void {
    buildChromeStructure(this as unknown as ChromeElements, {
      onBack: () => this.navigation.handleBackAction(),
      onToggleInfo: () => this.toggleInfoSheet(),
      onShare: () => { void this.shareManager.share() },
      onCloseSheet: () => this.surface.closeSheet(),
      onCloseInfo: () => this.closeInfoSheet(),
    })
    this.events.bindBottomSheetEvents()
  }

  private applyBaseStyles(): void {
    applyBaseStyles(this.refs, this as unknown as ChromeElements, this.htmlIframeLayer, () => this.mountChrome(), (iframe) => this.applyManagedIframeBaseStyle(iframe))
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
    applyStageLayout({
      manifest,
      viewport: this.refs.viewport,
      stage: this.refs.stage,
      chromeRoot: this.chromeRoot,
      layout: this.options.layout,
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
      this.nodeRenderer.renderHtmlNode(currentNode, transitioning)
    } else if (nodeKind === 'surface') {
      this.nodeRenderer.renderSurfaceNode(currentNode, transitioning)
    } else {
      this.nodeRenderer.renderImageNode(currentNode, transitioning)
    }

    requestAnimationFrame(() => {
      this.confirmHostVisualCommitIfReady('render:next-frame')
    })

    this.renderChrome(state)
    this.emitState()
  }

  private renderChrome(state: PlayerHostState): void {
    this.chrome.render(state)
  }

  private toggleInfoSheet(): void {
    this.chrome.toggleInfoSheet()
  }

  private closeInfoSheet(): void {
    this.chrome.closeInfoSheet()
  }

  private confirmHostVisualCommitIfReady(reason: string): void {
    confirmHostVisualCommitIfReady(
      reason,
      this.engine,
      this.refs.nodeImage,
      (node) => this.getNodeKind(node),
      () => this.isActiveHtmlIframeReady(),
      (node) => this.getNodeImageSource(node),
    )
  }

  private applyManagedIframeBaseStyle(iframe: HTMLIFrameElement): void {
    this.htmlIframe.applyBaseStyle(iframe)
  }

  private isActiveHtmlIframeReady(): boolean {
    return this.htmlIframe.isActiveReady()
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
    const expectedSrc = toAbsoluteUrl(imageUrl)
    const actualSrc = this.refs.nodeImage.currentSrc || this.refs.nodeImage.src
    return this.refs.nodeImage.complete && actualSrc === expectedSrc && this.refs.nodeImage.naturalWidth > 0
  }

  private maybeStartHtmlIframePreload(): void {
    this.htmlIframe.maybeStartPreload()
  }

  private primeHtmlIframeForEdgeId(edgeId: string): void {
    this.htmlIframe.primeForEdgeId(edgeId)
  }

  private primeHtmlIframeForNodeId(nodeId: string): void {
    this.htmlIframe.primeForNodeId(nodeId)
  }

  private focusSurfaceCard(cardId: string, moveCamera: boolean): void {
    this.surface.focusCard(cardId, moveCamera)
    this.renderChrome(this.getState())
  }

  private scheduleSurfaceCardScrollCommit(): void {
    this.surface.scheduleScrollCommit()
  }

  private clearSurfaceCardScrollSettleTimer(): void {
    this.surface.clearScrollSettleTimer()
  }

  private clearSurfaceCardScrollSyncTimer(): void {
    this.surface.clearScrollSyncTimer()
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
    const absoluteUrl = toAbsoluteUrl(imageUrl)
    const currentSrc = this.refs.nodeImage.currentSrc || this.refs.nodeImage.src
    if ((currentSrc && absoluteUrl === currentSrc) && this.refs.nodeImage.naturalWidth > 0 && this.refs.nodeImage.naturalHeight > 0) {
      return this.refs.nodeImage.naturalWidth / this.refs.nodeImage.naturalHeight
    }
    return this.engine.getSourceNodeAspectRatio(node)
  }

  private getNodeKind(node: PublishNode | null | undefined): 'surface' | 'image' | 'html' {
    if (!node) return 'image'
    return node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')
  }

  private handleHotspotNavigation(hotspot: PublishHotspot): void {
    void this.pageTracker.reportClick()
    this.primeHtmlIframeForNodeId(hotspot.targetNodeId)
    this.engine.handleHotspotClick(hotspot)
  }

  private async ensureExternalScriptLoaded(
    scriptAttr: string,
    src: string,
  ): Promise<void> {
    await ensureExternalScriptLoaded(scriptAttr, src)
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
