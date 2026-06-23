import type { PublishNode, CameraState } from '../../shared/types.js'
import type PlayerCore from './player-core.js'
import type { PlayerHostRefs, DragState, SheetCardDragState } from './player-host.js'
import type { SurfaceController } from './player-host-surface.js'
import type { AnnotationRenderer } from './player-host-annotation-renderer.js'
import type { NodeRenderer } from './player-host-node-renderer.js'
import type { HtmlNodeBridge, HtmlNodeBackRequestPayload, HtmlNodeBackResponsePayload, HtmlNodeRouteRequestPayload, HtmlNodeRouteResponsePayload } from './html-node-bridge.js'
import { clampSurfaceCamera } from './surface-camera.js'
import { isInteractiveSurfaceTarget, resolveHtmlRouteUrl, performDefaultHtmlRouteNavigation } from './player-host-routing.js'
import type { SurfaceCameraLayout } from './surface-camera.js'

export interface EventManagerEnv {
  engine: PlayerCore
  refs: PlayerHostRefs
  surface: SurfaceController
  annotations: AnnotationRenderer
  nodeRenderer: NodeRenderer
  htmlNodeBridge: HtmlNodeBridge
  // Mutable state (getter + setter pairs)
  get dragState(): DragState
  set dragState(v: DragState)
  get viewportPointerDownTarget(): EventTarget | null
  set viewportPointerDownTarget(v: EventTarget | null)
  get infoSheetOpen(): boolean
  set infoSheetOpen(v: boolean)
  get bottomSheetCardsDragState(): SheetCardDragState | null
  set bottomSheetCardsDragState(v: SheetCardDragState | null)
  get ignoreBottomSheetCardClick(): boolean
  set ignoreBottomSheetCardClick(v: boolean)
  // Read-only delegates
  readonly pinchState: { active: boolean }
  readonly imageOffset: { x: number; y: number }
  readonly bottomSheetCardsEl: HTMLElement
  // Accessor delegates
  get activeSurfaceLayout(): SurfaceCameraLayout | null
  get currentSurfaceCamera(): CameraState | null
  get activeSurfaceCardId(): string | null
  get surfaceSheetOpen(): boolean
  get surfaceCardScrollSyncLocked(): boolean
  readonly options: {
    onError?: (error: Error) => void
    onHtmlRouteRequest?: (params: any) => boolean | void
  }
  // Method callbacks
  getNodeKind: (node: PublishNode | null | undefined) => 'surface' | 'image' | 'html'
  getNodeAspectRatio: (node: PublishNode | null | undefined) => number | null
  getHtmlNodeBridgeRuntimeSnapshot: () => { currentNodeId: string; historyDepth: number; canGoBack: boolean }
  render: () => void
  emitState: () => void
  updateLayout: () => void
  confirmHostVisualCommitIfReady: (reason: string) => void
  tryHandleBackAction: () => boolean
  setSurfaceCamera: (camera: CameraState, animated: boolean) => void
  setActiveSurfaceCard: (cardId: string | null) => void
  scheduleSurfaceCardScrollCommit: () => void
  clearSurfaceCardScrollSettleTimer: () => void
  clearSurfaceCardScrollSyncTimer: () => void
  maybeStartHtmlIframePreload: () => void
}

export class EventManager {
  constructor(private env: EventManagerEnv) {}

