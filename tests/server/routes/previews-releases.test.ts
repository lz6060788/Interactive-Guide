import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { parse } from 'acorn'
import express from 'express'
import request from 'supertest'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import { AssetRepository } from '../../../src/server/storage/asset-repository.js'
import { ReleaseRepository } from '../../../src/server/storage/release-repository.js'
import { ReviewRepository } from '../../../src/server/storage/review-repository.js'
import { ProjectService } from '../../../src/server/services/project-service.js'
import { AssetService } from '../../../src/server/services/asset-service.js'
import { ReviewService } from '../../../src/server/services/review-service.js'
import { createProjectsRouter } from '../../../src/server/routes/projects.js'
import { createAssetsRouter } from '../../../src/server/routes/assets.js'
import { createPreviewsRouter } from '../../../src/server/routes/previews.js'
import { createReleasesRouter } from '../../../src/server/routes/releases.js'
import { createReviewSessionsRouter } from '../../../src/server/routes/review-sessions.js'
import type { ReviewApprovalReceipt } from '../../../src/automation/contracts/review-session-v1.js'

function bootApp(): { app: express.Express; dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-preview-release-routes-'))
  const projectRepo = new ProjectRepository({ dataDir: dir })
  const assetRepo = new AssetRepository(projectRepo, { dataDir: dir })
  const releaseRepo = new ReleaseRepository({ dataDir: dir })
  const reviewRepo = new ReviewRepository({ dataDir: dir })
  const projectService = new ProjectService(projectRepo)
  const assetService = new AssetService(projectRepo, assetRepo)
  const reviewService = new ReviewService(projectRepo, reviewRepo)
  const app = express()
  app.use(express.json({ limit: '20mb' }))
  app.use('/api', createProjectsRouter(projectService))
  app.use('/api', createAssetsRouter(projectService, assetService))
  app.use('/api', createPreviewsRouter(projectRepo, { dataDir: dir }))
  app.use('/api', createReviewSessionsRouter(reviewService))
  app.use('/api', createReleasesRouter(projectRepo, releaseRepo, reviewService))
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message, code: 'INTERNAL' })
    },
  )
  return { app, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

async function approveCurrentRevision(app: express.Express): Promise<ReviewApprovalReceipt> {
  const project = await request(app).get('/api/projects/p1')
  const approvedRevision = project.body.data.metadata.revision as number
  const opened = await request(app)
    .post('/api/automation/v1/projects/p1/review-sessions')
    .set('x-expected-revision', String(approvedRevision))
  assert.equal(opened.status, 201, JSON.stringify(opened.body))
  const approved = await request(app)
    .post(`/api/automation/v1/review-sessions/${opened.body.data.id}/approve`)
    .set('x-expected-revision', String(approvedRevision))
    .send({})
  assert.equal(approved.status, 200, JSON.stringify(approved.body))
  return {
    reviewId: opened.body.data.id,
    approvedRevision,
    approvedWorkbenchVersion: approved.body.data.approvedWorkbenchVersion,
    approvedProjectSha256: approved.body.data.approvedProjectSha256,
    approvedAssetClosureSha256: approved.body.data.approvedAssetClosureSha256,
  }
}

function releaseRequest(app: express.Express, approval: ReviewApprovalReceipt) {
  return request(app).post('/api/automation/v1/projects/p1/releases').send(approval)
}

async function createMinimalProject(
  app: express.Express,
  options: { includeEnglishTitle?: boolean } = {},
): Promise<void> {
  const create = await request(app).post('/api/projects').send({ id: 'p1', title: 'T' })
  const rev1 = create.body.data.metadata.revision
  await request(app)
    .post(`/api/projects/p1/assets/image?id=asset-pano&expectedRevision=${rev1}`)
    .set('content-type', 'image/jpeg')
    .send(Buffer.from('jpeg-bytes'))

  const get1 = await request(app).get('/api/projects/p1')
  const rev2 = get1.body.data.metadata.revision
  const panorama = await request(app)
    .put('/api/projects/p1/panorama')
    .set('x-expected-revision', String(rev2))
    .send({
      assetId: 'asset-pano',
      coordinateSpace: 'normalized',
      initialViewport: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      cameraBounds: { minZoom: 1, maxZoom: 4 },
      categories: {},
      items: {},
    })
  assert.equal(panorama.status, 200, JSON.stringify(panorama.body))

  if (options.includeEnglishTitle !== false) {
    const english = await request(app).patch('/api/projects/p1/metadata').send({
      title: 'T',
      titleLocale: 'en-US',
      expectedRevision: panorama.body.data.metadata.revision,
    })
    assert.equal(english.status, 200, JSON.stringify(english.body))
  }
}

test('POST /projects/:id/previews/:product returns a static preview entry that can be fetched', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  const preview = await request(app).post('/api/projects/p1/previews/atlas')
  assert.equal(preview.status, 200, JSON.stringify(preview.body))
  assert.equal(preview.body.data.product, 'atlas')
  assert.equal(typeof preview.body.data.sourceRevision, 'number')
  assert.match(
    preview.body.data.entryUrl,
    /\/api\/projects\/p1\/previews\/atlas\/builds\/.+\/index\.html$/,
  )
  assert.match(preview.body.data.downloadUrl, /\/download\.zip$/)

  const html = await request(app).get(preview.body.data.entryUrl)
  assert.equal(html.status, 200)
  assert.match(String(html.text), /<script src="\.\/app\.js"><\/script>/)
  assert.doesNotMatch(String(html.text), /type="module"/)

  const appJsUrl = preview.body.data.entryUrl.replace(/index\.html$/, 'app.js')
  const appJs = await request(app).get(appJsUrl)
  assert.equal(appJs.status, 200)
  assert.match(String(appJs.text), /manifest\.json/)
  assert.doesNotThrow(() => parse(String(appJs.text), { ecmaVersion: 5, sourceType: 'script' }))
  assert.doesNotMatch(String(appJs.text), /\b(?:import|export)\s/)

  const runtimeModule = await request(app).get(
    preview.body.data.entryUrl.replace(/index\.html$/, 'runtime/atlas-entry.js'),
  )
  assert.equal(runtimeModule.status, 404)

  const download = await request(app)
    .get(preview.body.data.downloadUrl)
    .buffer(true)
    .parse(bufferParser)
  assert.equal(download.status, 200)
  assert.match(String(download.headers['content-disposition']), /p1-atlas-0\.1\.0\.zip/)
  const zip = new AdmZip(download.body as Buffer)
  const entries = zip
    .getEntries()
    .filter(entry => !entry.isDirectory)
    .map(entry => entry.entryName)
  assert.ok(entries.includes('index.html'))
  assert.ok(entries.includes('app.js'))
  assert.ok(entries.includes('manifest.json'))
  assert.ok(entries.some(entry => entry.startsWith('assets/images/')))
  cleanup()
})

