import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GUIDE_AUTHORING_CHANGESET_CONTRACT,
  GUIDE_AUTHORING_CHANGESET_VERSION,
  GuideAuthoringChangeSetV1Schema,
  type GuideAuthoringChangeSetV1,
} from '../../src/automation/contracts/authoring-changeset-v1.js'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const SHA_C = 'c'.repeat(64)
const SHA_D = 'd'.repeat(64)
const SHA_E = 'e'.repeat(64)

function fixture(): GuideAuthoringChangeSetV1 {
  return {
    contract: GUIDE_AUTHORING_CHANGESET_CONTRACT,
    contractVersion: GUIDE_AUTHORING_CHANGESET_VERSION,
    projectId: 'memory-chip-industry-chain',
    expectedRevision: 7,
    idempotencyKey: '9e239a32-9494-4e70-a44b-d94d0ba72fb6',
    partitions: {
      profile: {
        title: { 'zh-CN': '存储芯片产业链', 'en-US': 'Memory Chip Industry Chain' },
        version: '2026.07.21+changeset',
      },
      localization: {
        replace: {
          defaultLocale: 'zh-CN',
          supportedLocales: ['zh-CN', 'en-US'],
        },
      },
      knowledge: {
        replace: {
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
                  experience: {
                    kind: 'html-scene',
                    sceneId: 'memory-scene',
                    viewId: 'dram-view',
                  },
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
      },
      assets: {
        append: [
          {
            usage: 'runtime',
            assetId: 'new-panorama',
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
            fileRef: 'revised-callout-map',
            blobSha256: SHA_E,
            size: 128,
            mediaType: 'image/png',
            semanticRole: 'callout-map',
            originalName: 'callouts.png',
          },
        ],
      },
      panorama: {
        patch: { imageAssetId: 'new-panorama' },
      },
      spatial: {
        categories: {
          upsert: [
            {
              categoryId: 'materials',
              layout: {
                viewport: { centerX: 0.2, centerY: 0.3, zoom: 2 },
                hotspot: { x: 0.2, y: 0.3 },
              },
            },
          ],
          remove: ['legacy-category'],
        },
        items: {
          upsert: [
            {
              itemId: 'silicon-wafer',
              layout: {
                marker: { x: 0.25, y: 0.35 },
                focusRect: { x: 0.2, y: 0.3, width: 0.1, height: 0.1 },
              },
            },
          ],
        },
      },
      scenes: {
        replace: [
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
      },
      navigation: {
        replace: {
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
      },
      products: {
        replace: {
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
      },
      integrations: {
        replace: {
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
      },
    },
  }
}

test('GuideAuthoringChangeSetV1 accepts a complete declarative targeted update', () => {
  const result = GuideAuthoringChangeSetV1Schema.safeParse(fixture())
  assert.equal(result.success, true, JSON.stringify(result.error?.issues ?? []))
})

test('GuideAuthoringChangeSetV1 requires an existing revision, UUID and non-empty partitions', () => {
  const wrongContract = fixture() as GuideAuthoringChangeSetV1 & { contract: string }
  wrongContract.contract = 'guide-authoring-bundle'
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(wrongContract).success, false)

  const wrongVersion = fixture() as GuideAuthoringChangeSetV1 & { contractVersion: string }
  wrongVersion.contractVersion = '2.0.0'
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(wrongVersion).success, false)

  const staleEnvelope = fixture()
  staleEnvelope.expectedRevision = 0
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(staleEnvelope).success, false)

  const badKey = fixture()
  badKey.idempotencyKey = 'retry-me'
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(badKey).success, false)

  const empty = fixture()
  empty.partitions = {} as GuideAuthoringChangeSetV1['partitions']
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(empty).success, false)

  const emptyProfile = fixture()
  emptyProfile.partitions = { profile: {} } as GuideAuthoringChangeSetV1['partitions']
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(emptyProfile).success, false)

  const extraRoot = { ...fixture(), operations: [] }
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(extraRoot).success, false)
})

