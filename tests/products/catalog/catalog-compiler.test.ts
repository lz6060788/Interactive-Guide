/**
 * CatalogCompiler unit tests — projection of NormalizedProject →
 * CatalogManifest with focusRect data for the structured-knowledge
 * product.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { compileCatalog, CatalogCompileError } from '../../../src/products/catalog/compiler/catalog-compiler.js'
import { createDraftProject } from '../../../src/domain/project-normalizer.js'
import type { GuideProject } from '../../../src/domain/project-types.js'

const closure = (_id: string, sourcePath: string): string => `./${sourcePath}`

function sample(): GuideProject {
  const p = createDraftProject({ id: 'rocket', title: 'Rocket' })
  p.panorama.assetId = 'asset-pano'
  p.assets.byId['asset-pano'] = {
    id: 'asset-pano',
    kind: 'image',
    sourcePath: 'assets/images/asset-pano/image.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    sha256: 'abc',
  }
  // Replace the default upstream stage with a real category that has focusRect.
  p.knowledge.stages[0].key = 'upstream'
  p.knowledge.stages[0].label = '上游'
  p.knowledge.stages[0].order = 1
  p.knowledge.stages[0].categories = [
    {
      id: 'cat-up',
      title: 'Upstream',
      order: 0,
      itemIds: ['item-1'],
      experience: { kind: 'panorama' },
    },
  ]
  p.knowledge.items['item-1'] = {
    id: 'item-1',
    categoryId: 'cat-up',
    title: 'Item 1',
    description: 'desc',
    order: 0,
  }
  p.panorama.categories['cat-up'] = {
    viewport: { centerX: 0.5, centerY: 0.5, zoom: 2 },
  }
  p.panorama.items['item-1'] = {
    marker: { x: 0.5, y: 0.6 },
    focusRect: { x: 0.1, y: 0.1, width: 0.22, height: 0.18, radius: 0.05, maskOpacity: 0.45 },
  }
  return p
}

test('compileCatalog projects stages and items with focusRect into the manifest', () => {
  const p = sample()
  const { manifest } = compileCatalog(p, closure)
  assert.equal(manifest.product, 'catalog')
  assert.equal(manifest.projectId, 'rocket')
  assert.equal(manifest.panorama.url, './assets/images/asset-pano/image.jpg')
  assert.equal(manifest.stages.length, 3)
  assert.equal(manifest.stages[0].key, 'upstream')
  assert.equal(manifest.stages[0].categories.length, 1)
  assert.equal(manifest.stages[0].categories[0].id, 'cat-up')
  assert.equal(manifest.stages[0].categories[0].viewport.zoom, 2)
  assert.equal(manifest.items.length, 1)
  assert.equal(manifest.items[0].focusRect.x, 0.1)
  assert.equal(manifest.items[0].focusRect.width, 0.22)
  assert.equal(manifest.items[0].focusRect.radius, 0.05)
  assert.equal(manifest.items[0].focusRect.maskOpacity, 0.45)
})

test('compileCatalog throws when panorama.assetId is missing', () => {
  const p = sample()
  p.panorama.assetId = ''
  assert.throws(() => compileCatalog(p, closure), CatalogCompileError)
})

test('compileCatalog throws when panorama.assetId points at a non-image', () => {
  const p = sample()
  p.assets.byId['asset-pano'].kind = 'video'
  assert.throws(() => compileCatalog(p, closure), CatalogCompileError)
})

test('compileCatalog is deterministic across runs', () => {
  const p = sample()
  const a = compileCatalog(p, closure)
  const b = compileCatalog(p, closure)
  assert.equal(JSON.stringify(a.manifest), JSON.stringify(b.manifest))
})

test('compileCatalog rewrites asset URLs through the closure', () => {
  const p = sample()
  const customClosure = (_id: string, sourcePath: string): string =>
    `./release/${sourcePath.split('/').pop()}`
  const { manifest } = compileCatalog(p, customClosure)
  assert.equal(manifest.panorama.url, './release/image.jpg')
})

test('compileCatalog includes only items with focusRect', () => {
  const p = sample()
  // Add a second item WITHOUT a focusRect — it must be excluded.
  p.knowledge.items['item-2'] = {
    id: 'item-2',
    categoryId: 'cat-up',
    title: 'Item 2',
    description: '',
    order: 1,
  }
  p.knowledge.stages[0].categories[0].itemIds.push('item-2')
  p.panorama.items['item-2'] = { marker: { x: 0.2, y: 0.2 } }
  const { manifest } = compileCatalog(p, closure)
  assert.equal(manifest.items.length, 1)
  assert.equal(manifest.items[0].id, 'item-1')
})

test('compileCatalog includes only scenes reachable via navigation', () => {
  const p = sample()
  p.scenes.push({
    id: 's-reachable',
    title: 'Reachable',
    assetId: 'asset-scene-reachable',
    views: [{ id: 'v1', title: 'V', activationMessage: { type: 'init' } }],
    protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
  })
  p.scenes.push({
    id: 's-orphan',
    title: 'Orphan',
    assetId: 'asset-scene-orphan',
    views: [{ id: 'v1', title: 'V', activationMessage: { type: 'init' } }],
    protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
  })
  p.assets.byId['asset-scene-reachable'] = {
    id: 'asset-scene-reachable',
    kind: 'html-bundle',
    sourcePath: 'scenes/s-reachable/index.html',
  }
  p.assets.byId['asset-scene-orphan'] = {
    id: 'asset-scene-orphan',
    kind: 'html-bundle',
    sourcePath: 'scenes/s-orphan/index.html',
  }
  p.navigation.routes = [
    {
      id: 'r1',
      from: { kind: 'panorama' },
      to: { kind: 'scene', sceneId: 's-reachable' },
      transition: { kind: 'video', assetId: 'asset-vid', onFailure: 'cut' },
    },
  ]
  const { manifest } = compileCatalog(p, closure)
  const ids = manifest.scenes.map((s) => s.sceneId).sort()
  assert.deepEqual(ids, ['s-reachable'])
})