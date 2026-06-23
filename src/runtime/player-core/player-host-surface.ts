import type {
  CameraState,
  PublishNode,
  SurfaceCard,
  SurfaceFocusLayer,
  SurfaceHotspot,
} from '../../shared/types.js'
import {
  clampSurfaceCamera,
  interpolateCamera,
  type SurfaceCameraLayout,
} from './surface-camera.js'
import type PlayerCore from './player-core.js'
import type { PlayerHostRefs } from './player-host.js'
import type { PageTracker } from './player-host-tracking.js'

type TouchPinchState = {
  active: boolean
  startDistance: number
  startCamera: CameraState | null
  anchorNormX: number
  anchorNormY: number
  baseWidth: number
  baseHeight: number
}

export interface SurfaceControllerEnv {
  refs: PlayerHostRefs
  engine: PlayerCore
  pageTracker: PageTracker
  getNodeKind: (node: PublishNode | null | undefined) => 'surface' | 'image' | 'html'
  getNodeAspectRatio: (node: PublishNode | null | undefined) => number | null
  dragState: { moved: boolean }
  cancelPointerDrag: () => void
  navigateByEdge: (edgeId: string) => boolean
  applySurfaceImageLayout: (node: PublishNode) => void
  requestRender: () => void
  renderChrome: () => void
  emitState: () => void
  renderAnnotations: (node: PublishNode | null, transitioning: boolean) => void
  updateHotspotViewport: () => void
  getBottomSheetCardsEl: () => HTMLElement
}

export class SurfaceController {
  static readonly CARD_SCROLL_SETTLE_MS = 140
  static readonly CARD_SCROLL_LOCK_MS = 420

  currentCamera: CameraState | null = null
  activeLayout: SurfaceCameraLayout | null = null
  activeNodeId: string | null = null
  activeLayerId: string | null = null
  activeCardId: string | null = null
  sheetOpen = false
  animationFrameId: number | null = null

  pinchState: TouchPinchState = {
    active: false,
    startDistance: 0,
    startCamera: null,
    anchorNormX: 0.5,
    anchorNormY: 0.5,
    baseWidth: 1,
    baseHeight: 1,
  }

  cardScrollSettleTimer: number | null = null
  cardScrollSyncTimer: number | null = null
  cardScrollSyncLocked = false

  constructor(private env: SurfaceControllerEnv) {}

  canHandlePinch(): boolean {
    const currentNode = this.env.engine.getCurrentNode()
    return !!currentNode
      && this.env.getNodeKind(currentNode) === 'surface'
      && !!currentNode.surfaceConfig
      && !!this.currentCamera
      && !!this.activeLayout
      && !this.env.engine.isTransitioning()
  }

