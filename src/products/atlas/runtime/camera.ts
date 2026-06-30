/**
 * Camera — manages the panorama viewport.
 *
 * The camera is the authoritative source of truth for which part of the
 * panorama is currently visible. Editor preview and runtime share the
 * same Camera so what-you-see-is-what-you-get.
 *
 * Coordinate space is normalized [0,1]; the camera maps this onto the
 * container's pixel size.
 */
import type { Viewport } from '../../../domain/project-types.js'

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

type ViewportChangeListener = (viewport: Viewport) => void

export class Camera {
  private viewport: Viewport
  private readonly bounds: CameraBounds
  private readonly interaction: CameraInteraction
  private readonly listeners: ViewportChangeListener[] = []
  private el: HTMLElement | null = null
  private dragging: boolean = false
  private dragOrigin: { x: number; y: number; cx: number; cy: number } | null = null

  constructor(
    el: HTMLElement,
    initial: Viewport,
    bounds: CameraBounds,
    interaction: CameraInteraction,
  ) {
    this.el = el
    this.viewport = this.clamp(initial, bounds)
    this.bounds = bounds
    this.interaction = interaction
    this.bindEvents()
  }

  onChange(listener: ViewportChangeListener): void {
    this.listeners.push(listener)
  }

  /** Returns the current viewport in normalized coordinates. */
  recordCurrentViewport(): Viewport {
    return { ...this.viewport }
  }

  /** Animates to a target viewport over `durationMs` (default 350ms). */
  animateTo(target: Viewport, durationMs: number = 350): void {
    const start = { ...this.viewport }
    const end = this.clamp(target, this.bounds)
    const t0 = performance.now()
    const tick = (now: number): void => {
      const t = Math.min(1, (now - t0) / durationMs)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      this.viewport = {
        centerX: start.centerX + (end.centerX - start.centerX) * eased,
        centerY: start.centerY + (end.centerY - start.centerY) * eased,
        zoom: start.zoom + (end.zoom - start.zoom) * eased,
      }
      this.notify()
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  reset(): void {
    if (!this.interaction.resetCameraEnabled) return
    this.viewport = this.clamp({ centerX: 0.5, centerY: 0.5, zoom: this.bounds.minZoom }, this.bounds)
    this.notify()
  }

  private bindEvents(): void {
    if (!this.el) return
    if (this.interaction.wheelZoom) {
      this.el.addEventListener('wheel', this.onWheel as EventListener, { passive: false })
    }
    if (this.interaction.dragPan) {
      this.el.addEventListener('pointerdown', this.onPointerDown as EventListener)
      this.el.addEventListener('pointermove', this.onPointerMove as EventListener)
      this.el.addEventListener('pointerup', this.onPointerUp as EventListener)
      this.el.addEventListener('pointercancel', this.onPointerUp as EventListener)
    }
  }

  private onWheel = (ev: WheelEvent): void => {
    ev.preventDefault()
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1
    const nextZoom = Math.max(this.bounds.minZoom, Math.min(this.bounds.maxZoom, this.viewport.zoom * factor))
    this.viewport = { ...this.viewport, zoom: nextZoom }
    this.notify()
  }

  private onPointerDown = (ev: PointerEvent): void => {
    this.dragging = true
    this.dragOrigin = {
      x: ev.clientX,
      y: ev.clientY,
      cx: this.viewport.centerX,
      cy: this.viewport.centerY,
    }
    ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
  }

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.dragging || !this.dragOrigin || !this.el) return
    const rect = this.el.getBoundingClientRect()
    const dx = (ev.clientX - this.dragOrigin.x) / rect.width
    const dy = (ev.clientY - this.dragOrigin.y) / rect.height
    this.viewport = {
      ...this.viewport,
      centerX: this.dragOrigin.cx - dx,
      centerY: this.dragOrigin.cy - dy,
    }
    this.notify()
  }

  private onPointerUp = (_ev: PointerEvent): void => {
    this.dragging = false
    this.dragOrigin = null
  }

  private clamp(v: Viewport, bounds: CameraBounds): Viewport {
    return {
      centerX: Math.max(0, Math.min(1, v.centerX)),
      centerY: Math.max(0, Math.min(1, v.centerY)),
      zoom: Math.max(bounds.minZoom, Math.min(bounds.maxZoom, v.zoom)),
    }
  }

  private notify(): void {
    for (const l of this.listeners) l({ ...this.viewport })
  }
}