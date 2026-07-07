import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import { AssetRepository } from '../../../src/server/storage/asset-repository.js'
import { ReleaseRepository } from '../../../src/server/storage/release-repository.js'
import { ProjectService } from '../../../src/server/services/project-service.js'
import { AssetService } from '../../../src/server/services/asset-service.js'
import { createProjectsRouter } from '../../../src/server/routes/projects.js'
import { createAssetsRouter } from '../../../src/server/routes/assets.js'
import { createPreviewsRouter } from '../../../src/server/routes/previews.js'
import { createReleasesRouter } from '../../../src/server/routes/releases.js'

function bootApp(): { app: express.Express; dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-preview-release-routes-'))
  const projectRepo = new ProjectRepository({ dataDir: dir })
  const assetRepo = new AssetRepository(projectRepo, { dataDir: dir })
  const releaseRepo = new ReleaseRepository({ dataDir: dir })
  const projectService = new ProjectService(projectRepo)
  const assetService = new AssetService(projectRepo, assetRepo)
  const app = express()
  app.use(express.json({ limit: '20mb' }))
  app.use('/api', createProjectsRouter(projectService))
  app.use('/api', createAssetsRouter(projectService, assetService))
  app.use('/api', createPreviewsRouter(projectRepo))
  app.use('/api', createReleasesRouter(projectRepo, releaseRepo))
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message, code: 'INTERNAL' })
  })
  return { app, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

async function createMinimalProject(app: express.Express): Promise<void> {
  const create = await request(app).post('/api/projects').send({ id: 'p1', title: 'T' })
  const rev1 = create.body.data.metadata.revision
  await request(app)
    .post(`/api/projects/p1/assets/image?id=asset-pano&expectedRevision=${rev1}`)
    .set('content-type', 'image/jpeg')
    .send(Buffer.from('jpeg-bytes'))

  const get1 = await request(app).get('/api/projects/p1')
  const rev2 = get1.body.data.metadata.revision
  await request(app)
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
}

test('POST /projects/:id/previews/:product returns a static preview entry that can be fetched', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  const preview = await request(app).post('/api/projects/p1/previews/atlas')
  assert.equal(preview.status, 200)
  assert.match(preview.body.data.entryUrl, /\/api\/projects\/p1\/previews\/atlas\/builds\/.+\/index\.html$/)

  const html = await request(app).get(preview.body.data.entryUrl)
  assert.equal(html.status, 200)
  assert.match(String(html.text), /app\.js/)

  const appJsUrl = preview.body.data.entryUrl.replace(/index\.html$/, 'app.js')
  const appJs = await request(app).get(appJsUrl)
  assert.equal(appJs.status, 200)
  assert.match(String(appJs.text), /manifest\.json/)
  const runtimeModuleMatch = String(appJs.text).match(/from '(.+atlas-entry\.js)'/)
  assert.ok(runtimeModuleMatch?.[1], 'preview app.js should import atlas browser runtime entry')
  const runtimeModuleUrl = new URL(runtimeModuleMatch[1], `http://local${appJsUrl}`).pathname
  const runtimeModule = await request(app).get(runtimeModuleUrl)
  assert.equal(runtimeModule.status, 200)
  assert.match(String(runtimeModule.text), /bootstrapAtlasProduct/)
  cleanup()
})

test('POST /projects/:id/releases creates a release whose files can be fetched statically', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  const release = await request(app).post('/api/projects/p1/releases')
  assert.equal(release.status, 200)

  const html = await request(app).get('/api/projects/p1/releases/0.1.0/files/atlas/index.html')
  assert.equal(html.status, 200)
  assert.match(String(html.text), /app\.js/)

  const appJs = await request(app).get('/api/projects/p1/releases/0.1.0/files/atlas/app.js')
  assert.equal(appJs.status, 200)
  assert.match(String(appJs.text), /manifest\.json/)
  const runtimeModuleMatch = String(appJs.text).match(/from '(.+atlas-entry\.js)'/)
  assert.ok(runtimeModuleMatch?.[1], 'release app.js should import atlas browser runtime entry')
  const runtimeModuleUrl = new URL(
    runtimeModuleMatch[1],
    'http://local/api/projects/p1/releases/0.1.0/files/atlas/app.js',
  ).pathname
  const runtimeModule = await request(app).get(runtimeModuleUrl)
  assert.equal(runtimeModule.status, 200)
  assert.match(String(runtimeModule.text), /bootstrapAtlasProduct/)
  cleanup()
})

test('preview and release file routes reject path traversal', async () => {
  const { app, cleanup } = bootApp()
  await createMinimalProject(app)
  await request(app).post('/api/projects/p1/releases')

  const preview = await request(app).get('/api/projects/p1/previews/atlas/builds/build-x/../../secret.txt')
  assert.equal(preview.status, 404)

  const release = await request(app).get('/api/projects/p1/releases/0.1.0/files/../../secret.txt')
  assert.equal(release.status, 404)
  cleanup()
})