  beginPinch(touches: TouchList): void {
    if (touches.length < 2 || !this.currentCamera || !this.activeLayout) return
    const currentNode = this.env.engine.getCurrentNode()
    if (!currentNode || this.env.getNodeKind(currentNode) !== 'surface') return

    const first = touches[0]
    const second = touches[1]
    const rect = this.env.refs.container.getBoundingClientRect()
    const midpointX = (first.clientX + second.clientX) / 2 - rect.left
    const midpointY = (first.clientY + second.clientY) / 2 - rect.top
    const layout = this.activeLayout

    this.env.cancelPointerDrag()
    this.pinchState = {
      active: true,
      startDistance: Math.max(Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY), 1),
      startCamera: { ...this.currentCamera },
      anchorNormX: (midpointX - layout.originX - layout.translateX) / Math.max(layout.scaledWidth, 1),
      anchorNormY: (midpointY - layout.originY - layout.translateY) / Math.max(layout.scaledHeight, 1),
      baseWidth: layout.baseWidth,
      baseHeight: layout.baseHeight,
    }
    this.env.dragState.moved = true
    this.env.refs.nodeImage.style.cursor = 'grabbing'
  }

  canResetCamera(node: PublishNode | null | undefined): boolean {
    if (!node || this.env.getNodeKind(node) !== 'surface' || !node.surfaceConfig || !this.currentCamera) {
      return false
    }
    const initial = node.surfaceConfig.initialCamera
    return (
      Math.abs(this.currentCamera.centerX - initial.centerX) > 0.0001
      || Math.abs(this.currentCamera.centerY - initial.centerY) > 0.0001
      || Math.abs(this.currentCamera.zoom - initial.zoom) > 0.0001
    )
  }

  hasActiveFocus(node: PublishNode | null | undefined): boolean {
    if (!node || this.env.getNodeKind(node) !== 'surface' || !node.surfaceConfig) {
      return false
    }
    return this.sheetOpen
      || !!this.activeLayerId
      || !!this.activeCardId
      || this.canResetCamera(node)
  }

  resetFocus(animated: boolean): void {
    const currentNode = this.env.engine.getCurrentNode()
    if (!currentNode || this.env.getNodeKind(currentNode) !== 'surface' || !currentNode.surfaceConfig) {
      return
    }
    this.sheetOpen = false
    this.activeLayerId = null
    this.activeCardId = null
    this.setCamera(currentNode.surfaceConfig.initialCamera, animated)
  }

  setCamera(camera: CameraState, animated: boolean): void {
    const currentNode = this.env.engine.getCurrentNode()
    if (!currentNode || this.env.getNodeKind(currentNode) !== 'surface' || !currentNode.surfaceConfig) return

    const apply = (nextCamera: CameraState) => {
      this.currentCamera = nextCamera
      this.env.applySurfaceImageLayout(currentNode)
      this.env.renderAnnotations(currentNode, this.env.engine.isTransitioning())
      this.env.updateHotspotViewport()
      this.env.renderChrome()
      this.env.emitState()
    }

    if (!animated || !this.currentCamera) {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId)
        this.animationFrameId = null
      }
      apply(camera)
      return
    }

    const from = this.currentCamera
    const to = camera
    const startTime = performance.now()
    const duration = 260
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - (1 - progress) * (1 - progress)
      apply(interpolateCamera(from, to, eased))
      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(step)
      } else {
        this.animationFrameId = null
      }
    }

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
    }
    this.animationFrameId = requestAnimationFrame(step)
  }

  handleHotspotNavigation(hotspot: SurfaceHotspot, currentNode: PublishNode): void {
    void this.env.pageTracker.reportClick()
    if (hotspot.target.type === 'edge') {
      this.env.navigateByEdge(hotspot.target.edgeId)
      return
    }
    if (hotspot.target.type === 'camera-preset') {
      this.setCamera(hotspot.target.camera, true)
      return
    }
    if (hotspot.target.type === 'focus-layer') {
      const { layerId } = hotspot.target
      const layer = currentNode.surfaceLayers?.find(item => item.id === layerId)
      this.activeLayerId = layerId
      const fallbackCardId = layer?.cards[0]?.id ?? null
      this.activeCardId = fallbackCardId
      this.sheetOpen = false
      if (layer?.cameraPreset) {
        this.setCamera({
          ...layer.cameraPreset,
          zoom: layer.visibility.minZoom,
        }, true)
      } else {
        this.env.requestRender()
      }
      if (fallbackCardId) {
        requestAnimationFrame(() => this.focusCard(fallbackCardId, false))
      }
    }
  }

  setActiveCard(cardId: string | null): void {
    if (this.activeCardId === cardId) return
    this.activeCardId = cardId
    if (this.env.getNodeKind(this.env.engine.getCurrentNode()) === 'surface') {
      this.env.requestRender()
    }
  }

  focusCard(cardId: string, moveCamera: boolean): void {
    const currentNode = this.env.engine.getCurrentNode()
    const cardContext = this.findCardContext(currentNode, cardId)
    if (!cardContext) return
    this.clearScrollSettleTimer()
    this.activeLayerId = cardContext.layer.id
    this.activeCardId = cardId
    this.sheetOpen = true
    if (this.env.getNodeKind(currentNode) === 'surface') {
      this.env.requestRender()
    }
    if (moveCamera && this.currentCamera) {
      const nextZoom = Math.max(
        this.currentCamera.zoom,
        cardContext.layer.visibility.minZoom,
        cardContext.layer.cameraPreset?.zoom ?? 0,
      )
      this.setCamera({
        centerX: cardContext.card.anchor.x,
        centerY: cardContext.card.anchor.y,
        zoom: nextZoom,
      }, true)
    } else {
      this.scrollActiveCardIntoView()
    }
  }

  closeSheet(): void {
    this.clearScrollSettleTimer()
    this.sheetOpen = false
    this.activeCardId = null
    if (this.env.getNodeKind(this.env.engine.getCurrentNode()) === 'surface') {
      this.env.requestRender()
    }
  }

  getActiveLayer(node: PublishNode | null | undefined): SurfaceFocusLayer | null {
    if (!node || this.env.getNodeKind(node) !== 'surface' || !this.activeLayerId) return null
    return node.surfaceLayers?.find(layer => layer.id === this.activeLayerId) ?? null
  }

  findCardContext(
    node: PublishNode | null | undefined,
    cardId: string,
  ): { layer: SurfaceFocusLayer, card: SurfaceCard } | null {
    if (!node || this.env.getNodeKind(node) !== 'surface') return null
    for (const layer of node.surfaceLayers ?? []) {
      const card = layer.cards.find(item => item.id === cardId)
      if (card) return { layer, card }
    }
    return null
  }

  scrollActiveCardIntoView(): void {
    if (!this.activeCardId) return
    this.lockScrollSync()
    requestAnimationFrame(() => {
      const sheetCards = this.env.getBottomSheetCardsEl()
      const activeCard = sheetCards.querySelector<HTMLElement>(`[data-surface-sheet-card-id="${this.activeCardId}"]`)
      activeCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
  }

  resolveNearestCardId(): string | null {
    const sheetCards = this.env.getBottomSheetCardsEl()
    const cards = Array.from(sheetCards.querySelectorAll<HTMLElement>('[data-surface-sheet-card-id]'))
    if (cards.length === 0) return null
    const containerRect = sheetCards.getBoundingClientRect()
    const centerX = containerRect.left + containerRect.width / 2
    let nearestCardId: string | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const card of cards) {
      const rect = card.getBoundingClientRect()
      const cardCenter = rect.left + rect.width / 2
      const distance = Math.abs(cardCenter - centerX)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestCardId = card.dataset.surfaceSheetCardId ?? null
      }
    }
    return nearestCardId
  }

  scheduleScrollCommit(): void {
    this.clearScrollSettleTimer()
    this.cardScrollSettleTimer = window.setTimeout(() => {
      this.cardScrollSettleTimer = null
      const nearestCardId = this.resolveNearestCardId()
      if (!nearestCardId || nearestCardId === this.activeCardId) return
      this.focusCard(nearestCardId, true)
    }, SurfaceController.CARD_SCROLL_SETTLE_MS)
  }

  clearScrollSettleTimer(): void {
    if (this.cardScrollSettleTimer === null) return
    window.clearTimeout(this.cardScrollSettleTimer)
    this.cardScrollSettleTimer = null
  }

  lockScrollSync(duration = SurfaceController.CARD_SCROLL_LOCK_MS): void {
    this.cardScrollSyncLocked = true
    this.clearScrollSyncTimer()
    this.cardScrollSyncTimer = window.setTimeout(() => {
      this.cardScrollSyncLocked = false
      this.cardScrollSyncTimer = null
    }, duration)
  }

  clearScrollSyncTimer(): void {
    if (this.cardScrollSyncTimer === null) return
    window.clearTimeout(this.cardScrollSyncTimer)
    this.cardScrollSyncTimer = null
  }

  handleWheel(event: WheelEvent): void {
    const currentNode = this.env.engine.getCurrentNode()
    if (!currentNode || this.env.getNodeKind(currentNode) !== 'surface' || !this.currentCamera) return
    if (this.env.engine.isTransitioning()) return
    event.preventDefault()

    const surfaceConfig = currentNode.surfaceConfig
    const layout = this.activeLayout
    if (!surfaceConfig || !layout) return

    const rect = this.env.refs.container.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const imageNormX = (pointerX - layout.originX - layout.translateX) / Math.max(layout.scaledWidth, 1)
    const imageNormY = (pointerY - layout.originY - layout.translateY) / Math.max(layout.scaledHeight, 1)
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    const nextZoom = this.currentCamera.zoom * zoomFactor
    const nextCamera = clampSurfaceCamera(
      {
        centerX: imageNormX - (pointerX - rect.width / 2) / Math.max(layout.baseWidth * nextZoom, 1),
        centerY: imageNormY - (pointerY - rect.height / 2) / Math.max(layout.baseHeight * nextZoom, 1),
        zoom: nextZoom,
      },
      rect.width,
      rect.height,
      this.env.getNodeAspectRatio(currentNode) ?? 1,
      surfaceConfig.bounds,
    )

    this.setCamera(nextCamera, false)
  }

  handleTouchMove(event: TouchEvent): void {
    if (event.touches.length < 2) return
    const currentNode = this.env.engine.getCurrentNode()
    if (!currentNode || this.env.getNodeKind(currentNode) !== 'surface' || !currentNode.surfaceConfig) return
    if (!this.canHandlePinch()) return

    if (!this.pinchState.active) {
      this.beginPinch(event.touches)
    }
    if (!this.pinchState.active || !this.pinchState.startCamera) return

    event.preventDefault()
    const first = event.touches[0]
    const second = event.touches[1]
    const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
    const nextZoom = this.pinchState.startCamera.zoom * (distance / Math.max(this.pinchState.startDistance, 1))
    const rect = this.env.refs.container.getBoundingClientRect()
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
      this.env.getNodeAspectRatio(currentNode) ?? 1,
      currentNode.surfaceConfig.bounds,
    )

    this.env.dragState.moved = true
    this.setCamera(nextCamera, false)
  }

  handleTouchEnd(event: TouchEvent): void {
    if (!this.pinchState.active) return
    if (event.touches.length >= 2) {
      this.beginPinch(event.touches)
      return
    }
    this.pinchState.active = false
    const currentNode = this.env.engine.getCurrentNode()
    if (this.env.getNodeKind(currentNode) === 'surface') {
      this.env.refs.nodeImage.style.cursor = 'grab'
    }
  }
}
