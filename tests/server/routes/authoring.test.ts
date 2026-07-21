import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import request from 'supertest'
import type { GuideAuthoringBundleV1 } from '../../../src/automation/contracts/authoring-bundle-v1.js'
import { createWorkbenchApp } from '../../../src/server/app.js'

function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function makeBundle(panorama: Buffer, knowledge: Buffer): GuideAuthoringBundleV1 {
  return {
    contract: 'guide-authoring-bundle',
    contractVersion: '1.0.0',
    idempotencyKey: '1299ca63-b5ee-45f6-845c-95f9f01cba3d',
    expectedRevision: 0,
    project: {
      id: 'authoring-route-fixture',
      version: '2026.07.21',
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
                  description: { 'zh-CN': '硅片说明', 'en-US': 'Wafer description' },
                },
              ],
            },
          ],
        },
        {
          key: 'midstream',
          label: { 'zh-CN': '中游', 'en-US': 'Midstream' },
          categories: [],
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
        blobSha256: sha256(panorama),
        size: panorama.length,
        mimeType: 'image/png',
        extension: 'png',
        semanticRole: 'panorama-image',
        originalName: 'panorama.png',
      },
      {
        usage: 'authoring-source',
        fileRef: 'knowledge-doc',
        blobSha256: sha256(knowledge),
        size: knowledge.length,
        mediaType: 'text/markdown',
        semanticRole: 'knowledge-source',
        originalName: 'knowledge.md',
      },
    ],
    panorama: { imageAssetId: 'panorama' },
  }
}

async function putBlob(app: ReturnType<typeof createWorkbenchApp>, bytes: Buffer) {
  return request(app)
    .put(`/api/automation/v1/authoring/blobs/${sha256(bytes)}`)
    .set('content-type', 'application/octet-stream')
    .set('x-blob-size', String(bytes.length))
    .send(bytes)
}

