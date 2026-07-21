import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GuideAuthoringChangeSetV1Schema,
  type GuideAuthoringChangeSetV1,
} from '../../../src/automation/contracts/authoring-changeset-v1.js'
import { createDraftProject } from '../../../src/domain/project-normalizer.js'
import { GuideProjectSchema } from '../../../src/domain/project-schema.js'
import type { AssetRegistry, GuideProject } from '../../../src/domain/project-types.js'
import { mergeAuthoringChangeSet } from '../../../src/server/services/authoring-changeset-mapper.js'

const CREATED_AT = '2026-07-20T01:00:00.000Z'
const UPDATED_AT = '2026-07-21T02:00:00.000Z'

function makeProject(): GuideProject {
  const project = createDraftProject({ id: 'memory-chain', title: '存储芯片产业链' })
  project.title = { 'zh-CN': '存储芯片产业链', 'en-US': 'Memory Chip Industry Chain' }
  project.version = '2026.07'
  project.localization = {
    defaultLocale: 'zh-CN',
    supportedLocales: ['zh-CN', 'en-US'],
  }
  project.assets = {
    byId: {
      panorama: {
        id: 'panorama',
        kind: 'image',
        sourcePath: 'images/panorama/image.png',
        mimeType: 'image/png',
      },
      'scene-bundle': {
        id: 'scene-bundle',
        kind: 'html-bundle',
        sourcePath: 'scenes/scene-bundle',
        entryPath: 'index.html',
      },
      transition: {
        id: 'transition',
        kind: 'video',
        sourcePath: 'videos/transition/video.mp4',
        mimeType: 'video/mp4',
      },
    },
  }
  project.panorama.assetId = 'panorama'
  project.knowledge.stages[0].categories = [
    {
      id: 'materials',
      title: { 'zh-CN': '材料', 'en-US': 'Materials' },
      order: 0,
      itemIds: ['wafer'],
      experience: { kind: 'html-scene', sceneId: 'materials-scene', viewId: 'overview' },
    },
  ]
  project.knowledge.items = {
    wafer: {
      id: 'wafer',
      categoryId: 'materials',
      title: { 'zh-CN': '半导体硅片', 'en-US': 'Semiconductor Wafer' },
      description: { 'zh-CN': '硅片说明', 'en-US': 'Wafer description' },
      order: 0,
    },
  }
  project.panorama.categories = {
    materials: {
      viewport: { centerX: 0.25, centerY: 0.4, zoom: 2 },
      hotspot: { x: 0.2, y: 0.35 },
    },
  }
  project.panorama.items = {
    wafer: {
      marker: { x: 0.22, y: 0.38 },
      focusRect: { x: 0.1, y: 0.2, width: 0.25, height: 0.3 },
    },
  }
  project.scenes = [
    {
      id: 'materials-scene',
      title: { 'zh-CN': '材料场景', 'en-US': 'Materials Scene' },
      assetId: 'scene-bundle',
      protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
      views: [
        {
          id: 'overview',
          title: { 'zh-CN': '概览', 'en-US': 'Overview' },
          activationMessage: { type: 'scene:activate' },
          categoryIds: ['materials'],
          itemFocusMap: { wafer: { type: 'scene:focus' } },
        },
      ],
    },
  ]
  project.navigation.routes = [
    {
      id: 'wafer-to-scene',
      from: { kind: 'panorama', categoryId: 'materials', itemId: 'wafer' },
      to: { kind: 'scene', sceneId: 'materials-scene', viewId: 'overview' },
      transition: { kind: 'video', assetId: 'transition', onFailure: 'cut' },
    },
  ]
  project.products.atlas.categoryIds = ['materials']
  project.metadata = {
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    revision: 7,
    schemaVersion: '3.0.0',
  }
  return GuideProjectSchema.parse(project)
}

