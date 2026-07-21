import assert from 'node:assert/strict'
import test from 'node:test'
import type { GuideAuthoringBundleV1 } from '../../../src/automation/contracts/authoring-bundle-v1.js'
import { mapAuthoringBundleToDraft } from '../../../src/server/services/authoring-mapper.js'
import type { AssetRegistry } from '../../../src/domain/project-types.js'

const NOW = '2026-07-21T08:00:00.000Z'

const assets: AssetRegistry = {
  byId: {
    panorama: {
      id: 'panorama',
      kind: 'image',
      sourcePath: 'assets/images/panorama.png',
      mimeType: 'image/png',
    },
    'scene-bundle': {
      id: 'scene-bundle',
      kind: 'html-bundle',
      sourcePath: 'assets/scenes/scene-bundle',
      entryPath: 'index.html',
    },
    transition: {
      id: 'transition',
      kind: 'video',
      sourcePath: 'assets/videos/transition.mp4',
      mimeType: 'video/mp4',
    },
  },
}

function makeBundle(): GuideAuthoringBundleV1 {
  return {
    contract: 'guide-authoring-bundle',
    contractVersion: '1.0.0',
    idempotencyKey: '141f6498-5f15-4ef9-857c-318b168bc8ea',
    expectedRevision: 0,
    project: {
      id: 'memory-chain',
      version: '2026.07',
      title: { 'zh-CN': '存储芯片产业链', 'en-US': 'Memory Chip Industry Chain' },
      localization: {
        defaultLocale: 'zh-CN',
        supportedLocales: ['zh-CN', 'en-US'],
      },
    },
    knowledge: {
      stages: [
        {
          key: 'upstream',
          label: { 'zh-CN': '上游', 'en-US': 'Upstream' },
          categories: [
            {
              id: 'materials',
              title: { 'zh-CN': '材料', 'en-US': 'Materials' },
              description: { 'zh-CN': '材料说明', 'en-US': 'Materials description' },
              experience: { kind: 'panorama' },
              items: [
                {
                  id: 'silicon-wafer',
                  title: { 'zh-CN': '半导体硅片', 'en-US': 'Semiconductor Wafer' },
                  description: { 'zh-CN': '硅片说明', 'en-US': 'Wafer description' },
                },
                {
                  id: 'photoresist',
                  title: { 'zh-CN': '光刻胶', 'en-US': 'Photoresist' },
                  description: { 'zh-CN': '光刻胶说明', 'en-US': 'Photoresist description' },
                },
              ],
            },
          ],
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
    files: [
      {
        usage: 'runtime',
        assetId: 'panorama',
        kind: 'image',
        blobSha256: '1'.repeat(64),
        size: 1024,
        mimeType: 'image/png',
        extension: 'png',
        semanticRole: 'panorama-image',
        originalName: 'panorama.png',
      },
      {
        usage: 'runtime',
        assetId: 'scene-bundle',
        kind: 'html-bundle',
        blobSha256: '2'.repeat(64),
        size: 2048,
        mimeType: 'application/zip',
        extension: 'zip',
        semanticRole: 'html-scene-bundle',
        originalName: 'scene.zip',
      },
      {
        usage: 'runtime',
        assetId: 'transition',
        kind: 'video',
        blobSha256: '3'.repeat(64),
        size: 4096,
        mimeType: 'video/mp4',
        extension: 'mp4',
        semanticRole: 'transition-video',
        originalName: 'transition.mp4',
      },
    ],
    panorama: { imageAssetId: 'panorama' },
  }
}

test('maps nested three-stage knowledge into ordered categories and item registry', () => {
  const bundle = makeBundle()
  const bundleBeforeMapping = structuredClone(bundle)
  const assetsBeforeMapping = structuredClone(assets)
  const result = mapAuthoringBundleToDraft(bundle, assets, { now: NOW })
  const { project } = result

  assert.equal(project.id, 'memory-chain')
  assert.equal(project.version, '2026.07')
  assert.deepEqual(project.title, {
    'zh-CN': '存储芯片产业链',
    'en-US': 'Memory Chip Industry Chain',
  })
  assert.deepEqual(project.localization.supportedLocales, ['zh-CN', 'en-US'])
  assert.deepEqual(
    project.knowledge.stages.map(stage => [stage.key, stage.order]),
    [
      ['upstream', 1],
      ['midstream', 2],
      ['downstream', 3],
    ],
  )
  assert.deepEqual(project.knowledge.stages[0].categories[0].itemIds, [
    'silicon-wafer',
    'photoresist',
  ])
  assert.deepEqual(project.knowledge.items['photoresist'], {
    id: 'photoresist',
    categoryId: 'materials',
    title: { 'zh-CN': '光刻胶', 'en-US': 'Photoresist' },
    description: { 'zh-CN': '光刻胶说明', 'en-US': 'Photoresist description' },
    order: 1,
  })
  assert.deepEqual(project.products.atlas.categoryIds, ['materials', 'memory-products'])
  assert.equal(project.panorama.assetId, 'panorama')
  assert.equal(project.metadata.createdAt, NOW)
  assert.equal(project.metadata.updatedAt, NOW)
  assert.equal(project.metadata.revision, 1)
  assert.deepEqual(bundle, bundleBeforeMapping)
  assert.deepEqual(assets, assetsBeforeMapping)
  assert.notEqual(project.assets, assets)
  assert.deepEqual(result.draftIssues, [])
})

test('preserves explicit spatial, scene, navigation, product, and integration configuration', () => {
  const bundle = makeBundle()
  bundle.spatial = {
    categories: [
      {
        categoryId: 'materials',
        layout: {
          viewport: { centerX: 0.2, centerY: 0.3, zoom: 2 },
          hotspot: { x: 0.25, y: 0.35 },
        },
      },
      {
        categoryId: 'memory-products',
        layout: {
          viewport: { centerX: 0.6, centerY: 0.4, zoom: 2.5 },
        },
      },
    ],
    items: [
      {
        itemId: 'silicon-wafer',
        layout: {
          marker: { x: 0.2, y: 0.4 },
          focusRect: { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
        },
      },
      {
        itemId: 'photoresist',
        layout: {
          marker: { x: 0.3, y: 0.45 },
          focusRect: { x: 0.2, y: 0.25, width: 0.2, height: 0.2 },
        },
      },
      {
        itemId: 'dram',
        layout: {
          marker: { x: 0.65, y: 0.5 },
          focusRect: { x: 0.5, y: 0.3, width: 0.25, height: 0.3 },
        },
      },
    ],
  }
  bundle.panorama.cameraBounds = { minZoom: 0.8, maxZoom: 6 }
  bundle.panorama.initialViewport = { centerX: 0.4, centerY: 0.45, zoom: 1.2 }
  bundle.scenes = [
    {
      id: 'detail-scene',
      title: { 'zh-CN': '详情场景', 'en-US': 'Detail Scene' },
      assetId: 'scene-bundle',
      protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
      views: [
        {
          id: 'overview',
          title: { 'zh-CN': '概览', 'en-US': 'Overview' },
          activationMessage: { type: 'scene:activate' },
          categoryIds: ['materials'],
        },
      ],
    },
  ]
  bundle.navigation = {
    routes: [
      {
        id: 'materials-to-scene',
        from: { kind: 'panorama', categoryId: 'materials' },
        to: { kind: 'scene', sceneId: 'detail-scene', viewId: 'overview' },
        transition: {
          kind: 'video',
          assetId: 'transition',
          onFailure: 'cut',
        },
      },
    ],
  }
  bundle.products = {
    atlas: {
      enabled: true,
      viewport: { width: 430, height: 932 },
      theme: { hotspotVariant: 'highlight', calloutVariant: 'connector' },
      chrome: { showToolbar: false },
      interaction: {
        wheelZoom: false,
        dragPan: true,
        pinchZoom: true,
        resetCameraEnabled: false,
      },
      categoryIds: ['memory-products'],
      hintText: { 'zh-CN': '探索', 'en-US': 'Explore' },
    },
    catalog: {
      enabled: true,
      viewport: { width: 430, height: 932 },
      theme: { listDensity: 'compact', focusVariant: 'pill' },
      chrome: { showHints: false },
      interaction: {
        listActivation: 'center-nearest',
        markerActivation: false,
        viewportAnimationMs: 500,
      },
      stageOrder: ['upstream', 'midstream', 'downstream'],
      hintText: { 'zh-CN': '浏览', 'en-US': 'Browse' },
    },
  }
  bundle.integrations = {
    share: {
      enabled: true,
      title: { 'zh-CN': '分享标题', 'en-US': 'Share title' },
      description: { 'zh-CN': '分享说明', 'en-US': 'Share description' },
    },
    analytics: {
      enabled: true,
      provider: 'weblog',
      appKey: 'memory-chain',
      pageType: 'industry-chain',
      name: 'memory-chain',
      defaultSource: 'offline-skill',
    },
  }

  const result = mapAuthoringBundleToDraft(bundle, assets, { now: NOW })

  assert.deepEqual(result.project.panorama.cameraBounds, { minZoom: 0.8, maxZoom: 6 })
  assert.deepEqual(result.project.panorama.initialViewport, {
    centerX: 0.4,
    centerY: 0.45,
    zoom: 1.2,
  })
  assert.deepEqual(result.project.panorama.categories, {
    materials: bundle.spatial.categories?.[0].layout,
    'memory-products': bundle.spatial.categories?.[1].layout,
  })
  assert.deepEqual(result.project.scenes, bundle.scenes)
  assert.deepEqual(result.project.navigation, bundle.navigation)
  assert.deepEqual(result.project.products, bundle.products)
  assert.deepEqual(result.project.integrations, bundle.integrations)
  assert.deepEqual(result.calibrationQueue, [])
  assert.deepEqual(result.draftIssues, [])
})

test('reports missing category layouts and item marker/focus rectangles without inventing them', () => {
  const bundle = makeBundle()
  bundle.spatial = {
    categories: [
      {
        categoryId: 'materials',
        layout: { viewport: { centerX: 0.5, centerY: 0.5, zoom: 2 } },
      },
    ],
    items: [
      {
        itemId: 'silicon-wafer',
        layout: { marker: { x: 0.4, y: 0.5 } },
      },
    ],
  }

  const result = mapAuthoringBundleToDraft(bundle, assets, { now: NOW })

  assert.deepEqual(Object.keys(result.project.panorama.categories), ['materials'])
  assert.deepEqual(Object.keys(result.project.panorama.items), ['silicon-wafer'])
  assert.deepEqual(
    result.calibrationQueue.map(item => [item.code, item.targetId]),
    [
      ['ITEM_FOCUS_RECT_MISSING', 'silicon-wafer'],
      ['ITEM_MARKER_MISSING', 'photoresist'],
      ['ITEM_FOCUS_RECT_MISSING', 'photoresist'],
      ['CATEGORY_LAYOUT_MISSING', 'memory-products'],
      ['ITEM_MARKER_MISSING', 'dram'],
      ['ITEM_FOCUS_RECT_MISSING', 'dram'],
    ],
  )
  assert.deepEqual(result.draftIssues, [])
})

test('returns draft validation issues for caller-provided asset registry mismatches', () => {
  const result = mapAuthoringBundleToDraft(makeBundle(), { byId: {} }, { now: NOW })

  assert.deepEqual(
    result.draftIssues.map(issue => [issue.code, issue.path]),
    [['ASSET_MISSING', 'panorama.assetId']],
  )
})