test('POST /projects/:id/releases creates a release whose files can be fetched statically', async () => {
  const { app, dir, cleanup } = bootApp()
  await createMinimalProject(app)
  const approval = await approveCurrentRevision(app)
  const release = await releaseRequest(app, approval)
  assert.equal(release.status, 200)
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, 'releases', 'p1', '0.1.0', 'release.json'), 'utf8'),
  ) as {
    schemaVersion: string
    sourceRevision: number
    projectSha256: string
    projectHashAlgorithm: string
    assetClosureSha256: string
    assetHashAlgorithm: string
    workbenchVersion: string
    approval: {
      reviewSessionId: string
      approvedRevision: number
      approvedWorkbenchVersion: string
      approvedProjectSha256: string
      approvedAssetClosureSha256: string
    }
  }
  assert.equal(manifest.schemaVersion, '1.1.0')
  assert.equal(manifest.sourceRevision, approval.approvedRevision)
  assert.equal(manifest.approval.reviewSessionId, approval.reviewId)
  assert.equal(manifest.approval.approvedRevision, approval.approvedRevision)
  assert.equal(manifest.workbenchVersion, approval.approvedWorkbenchVersion)
  assert.equal(manifest.projectSha256, manifest.approval.approvedProjectSha256)
  assert.equal(manifest.projectHashAlgorithm, 'sha256-stable-json-v1')
  assert.equal(manifest.assetClosureSha256, manifest.approval.approvedAssetClosureSha256)
  assert.equal(manifest.assetHashAlgorithm, 'sha256-asset-tree-v1')
  assert.match(manifest.projectSha256, /^[a-f0-9]{64}$/)
  assert.match(manifest.assetClosureSha256, /^[a-f0-9]{64}$/)

  for (const product of ['atlas', 'catalog'] as const) {
    const html = await request(app).get(
      `/api/projects/p1/releases/0.1.0/files/${product}/index.html`,
    )
    assert.equal(html.status, 200)
    assert.match(String(html.text), /<script src="\.\/app\.js"><\/script>/)
    assert.doesNotMatch(String(html.text), /type="module"/)

    const appJs = await request(app).get(`/api/projects/p1/releases/0.1.0/files/${product}/app.js`)
    assert.equal(appJs.status, 200)
    assert.match(String(appJs.text), /manifest\.json/)
    assert.doesNotThrow(() => parse(String(appJs.text), { ecmaVersion: 5, sourceType: 'script' }))
    assert.doesNotMatch(String(appJs.text), /\b(?:import|export)\s/)

    const runtimeModule = await request(app).get(
      `/api/projects/p1/releases/0.1.0/files/${product}/runtime/${product}-entry.js`,
    )
    assert.equal(runtimeModule.status, 404)
  }
  cleanup()
})

