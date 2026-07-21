/**
 * Camera — gesture and viewport state for the Atlas panorama.
 *
 * All cover/crop/projection math lives in panorama-projection.ts. The
 * controller only owns gestures, animation and subscriptions so the runtime
 * and editor can share exactly the same behavior.
 */
import type { Viewport } from '../../../domain/project-types.js'
import {
  clampPanoramaCamera,
  resolvePanoramaProjection,
  zoomCameraAtScreenPoint,
  type PanoramaProjection,
} from './panorama-projection.js'

export interface CameraBounds {
  minZoom: number
  maxZoom: number
}

export interface CameraInteraction {
  wheelZoom: boolean
  dragPan: boolean
  pinchZoom: boolean
  resetCameraEnabled: boolean
}

export interface CameraTransform {
  css: string
  scale: number
  width: number
  height: number
  originX: number
  originY: number
  translateX: number
  translateY: number
}

type ViewportChangeListener = (viewport: Viewport) => void

interface PointerPosition {
  x: number
  y: number
}

export class Camera {
  private viewport: Viewport
  private readonly initial: Viewport
  private readonly bounds: CameraBounds
  private readonly interaction: CameraInteraction
  private readonly listeners = new Set<ViewportChangeListener>()
  private el: HTMLElement | null
  private sourceWidth = 1
  private sourceHeight = 1
  private dragOrigin: { x: number; y: number; cx: number; cy: number } | null = null
  private pointers = new Map<number, PointerPosition>()
  private pinchOrigin: { distance: number; zoom: number } | null = null
  private animationFrame: number | null = null

  constructor(
    el: HTMLElement,
    initial: Viewport,
    bounds: CameraBounds,
    interaction: CameraInteraction,
    sourceSize?: { width: number; height: number },
  ) {
    this.el = el
    this.initial = { ...initial }
    this.bounds = bounds
    this.interaction = interaction
    this.viewport = { ...initial }
    if (sourceSize) this.setSourceSize(sourceSize.width, sourceSize.height, false)
    this.viewport = this.clamp(initial)
    this.el.style.touchAction = 'none'
    this.bindEvents()
  }

