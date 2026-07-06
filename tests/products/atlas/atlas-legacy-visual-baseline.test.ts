import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  ATLAS_CHIP_ACTIVE_BG,
  ATLAS_CHIP_HEIGHT_PX,
  ATLAS_DRAWER_CARD_WIDTH_PX,
  ATLAS_DRAWER_SCROLL_LOCK_MS,
  ATLAS_DRAWER_SCROLL_SETTLE_MS,
  ATLAS_MARKER_SIZE_PX,
} from '../../../src/products/atlas/runtime/atlas-visual-tokens.js'

interface AtlasLegacyBaseline {
  source: { branch: string; runtimeFile: string }
  viewport: { primary: { width: number; height: number }; maxAnnotationPositionErrorPx: number }
  annotation: {
    marker: { width: number; height: number; selectedColor: string }
    chip: { height: number; selectedBackground: string; hasConnectorLine: boolean }
  }
  drawer: { card: { width: number; scrollSettleMs: number; scrollLockMs: number } }
}

const fixturePath = path.resolve('tests/fixtures/atlas-legacy-visual-baseline.json')
const baseline = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as AtlasLegacyBaseline

test('Atlas legacy visual baseline stays tied to the main Surface runtime', () => {
  assert.equal(baseline.source.branch, 'main')
  assert.equal(baseline.source.runtimeFile, 'src/runtime/player-core/player-host.ts')
  assert.deepEqual(baseline.viewport.primary, { width: 375, height: 808 })
  assert.equal(baseline.viewport.maxAnnotationPositionErrorPx, 1)
})

test('Atlas annotations use marker + chip without a connector line', () => {
  assert.equal(baseline.annotation.marker.width, 21)
  assert.equal(baseline.annotation.marker.height, 21)
  assert.equal(baseline.annotation.marker.selectedColor, '#FF2436')
  assert.equal(baseline.annotation.chip.height, 36)
  assert.equal(baseline.annotation.chip.selectedBackground, '#3366FF')
  assert.equal(baseline.annotation.chip.hasConnectorLine, false)
  assert.equal(ATLAS_MARKER_SIZE_PX, baseline.annotation.marker.width)
  assert.equal(ATLAS_CHIP_HEIGHT_PX, baseline.annotation.chip.height)
  assert.equal(ATLAS_CHIP_ACTIVE_BG, baseline.annotation.chip.selectedBackground)
})

test('Atlas drawer preserves the original card and scroll timing contract', () => {
  assert.equal(baseline.drawer.card.width, 260)
  assert.equal(baseline.drawer.card.scrollSettleMs, 140)
  assert.equal(baseline.drawer.card.scrollLockMs, 420)
  assert.equal(ATLAS_DRAWER_CARD_WIDTH_PX, baseline.drawer.card.width)
  assert.equal(ATLAS_DRAWER_SCROLL_SETTLE_MS, baseline.drawer.card.scrollSettleMs)
  assert.equal(ATLAS_DRAWER_SCROLL_LOCK_MS, baseline.drawer.card.scrollLockMs)
})
