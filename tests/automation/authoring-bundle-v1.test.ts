import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GUIDE_AUTHORING_BUNDLE_CONTRACT,
  GUIDE_AUTHORING_BUNDLE_VERSION,
  GuideAuthoringBundleV1Schema,
  type GuideAuthoringBundleV1,
} from '../../src/automation/contracts/authoring-bundle-v1.js'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const SHA_C = 'c'.repeat(64)
const SHA_D = 'd'.repeat(64)
const SHA_E = 'e'.repeat(64)

function fixture(): GuideAuthoringBundleV1 {
  return {
    contract: GUIDE_AUTHORING_BUNDLE_CONTRACT,
    contractVersion: GUIDE_AUTHORING_BUNDLE_VERSION,
    idempotencyKey: '9e239a32-9494-4e70-a44b-d94d0ba72fb6',
    expectedRevision: 0,
    project: {
      id: 'memory-chip-industry-chain',
      version: '2026.07.21+authoring',
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
              experience: { kind: 'panorama' },
              items: [
                {
                  id: 'silicon-wafer',
                  title: { 'zh-CN': '半导体硅片', 'en-US': 'Semiconductor Wafer' },
                  description: { 'zh-CN': '晶圆材料', 'en-US': 'Wafer material' },
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
              id: 'storage-products',
              title: { 'zh-CN': '存储芯片产品', 'en-US': 'Memory Products' },
              experience: { kind: 'html-scene', sceneId: 'memory-scene', viewId: 'dram-view' },
              items: [
                {
                  id: 'dram',
                  title: { 'zh-CN': 'DRAM', 'en-US': 'DRAM' },
                  description: { 'zh-CN': '动态随机存取存储器', 'en-US': 'Dynamic RAM' },
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
        blobSha256: SHA_A,
        size: 1024,
        mimeType: 'image/png',
        extension: 'png',
        semanticRole: 'panorama-image',
        originalName: 'panorama.png',
      },
      {
        usage: 'runtime',
        assetId: 'memory-scene-bundle',
        kind: 'html-bundle',
        blobSha256: SHA_B,
        size: 2048,
        mimeType: 'application/zip',
        extension: 'zip',
        semanticRole: 'html-scene-bundle',
        originalName: 'memory-scene.zip',
      },
      {
        usage: 'runtime',
        assetId: 'route-video',
        kind: 'video',
        blobSha256: SHA_C,
        size: 4096,
        mimeType: 'video/mp4',
        extension: 'mp4',
        semanticRole: 'transition-video',
        originalName: 'route.mp4',
      },
      {
        usage: 'runtime',
        assetId: 'share-image',
        kind: 'image',
        blobSha256: SHA_D,
        size: 512,
        mimeType: 'image/png',
        extension: 'png',
        semanticRole: 'share-image',
        originalName: 'share.png',
      },
      {
        usage: 'authoring-source',
        fileRef: 'knowledge-doc',
        blobSha256: SHA_E,
        size: 128,
        mediaType: 'text/markdown',
        semanticRole: 'knowledge-source',
        originalName: 'knowledge.md',
      },
    ],
    panorama: {
      imageAssetId: 'panorama',
      cameraBounds: { minZoom: 1, maxZoom: 8 },
      initialViewport: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    },
    spatial: {
      categories: [
        {
          categoryId: 'materials',
          layout: {
            viewport: { centerX: 0.2, centerY: 0.3, zoom: 2 },
            hotspot: { x: 0.2, y: 0.3 },
          },
        },
      ],
      items: [
        {
          itemId: 'silicon-wafer',
          layout: {
            marker: { x: 0.25, y: 0.35 },
            focusRect: { x: 0.2, y: 0.3, width: 0.1, height: 0.1 },
          },
        },
      ],
    },
    scenes: [
      {
        id: 'memory-scene',
        title: { 'zh-CN': '存储场景', 'en-US': 'Memory Scene' },
        assetId: 'memory-scene-bundle',
        protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
        views: [
          {
            id: 'dram-view',
            title: { 'zh-CN': 'DRAM 视图', 'en-US': 'DRAM View' },
            activationMessage: { type: 'focus' },
            categoryIds: ['storage-products'],
            itemFocusMap: { dram: { type: 'focus-item' } },
          },
        ],
      },
    ],
    navigation: {
      routes: [
        {
          id: 'to-dram-scene',
          from: { kind: 'panorama', categoryId: 'storage-products', itemId: 'dram' },
          to: { kind: 'scene', sceneId: 'memory-scene', viewId: 'dram-view' },
          transition: {
            kind: 'video',
            assetId: 'route-video',
            onFailure: 'cut',
          },
        },
      ],
    },
    products: {
      atlas: {
        enabled: true,
        viewport: { width: 1920, height: 1080 },
        theme: { hotspotVariant: 'default', calloutVariant: 'classic' },
        chrome: {},
        interaction: {
          wheelZoom: true,
          dragPan: true,
          pinchZoom: true,
          resetCameraEnabled: true,
        },
        categoryIds: ['materials', 'storage-products'],
        hintText: { 'zh-CN': '探索产业链', 'en-US': 'Explore the industry chain' },
      },
      catalog: {
        enabled: true,
        viewport: { width: 1920, height: 1080 },
        theme: { listDensity: 'comfortable', focusVariant: 'rect' },
        chrome: {},
        interaction: {
          listActivation: 'center-nearest',
          markerActivation: true,
          viewportAnimationMs: 300,
        },
        stageOrder: ['upstream', 'midstream', 'downstream'],
        hintText: { 'zh-CN': '选择条目', 'en-US': 'Select an item' },
      },
    },
    integrations: {
      analytics: {
        enabled: true,
        provider: 'weblog',
        appKey: 'app-key',
        pageType: 'visindustry',
        name: 'memory-chip-industry-chain',
        defaultSource: 'industry',
      },
      share: {
        enabled: true,
        title: { 'zh-CN': '存储芯片产业链', 'en-US': 'Memory Chip Industry Chain' },
        description: { 'zh-CN': '产业链导览', 'en-US': 'Industry chain guide' },
        imageAssetId: 'share-image',
      },
    },
  }
}

test('GuideAuthoringBundleV1 accepts a complete content-addressed bilingual bundle', () => {
  const result = GuideAuthoringBundleV1Schema.safeParse(fixture())
  assert.equal(result.success, true, JSON.stringify(result.error?.issues ?? []))
})

test('GuideAuthoringBundleV1 is creation-only and strict', () => {
  const wrongRevision = { ...fixture(), expectedRevision: 1 }
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(wrongRevision).success, false)

  const extraRoot = { ...fixture(), localPath: 'C:\\secret\\bundle.json' }
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(extraRoot).success, false)

  const extraKnowledge = fixture() as GuideAuthoringBundleV1 & {
    knowledge: GuideAuthoringBundleV1['knowledge'] & { inferredFacts?: string[] }
  }
  extraKnowledge.knowledge.inferredFacts = []
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(extraKnowledge).success, false)
})

