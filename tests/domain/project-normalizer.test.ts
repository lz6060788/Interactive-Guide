import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftProject, normalizeProject } from '../../src/domain/project-normalizer.js'
import { PROJECT_DEFAULTS } from '../../src/config/project-defaults.js'

void PROJECT_DEFAULTS

test('normalizeProject fills panorama.cameraBounds and initialViewport from defaults', () => {
  const draft = createDraftProject({ id: 'p1', title: 'T' })
  draft.panorama.assetId = 'asset-pano'
  draft.assets.byId['asset-pano'] = { id: 'asset-pano', kind: 'image', sourcePath: 'pano.png' }
  const normalized = normalizeProject(draft)
  assert.equal(normalized.panorama.cameraBounds.minZoom, PROJECT_DEFAULTS.panorama.minZoom)
  assert.equal(normalized.panorama.cameraBounds.maxZoom, PROJECT_DEFAULTS.panorama.maxZoom)
  assert.equal(normalized.panorama.initialViewport.zoom, PROJECT_DEFAULTS.panorama.minZoom)
})

test('normalizeProject leaves focusRect undefined for atlas-only items (catalog-only field)', () => {
  const draft = createDraftProject({ id: 'p1', title: 'T' })
  draft.panorama.assetId = 'asset-pano'
  draft.assets.byId['asset-pano'] = { id: 'asset-pano', kind: 'image', sourcePath: 'x' }
  draft.knowledge.stages[0].categories.push({
    id: 'cat-a',
    title: 'A',
    order: 0,
    itemIds: ['item-a'],
    experience: { kind: 'panorama' },
  })
  draft.knowledge.items['item-a'] = {
    id: 'item-a',
    categoryId: 'cat-a',
    title: 'A',
    description: '',
    order: 0,
  }
  const normalized = normalizeProject(draft)
  const item = normalized.panorama.items['item-a']
  // focusRect is catalog-only; atlas-only items carry no focusRect
  // until the catalog inspector populates one.
  assert.equal(item.focusRect, undefined)
  assert.ok(item.marker, 'marker must still be populated from category centroid')
})

test('normalizeProject fills product hint texts and viewport animation from defaults', () => {
  const draft = createDraftProject({ id: 'p1', title: 'T' })
  draft.panorama.assetId = 'asset-pano'
  draft.assets.byId['asset-pano'] = { id: 'asset-pano', kind: 'image', sourcePath: 'pano.png' }
  const normalized = normalizeProject(draft)
  assert.equal(normalized.products.atlas.hintText, PROJECT_DEFAULTS.products.atlas.hintText)
  assert.equal(normalized.products.catalog.hintText, PROJECT_DEFAULTS.products.catalog.hintText)
  assert.equal(
    normalized.products.catalog.interaction.viewportAnimationMs,
    PROJECT_DEFAULTS.products.catalog.viewportAnimationMs,
  )
})

test('normalizeProject throws when panorama.assetId is missing and autoPick is disabled', () => {
  const draft = createDraftProject({ id: 'p1', title: 'T' })
  assert.throws(() => normalizeProject(draft, { autoPickPanoramaAsset: false }))
})

test('normalizeProject auto-picks the first image asset when autoPickPanoramaAsset is true', () => {
  const draft = createDraftProject({ id: 'p1', title: 'T' })
  draft.assets.byId['asset-pano'] = { id: 'asset-pano', kind: 'image', sourcePath: 'pano.png' }
  const normalized = normalizeProject(draft, { autoPickPanoramaAsset: true })
  assert.equal(normalized.panorama.assetId, 'asset-pano')
})

test('normalizeProject does not overwrite explicitly provided values', () => {
  const draft = createDraftProject({ id: 'p1', title: 'T' })
  draft.panorama.assetId = 'asset-pano'
  draft.assets.byId['asset-pano'] = { id: 'asset-pano', kind: 'image', sourcePath: 'pano.png' }
  draft.panorama.initialViewport = { centerX: 0.123, centerY: 0.456, zoom: 2.5 }
  const normalized = normalizeProject(draft)
  assert.equal(normalized.panorama.initialViewport.centerX, 0.123)
  assert.equal(normalized.panorama.initialViewport.zoom, 2.5)
})

test('createDraftProject returns a shape-valid project with revision 1', () => {
  const draft = createDraftProject({ id: 'p1', title: 'T', locale: 'en-US' })
  assert.equal(draft.id, 'p1')
  assert.equal(draft.title, 'T')
  assert.equal(draft.locale, 'en-US')
  assert.equal(draft.metadata.revision, 1)
  assert.equal(draft.metadata.schemaVersion, '2.0.0')
  assert.equal(draft.knowledge.stages.length, 3)
})
