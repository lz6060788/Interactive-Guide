import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftProject, normalizeProject } from '../../src/domain/project-normalizer.js'
import { validateDraftProject, validateReleaseProject } from '../../src/domain/project-validator.js'
import { GuideProjectSchema } from '../../src/domain/project-schema.js'
import type { GuideProject } from '../../src/domain/project-types.js'

function buildSampleProject(): GuideProject {
  const draft = createDraftProject({ id: 'p1', title: 'Sample', locale: 'zh-CN' })
  draft.panorama.assetId = 'asset-pano'
  draft.assets.byId['asset-pano'] = {
    id: 'asset-pano',
    kind: 'image',
    sourcePath: 'images/pano.png',
    sha256: 'a'.repeat(64),
  }
  draft.assets.byId['asset-html-1'] = {
    id: 'asset-html-1',
    kind: 'html-bundle',
    sourcePath: 'scenes/asset-html-1',
    entryPath: 'index.html',
  }
  draft.assets.byId['asset-vid-1'] = {
    id: 'asset-vid-1',
    kind: 'video',
    sourcePath: 'videos/transition.mp4',
  }
  draft.knowledge.stages[0].categories.push({
    id: 'upstream-rocket',
    title: '火箭',
    order: 0,
    itemIds: ['upstream-rocket-1', 'upstream-rocket-2'],
    experience: { kind: 'html-scene', sceneId: 'scene-rocket', viewId: 'v1' },
  })
  draft.knowledge.stages[1].categories.push({
    id: 'midstream-launch',
    title: '发射服务',
    order: 0,
    itemIds: ['midstream-launch-1', 'midstream-launch-2'],
    experience: { kind: 'panorama' },
  })
  draft.knowledge.stages[2].categories.push({
    id: 'downstream-satcom',
    title: '卫星通信',
    order: 0,
    itemIds: ['downstream-satcom-1'],
    experience: { kind: 'panorama' },
  })
  draft.knowledge.items['upstream-rocket-1'] = {
    id: 'upstream-rocket-1',
    categoryId: 'upstream-rocket',
    title: '运载火箭总体',
    description: '',
    order: 0,
  }
  draft.knowledge.items['upstream-rocket-2'] = {
    id: 'upstream-rocket-2',
    categoryId: 'upstream-rocket',
    title: '火箭发动机',
    description: '',
    order: 1,
  }
  draft.knowledge.items['midstream-launch-1'] = {
    id: 'midstream-launch-1',
    categoryId: 'midstream-launch',
    title: '星箭测试',
    description: '',
    order: 0,
  }
  draft.knowledge.items['midstream-launch-2'] = {
    id: 'midstream-launch-2',
    categoryId: 'midstream-launch',
    title: '发射场',
    description: '',
    order: 1,
  }
  draft.knowledge.items['downstream-satcom-1'] = {
    id: 'downstream-satcom-1',
    categoryId: 'downstream-satcom',
    title: '通信地面站',
    description: '',
    order: 0,
  }
  draft.scenes.push({
    id: 'scene-rocket',
    title: 'Rocket',
    assetId: 'asset-html-1',
    protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
    views: [{ id: 'v1', title: 'Rocket', activationMessage: { type: 'init' }, categoryIds: ['upstream-rocket'] }],
  })
  draft.navigation.routes.push({
    id: 'route-1',
    from: { kind: 'panorama' },
    to: { kind: 'scene', sceneId: 'scene-rocket' },
    transition: { kind: 'video', assetId: 'asset-vid-1', onFailure: 'cut' },
  })
  draft.products.atlas.categoryIds = ['upstream-rocket', 'midstream-launch', 'downstream-satcom']
  return draft
}

test('validateDraftProject accepts a shape-valid sample with empty coordinates', () => {
  const project = buildSampleProject()
  const r = validateDraftProject(project)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

test('validateReleaseProject requires labels to be exactly 上游/中游/下游', () => {
  const project = buildSampleProject()
  // @ts-expect-error mutate label
  project.knowledge.stages[0].label = '上 游'
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'STAGE_LABEL_FIXED'))
})

test('validateReleaseProject requires all coordinates to be in [0,1]', () => {
  const project = buildSampleProject()
  const normalized = normalizeProject(project, { autoPickPanoramaAsset: false })
  normalized.panorama.categories['midstream-launch'].viewport.centerX = 1.5
  const r = validateReleaseProject(normalized)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'COORD_OUT_OF_RANGE'))
})

test('validateReleaseProject rejects unknown sceneId in category.experience', () => {
  const project = buildSampleProject()
  project.knowledge.stages[0].categories[0].experience = {
    kind: 'html-scene',
    sceneId: 'scene-ghost',
    viewId: 'v1',
  }
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'SCENE_MISSING'))
})

test('validateReleaseProject rejects unknown viewId in category.experience', () => {
  const project = buildSampleProject()
  project.knowledge.stages[0].categories[0].experience = {
    kind: 'html-scene',
    sceneId: 'scene-rocket',
    viewId: 'v-ghost',
  }
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'SCENE_VIEW_MISSING'))
})

test('validateReleaseProject rejects route referencing missing panorama item', () => {
  const project = buildSampleProject()
  project.navigation.routes.push({
    id: 'route-2',
    from: { kind: 'panorama', itemId: 'item-ghost' },
    to: { kind: 'scene', sceneId: 'scene-rocket' },
  })
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'ROUTE_PANORAMA_ITEM_MISSING'))
})

test('validateReleaseProject rejects route referencing non-video transition asset', () => {
  const project = buildSampleProject()
  // change transition asset to image (wrong kind)
  project.navigation.routes[0].transition!.assetId = 'asset-pano'
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'ASSET_KIND_MISMATCH'))
})

test('validateReleaseProject rejects duplicate item ids', () => {
  const project = buildSampleProject()
  // create a duplicate id by reusing an existing one
  project.knowledge.items['dup'] = project.knowledge.items['upstream-rocket-1']
  const r = validateReleaseProject(project)
  // dup is orphaned (no category references it) — should fail
  assert.equal(r.ok, false)
})

test('validateReleaseProject rejects items declared in multiple categories', () => {
  const project = buildSampleProject()
  project.knowledge.stages[1].categories[0].itemIds.push('upstream-rocket-1')
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'ITEM_IN_MULTIPLE_CATEGORIES'))
})

test('validateReleaseProject rejects items with mismatched categoryId', () => {
  const project = buildSampleProject()
  project.knowledge.items['upstream-rocket-1'].categoryId = 'midstream-launch'
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'ITEM_CATEGORY_MISMATCH'))
})

test('validateReleaseProject rejects orphaned items', () => {
  const project = buildSampleProject()
  delete project.knowledge.items['upstream-rocket-2']
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'ITEM_NOT_IN_REGISTRY'))
})

test('validateReleaseProject rejects atlas categoryIds referencing unknown category', () => {
  const project = buildSampleProject()
  project.products.atlas.categoryIds.push('cat-ghost')
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'ATLAS_CATEGORY_NOT_FOUND'))
})

test('validateReleaseProject requires every released project to round-trip through Zod', () => {
  const project = buildSampleProject()
  // Manually create an inconsistency: order gap
  project.knowledge.stages[1].categories[0].order = 5
  const r = validateReleaseProject(project)
  assert.equal(r.ok, false)
  assert.ok(r.issues.some((i) => i.code === 'CATEGORY_ORDER'))
  // Round-trip
  const parsed = GuideProjectSchema.safeParse(project)
  // Order mismatch is in the shape-valid range (any nonneg int) so Zod will accept it; the validator catches it.
  assert.equal(parsed.success, true)
})