test('GuideAuthoringChangeSetV1 exposes explicit replace, append and patch semantics only', () => {
  const jsonPatch = fixture() as GuideAuthoringChangeSetV1 & {
    partitions: GuideAuthoringChangeSetV1['partitions'] & { operations?: unknown[] }
  }
  jsonPatch.partitions.operations = [{ op: 'remove', path: '/assets/panorama' }]
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(jsonPatch).success, false)

  const assetRemoval = fixture() as GuideAuthoringChangeSetV1 & {
    partitions: GuideAuthoringChangeSetV1['partitions'] & {
      assets: GuideAuthoringChangeSetV1['partitions']['assets'] & { remove?: string[] }
    }
  }
  assetRemoval.partitions.assets!.remove = ['new-panorama']
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(assetRemoval).success, false)

  const knowledgeMerge = fixture()
  ;(knowledgeMerge.partitions.knowledge as unknown as Record<string, unknown>).merge = {
    categories: [],
  }
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(knowledgeMerge).success, false)

  const panoramaReplace = fixture()
  ;(panoramaReplace.partitions.panorama as unknown as Record<string, unknown>).replace = {
    imageAssetId: 'new-panorama',
  }
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(panoramaReplace).success, false)

  const emptyPanoramaPatch = fixture()
  emptyPanoramaPatch.partitions.panorama = { patch: {} } as never
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(emptyPanoramaPatch).success, false)
})

test('GuideAuthoringChangeSetV1 enforces conflict-free targeted spatial patches', () => {
  const emptySpatial = fixture()
  emptySpatial.partitions.spatial = {} as never
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(emptySpatial).success, false)

  const emptyCollection = fixture()
  emptyCollection.partitions.spatial = { categories: {} } as never
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(emptyCollection).success, false)

  const duplicateUpsert = fixture()
  const categoryEntry = duplicateUpsert.partitions.spatial!.categories!.upsert![0]
  duplicateUpsert.partitions.spatial!.categories!.upsert!.push(categoryEntry)
  const duplicateResult = GuideAuthoringChangeSetV1Schema.safeParse(duplicateUpsert)
  assert.equal(duplicateResult.success, false)
  assert.ok(
    duplicateResult.error?.issues.some(issue => issue.message.includes('duplicate categoryId')),
  )

  const overlap = fixture()
  overlap.partitions.spatial!.categories!.remove = ['materials']
  const overlapResult = GuideAuthoringChangeSetV1Schema.safeParse(overlap)
  assert.equal(overlapResult.success, false)
  assert.ok(overlapResult.error?.issues.some(issue => issue.message.includes('cannot be upserted')))

  const unknownRemove = fixture()
  unknownRemove.partitions = {
    spatial: { categories: { remove: ['old-category-not-in-new-knowledge'] } },
  }
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(unknownRemove).success, true)
})

test('GuideAuthoringChangeSetV1 validates appended files without permitting overwrite semantics', () => {
  const roleKindMismatch = fixture()
  const panorama = roleKindMismatch.partitions.assets!.append[0]
  if (panorama.usage === 'runtime') panorama.kind = 'video'
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(roleKindMismatch).success, false)

  const duplicateAsset = fixture()
  duplicateAsset.partitions.assets!.append.push(duplicateAsset.partitions.assets!.append[0])
  const assetResult = GuideAuthoringChangeSetV1Schema.safeParse(duplicateAsset)
  assert.equal(assetResult.success, false)
  assert.ok(
    assetResult.error?.issues.some(issue => issue.message.includes('duplicate appended runtime')),
  )

  const duplicateSource = fixture()
  duplicateSource.partitions.assets!.append.push(
    duplicateSource.partitions.assets!.append[duplicateSource.partitions.assets!.append.length - 1],
  )
  const sourceResult = GuideAuthoringChangeSetV1Schema.safeParse(duplicateSource)
  assert.equal(sourceResult.success, false)
  assert.ok(
    sourceResult.error?.issues.some(issue =>
      issue.message.includes('duplicate appended authoring'),
    ),
  )

  const emptyAppend = fixture()
  emptyAppend.partitions.assets!.append = []
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(emptyAppend).success, false)
})

