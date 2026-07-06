/**
 * AtlasCompiler unit tests.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { compileAtlas, AtlasCompileError } from '../../../src/products/atlas/compiler/atlas-compiler.js'
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
  p.knowledge.stages[0].categories.push({
    id: 'cat-up',
    title: 'Upstream',
    order: 0,
    itemIds: ['item-1'],
    experience: { kind: 'panorama' },
  })
  p.knowledge.items['item-1'] = {
    id: 'item-1',
    categoryId: 'cat-up',
    title: 'Item 1',
    description: '',
    order: 0,
  }
  p.panorama.categories['cat-up'] = {
    viewport: { centerX: 0.5, centerY: 0.5, zoom: 2 },
    activationZoom: 3.6,
    hotspot: { x: 0.5, y: 0.5 },
  }
  p.panorama.items['item-1'] = {
    marker: { x: 0.5, y: 0.6 },
    viewportOverride: { centerX: 0.4, centerY: 0.55, zoom: 2.6 },
    focusRect: { x: 0, y: 0, width: 0.22, height: 0.18 },
  }
  return p
}

test('compileAtlas projects project fields into the manifest', () => {
  const p = sample()
  const { manifest } = compileAtlas(p, closure)
  assert.equal(manifest.product, 'atlas')
  assert.equal(manifest.projectId, 'rocket')
  assert.equal(manifest.panorama.assetId, 'asset-pano')
  assert.equal(manifest.panorama.url, './assets/images/asset-pano/image.jpg')
  assert.equal(manifest.categories.length, 1)
  assert.equal(manifest.categories[0].id, 'cat-up')
  assert.equal(manifest.categories[0].stageLabel, '上游')
  assert.equal(manifest.categories[0].hotspot?.x, 0.5)
  assert.equal(manifest.categories[0].activationZoom, 3.6)
  assert.equal(manifest.items.length, 1)
  assert.equal(manifest.items[0].marker.y, 0.6)
  assert.equal(manifest.items[0].viewportOverride?.zoom, 2.6)
})

test('compileAtlas throws when panorama.assetId is missing', () => {
  const p = sample()
  p.panorama.assetId = ''
  assert.throws(() => compileAtlas(p, closure), AtlasCompileError)
})

test('compileAtlas throws when panorama.assetId points at a non-image', () => {
  const p = sample()
  p.assets.byId['asset-pano'].kind = 'video'
  assert.throws(() => compileAtlas(p, closure), AtlasCompileError)
})

test('compileAtlas is deterministic: same input → same manifest (key order stable)', () => {
  const p = sample()
  const now = () => '2026-07-03T00:00:00.000Z'
  const a = compileAtlas(p, closure, now)
  const b = compileAtlas(p, closure, now)
  assert.equal(JSON.stringify(a.manifest), JSON.stringify(b.manifest))
})

test('compileAtlas rewrites asset URLs through the closure', () => {
  const p = sample()
  const customClosure = (_id: string, sourcePath: string): string =>
    `./release/${sourcePath.split('/').pop()}`
  const { manifest } = compileAtlas(p, customClosure)
  assert.equal(manifest.panorama.url, './release/image.jpg')
})

test('compileAtlas includes routes reachable from panorama or scene', () => {
  const p = sample()
  p.navigation.routes = [
    {
      id: 'r1',
      from: { kind: 'panorama' },
      to: { kind: 'scene', sceneId: 's-rocket' },
      transition: { kind: 'video', assetId: 'asset-vid', onFailure: 'cut' },
    },
  ]
  const { manifest } = compileAtlas(p, closure)
  assert.equal(manifest.routes.length, 1)
  assert.equal(manifest.routes[0].id, 'r1')
})

test('compileAtlas preserves authored category.itemIds order for drawer and first-callout focus', () => {
  const p = sample()
  p.knowledge.stages[0].categories[0].itemIds = ['item-2', 'item-1']
  p.knowledge.items['item-2'] = {
    id: 'item-2',
    categoryId: 'cat-up',
    title: 'Item 2',
    description: '',
    order: 1,
  }
  p.panorama.items['item-2'] = {
    marker: { x: 0.25, y: 0.35 },
    callout: { markerPosition: 'top', markerGapPx: 6 },
  }

  const { manifest } = compileAtlas(p, closure)
  assert.deepEqual(manifest.categories[0].itemIds, ['item-2', 'item-1'])
  assert.deepEqual(manifest.items.map((item) => item.id), ['item-2', 'item-1'])
})
