/**
 * CatalogEditor smoke test — verifies the catalog editor surface is
 * importable and that compileCatalog produces a mountable manifest.
 *
 * Real DOM coverage lives in the admin workbench integration tests
 * (Phase 8).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { CatalogEditor } from '../../src/admin/src/editors/catalog/CatalogEditor'
import { CatalogCanvas } from '../../src/admin/src/editors/catalog/CatalogCanvas'
import { CatalogInspector } from '../../src/admin/src/editors/catalog/CatalogInspector'
import { CatalogPreview } from '../../src/admin/src/editors/catalog/CatalogPreview'
import { CatalogToolbar } from '../../src/admin/src/editors/catalog/CatalogToolbar'
import { createDraftProject } from '../../src/domain/project-normalizer'
import { compileCatalog } from '../../src/products/catalog/compiler/catalog-compiler'

test('Catalog editor components are importable', () => {
  assert.equal(typeof CatalogEditor, 'function')
  assert.equal(typeof CatalogCanvas, 'function')
  assert.equal(typeof CatalogInspector, 'function')
  assert.equal(typeof CatalogPreview, 'function')
  assert.equal(typeof CatalogToolbar, 'function')
})

test('compileCatalog produces a manifest with stages and items for preview mount', () => {
  const p = createDraftProject({ id: 'p', title: 'P' })
  p.panorama.assetId = 'asset-pano'
  p.assets.byId['asset-pano'] = {
    id: 'asset-pano',
    kind: 'image',
    sourcePath: 'images/asset-pano/image.jpg',
    mimeType: 'image/jpeg',
    size: 1,
    sha256: 'x',
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
  p.panorama.items['item-1'] = {
    marker: { x: 0.5, y: 0.5 },
    focusRect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  }
  const { manifest } = compileCatalog(p, (_id, sourcePath) => `./${sourcePath}`)
  assert.equal(manifest.product, 'catalog')
  assert.equal(manifest.stages[0].categories[0].itemIds[0], 'item-1')
  assert.equal(manifest.items[0].focusRect.width, 0.2)
})