function makeChangeSet(
  partitions: GuideAuthoringChangeSetV1['partitions'],
  overrides: Partial<GuideAuthoringChangeSetV1> = {},
): GuideAuthoringChangeSetV1 {
  return GuideAuthoringChangeSetV1Schema.parse({
    contract: 'guide-authoring-changeset',
    contractVersion: '1.0.0',
    projectId: 'memory-chain',
    expectedRevision: 7,
    idempotencyKey: 'efcb333a-6484-4860-b536-a62fd9bafdd5',
    partitions,
    ...overrides,
  })
}

test('merges profile and panorama patches without changing metadata or unrelated spatial state', () => {
  const current = makeProject()
  const changeSet = makeChangeSet({
    profile: {
      title: { 'zh-CN': '新标题', 'en-US': 'New Title' },
      version: '2026.08',
    },
    panorama: {
      patch: {
        cameraBounds: { minZoom: 0.8, maxZoom: 6 },
        initialViewport: { centerX: 0.4, centerY: 0.45, zoom: 1.2 },
      },
    },
  })
  const currentBefore = structuredClone(current)
  const changeSetBefore = structuredClone(changeSet)
  const assetsBefore = structuredClone(current.assets)

  const result = mergeAuthoringChangeSet(current, changeSet, current.assets)

  assert.equal(
    result.ok,
    true,
    JSON.stringify({ conflicts: result.conflicts, issues: result.issues }),
  )
  assert.deepEqual(result.project.title, { 'zh-CN': '新标题', 'en-US': 'New Title' })
  assert.equal(result.project.version, '2026.08')
  assert.deepEqual(result.project.panorama.cameraBounds, { minZoom: 0.8, maxZoom: 6 })
  assert.deepEqual(result.project.panorama.initialViewport, {
    centerX: 0.4,
    centerY: 0.45,
    zoom: 1.2,
  })
  assert.equal(result.project.panorama.assetId, 'panorama')
  assert.deepEqual(result.project.panorama.categories, current.panorama.categories)
  assert.deepEqual(result.project.panorama.items, current.panorama.items)
  assert.deepEqual(result.project.metadata, current.metadata)
  assert.deepEqual(current, currentBefore)
  assert.deepEqual(changeSet, changeSetBefore)
  assert.deepEqual(current.assets, assetsBefore)
  assert.notEqual(result.project, current)
  assert.notEqual(result.project.assets, current.assets)
})

test('missing route-target calibration is queued without blocking or cascading', () => {
  const current = makeProject()
  const changeSet = makeChangeSet({
    spatial: {
      categories: { remove: ['materials'] },
      items: { remove: ['wafer'] },
    },
  })

  const result = mergeAuthoringChangeSet(current, changeSet, current.assets)

  assert.equal(
    result.ok,
    true,
    JSON.stringify({ conflicts: result.conflicts, issues: result.issues }),
  )
  assert.equal(result.project.knowledge.items.wafer.id, 'wafer')
  assert.equal(result.project.scenes[0].views[0].itemFocusMap?.wafer.type, 'scene:focus')
  assert.equal(result.project.navigation.routes[0].from.kind, 'panorama')
  assert.equal(result.project.panorama.categories.materials, undefined)
  assert.equal(result.project.panorama.items.wafer, undefined)
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.issues, [])
  assert.deepEqual(
    result.calibrationQueue.map(item => [item.code, item.targetId]),
    [
      ['CATEGORY_LAYOUT_MISSING', 'materials'],
      ['ITEM_MARKER_MISSING', 'wafer'],
      ['ITEM_FOCUS_RECT_MISSING', 'wafer'],
    ],
  )
})

