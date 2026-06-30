import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const FIXTURE_ROOT = path.resolve('tests/fixtures')
const RESOURCE_FIXTURE = path.join(FIXTURE_ROOT, 'guide_surface_validation_001.resources.json')
const KNOWLEDGE_FIXTURE = path.join(FIXTURE_ROOT, 'guide_surface_validation_001.knowledge.json')
const SPATIAL_FIXTURE = path.join(FIXTURE_ROOT, 'guide_surface_validation_001.spatial.json')
const WORKSPACE_DIR = path.resolve('data/workspace/guide_surface_validation_001')

test('resource fixture lists 8 entries with sha256 and size', () => {
  const data = JSON.parse(fs.readFileSync(RESOURCE_FIXTURE, 'utf-8'))
  assert.equal(data.projectId, 'guide_surface_validation_001')
  assert.equal(data.assets.length, 8)
  for (const a of data.assets) {
    assert.match(a.sha256, /^[a-f0-9]{64}$/)
    assert.ok(a.size > 0)
    assert.ok(['image', 'video', 'html-bundle'].includes(a.kind))
  }
})

test('workspace files match fixture sha256', () => {
  const data = JSON.parse(fs.readFileSync(RESOURCE_FIXTURE, 'utf-8'))
  for (const a of data.assets) {
    const fullPath = path.join(WORKSPACE_DIR, a.path)
    assert.ok(fs.existsSync(fullPath), `missing: ${a.path}`)
    const buf = fs.readFileSync(fullPath)
    const h = crypto.createHash('sha256').update(buf).digest('hex')
    assert.equal(h, a.sha256, `sha256 mismatch: ${a.path}`)
    assert.equal(buf.length, a.size, `size mismatch: ${a.path}`)
  }
})

test('knowledge fixture covers 34 items across 9 categories in 3 stages', () => {
  const data = JSON.parse(fs.readFileSync(KNOWLEDGE_FIXTURE, 'utf-8'))
  assert.equal(data.stages.length, 3)
  assert.deepEqual(data.stages.map((s: { key: string }) => s.key), ['upstream', 'midstream', 'downstream'])
  const allItems = data.stages.flatMap((s: { categories: { items: unknown[] }[] }) =>
    s.categories.flatMap((c: { items: unknown[] }) => c.items),
  )
  assert.equal(allItems.length, 34)
  const itemIds = new Set(allItems.map((i: { id: string }) => i.id))
  assert.equal(itemIds.size, 34, 'item IDs must be unique')
})

test('spatial fixture coordinates are within [0,1] and have 7 hotspot + 16 item markers', () => {
  const data = JSON.parse(fs.readFileSync(SPATIAL_FIXTURE, 'utf-8'))
  let hotspotCount = 0
  let itemMarkerCount = 0
  for (const stage of data.stages) {
    hotspotCount += (stage.hotspots ?? []).length
    for (const h of stage.hotspots ?? []) {
      assert.ok(h.anchor.x >= 0 && h.anchor.x <= 1, `hotspot x out of range: ${h.categoryId}`)
      assert.ok(h.anchor.y >= 0 && h.anchor.y <= 1, `hotspot y out of range: ${h.categoryId}`)
    }
  }
  for (const items of Object.values(data.categoryItems as Record<string, Array<{ marker: { x: number; y: number } }>>)) {
    itemMarkerCount += items.length
    for (const i of items) {
      assert.ok(i.marker.x >= 0 && i.marker.x <= 1)
      assert.ok(i.marker.y >= 0 && i.marker.y <= 1)
    }
  }
  assert.equal(hotspotCount, 7, 'expected 7 panorama hotspots (midstream 3 + downstream 4)')
  assert.equal(itemMarkerCount, 16, 'expected 16 item markers (midstream 8 + downstream 8)')
  assert.equal(data.calibrationStatus, 'confirmed')
})

test('spatial fixture upstream stage is html-scene, not panorama', () => {
  const data = JSON.parse(fs.readFileSync(SPATIAL_FIXTURE, 'utf-8'))
  const upstream = data.stages.find((s: { key: string }) => s.key === 'upstream')
  assert.equal(upstream.presentation, 'html-scene')
  assert.match(upstream.sceneAssetId, /^scene:/)
  assert.ok(typeof upstream.htmlActivationMessage?.type === 'string')
})