  bindEvents(destroyers: Array<() => void>): void {
    this.env.engine.on('stateChange', this.handleEngineStateChange)
    this.env.engine.on('error', this.handleEngineError)
    destroyers.push(() => this.env.engine.off('stateChange', this.handleEngineStateChange))
    destroyers.push(() => this.env.engine.off('error', this.handleEngineError))

    this.env.refs.nodeImage.addEventListener('load', this.handleNodeImageLoad)
    this.env.refs.nodeImage.addEventListener('pointerdown', this.handleNodeImagePointerDown)
    window.addEventListener('resize', this.handleWindowResize)
    this.env.refs.viewport.addEventListener('pointerdown', this.handleViewportPointerDown)
    this.env.refs.viewport.addEventListener('click', this.handleViewportClick)
    this.env.refs.viewport.addEventListener('wheel', this.handleViewportWheel, { passive: false })
    this.env.refs.viewport.addEventListener('touchstart', this.handleViewportTouchStart, { passive: false })
    this.env.refs.viewport.addEventListener('touchmove', this.handleViewportTouchMove, { passive: false })
    this.env.refs.viewport.addEventListener('touchend', this.handleViewportTouchEnd)
    this.env.refs.viewport.addEventListener('touchcancel', this.handleViewportTouchEnd)

    destroyers.push(() => this.env.refs.nodeImage.removeEventListener('load', this.handleNodeImageLoad))
    destroyers.push(() => this.env.refs.nodeImage.removeEventListener('pointerdown', this.handleNodeImagePointerDown))
    destroyers.push(() => window.removeEventListener('resize', this.handleWindowResize))
    destroyers.push(() => this.env.refs.viewport.removeEventListener('pointerdown', this.handleViewportPointerDown))
    destroyers.push(() => this.env.refs.viewport.removeEventListener('click', this.handleViewportClick))
    destroyers.push(() => this.env.refs.viewport.removeEventListener('wheel', this.handleViewportWheel))
    destroyers.push(() => this.env.refs.viewport.removeEventListener('touchstart', this.handleViewportTouchStart))
    destroyers.push(() => this.env.refs.viewport.removeEventListener('touchmove', this.handleViewportTouchMove))
    destroyers.push(() => this.env.refs.viewport.removeEventListener('touchend', this.handleViewportTouchEnd))
    destroyers.push(() => this.env.refs.viewport.removeEventListener('touchcancel', this.handleViewportTouchEnd))
    destroyers.push(() => this.detachDragListeners())
  }

  detachDragListeners(): void {
    document.removeEventListener('pointermove', this.handleDragMove)
    document.removeEventListener('pointerup', this.handleDragEnd)
    document.removeEventListener('pointercancel', this.handleDragEnd)
  }

  cancelSurfacePointerDrag(): void {
    if (!this.env.dragState.active) return
    const pointerId = this.env.dragState.pointerId
    this.env.dragState.active = false
    this.env.dragState.pointerId = null
    this.detachDragListeners()
    if (pointerId !== null && this.env.refs.nodeImage.hasPointerCapture?.(pointerId)) {
      this.env.refs.nodeImage.releasePointerCapture(pointerId)
    }
  }

  // Bottom sheet card event listeners
  bindBottomSheetEvents(): void {
    const el = this.env.bottomSheetCardsEl
    el.addEventListener('scroll', this.handleBottomSheetCardsScroll, { passive: true })
    el.addEventListener('pointerdown', this.handleBottomSheetCardsPointerDown)
    el.addEventListener('pointermove', this.handleBottomSheetCardsPointerMove)
    el.addEventListener('pointerup', this.handleBottomSheetCardsPointerUp)
    el.addEventListener('pointercancel', this.handleBottomSheetCardsPointerCancel)
  }

  handleEngineStateChange = (): void => {
    this.env.infoSheetOpen = false
    this.env.maybeStartHtmlIframePreload()
    this.env.render()
    requestAnimationFrame(() => {
      this.env.confirmHostVisualCommitIfReady('engine:stateChange:next-frame')
    })
  }

  handleEngineError = (error: Error): void => {
    this.env.options.onError?.(error)
  }

  handleNodeImageLoad = (): void => {
    this.env.annotations.scheduleHotspotViewportUpdate()
    requestAnimationFrame(() => {
      this.env.confirmHostVisualCommitIfReady('node-image:onLoad:next-frame')
    })
  }

  handleWindowResize = (): void => {
    this.env.updateLayout()
  }

  handleViewportPointerDown = (event: PointerEvent): void => {
    this.env.viewportPointerDownTarget = event.target
  }

  handleViewportClick = (event: MouseEvent): void => {
    const currentNode = this.env.engine.getCurrentNode()
    if (!currentNode || this.env.getNodeKind(currentNode) !== 'surface') return
    if (this.env.engine.isTransitioning()) return
    if (this.env.dragState.moved) {
      this.env.dragState.moved = false
      return
    }

    const pointerDownTarget = this.env.viewportPointerDownTarget
    this.env.viewportPointerDownTarget = null
    if (isInteractiveSurfaceTarget(pointerDownTarget) || isInteractiveSurfaceTarget(event.target)) {
      return
    }
    if (this.env.activeSurfaceCardId) {
      this.env.setActiveSurfaceCard(null)
    }
  }

  handleViewportWheel = (event: WheelEvent): void => {
    this.env.surface.handleWheel(event)
  }

  handleViewportTouchStart = (event: TouchEvent): void => {
    if (event.touches.length < 2) return
    if (!this.env.surface.canHandlePinch()) return
    event.preventDefault()
    this.env.surface.beginPinch(event.touches)
  }

  handleViewportTouchMove = (event: TouchEvent): void => {
    if (event.touches.length < 2) return
    this.env.surface.handleTouchMove(event)
  }

