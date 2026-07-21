import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GuideAuthoringStateV1Schema,
  type GuideAuthoringStateV1,
} from '../../src/automation/contracts/authoring-state-v1.js'
import { createDraftProject } from '../../src/domain/project-normalizer.js'

function validState(): GuideAuthoringStateV1 {
  const project = createDraftProject({ id: 'authoring-state-fixture', title: '产业链' })
  project.panorama.assetId = 'panorama'
  return {
    contract: 'guide-authoring-state',
    contractVersion: '1.0.0',
    workbenchVersion: '0.5.0',
    projectId: project.id,
    revision: 1,
    projectSha256: '1'.repeat(64),
    projectTreeSha256: '2'.repeat(64),
    projectTreeHashAlgorithm: 'sha256-path-length-content-v1',
    project: {
      title: project.title,
      version: project.version,
      localization: project.localization,
      createdAt: project.metadata.createdAt,
      updatedAt: project.metadata.updatedAt,
    },
    knowledge: {
      stages: project.knowledge.stages.map(stage => ({
        key: stage.key,
        label: stage.label,
        categories: [],
      })) as GuideAuthoringStateV1['knowledge']['stages'],
    },
    runtimeAssets: [
      {
        assetId: 'panorama',
        kind: 'image',
        mimeType: 'image/png',
        sha256: '3'.repeat(64),
        size: 42,
      },
    ],
    panorama: {
      imageAssetId: 'panorama',
      cameraBounds: project.panorama.cameraBounds,
      initialViewport: project.panorama.initialViewport,
    },
    spatial: { categories: [], items: [] },
    scenes: project.scenes,
    navigation: project.navigation,
    products: project.products,
    integrations: project.integrations,
    authoringSources: [],
  }
}

test('GuideAuthoringStateV1 accepts the strict path-free automation projection', () => {
  assert.equal(GuideAuthoringStateV1Schema.safeParse(validState()).success, true)
})

test('GuideAuthoringStateV1 rejects Workbench-local paths and duplicate stable ids', () => {
  const leakedPath = validState() as unknown as Record<string, unknown>
  const runtimeAssets = leakedPath.runtimeAssets as Array<Record<string, unknown>>
  runtimeAssets[0]!.sourcePath = 'images/panorama/image.png'
  assert.equal(GuideAuthoringStateV1Schema.safeParse(leakedPath).success, false)

  const absoluteEntry = validState()
  absoluteEntry.runtimeAssets[0]!.entryPath = '/private/index.html'
  assert.equal(GuideAuthoringStateV1Schema.safeParse(absoluteEntry).success, false)

  const duplicate = validState()
  duplicate.runtimeAssets.push({ ...duplicate.runtimeAssets[0]! })
  assert.equal(GuideAuthoringStateV1Schema.safeParse(duplicate).success, false)
})

test('GuideAuthoringStateV1 represents empty drafts and legacy zero-byte metadata', () => {
  const state = validState()
  state.panorama.imageAssetId = null
  state.runtimeAssets[0]!.size = 0
  assert.equal(GuideAuthoringStateV1Schema.safeParse(state).success, true)
})