test('review approval rejects a release-incomplete draft before release can start', async () => {
  const { app, dir, cleanup } = bootApp()
  await createMinimalProject(app, { includeEnglishTitle: false })
  const project = await request(app).get('/api/projects/p1')
  const revision = project.body.data.metadata.revision as number
  const opened = await request(app)
    .post('/api/automation/v1/projects/p1/review-sessions')
    .set('x-expected-revision', String(revision))
  const approval = await request(app)
    .post(`/api/automation/v1/review-sessions/${opened.body.data.id}/approve`)
    .set('x-expected-revision', String(revision))
    .send({})

  assert.equal(approval.status, 400)
  assert.equal(approval.body.code, 'REVIEW_NOT_RELEASE_READY')
  assert.ok(
    approval.body.issues.some((issue: { code: string }) => issue.code === 'TRANSLATION_MISSING'),
  )
  assert.equal(fs.existsSync(path.join(dir, 'releases', 'p1', '0.1.0')), false)
  cleanup()
})

test('POST /projects/:id/releases keeps versions immutable', async () => {
  const { app, dir, cleanup } = bootApp()
  await createMinimalProject(app)
  const approval = await approveCurrentRevision(app)
  const first = await releaseRequest(app, approval)
  assert.equal(first.status, 200, JSON.stringify(first.body))
  const manifestPath = path.join(dir, 'releases', 'p1', '0.1.0', 'release.json')
  const before = fs.readFileSync(manifestPath)

  const duplicate = await releaseRequest(app, approval)

  assert.equal(duplicate.status, 409)
  assert.equal(duplicate.body.code, 'RELEASE_EXISTS')
  assert.deepEqual(fs.readFileSync(manifestPath), before)
  cleanup()
})

test('POST /projects/:id/releases rejects an approval made stale by a later edit', async () => {
  const { app, dir, cleanup } = bootApp()
  await createMinimalProject(app)
  const approval = await approveCurrentRevision(app)
  const edited = await request(app).patch('/api/projects/p1/metadata').send({
    version: '0.2.0',
    expectedRevision: approval.approvedRevision,
  })
  assert.equal(edited.status, 200)

  const release = await releaseRequest(app, approval)

  assert.equal(release.status, 409)
  assert.equal(release.body.code, 'APPROVAL_STALE')
  assert.equal(fs.existsSync(path.join(dir, 'releases', 'p1', '0.2.0')), false)
  cleanup()
})

