import test from 'node:test'
import assert from 'node:assert/strict'
import type { ResolvedGalleryManifest } from '../../../src/products/gallery/contract/gallery-manifest.js'
import { resolveGalleryFocusItemId } from '../../../src/products/gallery/runtime/gallery-focus.js'
import { resolveGalleryInitialItem } from '../../../src/products/gallery/runtime/gallery-runtime.js'
import {
  resolveGalleryImageScrollDirection,
  resolveGallerySelection,
} from '../../../src/products/gallery/runtime/gallery-scene.js'

function manifest(): ResolvedGalleryManifest {
  return {
    schemaVersion: '1.0.0',
    product: 'gallery',
    projectId: 'p',
    projectTitle: 'P',
    projectVersion: '0.1.0',
    localization: { defaultLocale: 'zh-CN', supportedLocales: ['zh-CN'] },
    locale: 'zh-CN',
    generatedAt: '2026-07-22T00:00:00.000Z',
    stages: [
      { key: 'upstream', label: '上游', order: 1, categories: [] },
      {
        key: 'midstream',
        label: '中游',
        order: 2,
        categories: [
          { id: 'cat-tools', title: '图形成形设备', order: 0, itemIds: ['item-lithography'] },
        ],
      },
      { key: 'downstream', label: '下游', order: 3, categories: [] },
    ],
    items: [
      {
        id: 'item-lithography',
        categoryId: 'cat-tools',
        title: '光刻设备',
        description: '图形曝光设备',
        order: 0,
        image: { assetId: 'image-1', url: './assets/image.png' },
      },
    ],
    config: {
      viewport: { width: 375, height: 808 },
      interaction: {
        listActivation: 'center-nearest',
        itemTransitionMs: 220,
        categoryTransitionMs: 320,
      },
      chrome: {},
      theme: { listDensity: 'comfortable' },
    },
    integrations: {},
  }
}

test('Gallery URL focus accepts stable item id and localized title', () => {
  assert.equal(resolveGalleryInitialItem(manifest(), 'item-lithography')?.id, 'item-lithography')
  assert.equal(resolveGalleryInitialItem(manifest(), ' 光刻设备 ')?.id, 'item-lithography')
})

test('Gallery URL focus resolves titles from every supported language before localization', () => {
  const items = [
    {
      id: 'item-rf-power',
      title: { 'zh-CN': '射频电源', 'en-US': 'RF Power Supply' },
    },
  ]
  assert.equal(resolveGalleryFocusItemId(items, '射频电源'), 'item-rf-power')
  assert.equal(resolveGalleryFocusItemId(items, ' RF Power Supply '), 'item-rf-power')
  assert.equal(resolveGalleryFocusItemId(items, 'item-rf-power'), 'item-rf-power')
})

test('Gallery selection derives the owning stage and category from an item id', () => {
  assert.deepEqual(resolveGallerySelection(manifest(), { itemId: 'item-lithography' }), {
    stageKey: 'midstream',
    categoryId: 'cat-tools',
    itemId: 'item-lithography',
  })
})

test('Gallery image scroll follows the authored item order in both directions', () => {
  const value = manifest()
  value.stages[1].categories[0].itemIds.push('item-coating')
  value.items.push({
    id: 'item-coating',
    categoryId: 'cat-tools',
    title: '涂胶显影设备',
    description: '涂胶显影设备',
    order: 1,
    image: { assetId: 'image-2', url: './assets/image-2.png' },
  })

  assert.equal(
    resolveGalleryImageScrollDirection(value, 'item-lithography', 'item-coating'),
    'forward',
  )
  assert.equal(
    resolveGalleryImageScrollDirection(value, 'item-coating', 'item-lithography'),
    'backward',
  )
})