  handleViewportTouchEnd = (event: TouchEvent): void => {
    this.env.surface.handleTouchEnd(event)
  }

  handleHtmlNodeBackRequest = (
    _payload: HtmlNodeBackRequestPayload | undefined,
  ): HtmlNodeBackResponsePayload => {
    const handled = this.env.tryHandleBackAction()
    return {
      handled,
      runtime: this.env.getHtmlNodeBridgeRuntimeSnapshot(),
    }
  }

  handleHtmlNodeRouteRequest = (
    payload: HtmlNodeRouteRequestPayload | undefined,
  ): HtmlNodeRouteResponsePayload => {
    const route = payload?.route?.trim()
    if (!route) {
      throw new Error('缺少可跳转的 route')
    }

    const openMode = payload?.openMode === 'new-tab' ? 'new-tab' : 'current-tab'
    const resolvedUrl = resolveHtmlRouteUrl(route)

    let handled = false
    const callbackResult = this.env.options.onHtmlRouteRequest?.({
      route,
      reason: payload?.reason,
      openMode,
      resolvedUrl,
    })

    if (typeof callbackResult === 'boolean') {
      handled = callbackResult
    } else if (this.env.options.onHtmlRouteRequest) {
      handled = true
    } else {
      handled = performDefaultHtmlRouteNavigation(resolvedUrl, openMode)
    }

    return {
      handled,
      route: resolvedUrl,
      openMode,
    }
  }

  handleNodeImagePointerDown = (event: PointerEvent): void => {
    const currentNode = this.env.engine.getCurrentNode()
    if (!currentNode) return

    if (this.env.getNodeKind(currentNode) === 'surface') {
      if (this.env.pinchState.active) return
      if (!event.isPrimary || !this.env.currentSurfaceCamera) return
      event.preventDefault()
      const camera = this.env.currentSurfaceCamera!
      this.env.dragState = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: camera.centerX,
        startOffsetY: camera.centerY,
        maxOffsetX: 0,
        maxOffsetY: 0,
        moved: false,
      }
      this.env.refs.nodeImage.style.cursor = 'grabbing'
      this.env.refs.nodeImage.setPointerCapture?.(event.pointerId)
      document.addEventListener('pointermove', this.handleDragMove)
      document.addEventListener('pointerup', this.handleDragEnd)
      document.addEventListener('pointercancel', this.handleDragEnd)
      return
    }

    const fitMode = currentNode.imageFitMode ?? 'fill'
    if (fitMode === 'fill') return
    if (!event.isPrimary) return

