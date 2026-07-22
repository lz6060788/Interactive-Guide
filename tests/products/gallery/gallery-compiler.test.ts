import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftProject } from '../../../src/domain/project-normalizer.js'
import {
  compileGallery,
  GalleryCompileError,
} from '../../../src/products/gallery/compiler/gallery-compiler.js'
import { resolveGalleryManifest } from '../../../src/products/contracts/manifest-localization.js'

function project() {
  const value = createDraftProject({ id: 'gallery-test', title: 'Gallery Test' })
  value.title['en-US'] = 'Gallery Test'
  value.products.gallery.enabled = true
  value.knowledge.stages[0].categories = [
    {
      id: 'cat-up',
      title: { 'zh-CN': '核心零部件', 'en-US': 'Core Components' },
      order: 0,
      itemIds: ['item-vacuum'],
      experience: { kind: 'panorama' },
    },
  ]
  value.knowledge.items['item-vacuum'] = {
    id: 'item-vacuum',
    categoryId: 'cat-up',
    title: { 'zh-CN': '真空系统', 'en-US': 'Vacuum Systems' },
    description: {
      'zh-CN': '维持洁净低压环境。',
      'en-US': 'Maintains a clean low-pressure environment.',
    },
    order: 0,
  }
  value.assets.byId['image-vacuum'] = {
    id: 'image-vacuum',
    kind: 'image',
    sourcePath: 'images/image-vacuum/真空系统.png',
    mimeType: 'image/png',
  }
  value.products.gallery.itemImageAssetIds['item-vacuum'] = 'image-vacuum'
  return value
}

test('compileGallery emits one ordered image entry per third-level item', () => {
  const result = compileGallery(project(), (_projectId, sourcePath) => `./assets/${sourcePath}`)
  assert.equal(result.manifest.product, 'gallery')
  assert.equal(result.manifest.schemaVersion, '1.0.0')
  assert.equal(result.manifest.items.length, 1)
  assert.equal(result.manifest.items[0].image.url, './assets/images/image-vacuum/真空系统.png')
  assert.deepEqual(result.manifest.stages[0].categories[0].itemIds, ['item-vacuum'])
  assert.deepEqual(
    result.assets.map(asset => asset.id),
    ['image-vacuum'],
  )
})

test('compileGallery fails with an item-addressable error when an image is missing', () => {
  const value = project()
  delete value.products.gallery.itemImageAssetIds['item-vacuum']
  assert.throws(
    () => compileGallery(value, () => './unused'),
    (error: unknown) =>
      error instanceof GalleryCompileError && error.message.includes('upstream/cat-up/item-vacuum'),
  )
})

test('resolveGalleryManifest keeps the selected item stable across locales', () => {
  const result = compileGallery(project(), (_projectId, sourcePath) => `./assets/${sourcePath}`)
  const zh = resolveGalleryManifest(result.manifest, 'zh-CN')
  const en = resolveGalleryManifest(result.manifest, 'en-US')
  assert.equal(zh.items[0].id, en.items[0].id)
  assert.equal(zh.items[0].title, '真空系统')
  assert.equal(en.items[0].title, 'Vacuum Systems')
})
