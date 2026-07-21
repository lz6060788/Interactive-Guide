import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import { ReviewRepository } from '../../../src/server/storage/review-repository.js'
import { AssetRepository } from '../../../src/server/storage/asset-repository.js'
import { ProjectService } from '../../../src/server/services/project-service.js'
import { ReviewService } from '../../../src/server/services/review-service.js'
import { AssetService } from '../../../src/server/services/asset-service.js'
import { createProjectsRouter } from '../../../src/server/routes/projects.js'
import { createReviewSessionsRouter } from '../../../src/server/routes/review-sessions.js'
import { createAssetsRouter } from '../../../src/server/routes/assets.js'
import { WORKBENCH_VERSION } from '../../../src/server/workbench-version.js'

function bootApp(): { app: express.Express; dataDir: string; cleanup: () => void } {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-review-routes-'))
  const projects = new ProjectRepository({ dataDir })
  const reviews = new ReviewRepository({ dataDir })
  const projectService = new ProjectService(projects)
  const app = express()
  app.use(express.json())
  app.use('/api', createProjectsRouter(projectService))
  app.use(
    '/api',
    createAssetsRouter(
      projectService,
      new AssetService(projects, new AssetRepository(projects, { dataDir })),
    ),
  )
  app.use('/api', createReviewSessionsRouter(new ReviewService(projects, reviews)))
  return {
    app,
    dataDir,
    cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }),
  }
}

async function createReviewReadyProject(app: express.Express): Promise<number> {
  const created = await request(app).post('/api/projects').send({ id: 'p1', title: 'Initial' })
  const uploaded = await request(app)
    .post(
      `/api/projects/p1/assets/image?id=asset-pano&expectedRevision=${created.body.data.metadata.revision}`,
    )
    .set('content-type', 'image/jpeg')
    .send(Buffer.from('approved-image'))
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body))
  const afterUpload = await request(app).get('/api/projects/p1')
  const panorama = await request(app)
    .put('/api/projects/p1/panorama')
    .set('x-expected-revision', String(afterUpload.body.data.metadata.revision))
    .send({
      assetId: 'asset-pano',
      coordinateSpace: 'normalized',
      initialViewport: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      cameraBounds: { minZoom: 1, maxZoom: 4 },
      categories: {},
      items: {},
    })
  assert.equal(panorama.status, 200, JSON.stringify(panorama.body))
  const english = await request(app).patch('/api/projects/p1/metadata').send({
    title: 'Initial',
    titleLocale: 'en-US',
    expectedRevision: panorama.body.data.metadata.revision,
  })
  assert.equal(english.status, 200, JSON.stringify(english.body))
  return english.body.data.metadata.revision as number
}