test('Automation v1 validates blobs and atomically creates a replay-safe authoring project', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-authoring-route-'))
  const panorama = Buffer.from('opaque-panorama-bytes')
  const knowledge = Buffer.from('# supplied knowledge\n', 'utf8')
  const bundle = makeBundle(panorama, knowledge)
  const app = createWorkbenchApp({ dataDir: root })

  try {
    const missing = await request(app)
      .post('/api/automation/v1/authoring/bundles/validate')
      .send(bundle)
    assert.equal(missing.status, 200)
    assert.equal(missing.body.data.ok, false)
    assert.equal(
      missing.body.data.issues.filter((issue: { code: string }) => issue.code === 'BLOB_NOT_FOUND')
        .length,
      2,
    )
    assert.equal(fs.existsSync(path.join(root, 'projects', bundle.project.id)), false)

    const panoramaUpload = await putBlob(app, panorama)
    assert.equal(panoramaUpload.status, 201)
    assert.equal(panoramaUpload.body.data.created, true)
    const repeatedUpload = await putBlob(app, panorama)
    assert.equal(repeatedUpload.status, 200)
    assert.equal(repeatedUpload.body.data.created, false)
    assert.equal((await putBlob(app, knowledge)).status, 201)

    const validation = await request(app)
      .post('/api/automation/v1/authoring/bundles/validate')
      .send(bundle)
    assert.equal(validation.status, 200)
    assert.equal(validation.body.data.ok, true, JSON.stringify(validation.body.data.issues))
    assert.equal(validation.body.data.projectedRevision, 1)
    assert.deepEqual(
      validation.body.data.calibrationQueue.map((item: { code: string }) => item.code),
      ['CATEGORY_LAYOUT_MISSING', 'ITEM_MARKER_MISSING', 'ITEM_FOCUS_RECT_MISSING'],
    )
    assert.ok(
      validation.body.data.releaseIssues.some(
        (issue: { code: string }) => issue.code === 'CALIBRATION_MISSING',
      ),
    )
    assert.equal(fs.existsSync(path.join(root, 'projects', bundle.project.id)), false)

    const apply = await request(app)
      .post('/api/automation/v1/authoring/bundles/apply')
      .send({ bundle, validationToken: validation.body.data.validationToken })
    assert.equal(apply.status, 200, JSON.stringify(apply.body))
    assert.equal(apply.body.data.projectId, bundle.project.id)
    assert.equal(apply.body.data.revision, 1)
    assert.match(apply.body.data.projectSha256, /^[a-f0-9]{64}$/)
    assert.match(apply.body.data.projectTreeSha256, /^[a-f0-9]{64}$/)

    const projectDir = path.join(root, 'projects', bundle.project.id)
    const storedProject = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'project.json'), 'utf8'),
    ) as {
      assets: { byId: Record<string, { sourcePath: string }> }
    }
    assert.equal(storedProject.assets.byId.panorama?.sourcePath, 'images/panorama/image.png')
    assert.deepEqual(
      fs.readFileSync(path.join(projectDir, 'assets', 'images', 'panorama', 'image.png')),
      panorama,
    )
    assert.deepEqual(
      fs.readFileSync(path.join(projectDir, 'authoring-sources', 'blobs', sha256(knowledge))),
      knowledge,
    )
    assert.equal(storedProject.assets.byId['knowledge-doc'], undefined)

    const authoringState = await request(app).get(
      `/api/automation/v1/projects/${bundle.project.id}/authoring-state`,
    )
    assert.equal(authoringState.status, 200, JSON.stringify(authoringState.body))
    assert.equal(authoringState.body.data.contract, 'guide-authoring-state')
    assert.equal(authoringState.body.data.contractVersion, '1.0.0')
    assert.equal(authoringState.body.data.revision, 1)
    assert.equal(authoringState.body.data.projectId, bundle.project.id)
    assert.equal(
      authoringState.body.data.knowledge.stages[0].categories[0].items[0].id,
      'silicon-wafer',
    )
    assert.deepEqual(authoringState.body.data.runtimeAssets, [
      {
        assetId: 'panorama',
        kind: 'image',
        mimeType: 'image/png',
        sha256: sha256(panorama),
        size: panorama.length,
      },
    ])
    assert.equal(JSON.stringify(authoringState.body.data).includes('sourcePath'), false)
    assert.equal(JSON.stringify(authoringState.body.data).includes(projectDir), false)
    assert.deepEqual(authoringState.body.data.authoringSources, [
      {
        fileRef: 'knowledge-doc',
        blobSha256: sha256(knowledge),
        size: knowledge.length,
        mediaType: 'text/markdown',
        semanticRole: 'knowledge-source',
        originalName: 'knowledge.md',
      },
    ])

    const replay = await request(app)
      .post('/api/automation/v1/authoring/bundles/apply')
      .send({ bundle, validationToken: validation.body.data.validationToken })
    assert.equal(replay.status, 200)
    assert.deepEqual(replay.body.data, apply.body.data)

    const changedBundle = {
      ...bundle,
      project: { ...bundle.project, version: '2026.07.22' },
    }
    const changedValidation = await request(app)
      .post('/api/automation/v1/authoring/bundles/validate')
      .send(changedBundle)
    const reusedKey = await request(app).post('/api/automation/v1/authoring/bundles/apply').send({
      bundle: changedBundle,
      validationToken: changedValidation.body.data.validationToken,
    })
    assert.equal(reusedKey.status, 409)
    assert.equal(reusedKey.body.code, 'IDEMPOTENCY_KEY_REUSED')

    const changeSet = {
      contract: 'guide-authoring-changeset',
      contractVersion: '1.0.0',
      projectId: bundle.project.id,
      expectedRevision: 1,
      idempotencyKey: '90a605b8-d62a-4a15-a29a-80dca42743b1',
      partitions: {
        profile: {
          title: {
            'zh-CN': '存储芯片产业链（更新）',
            'en-US': 'Memory Chip Industry Chain Updated',
          },
        },
      },
    }
    const changeValidation = await request(app)
      .post('/api/automation/v1/authoring/changesets/validate')
      .send(changeSet)
    assert.equal(changeValidation.status, 200, JSON.stringify(changeValidation.body))
    assert.equal(changeValidation.body.data.ok, true, JSON.stringify(changeValidation.body.data))
    assert.equal(changeValidation.body.data.projectedRevision, 2)

    const changeApply = await request(app)
      .post('/api/automation/v1/authoring/changesets/apply')
      .send({
        changeSet,
        validationToken: changeValidation.body.data.validationToken,
      })
    assert.equal(changeApply.status, 200, JSON.stringify(changeApply.body))
    assert.equal(changeApply.body.data.revision, 2)
    const updatedState = await request(app).get(
      `/api/automation/v1/projects/${bundle.project.id}/authoring-state`,
    )
    assert.equal(updatedState.body.data.revision, 2)
    assert.equal(
      updatedState.body.data.project.title['en-US'],
      'Memory Chip Industry Chain Updated',
    )
    const changeReplay = await request(app)
      .post('/api/automation/v1/authoring/changesets/apply')
      .send({
        changeSet,
        validationToken: changeValidation.body.data.validationToken,
      })
    assert.equal(changeReplay.status, 200)
    assert.deepEqual(changeReplay.body.data, changeApply.body.data)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('Automation v1 rejects tampered blob bytes and stale validation tokens', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-authoring-errors-'))
  const panorama = Buffer.from('panorama')
  const knowledge = Buffer.from('knowledge')
  const bundle = makeBundle(panorama, knowledge)
  const app = createWorkbenchApp({ dataDir: root })
  try {
    const badUpload = await request(app)
      .put(`/api/automation/v1/authoring/blobs/${sha256(panorama)}`)
      .set('content-type', 'application/octet-stream')
      .set('x-blob-size', String(panorama.length))
      .send(Buffer.from('tampered'))
    assert.equal(badUpload.status, 400)
    assert.equal(badUpload.body.code, 'BLOB_HASH_MISMATCH')

    await putBlob(app, panorama)
    await putBlob(app, knowledge)
    const stale = await request(app)
      .post('/api/automation/v1/authoring/bundles/apply')
      .send({ bundle, validationToken: '0'.repeat(64) })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.code, 'VALIDATION_TOKEN_STALE')
    assert.equal(fs.existsSync(path.join(root, 'projects', bundle.project.id)), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('Automation authoring state returns a stable not-found error', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-authoring-state-missing-'))
  const app = createWorkbenchApp({ dataDir: root })
  try {
    const response = await request(app).get(
      '/api/automation/v1/projects/missing-project/authoring-state',
    )
    assert.equal(response.status, 404)
    assert.equal(response.body.code, 'PROJECT_NOT_FOUND')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('Automation authoring state represents a valid empty Workbench draft', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-authoring-state-draft-'))
  const app = createWorkbenchApp({ dataDir: root })
  try {
    const created = await request(app)
      .post('/api/projects')
      .send({ id: 'empty-authoring-draft', title: '空草稿' })
    assert.equal(created.status, 201)
    const response = await request(app).get(
      '/api/automation/v1/projects/empty-authoring-draft/authoring-state',
    )
    assert.equal(response.status, 200, JSON.stringify(response.body))
    assert.equal(response.body.data.panorama.imageAssetId, null)
    assert.deepEqual(response.body.data.runtimeAssets, [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('Automation authoring endpoints reject a contract supported only by the other endpoint', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-authoring-contract-routing-'))
  const app = createWorkbenchApp({ dataDir: root })
  try {
    const changeSetOnBundle = await request(app)
      .post('/api/automation/v1/authoring/bundles/validate')
      .send({ contract: 'guide-authoring-changeset', contractVersion: '1.0.0' })
    assert.equal(changeSetOnBundle.status, 400)
    assert.equal(changeSetOnBundle.body.code, 'CONTRACT_UNSUPPORTED')
    assert.deepEqual(changeSetOnBundle.body.supported, [
      { name: 'guide-authoring-bundle', versions: ['1.0.0'] },
    ])

    const bundleOnChangeSet = await request(app)
      .post('/api/automation/v1/authoring/changesets/validate')
      .send({ contract: 'guide-authoring-bundle', contractVersion: '1.0.0' })
    assert.equal(bundleOnChangeSet.status, 400)
    assert.equal(bundleOnChangeSet.body.code, 'CONTRACT_UNSUPPORTED')
    assert.deepEqual(bundleOnChangeSet.body.supported, [
      { name: 'guide-authoring-changeset', versions: ['1.0.0'] },
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
