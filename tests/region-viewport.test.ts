import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveInitialRegionViewport } from '../src/runtime/player-core/region-viewport.js'

function approxEqual(actual: number, expected: number, epsilon: number = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ~= ${expected}`)
}

test('resolveInitialRegionViewport derives center window from panRange and viewport aspect', () => {
  const result = resolveInitialRegionViewport({
    viewportWidth: 375,
    viewportHeight: 808,
    sourceAspect: 375 / 808,
    imageFitMode: 'fitHeight',
    regionViewport: {
      sourceNodeId: 'root',
      coordSpace: 'source-normalized',
      panRange: {
        topLeft: { x: 0.2, y: 0.3 },
        topRight: { x: 0.8, y: 0.3 },
        bottomRight: { x: 0.8, y: 0.7 },
        bottomLeft: { x: 0.2, y: 0.7 },
      },
      initialWindowRule: {
        mode: 'derive-from-pan-range-center',
        fitBy: 'height',
      },
    },
  })

  approxEqual(result.initialWindow.topLeft.y, 0.3)
  approxEqual(result.initialWindow.bottomLeft.y, 0.7)
  approxEqual(result.initialWindow.topLeft.x, 0.3)
  approxEqual(result.initialWindow.topRight.x, 0.7)
  assert.equal(result.fitMode, 'fitHeight')
  assert.equal(result.canPanHorizontally, true)
  assert.equal(result.clipPath, '')
})

test('resolveInitialRegionViewport clamps derived width to panRange width on wide viewports', () => {
  const result = resolveInitialRegionViewport({
    viewportWidth: 1400,
    viewportHeight: 600,
    sourceAspect: 16 / 9,
    imageFitMode: 'fitHeight',
    regionViewport: {
      sourceNodeId: 'root',
      coordSpace: 'source-normalized',
      panRange: {
        topLeft: { x: 0.4, y: 0.2 },
        topRight: { x: 0.6, y: 0.2 },
        bottomRight: { x: 0.6, y: 0.8 },
        bottomLeft: { x: 0.4, y: 0.8 },
      },
      initialWindowRule: {
        mode: 'derive-from-pan-range-center',
        fitBy: 'height',
      },
    },
  })

  assert.equal(result.initialWindow.topLeft.x, 0.4)
  assert.equal(result.initialWindow.topRight.x, 0.6)
  approxEqual(result.initialWindow.topLeft.y, 0.7517857143)
  approxEqual(result.initialWindow.bottomLeft.y, 0.8)
  assert.equal(result.fitMode, 'fitWidth')
  assert.equal(result.canPanHorizontally, false)
  assert.equal(result.visibleWindowWidthPx, 1400)
  approxEqual(result.offsetY, -2550)
})

test('resolveInitialRegionViewport uses fill mode without preserving pan window aspect', () => {
  const result = resolveInitialRegionViewport({
    viewportWidth: 375,
    viewportHeight: 808,
    sourceAspect: 16 / 9,
    regionViewport: {
      sourceNodeId: 'root',
      coordSpace: 'source-normalized',
      panRange: {
        topLeft: { x: 0.2, y: 0.1 },
        topRight: { x: 0.5, y: 0.1 },
        bottomRight: { x: 0.5, y: 0.8 },
        bottomLeft: { x: 0.2, y: 0.8 },
      },
      initialWindowRule: {
        mode: 'derive-from-pan-range-center',
        fitBy: 'height',
      },
    },
    imageFitMode: 'fill',
  })

  assert.equal(result.fitMode, 'fill')
  approxEqual(result.initialWindow.topLeft.x, 0.2)
  approxEqual(result.initialWindow.bottomRight.y, 0.8)
  assert.equal(result.canPanHorizontally, false)
})
