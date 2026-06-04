import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clampSurfaceCamera,
  getVisibleSurfaceLayers,
  resolveVisibleSurfaceAnnotations,
  projectSurfacePoint,
  resolveSurfaceCameraLayout,
} from '../src/runtime/player-core/surface-camera.js'

test('clampSurfaceCamera constrains zoom and camera center to visible bounds', () => {
  const camera = clampSurfaceCamera(
    { centerX: -1, centerY: 2, zoom: 99 },
    375,
    808,
    375 / 808,
    { minZoom: 1, maxZoom: 4 },
  )

  assert.equal(camera.zoom, 4)
  assert.equal(camera.centerX, 0.125)
  assert.equal(camera.centerY, 0.875)
})

test('resolveSurfaceCameraLayout projects normalized points into viewport space', () => {
  const layout = resolveSurfaceCameraLayout({
    viewportWidth: 375,
    viewportHeight: 808,
    sourceAspect: 375 / 808,
    camera: { centerX: 0.5, centerY: 0.5, zoom: 2 },
    bounds: { minZoom: 1, maxZoom: 4 },
  })

  const center = projectSurfacePoint({ x: 0.5, y: 0.5 }, layout)
  assert.equal(Math.round(center.x), 188)
  assert.equal(Math.round(center.y), 404)
})

test('resolveSurfaceCameraLayout uses cover sizing and prevents black edges at initial zoom', () => {
  const layout = resolveSurfaceCameraLayout({
    viewportWidth: 375,
    viewportHeight: 808,
    sourceAspect: 16 / 9,
    camera: { centerX: 0.5, centerY: 0, zoom: 1 },
    bounds: { minZoom: 1, maxZoom: 4 },
  })

  assert.equal(layout.scaledHeight, 808)
  assert.ok(layout.scaledWidth > 375)
  assert.equal(layout.camera.centerY, 0.5)
  assert.ok(layout.originX < 0)
  assert.equal(layout.originY, 0)
})

test('getVisibleSurfaceLayers returns layers allowed by current zoom', () => {
  const visible = getVisibleSurfaceLayers(
    [
      { id: 'base', title: 'base', visibility: { minZoom: 1 }, cards: [], hotspots: [] },
      { id: 'detail', title: 'detail', visibility: { minZoom: 2.5 }, cards: [], hotspots: [] },
    ],
    { centerX: 0.5, centerY: 0.5, zoom: 2 },
  )

  assert.deepEqual(visible.map(layer => layer.id), ['base'])
})

test('resolveVisibleSurfaceAnnotations hides hotspots once cards become visible', () => {
  const annotations = resolveVisibleSurfaceAnnotations(
    [
      {
        id: 'overview',
        title: 'overview',
        visibility: { minZoom: 1, hotspotsMinZoom: 1, cardsMinZoom: 3 },
        cards: [],
        hotspots: [
          {
            id: 'hotspot-1',
            label: '总览热点',
            anchor: { x: 0.4, y: 0.4 },
            coordSpace: 'surface-normalized',
            target: { type: 'focus-layer', layerId: 'detail' },
          },
        ],
      },
      {
        id: 'detail',
        title: 'detail',
        visibility: { minZoom: 2, cardsMinZoom: 2, hotspotsMinZoom: 2 },
        cards: [
          {
            id: 'card-1',
            title: '地面站',
            anchor: { x: 0.6, y: 0.5 },
            coordSpace: 'surface-normalized',
          },
        ],
        hotspots: [
          {
            id: 'hotspot-2',
            label: '详情热点',
            anchor: { x: 0.6, y: 0.5 },
            coordSpace: 'surface-normalized',
            target: { type: 'edge', edgeId: 'edge-1' },
          },
        ],
      },
    ],
    { centerX: 0.5, centerY: 0.5, zoom: 2.2 },
  )

  assert.deepEqual(annotations.cards.map(card => card.id), ['card-1'])
  assert.deepEqual(annotations.hotspots.map(hotspot => hotspot.id), [])
})

test('resolveVisibleSurfaceAnnotations uses visibility.minZoom as the single threshold', () => {
  const annotations = resolveVisibleSurfaceAnnotations(
    [
      {
        id: 'overview',
        title: 'overview',
        visibility: { minZoom: 1, hotspotsMinZoom: 9, cardsMinZoom: 9 },
        cards: [],
        hotspots: [
          {
            id: 'overview-hotspot',
            label: '总览热点',
            anchor: { x: 0.2, y: 0.2 },
            coordSpace: 'surface-normalized',
            target: { type: 'focus-layer', layerId: 'detail' },
          },
        ],
      },
      {
        id: 'detail',
        title: 'detail',
        visibility: { minZoom: 3.6, hotspotsMinZoom: 1, cardsMinZoom: 1 },
        cards: [
          {
            id: 'detail-card',
            title: '详情卡片',
            anchor: { x: 0.6, y: 0.5 },
            coordSpace: 'surface-normalized',
          },
        ],
        hotspots: [],
      },
    ],
    { centerX: 0.5, centerY: 0.5, zoom: 3.6 },
  )

  assert.deepEqual(annotations.cards.map(card => card.id), ['detail-card'])
  assert.deepEqual(annotations.hotspots, [])
})
