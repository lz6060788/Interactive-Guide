import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftProject, normalizeProject } from '../../src/domain/project-normalizer.js'
import { draftIssues, releaseIssues, isReleaseReady, validateAsStage } from '../../src/domain/draft-vs-release.js'
import type { GuideProject } from '../../src/domain/project-types.js'

function buildMinimalProject(): GuideProject {
  const draft = createDraftProject({ id: 'p1', title: 'Test' })
  draft.panorama.assetId = 'asset-pano'
  draft.assets.byId['asset-pano'] = { id: 'asset-pano', kind: 'image', sourcePath: 'pano.png' }
  return draft
}

test('draftIssues returns ok for a fresh draft', () => {
  const r = draftIssues(buildMinimalProject())
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

test('releaseIssues returns ok for a normalized minimal project', () => {
  const normalized = normalizeProject(buildMinimalProject())
  const r = releaseIssues(normalized)
  assert.equal(r.ok, true, JSON.stringify(r.issues))
})

test('isReleaseReady is false for an unnormalized draft without assetId', () => {
  const project = buildMinimalProject()
  project.panorama.assetId = ''
  assert.equal(isReleaseReady(project), false)
})

test('validateAsStage dispatches to the right tier', () => {
  const project = buildMinimalProject()
  assert.equal(validateAsStage(project, 'draft').ok, true)
  assert.equal(validateAsStage(normalizeProject(project), 'release').ok, true)
})

test('validateAsStage release fails for a project with content but no calibration', () => {
  const project = buildMinimalProject()
  project.knowledge.stages[0].categories.push({
    id: 'upstream-rocket',
    title: '火箭',
    order: 0,
    itemIds: ['r1'],
    experience: { kind: 'panorama' },
  })
  project.knowledge.items['r1'] = {
    id: 'r1',
    categoryId: 'upstream-rocket',
    title: 'r',
    description: '',
    order: 0,
  }
  assert.equal(validateAsStage(project, 'draft').ok, true)
  // release should fail because item has no spatial layout
  assert.equal(validateAsStage(project, 'release').ok, false)
})

test('releaseIssues fails when stage labels are not the fixed values', () => {
  const project = buildMinimalProject()
  // @ts-expect-error mutate label
  project.knowledge.stages[0].label = 'Source'
  const normalized = normalizeProject(project)
  const r = releaseIssues(normalized)
  assert.equal(r.ok, false)
})