test('GuideAuthoringBundleV1 requires the exact upstream-midstream-downstream tuple', () => {
  const wrongOrder = fixture()
  const upstream = wrongOrder.knowledge.stages[0]
  const midstream = wrongOrder.knowledge.stages[1]
  wrongOrder.knowledge.stages = [midstream, upstream, wrongOrder.knowledge.stages[2]] as never
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(wrongOrder).success, false)

  const onlyTwo = fixture()
  onlyTwo.knowledge.stages = onlyTwo.knowledge.stages.slice(0, 2) as never
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(onlyTwo).success, false)
})

test('GuideAuthoringBundleV1 rejects invalid file variants and filesystem paths', () => {
  const badHash = fixture()
  badHash.files[0].blobSha256 = 'ABC'
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(badHash).success, false)

  const zeroSize = fixture()
  zeroSize.files[0].size = 0
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(zeroSize).success, false)

  const roleKindMismatch = fixture()
  const panorama = roleKindMismatch.files[0]
  if (panorama.usage === 'runtime') panorama.kind = 'video'
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(roleKindMismatch).success, false)

  const pathName = fixture()
  pathName.files[0].originalName = '../panorama.png'
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(pathName).success, false)

  const mixedVariant = fixture()
  ;(mixedVariant.files[0] as unknown as Record<string, unknown>).fileRef = 'not-allowed'
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(mixedVariant).success, false)
})

