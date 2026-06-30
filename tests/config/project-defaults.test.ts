import test from 'node:test'
import assert from 'node:assert/strict'
import { PROJECT_DEFAULTS } from '../../src/config/project-defaults.js'

test('PROJECT_DEFAULTS.viewport is 375x808', () => {
  assert.equal(PROJECT_DEFAULTS.viewport.width, 375)
  assert.equal(PROJECT_DEFAULTS.viewport.height, 808)
})

test('PROJECT_DEFAULTS.panorama.minZoom/maxZoom/categoryZoom are sensible', () => {
  assert.equal(PROJECT_DEFAULTS.panorama.minZoom, 1)
  assert.equal(PROJECT_DEFAULTS.panorama.maxZoom, 4)
  assert.equal(PROJECT_DEFAULTS.panorama.categoryZoom, 3.6)
})

test('PROJECT_DEFAULTS.panorama.focusRect has stable shape', () => {
  assert.equal(PROJECT_DEFAULTS.panorama.focusRect.width, 0.22)
  assert.equal(PROJECT_DEFAULTS.panorama.focusRect.height, 0.18)
  assert.equal(PROJECT_DEFAULTS.panorama.focusRect.radius, 12)
  assert.equal(PROJECT_DEFAULTS.panorama.focusRect.maskOpacity, 0.48)
})

test('PROJECT_DEFAULTS.products carries both atlas and catalog hint texts', () => {
  assert.match(PROJECT_DEFAULTS.products.atlas.hintText, /拖动|缩放|探索/)
  assert.match(PROJECT_DEFAULTS.products.catalog.hintText, /点击|滑动|简介/)
  assert.equal(PROJECT_DEFAULTS.products.catalog.viewportAnimationMs, 360)
})

test('PROJECT_DEFAULTS contains no project names, asset paths, or business labels', () => {
  const json = JSON.stringify(PROJECT_DEFAULTS)
  for (const forbidden of ['商业航天', 'rocket.html', 'satellite', '北斗', 'starship', 'launch-services']) {
    assert.doesNotMatch(json, new RegExp(forbidden, 'i'), `default must not contain "${forbidden}"`)
  }
})