test('POST /projects/:id/releases rejects changed asset bytes without creating staging output', async () => {
  const { app, dir, cleanup } = bootApp()
  await createMinimalProject(app)
  const approval = await approveCurrentRevision(app)
  fs.writeFileSync(
    path.join(dir, 'projects', 'p1', 'assets', 'images', 'asset-pano', 'image.jpg'),
    'tampered-after-approval',
  )

  const release = await releaseRequest(app, approval)

  assert.equal(release.status, 409)
  assert.equal(release.body.code, 'APPROVAL_STALE')
  assert.equal(release.body.reason, 'ASSET_CLOSURE_CHANGED')
  assert.equal(fs.existsSync(path.join(dir, 'releases', 'p1', '0.1.0')), false)
  cleanup()
})

test('POST /projects/:id/releases verifies the complete approval receipt and owning project', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  const approval = await approveCurrentRevision(app)

  const wrongHash = await releaseRequest(app, {
    ...approval,
    approvedProjectSha256: 'f'.repeat(64),
  })
  assert.equal(wrongHash.status, 409)
  assert.equal(wrongHash.body.code, 'APPROVAL_RECEIPT_MISMATCH')

  await request(app).post('/api/projects').send({ id: 'p2', title: 'Other' })
  const wrongProject = await request(app)
    .post('/api/automation/v1/projects/p2/releases')
    .send(approval)
  assert.equal(wrongProject.status, 409)
  assert.equal(wrongProject.body.code, 'APPROVAL_PROJECT_MISMATCH')
  cleanup()
})

test('POST /projects/:id/releases requires an explicit review approval', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)

  const release = await request(app).post('/api/automation/v1/projects/p1/releases').send({})

  assert.equal(release.status, 400)
  assert.equal(release.body.code, 'APPROVAL_REQUIRED')
  cleanup()
})

test('POST /projects/:id/releases rejects a pending or mismatched approval', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  const project = await request(app).get('/api/projects/p1')
  const revision = project.body.data.metadata.revision as number
  const opened = await request(app)
    .post('/api/automation/v1/projects/p1/review-sessions')
    .set('x-expected-revision', String(revision))

  const pending = await releaseRequest(app, {
    reviewId: opened.body.data.id,
    approvedRevision: revision,
    approvedWorkbenchVersion: '0.3.0',
    approvedProjectSha256: 'a'.repeat(64),
    approvedAssetClosureSha256: 'b'.repeat(64),
  })
  assert.equal(pending.status, 409)
  assert.equal(pending.body.code, 'APPROVAL_REQUIRED')

  const approved = await request(app)
    .post(`/api/automation/v1/review-sessions/${opened.body.data.id}/approve`)
    .set('x-expected-revision', String(revision))
    .send({})
  assert.equal(approved.status, 200)

  const wrongRevision = await releaseRequest(app, {
    reviewId: approved.body.data.id,
    approvedRevision: revision + 1,
    approvedWorkbenchVersion: approved.body.data.approvedWorkbenchVersion,
    approvedProjectSha256: approved.body.data.approvedProjectSha256,
    approvedAssetClosureSha256: approved.body.data.approvedAssetClosureSha256,
  })
  assert.equal(wrongRevision.status, 409)
  assert.equal(wrongRevision.body.code, 'APPROVAL_REVISION_MISMATCH')
  cleanup()
})

function bufferParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
): void {
  const chunks: Buffer[] = []
  response.on('data', chunk => chunks.push(Buffer.from(chunk)))
  response.on('end', () => callback(null, Buffer.concat(chunks)))
  response.on('error', callback)
}

test('preview and release file routes reject path traversal', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  const approval = await approveCurrentRevision(app)
  await releaseRequest(app, approval)

  const preview = await request(app).get(
    '/api/projects/p1/previews/atlas/builds/build-x/../../secret.txt',
  )
  assert.equal(preview.status, 404)

  const release = await request(app).get('/api/projects/p1/releases/0.1.0/files/../../secret.txt')
  assert.equal(release.status, 404)
  cleanup()
})