  onChange(listener: ViewportChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setSourceSize(width: number, height: number, notify = true): void {
    this.sourceWidth = Math.max(width, 1)
    this.sourceHeight = Math.max(height, 1)
    if (!this.viewport) return
    this.viewport = this.clamp(this.viewport)
    if (notify) this.notify()
  }

  recordCurrentViewport(): Viewport {
    return { ...this.viewport }
  }

  getViewport(): Viewport {
    return { ...this.viewport }
  }

  getProjection(): PanoramaProjection {
    const width = this.el?.clientWidth || this.el?.offsetWidth || 1
    const height = this.el?.clientHeight || this.el?.offsetHeight || 1
    return resolvePanoramaProjection({
      viewportWidth: width,
      viewportHeight: height,
      sourceWidth: this.sourceWidth || width,
      sourceHeight: this.sourceHeight || height,
      camera: this.viewport,
      bounds: this.bounds,
    })
  }

  getTransform(): CameraTransform {
    const p = this.getProjection()
    return {
      css: `matrix(${p.camera.zoom}, 0, 0, ${p.camera.zoom}, ${p.translateX}, ${p.translateY})`,
      scale: p.camera.zoom,
      width: p.baseWidth,
      height: p.baseHeight,
      originX: p.originX,
      originY: p.originY,
      translateX: p.translateX,
      translateY: p.translateY,
    }
  }

  animateTo(target: Viewport, durationMs = 350): void {
    this.cancelAnimation()
    const start = { ...this.viewport }
    const end = this.clamp(target)
    if (durationMs <= 0) {
      this.viewport = end
      this.notify()
      return
    }
    const t0 = performance.now()
    const tick = (now: number): void => {
      const t = Math.min(1, (now - t0) / durationMs)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      this.viewport = this.clamp({
        centerX: start.centerX + (end.centerX - start.centerX) * eased,
        centerY: start.centerY + (end.centerY - start.centerY) * eased,
        zoom: start.zoom + (end.zoom - start.zoom) * eased,
      })
      this.notify()
      this.animationFrame = t < 1 ? requestAnimationFrame(tick) : null
    }
    this.animationFrame = requestAnimationFrame(tick)
  }

  /** Re-project the current camera after the host container changes size. */
  refreshLayout(): void {
    if (!this.el) return
    const width = this.el.clientWidth || this.el.offsetWidth
    const height = this.el.clientHeight || this.el.offsetHeight
    if (width <= 0 || height <= 0) return
    this.cancelAnimation()
    this.viewport = this.clamp(this.viewport)
    this.notify()
  }

  reset(): void {
    if (!this.interaction.resetCameraEnabled) return
    this.animateTo(this.initial)
  }

  destroy(): void {
    this.cancelAnimation()
    const el = this.el
    if (el) {
      el.removeEventListener('wheel', this.onWheel as EventListener)
      el.removeEventListener('pointerdown', this.onPointerDown as EventListener)
      el.removeEventListener('pointermove', this.onPointerMove as EventListener)
      el.removeEventListener('pointerup', this.onPointerUp as EventListener)
      el.removeEventListener('pointercancel', this.onPointerUp as EventListener)
    }
    this.listeners.clear()
    this.pointers.clear()
    this.dragOrigin = null
    this.pinchOrigin = null
    this.el = null
  }

  private bindEvents(): void {
    if (!this.el) return
    if (this.interaction.wheelZoom) {
      this.el.addEventListener('wheel', this.onWheel as EventListener, { passive: false })
    }
    if (this.interaction.dragPan || this.interaction.pinchZoom) {
      this.el.addEventListener('pointerdown', this.onPointerDown as EventListener)
      this.el.addEventListener('pointermove', this.onPointerMove as EventListener)
      this.el.addEventListener('pointerup', this.onPointerUp as EventListener)
      this.el.addEventListener('pointercancel', this.onPointerUp as EventListener)
    }
  }

  private onWheel = (ev: WheelEvent): void => {
    if (!this.el) return
    ev.preventDefault()
    this.cancelAnimation()
    const rect = this.el.getBoundingClientRect()
    const logicalWidth = this.el.clientWidth || this.el.offsetWidth || rect.width || 1
    const logicalHeight = this.el.clientHeight || this.el.offsetHeight || rect.height || 1
    const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1
    const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1
    this.viewport = zoomCameraAtScreenPoint(
      this.viewport,
      {
        x: (ev.clientX - rect.left) * scaleX,
        y: (ev.clientY - rect.top) * scaleY,
      },
      this.viewport.zoom * factor,
      this.projectionBase(logicalWidth, logicalHeight),
    )
    this.notify()
  }

  private onPointerDown = (ev: PointerEvent): void => {
    if (!this.el || this.isInteractiveTarget(ev.target)) return
    this.cancelAnimation()
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    this.el.setPointerCapture?.(ev.pointerId)

    if (this.interaction.pinchZoom && this.pointers.size === 2) {
      this.pinchOrigin = {
        distance: this.pointerDistance(),
        zoom: this.viewport.zoom,
      }
      this.dragOrigin = null
      return
    }

    if (this.interaction.dragPan) {
      this.dragOrigin = {
        x: ev.clientX,
        y: ev.clientY,
        cx: this.viewport.centerX,
        cy: this.viewport.centerY,
      }
    }
  }

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.el || !this.pointers.has(ev.pointerId)) return
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })

    if (this.interaction.pinchZoom && this.pointers.size === 2 && this.pinchOrigin) {
      const rect = this.el.getBoundingClientRect()
      const logicalWidth = this.el.clientWidth || this.el.offsetWidth || rect.width || 1
      const logicalHeight = this.el.clientHeight || this.el.offsetHeight || rect.height || 1
      const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1
      const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1
      const points = [...this.pointers.values()]
      const midpoint = {
        x: ((points[0].x + points[1].x) / 2 - rect.left) * scaleX,
        y: ((points[0].y + points[1].y) / 2 - rect.top) * scaleY,
      }
      const ratio = this.pointerDistance() / Math.max(this.pinchOrigin.distance, 1)
      this.viewport = zoomCameraAtScreenPoint(
        this.viewport,
        midpoint,
        this.pinchOrigin.zoom * ratio,
        this.projectionBase(logicalWidth, logicalHeight),
      )
      this.notify()
      return
    }

    if (!this.dragOrigin || !this.interaction.dragPan) return
    const rect = this.el.getBoundingClientRect()
    const logicalWidth = this.el.clientWidth || this.el.offsetWidth || rect.width || 1
    const logicalHeight = this.el.clientHeight || this.el.offsetHeight || rect.height || 1
    const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1
    const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1
    const projection = this.getProjection()
    this.viewport = this.clamp({
      ...this.viewport,
      centerX: this.dragOrigin.cx - ((ev.clientX - this.dragOrigin.x) * scaleX) / projection.scaledWidth,
      centerY: this.dragOrigin.cy - ((ev.clientY - this.dragOrigin.y) * scaleY) / projection.scaledHeight,
    })
    this.notify()
  }

  private onPointerUp = (ev: PointerEvent): void => {
    this.pointers.delete(ev.pointerId)
    if (this.el?.hasPointerCapture?.(ev.pointerId)) this.el.releasePointerCapture(ev.pointerId)
    this.dragOrigin = null
    this.pinchOrigin = null
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    const element = target as Element | null
    if (!element?.closest) return false
    return Boolean(element.closest('[data-atlas-interactive="true"],button,a,input,select,textarea,[role="button"]'))
  }

  private pointerDistance(): number {
    const points = [...this.pointers.values()]
    if (points.length < 2) return 0
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  private clamp(viewport: Viewport): Viewport {
    const width = this.el?.clientWidth || this.el?.offsetWidth || 1
    const height = this.el?.clientHeight || this.el?.offsetHeight || 1
    return clampPanoramaCamera(viewport, this.projectionBase(width, height))
  }

  private projectionBase(viewportWidth: number, viewportHeight: number) {
    return {
      viewportWidth,
      viewportHeight,
      sourceWidth: this.sourceWidth || viewportWidth,
      sourceHeight: this.sourceHeight || viewportHeight,
      bounds: this.bounds,
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener({ ...this.viewport })
  }

  private cancelAnimation(): void {
    if (this.animationFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animationFrame)
    }
    this.animationFrame = null
  }
}