test('optional hotspot and focus-rect gaps never become blocking diagnostics', () => {
  const current = makeProject()
  delete current.panorama.categories.materials.hotspot
  delete current.panorama.items.wafer.focusRect
  const changeSet = makeChangeSet({ profile: { version: '2026.07.1' } })

  const result = mergeAuthoringChangeSet(current, changeSet, current.assets)

  assert.equal(
    result.ok,
    true,
    JSON.stringify({ conflicts: result.conflicts, issues: result.issues }),
  )
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.issues, [])
  assert.equal(result.project.panorama.categories.materials.hotspot, undefined)
  assert.deepEqual(
    result.calibrationQueue.map(item => [item.code, item.targetId]),
    [['ITEM_FOCUS_RECT_MISSING', 'wafer']],
  )
})

test('knowledge replacement reports every untouched dependent reference instead of deleting it', () => {
  const current = makeProject()
  const changeSet = makeChangeSet({
    knowledge: {
      replace: {
        stages: [
          {
            key: 'upstream',
            label: { 'zh-CN': '上游', 'en-US': 'Upstream' },
            categories: [],
          },
          {
            key: 'midstream',
            label: { 'zh-CN': '中游', 'en-US': 'Midstream' },
            categories: [
              {
                id: 'memory-products',
                title: { 'zh-CN': '存储芯片产品', 'en-US': 'Memory Products' },
                experience: { kind: 'panorama' },
                items: [
                  {
                    id: 'dram',
                    title: { 'zh-CN': 'DRAM', 'en-US': 'DRAM' },
                    description: { 'zh-CN': 'DRAM 说明', 'en-US': 'DRAM description' },
                  },
                ],
              },
            ],
          },
          {
            key: 'downstream',
            label: { 'zh-CN': '下游', 'en-US': 'Downstream' },
            categories: [],
          },
        ],
      },
    },
  })

  const result = mergeAuthoringChangeSet(current, changeSet, current.assets)

  assert.equal(result.ok, false)
  assert.equal(result.project.knowledge.items.dram.categoryId, 'memory-products')
  assert.equal(result.project.panorama.categories.materials.viewport.zoom, 2)
  assert.equal(result.project.panorama.items.wafer.marker.x, 0.22)
  assert.equal(result.project.scenes[0].id, 'materials-scene')
  assert.equal(result.project.navigation.routes[0].id, 'wafer-to-scene')
  assert.deepEqual(result.project.products.atlas.categoryIds, ['materials'])
  assert.deepEqual(
    new Set(result.conflicts.map(conflict => conflict.path)),
    new Set([
      'panorama.categories.materials',
      'panorama.items.wafer',
      'scenes.0.views.0.categoryIds.0',
      'scenes.0.views.0.itemFocusMap.wafer',
      'navigation.routes.0.from.categoryId',
      'navigation.routes.0.from.itemId',
      'products.atlas.categoryIds.0',
    ]),
  )
  assert.deepEqual(
    result.calibrationQueue.map(item => [item.code, item.targetId]),
    [
      ['CATEGORY_LAYOUT_MISSING', 'memory-products'],
      ['ITEM_MARKER_MISSING', 'dram'],
      ['ITEM_FOCUS_RECT_MISSING', 'dram'],
    ],
  )
})