test('GuideAuthoringChangeSetV1 validates supplied locale content against a replacement locale set', () => {
  const missingTranslation = fixture()
  delete missingTranslation.partitions.profile!.title!['en-US']
  const missingResult = GuideAuthoringChangeSetV1Schema.safeParse(missingTranslation)
  assert.equal(missingResult.success, false)
  assert.ok(
    missingResult.error?.issues.some(issue => issue.message.includes('translation for "en-US"')),
  )

  const undeclared = fixture()
  undeclared.partitions.profile!.title!.fr = 'Chaîne des mémoires'
  const undeclaredResult = GuideAuthoringChangeSetV1Schema.safeParse(undeclared)
  assert.equal(undeclaredResult.success, false)
  assert.ok(undeclaredResult.error?.issues.some(issue => issue.message.includes('not declared')))

  const duplicateLocales = fixture()
  duplicateLocales.partitions.localization!.replace.supportedLocales = ['zh-CN', 'zh-CN']
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(duplicateLocales).success, false)

  const currentStateDependent = fixture()
  currentStateDependent.partitions = { profile: { title: { 'zh-CN': '仅修改中文标题' } } }
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(currentStateDependent).success, true)
})

test('GuideAuthoringChangeSetV1 validates references that are decidable within replacement partitions', () => {
  const unknownSpatial = fixture()
  unknownSpatial.partitions.spatial!.items!.upsert![0].itemId = 'missing-item'
  const spatialResult = GuideAuthoringChangeSetV1Schema.safeParse(unknownSpatial)
  assert.equal(spatialResult.success, false)
  assert.ok(
    spatialResult.error?.issues.some(issue => issue.message.includes('replacement knowledge')),
  )

  const missingScene = fixture()
  missingScene.partitions.knowledge!.replace.stages[1].categories[0].experience = {
    kind: 'html-scene',
    sceneId: 'missing-scene',
    viewId: 'dram-view',
  }
  const sceneResult = GuideAuthoringChangeSetV1Schema.safeParse(missingScene)
  assert.equal(sceneResult.success, false)
  assert.ok(sceneResult.error?.issues.some(issue => issue.message.includes('unknown scene id')))

  const unknownProductCategory = fixture()
  unknownProductCategory.partitions.products!.replace.atlas.categoryIds.push('missing-category')
  const productResult = GuideAuthoringChangeSetV1Schema.safeParse(unknownProductCategory)
  assert.equal(productResult.success, false)
  assert.ok(
    productResult.error?.issues.some(issue => issue.message.includes('unknown category id')),
  )

  const wrongCategoryForItem = fixture()
  const from = wrongCategoryForItem.partitions.navigation!.replace.routes[0].from
  if (from.kind === 'panorama') from.categoryId = 'materials'
  const routeResult = GuideAuthoringChangeSetV1Schema.safeParse(wrongCategoryForItem)
  assert.equal(routeResult.success, false)
  assert.ok(routeResult.error?.issues.some(issue => issue.message.includes('does not belong')))
})

test('GuideAuthoringChangeSetV1 checks same-request asset kinds but defers existing refs to service', () => {
  const wrongPanoramaKind = fixture()
  wrongPanoramaKind.partitions.panorama!.patch.imageAssetId = 'route-video'
  const wrongResult = GuideAuthoringChangeSetV1Schema.safeParse(wrongPanoramaKind)
  assert.equal(wrongResult.success, false)
  assert.ok(
    wrongResult.error?.issues.some(issue => issue.message.includes('must have kind "image"')),
  )

  const existingAssetReference = fixture()
  existingAssetReference.partitions = {
    panorama: { patch: { imageAssetId: 'existing-panorama' } },
  }
  assert.equal(GuideAuthoringChangeSetV1Schema.safeParse(existingAssetReference).success, true)
})