test('GuideAuthoringBundleV1 validates semantic IDs and asset references', () => {
  const missingPanorama = fixture()
  missingPanorama.panorama.imageAssetId = 'missing-image'
  const panoramaResult = GuideAuthoringBundleV1Schema.safeParse(missingPanorama)
  assert.equal(panoramaResult.success, false)
  assert.ok(
    panoramaResult.error?.issues.some(issue => issue.path.join('.') === 'panorama.imageAssetId'),
  )

  const unknownSpatialItem = fixture()
  unknownSpatialItem.spatial!.items![0].itemId = 'unknown-item'
  const spatialResult = GuideAuthoringBundleV1Schema.safeParse(unknownSpatialItem)
  assert.equal(spatialResult.success, false)
  assert.ok(spatialResult.error?.issues.some(issue => issue.message.includes('unknown item id')))

  const duplicateItem = fixture()
  duplicateItem.knowledge.stages[1].categories[0].items[0].id = 'silicon-wafer'
  const duplicateResult = GuideAuthoringBundleV1Schema.safeParse(duplicateItem)
  assert.equal(duplicateResult.success, false)
  assert.ok(
    duplicateResult.error?.issues.some(issue => issue.message.includes('duplicate item id')),
  )

  const missingScene = fixture()
  missingScene.knowledge.stages[1].categories[0].experience = {
    kind: 'html-scene',
    sceneId: 'missing-scene',
    viewId: 'dram-view',
  }
  const sceneResult = GuideAuthoringBundleV1Schema.safeParse(missingScene)
  assert.equal(sceneResult.success, false)
  assert.ok(sceneResult.error?.issues.some(issue => issue.message.includes('unknown scene id')))

  const laterCategoryCollision = fixture()
  laterCategoryCollision.knowledge.stages[1].categories[0].id = 'silicon-wafer'
  const categoryCollisionResult = GuideAuthoringBundleV1Schema.safeParse(laterCategoryCollision)
  assert.equal(categoryCollisionResult.success, false)
  assert.ok(
    categoryCollisionResult.error?.issues.some(issue =>
      issue.message.includes('conflicts with an item id'),
    ),
  )

  const sceneCollision = fixture()
  sceneCollision.scenes![0].id = 'dram'
  const sceneCollisionResult = GuideAuthoringBundleV1Schema.safeParse(sceneCollision)
  assert.equal(sceneCollisionResult.success, false)
  assert.ok(sceneCollisionResult.error?.issues.some(issue => issue.message.includes('scene id')))

  const routeCollision = fixture()
  routeCollision.navigation!.routes[0].id = 'materials'
  const routeCollisionResult = GuideAuthoringBundleV1Schema.safeParse(routeCollision)
  assert.equal(routeCollisionResult.success, false)
  assert.ok(routeCollisionResult.error?.issues.some(issue => issue.message.includes('route id')))
})

test('GuideAuthoringBundleV1 requires every declared locale and rejects undeclared locales', () => {
  const missingTranslation = fixture()
  delete missingTranslation.knowledge.stages[0].categories[0].items[0].title['en-US']
  const missingResult = GuideAuthoringBundleV1Schema.safeParse(missingTranslation)
  assert.equal(missingResult.success, false)
  assert.ok(
    missingResult.error?.issues.some(issue => issue.message.includes('translation for "en-US"')),
  )

  const undeclared = fixture()
  undeclared.project.title.fr = 'Chaîne de mémoire'
  const undeclaredResult = GuideAuthoringBundleV1Schema.safeParse(undeclared)
  assert.equal(undeclaredResult.success, false)
  assert.ok(undeclaredResult.error?.issues.some(issue => issue.message.includes('not declared')))
})

test('GuideAuthoringBundleV1 validates navigation, product and integration references', () => {
  const routeMismatch = fixture()
  const from = routeMismatch.navigation!.routes[0].from
  if (from.kind === 'panorama') from.categoryId = 'materials'
  const routeResult = GuideAuthoringBundleV1Schema.safeParse(routeMismatch)
  assert.equal(routeResult.success, false)
  assert.ok(routeResult.error?.issues.some(issue => issue.message.includes('does not belong')))

  const catalogOrder = fixture()
  catalogOrder.products!.catalog.stageOrder = ['downstream', 'midstream', 'upstream']
  assert.equal(GuideAuthoringBundleV1Schema.safeParse(catalogOrder).success, false)

  const shareAsset = fixture()
  shareAsset.integrations!.share!.imageAssetId = 'route-video'
  const shareResult = GuideAuthoringBundleV1Schema.safeParse(shareAsset)
  assert.equal(shareResult.success, false)
  assert.ok(
    shareResult.error?.issues.some(issue => issue.message.includes('must have kind "image"')),
  )
})