test('review session can approve the revision produced by manual workbench edits', async () => {
  const { app, cleanup } = bootApp()
  try {
    const initialRevision = await createReviewReadyProject(app)
    const opened = await request(app)
      .post('/api/automation/v1/projects/p1/review-sessions')
      .set('x-expected-revision', String(initialRevision))

    assert.equal(opened.status, 201, JSON.stringify(opened.body))
    assert.equal(opened.body.data.status, 'pending')
    assert.equal(opened.body.data.openedRevision, initialRevision)
    assert.match(opened.body.data.reviewPath, /^\/projects\/p1\/review\/review-/)
    assert.match(opened.body.data.reviewUrl, /^http:\/\//)

    const edited = await request(app)
      .patch('/api/projects/p1/metadata')
      .send({ title: 'Manually fixed', expectedRevision: initialRevision })
    assert.equal(edited.status, 200)
    assert.equal(edited.body.data.metadata.revision, initialRevision + 1)

    const approved = await request(app)
      .post(`/api/automation/v1/review-sessions/${opened.body.data.id}/approve`)
      .set('x-expected-revision', String(initialRevision + 1))
      .send({ notes: 'Atlas and Catalog checked.' })

    assert.equal(approved.status, 200, JSON.stringify(approved.body))
    assert.equal(approved.body.data.status, 'approved')
    assert.equal(approved.body.data.approvedRevision, initialRevision + 1)
    assert.equal(approved.body.data.approvedWorkbenchVersion, WORKBENCH_VERSION)
    assert.match(approved.body.data.approvedProjectSha256, /^[a-f0-9]{64}$/)
    assert.match(approved.body.data.approvedAssetClosureSha256, /^[a-f0-9]{64}$/)
    assert.equal(approved.body.data.hashAlgorithm, 'sha256-stable-json-v1')
    assert.equal(approved.body.data.assetHashAlgorithm, 'sha256-asset-tree-v1')
    assert.equal(approved.body.data.notes, 'Atlas and Catalog checked.')
  } finally {
    cleanup()
  }
})

test('a pending review tracks the current revision without changing its opened revision', async () => {
  const { app, cleanup } = bootApp()
  try {
    await request(app).post('/api/projects').send({ id: 'p1', title: 'Initial' })
    const opened = await request(app)
      .post('/api/automation/v1/projects/p1/review-sessions')
      .set('x-expected-revision', '1')

    await request(app)
      .patch('/api/projects/p1/metadata')
      .send({ title: 'Manual edit', expectedRevision: 1 })

    const current = await request(app).get(
      `/api/automation/v1/review-sessions/${opened.body.data.id}`,
    )
    assert.equal(current.status, 200)
    assert.equal(current.body.data.status, 'pending')
    assert.equal(current.body.data.openedRevision, 1)
    assert.equal(current.body.data.currentRevision, 2)
  } finally {
    cleanup()
  }
})

test('review sessions persist across service restarts', async () => {
  const first = bootApp()
  try {
    await request(first.app).post('/api/projects').send({ id: 'p1', title: 'Initial' })
    const opened = await request(first.app)
      .post('/api/automation/v1/projects/p1/review-sessions')
      .set('x-expected-revision', '1')

    const projects = new ProjectRepository({ dataDir: first.dataDir })
    const reviews = new ReviewRepository({ dataDir: first.dataDir })
    const restarted = express()
    restarted.use(express.json())
    restarted.use('/api', createReviewSessionsRouter(new ReviewService(projects, reviews)))

    const restored = await request(restarted).get(
      `/api/automation/v1/review-sessions/${opened.body.data.id}`,
    )
    assert.equal(restored.status, 200)
    assert.equal(restored.body.data.openedRevision, 1)
    assert.equal(restored.body.data.status, 'pending')
  } finally {
    first.cleanup()
  }
})

test('an approved review becomes stale after any later project mutation', async () => {
  const { app, cleanup } = bootApp()
  try {
    const revision = await createReviewReadyProject(app)
    const opened = await request(app)
      .post('/api/automation/v1/projects/p1/review-sessions')
      .set('x-expected-revision', String(revision))
    await request(app)
      .post(`/api/automation/v1/review-sessions/${opened.body.data.id}/approve`)
      .set('x-expected-revision', String(revision))
      .send({})

    await request(app)
      .patch('/api/projects/p1/metadata')
      .send({ version: '0.2.0', expectedRevision: revision })

    const current = await request(app).get(
      `/api/automation/v1/review-sessions/${opened.body.data.id}`,
    )
    assert.equal(current.status, 200)
    assert.equal(current.body.data.status, 'stale')
    assert.equal(current.body.data.approvedRevision, revision)
    assert.equal(current.body.data.currentRevision, revision + 1)
    assert.equal(current.body.data.staleReason, 'REVISION_CHANGED')
  } finally {
    cleanup()
  }
})

test('an approved review detects same-revision project file changes by hash', async () => {
  const { app, dataDir, cleanup } = bootApp()
  try {
    const revision = await createReviewReadyProject(app)
    const opened = await request(app)
      .post('/api/automation/v1/projects/p1/review-sessions')
      .set('x-expected-revision', String(revision))
    await request(app)
      .post(`/api/automation/v1/review-sessions/${opened.body.data.id}/approve`)
      .set('x-expected-revision', String(revision))
      .send({})

    const projectFile = path.join(dataDir, 'projects', 'p1', 'project.json')
    const project = JSON.parse(fs.readFileSync(projectFile, 'utf8')) as { version: string }
    project.version = '0.2.0'
    fs.writeFileSync(projectFile, JSON.stringify(project, null, 2))
    const future = new Date(Date.now() + 2000)
    fs.utimesSync(projectFile, future, future)

    const current = await request(app).get(
      `/api/automation/v1/review-sessions/${opened.body.data.id}`,
    )
    assert.equal(current.status, 200)
    assert.equal(current.body.data.status, 'stale')
    assert.equal(current.body.data.currentRevision, revision)
    assert.equal(current.body.data.staleReason, 'PROJECT_HASH_CHANGED')
  } finally {
    cleanup()
  }
})

test('an approved review becomes stale when approved asset bytes change on disk', async () => {
  const { app, dataDir, cleanup } = bootApp()
  try {
    const revision = await createReviewReadyProject(app)
    const opened = await request(app)
      .post('/api/automation/v1/projects/p1/review-sessions')
      .set('x-expected-revision', String(revision))
    const approved = await request(app)
      .post(`/api/automation/v1/review-sessions/${opened.body.data.id}/approve`)
      .set('x-expected-revision', String(revision))
      .send({})
    assert.equal(approved.status, 200)

    fs.writeFileSync(
      path.join(dataDir, 'projects', 'p1', 'assets', 'images', 'asset-pano', 'image.jpg'),
      'tampered-image',
    )

    const current = await request(app).get(
      `/api/automation/v1/review-sessions/${opened.body.data.id}`,
    )
    assert.equal(current.status, 200)
    assert.equal(current.body.data.status, 'stale')
    assert.equal(current.body.data.currentRevision, revision)
    assert.equal(current.body.data.staleReason, 'ASSET_CLOSURE_CHANGED')
  } finally {
    cleanup()
  }
})

test('review session rejects stale expected revisions and a second approval', async () => {
  const { app, cleanup } = bootApp()
  try {
    const revision = await createReviewReadyProject(app)
    const staleOpen = await request(app)
      .post('/api/automation/v1/projects/p1/review-sessions')
      .set('x-expected-revision', String(revision + 1))
    assert.equal(staleOpen.status, 409)
    assert.equal(staleOpen.body.code, 'REVISION_CONFLICT')

    const opened = await request(app)
      .post('/api/automation/v1/projects/p1/review-sessions')
      .set('x-expected-revision', String(revision))
    const reviewId = opened.body.data.id
    const first = await request(app)
      .post(`/api/automation/v1/review-sessions/${reviewId}/approve`)
      .set('x-expected-revision', String(revision))
      .send({})
    assert.equal(first.status, 200)

    const duplicate = await request(app)
      .post(`/api/automation/v1/review-sessions/${reviewId}/approve`)
      .set('x-expected-revision', String(revision))
      .send({})
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.code, 'REVIEW_ALREADY_APPROVED')
  } finally {
    cleanup()
  }
})
