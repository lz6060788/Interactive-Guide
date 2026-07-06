import test from 'node:test'
import assert from 'node:assert/strict'
import { Camera } from '../../../src/products/atlas/runtime/camera.js'

class FakeCameraElement {
  style: Record<string, string> = {}
  clientWidth: number
  clientHeight: number
  offsetWidth: number
  offsetHeight: number
  private readonly rectWidth: number
  private readonly rectHeight: number
  private listeners = new Map<string, Set<(event: any) => void>>()

  constructor(opts: {
    clientWidth: number
    clientHeight: number
    rectWidth: number
    rectHeight: number
  }) {
    this.clientWidth = opts.clientWidth
    this.clientHeight = opts.clientHeight
    this.offsetWidth = opts.clientWidth
    this.offsetHeight = opts.clientHeight
    this.rectWidth = opts.rectWidth
    this.rectHeight = opts.rectHeight
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return {
      left: 0,
      top: 0,
      width: this.rectWidth,
      height: this.rectHeight,
    }
  }

  setPointerCapture(): void {}
  hasPointerCapture(): boolean { return false }
  releasePointerCapture(): void {}

  dispatch(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

test('Camera drag pan uses logical viewport deltas when preview is CSS-scaled', () => {
  const scaledEl = new FakeCameraElement({
    clientWidth: 375,
    clientHeight: 808,
    rectWidth: 187.5,
    rectHeight: 404,
  })
  const scaledCamera = new Camera(
    scaledEl as unknown as HTMLElement,
    { centerX: 0.5, centerY: 0.5, zoom: 2 },
    { minZoom: 1, maxZoom: 4 },
    { wheelZoom: true, dragPan: true, pinchZoom: true, resetCameraEnabled: true },
    { width: 3000, height: 1500 },
  )
  const fullEl = new FakeCameraElement({
    clientWidth: 375,
    clientHeight: 808,
    rectWidth: 375,
    rectHeight: 808,
  })
  const fullCamera = new Camera(
    fullEl as unknown as HTMLElement,
    { centerX: 0.5, centerY: 0.5, zoom: 2 },
    { minZoom: 1, maxZoom: 4 },
    { wheelZoom: true, dragPan: true, pinchZoom: true, resetCameraEnabled: true },
    { width: 3000, height: 1500 },
  )

  scaledEl.dispatch('pointerdown', {
    pointerId: 1,
    clientX: 50,
    clientY: 60,
    target: null,
  })
  scaledEl.dispatch('pointermove', {
    pointerId: 1,
    clientX: 100,
    clientY: 60,
    target: null,
  })
  fullEl.dispatch('pointerdown', {
    pointerId: 1,
    clientX: 100,
    clientY: 60,
    target: null,
  })
  fullEl.dispatch('pointermove', {
    pointerId: 1,
    clientX: 200,
    clientY: 60,
    target: null,
  })

  const scaledAfter = scaledCamera.getViewport()
  const fullAfter = fullCamera.getViewport()

  assert.ok(scaledAfter.centerX < 0.5, 'dragging right should pan camera left')
  assert.ok(Math.abs(scaledAfter.centerX - fullAfter.centerX) < 0.000001, 'scaled preview drag should match logical unscaled drag')

  scaledCamera.destroy()
  fullCamera.destroy()
})