test('coordinated aggregate replacements and spatial patch produce a valid deterministic project', () => {
  const current = makeProject()
  const products = structuredClone(current.products)
  products.atlas.categoryIds = ['memory-products']
  const changeSet = makeChangeSet({
    knowledge: {
      replace: {
        stages: [
          {
            key: 'upstream',
            label: { 'zh-CN': '上游', 'en-US': 'Upstream' },
            categories: [],
          },
          {
            key: 'midstream',
            label: { 'zh-CN': '中游', 'en-US': 'Midstream' },
            categories: [
              {
                id: 'memory-products',
                title: { 'zh-CN': '存储芯片产品', 'en-US': 'Memory Products' },
                experience: { kind: 'panorama' },
                items: [
                  {
                    id: 'dram',
                    title: { 'zh-CN': 'DRAM', 'en-US': 'DRAM' },
                    description: { 'zh-CN': 'DRAM 说明', 'en-US': 'DRAM description' },
                  },
                ],
              },
            ],
          },
          {
            key: 'downstream',
            label: { 'zh-CN': '下游', 'en-US': 'Downstream' },
            categories: [],
          },
        ],
      },
    },
    spatial: {
      categories: {
        remove: ['materials'],
        upsert: [
          {
            categoryId: 'memory-products',
            layout: {
              viewport: { centerX: 0.6, centerY: 0.5, zoom: 2.4 },
              hotspot: { x: 0.62, y: 0.48 },
            },
          },
        ],
      },
      items: {
        remove: ['wafer'],
        upsert: [
          {
            itemId: 'dram',
            layout: {
              marker: { x: 0.65, y: 0.52 },
              focusRect: { x: 0.5, y: 0.3, width: 0.25, height: 0.3 },
            },
          },
        ],
      },
    },
    scenes: { replace: [] },
    navigation: { replace: { routes: [] } },
    products: { replace: products },
  })

  const result = mergeAuthoringChangeSet(current, changeSet, current.assets)

  assert.equal(
    result.ok,
    true,
    JSON.stringify({ conflicts: result.conflicts, issues: result.issues }),
  )
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.calibrationQueue, [])
  assert.deepEqual(Object.keys(result.project.panorama.categories), ['memory-products'])
  assert.deepEqual(Object.keys(result.project.panorama.items), ['dram'])
  assert.equal(result.project.knowledge.stages[1].categories[0].order, 0)
  assert.equal(result.project.knowledge.items.dram.order, 0)
  assert.deepEqual(result.project.metadata, current.metadata)
})

test('uses the caller-provided post-append asset registry to resolve new references', () => {
  const current = makeProject()
  const changeSet = makeChangeSet({
    assets: {
      append: [
        {
          usage: 'runtime',
          assetId: 'panorama-v2',
          kind: 'image',
          blobSha256: 'a'.repeat(64),
          size: 2048,
          mimeType: 'image/png',
          extension: 'png',
          semanticRole: 'panorama-image',
          originalName: 'panorama-v2.png',
        },
      ],
    },
    panorama: { patch: { imageAssetId: 'panorama-v2' } },
  })
  const assets: AssetRegistry = structuredClone(current.assets)
  assets.byId['panorama-v2'] = {
    id: 'panorama-v2',
    kind: 'image',
    sourcePath: 'images/panorama-v2/image.png',
    mimeType: 'image/png',
    sha256: 'a'.repeat(64),
    size: 2048,
  }
  const assetsBefore = structuredClone(assets)

  const result = mergeAuthoringChangeSet(current, changeSet, assets)

  assert.equal(
    result.ok,
    true,
    JSON.stringify({ conflicts: result.conflicts, issues: result.issues }),
  )
  assert.equal(result.project.panorama.assetId, 'panorama-v2')
  assert.deepEqual(result.project.assets, assets)
  assert.notEqual(result.project.assets, assets)
  assert.deepEqual(assets, assetsBefore)

  const missing = mergeAuthoringChangeSet(current, changeSet, current.assets)
  assert.equal(missing.ok, false)
  assert.ok(
    missing.conflicts.some(
      conflict => conflict.code === 'DANGLING_REFERENCE' && conflict.path === 'panorama.assetId',
    ),
  )
})

test('project id mismatch fails closed without applying any partition', () => {
  const current = makeProject()
  const changeSet = makeChangeSet(
    { profile: { version: '2026.08' } },
    { projectId: 'different-project' },
  )

  const result = mergeAuthoringChangeSet(current, changeSet, current.assets)

  assert.equal(result.ok, false)
  assert.equal(result.project.version, current.version)
  assert.deepEqual(result.project.metadata, current.metadata)
  assert.deepEqual(
    result.conflicts.map(conflict => conflict.code),
    ['PROJECT_ID_MISMATCH'],
  )
})
