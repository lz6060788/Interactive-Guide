import test from 'node:test'
import assert from 'node:assert/strict'
import {
  projectNormalizedPoint,
  resolvePanoramaProjection,
  unprojectScreenPoint,
  zoomCameraAtScreenPoint,
} from '../../../src/products/atlas/runtime/panorama-projection.js'

const base = {
  viewportWidth: 375,
  viewportHeight: 808,
  sourceWidth: 1920,
  sourceHeight: 1080,
  bounds: { minZoom: 1, maxZoom: 4 },
}

test('cover projection preserves a wide source aspect inside a portrait viewport', () => {
  const p = resolvePanoramaProjection({ ...base, camera: { centerX: 0.5, centerY: 0.5, zoom: 1 } })
  assert.equal(p.baseHeight, 808)
  assert.ok(p.baseWidth > 1400)
  assert.ok(p.originX < 0)
  assert.deepEqual(projectNormalizedPoint({ x: 0.5, y: 0.5 }, p), { x: 187.5, y: 404 })
})

test('normalized -> screen -> normalized round-trip remains stable at every zoom', () => {
  for (const zoom of [1, 2, 4]) {
    const p = resolvePanoramaProjection({ ...base, camera: { centerX: 0.48, centerY: 0.62, zoom } })
    const source = { x: 0.53, y: 0.71 }
    const roundTrip = unprojectScreenPoint(projectNormalizedPoint(source, p), p)
    assert.ok(Math.abs(roundTrip.x - source.x) < 1e-9)
    assert.ok(Math.abs(roundTrip.y - source.y) < 1e-9)
  }
})

test('pointer-anchored zoom keeps the same panorama point under the pointer', () => {
  const camera = { centerX: 0.5, centerY: 0.5, zoom: 1 }
  const pointer = { x: 90, y: 220 }
  const before = resolvePanoramaProjection({ ...base, camera })
  const anchor = unprojectScreenPoint(pointer, before)
  const next = zoomCameraAtScreenPoint(camera, pointer, 2, base)
  const after = resolvePanoramaProjection({ ...base, camera: next })
  const projected = projectNormalizedPoint(anchor, after)
  assert.ok(Math.abs(projected.x - pointer.x) <= 1)
  assert.ok(Math.abs(projected.y - pointer.y) <= 1)
})
