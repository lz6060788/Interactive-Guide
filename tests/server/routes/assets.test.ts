/**
 * Integration tests for /api/projects/:id/assets routes.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import express from 'express'
import request from 'supertest'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import { AssetRepository } from '../../../src/server/storage/asset-repository.js'
import { ProjectService } from '../../../src/server/services/project-service.js'
import { AssetService } from '../../../src/server/services/asset-service.js'
import { createAssetsRouter } from '../../../src/server/routes/assets.js'
import { createProjectsRouter } from '../../../src/server/routes/projects.js'

function bootApp(): { app: express.Express; dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-assets-routes-'))
  const repo = new ProjectRepository({ dataDir: dir })
  const assetRepo = new AssetRepository(repo, { dataDir: dir })
  const projectService = new ProjectService(repo)
  const assetService = new AssetService(repo, assetRepo)
  const app = express()
  app.use(express.json({ limit: '20mb' }))
  app.use(createProjectsRouter(projectService))
  app.use(createAssetsRouter(projectService, assetService))
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message, code: 'INTERNAL' })
  })
  return { app, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

test('POST /projects/:id/assets/image uploads an image', async () => {
  const { app, cleanup } = bootApp()
  const create = await request(app).post('/projects').send({ id: 'p1', title: 'T' })
  const rev = create.body.data.metadata.revision
  const res = await request(app)
    .post('/projects/p1/assets/image?id=asset-pano&expectedRevision=' + rev)
    .set('content-type', 'image/jpeg')
    .send(Buffer.from('jpeg-bytes'))
  assert.equal(res.status, 201)
  assert.equal(res.body.data.kind, 'image')
  assert.equal(res.body.data.id, 'asset-pano')
  cleanup()
})

test('POST /projects/:id/assets/image without expectedRevision returns 400', async () => {
  const { app, cleanup } = bootApp()
  await request(app).post('/projects').send({ id: 'p1', title: 'T' })
  const res = await request(app)
    .post('/projects/p1/assets/image?id=asset-pano')
    .set('content-type', 'image/jpeg')
    .send(Buffer.from('jpeg-bytes'))
  assert.equal(res.status, 400)
  cleanup()
})

test('POST /projects/:id/assets/html-bundle uploads and extracts a zip', async () => {
  const { app, cleanup, dir } = bootApp()
  const create = await request(app).post('/projects').send({ id: 'p1', title: 'T' })
  const rev = create.body.data.metadata.revision
  const zip = new AdmZip()
  zip.addFile('index.html', Buffer.from('<!doctype html>'))
  zip.addFile('lib/three.js', Buffer.from('// three'))
  const bytes = zip.toBuffer()
  const res = await request(app)
    .post('/projects/p1/assets/html-bundle?id=scene-rocket&expectedRevision=' + rev)
    .set('content-type', 'application/zip')
    .send(bytes)
  assert.equal(res.status, 201)
  assert.equal(res.body.data.kind, 'html-bundle')
  assert.ok(fs.existsSync(path.join(dir, 'projects/p1/assets/scenes/scene-rocket/index.html')))
  cleanup()
})

test('DELETE /projects/:id/assets/:assetId removes the asset', async () => {
  const { app, cleanup, dir } = bootApp()
  const create = await request(app).post('/projects').send({ id: 'p1', title: 'T' })
  const rev = create.body.data.metadata.revision
  await request(app)
    .post('/projects/p1/assets/image?id=asset-pano&expectedRevision=' + rev)
    .set('content-type', 'image/jpeg')
    .send(Buffer.from('jpeg-bytes'))
  const get = await request(app).get('/projects/p1')
  const del = await request(app)
    .delete('/projects/p1/assets/asset-pano?expectedRevision=' + (get.body.data.metadata.revision))
  assert.equal(del.status, 200)
  assert.equal(fs.existsSync(path.join(dir, 'projects/p1/assets/images/asset-pano')), false)
  cleanup()
})