    event.preventDefault()
    const containerRect = this.env.refs.container.getBoundingClientRect()
    const imageRect = this.env.refs.nodeImage.getBoundingClientRect()
    const maxOffsetX = imageRect.width > containerRect.width
      ? (imageRect.width - containerRect.width) / 2
      : 0
    const maxOffsetY = imageRect.height > containerRect.height
      ? (imageRect.height - containerRect.height) / 2
      : 0
    this.env.dragState = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: this.env.imageOffset.x,
      startOffsetY: this.env.imageOffset.y,
      maxOffsetX,
      maxOffsetY,
      moved: false,
    }

    this.env.refs.nodeImage.style.cursor = 'grabbing'
    this.env.refs.nodeImage.setPointerCapture?.(event.pointerId)
    document.addEventListener('pointermove', this.handleDragMove)
    document.addEventListener('pointerup', this.handleDragEnd)
    document.addEventListener('pointercancel', this.handleDragEnd)
  }

  handleDragMove = (event: PointerEvent): void => {
    if (this.env.pinchState.active) return
    if (!this.env.dragState.active) return
    if (this.env.dragState.pointerId !== null && event.pointerId !== this.env.dragState.pointerId) return

    if (
      Math.abs(event.clientX - this.env.dragState.startX) > 3
      || Math.abs(event.clientY - this.env.dragState.startY) > 3
    ) {
      this.env.dragState.moved = true
    }

    const currentNode = this.env.engine.getCurrentNode()
    if (!currentNode) return

    const layout = this.env.activeSurfaceLayout
    const camera = this.env.currentSurfaceCamera
    if (this.env.getNodeKind(currentNode) === 'surface' && layout && camera && currentNode.surfaceConfig) {
      const rect = this.env.refs.container.getBoundingClientRect()
      const nextCamera = clampSurfaceCamera(
        {
          centerX: this.env.dragState.startOffsetX - (event.clientX - this.env.dragState.startX) / Math.max(layout.baseWidth * camera.zoom, 1),
          centerY: this.env.dragState.startOffsetY - (event.clientY - this.env.dragState.startY) / Math.max(layout.baseHeight * camera.zoom, 1),
          zoom: camera.zoom,
        },
        rect.width,
        rect.height,
        this.env.getNodeAspectRatio(currentNode) ?? 1,
        currentNode.surfaceConfig.bounds,
      )
      this.env.setSurfaceCamera(nextCamera, false)
      return
    }

    const fitMode = currentNode.imageFitMode ?? 'fill'

    let nextX = this.env.dragState.startOffsetX
    let nextY = this.env.dragState.startOffsetY

    if (fitMode === 'fitHeight') {
      nextX += event.clientX - this.env.dragState.startX
      nextX = this.env.dragState.maxOffsetX > 0
        ? Math.max(-this.env.dragState.maxOffsetX, Math.min(this.env.dragState.maxOffsetX, nextX))
        : 0
      nextY = 0
    } else if (fitMode === 'fitWidth') {
      nextY += event.clientY - this.env.dragState.startY
      nextY = this.env.dragState.maxOffsetY > 0
        ? Math.max(-this.env.dragState.maxOffsetY, Math.min(this.env.dragState.maxOffsetY, nextY))
        : 0
      nextX = 0
    }

    this.env.nodeRenderer.applyImageTransform(nextX, nextY)
    this.env.annotations.scheduleHotspotViewportUpdate()
  }

  handleDragEnd = (): void => {
    const pointerId = this.env.dragState.pointerId
    this.env.dragState.active = false
    this.env.dragState.pointerId = null
    this.detachDragListeners()
    if (pointerId !== null && this.env.refs.nodeImage.hasPointerCapture?.(pointerId)) {
      this.env.refs.nodeImage.releasePointerCapture(pointerId)
    }

    const currentNode = this.env.engine.getCurrentNode()
    if (this.env.getNodeKind(currentNode) === 'surface') {
      this.env.refs.nodeImage.style.cursor = 'grab'
      return
    }

    const fitMode = currentNode?.imageFitMode ?? 'fill'
    this.env.refs.nodeImage.style.cursor = fitMode === 'fill' ? 'default' : 'grab'
  }

  // Bottom sheet card handlers

  handleBottomSheetCardsScroll = (): void => {
    if (this.env.surfaceCardScrollSyncLocked || !this.env.surfaceSheetOpen) return
    if (!this.env.bottomSheetCardsDragState?.moved) return
    this.env.scheduleSurfaceCardScrollCommit()
  }

  handleBottomSheetCardsPointerDown = (event: PointerEvent): void => {
    if (!this.env.surfaceSheetOpen || event.button !== 0) return
    this.env.bottomSheetCardsDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: this.env.bottomSheetCardsEl.scrollLeft,
      moved: false,
    }
    this.env.ignoreBottomSheetCardClick = false
    this.env.bottomSheetCardsEl.setPointerCapture?.(event.pointerId)
  }

  handleBottomSheetCardsPointerMove = (event: PointerEvent): void => {
    const dragState = this.env.bottomSheetCardsDragState
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const deltaX = event.clientX - dragState.startX
    if (Math.abs(deltaX) < 4) return
    dragState.moved = true
    this.env.ignoreBottomSheetCardClick = true
    this.env.bottomSheetCardsEl.scrollLeft = dragState.startScrollLeft - deltaX
    event.preventDefault()
  }

  handleBottomSheetCardsPointerUp = (event: PointerEvent): void => {
    const dragState = this.env.bottomSheetCardsDragState
    if (!dragState || dragState.pointerId !== event.pointerId) return
    this.env.bottomSheetCardsDragState = null
    if (this.env.bottomSheetCardsEl.hasPointerCapture?.(event.pointerId)) {
      this.env.bottomSheetCardsEl.releasePointerCapture(event.pointerId)
    }
    if (!dragState.moved) return
    this.env.scheduleSurfaceCardScrollCommit()
  }

  handleBottomSheetCardsPointerCancel = (event: PointerEvent): void => {
    const dragState = this.env.bottomSheetCardsDragState
    if (!dragState || dragState.pointerId !== event.pointerId) return
    this.env.bottomSheetCardsDragState = null
    if (this.env.bottomSheetCardsEl.hasPointerCapture?.(event.pointerId)) {
      this.env.bottomSheetCardsEl.releasePointerCapture(event.pointerId)
    }
    this.env.clearSurfaceCardScrollSettleTimer()
  }
}
