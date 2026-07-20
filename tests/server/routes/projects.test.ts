/**
 * Integration tests for /api/projects routes.
 *
 * Boots an Express app with the real ProjectService + ProjectRepository
 * against a temp directory. Uses supertest for HTTP-level assertions.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import { ProjectService } from '../../../src/server/services/project-service.js'
import { createProjectsRouter } from '../../../src/server/routes/projects.js'

function bootApp(): { app: express.Express; dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-routes-'))
  const repo = new ProjectRepository({ dataDir: dir })
  const service = new ProjectService(repo)
  const app = express()
  app.use(express.json({ limit: '20mb' }))
  app.use(createProjectsRouter(service))
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message, code: 'INTERNAL' })
    },
  )
  return { app, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

test('POST /projects creates a new project with revision 1', async () => {
  const { app, cleanup } = bootApp()
  const res = await request(app).post('/projects').send({ id: 'p1', title: 'Hello' })
  assert.equal(res.status, 201)
  assert.equal(res.body.data.metadata.revision, 1)
  assert.equal(res.body.data.id, 'p1')
  cleanup()
})

test('POST /projects rejects duplicate id', async () => {
  const { app, cleanup } = bootApp()
  await request(app).post('/projects').send({ id: 'p1', title: 'Hello' })
  const res = await request(app).post('/projects').send({ id: 'p1', title: 'Hello 2' })
  assert.equal(res.status, 400)
  cleanup()
})

test('POST /projects rejects invalid id format', async () => {
  const { app, cleanup } = bootApp()
  const res = await request(app).post('/projects').send({ id: 'Bad Id!', title: 'X' })
  assert.equal(res.status, 400)
  cleanup()
})

test('GET /projects lists projects ordered by updatedAt desc', async () => {
  const { app, cleanup } = bootApp()
  await request(app).post('/projects').send({ id: 'p1', title: 'A' })
  await new Promise(r => setTimeout(r, 5))
  await request(app).post('/projects').send({ id: 'p2', title: 'B' })
  const res = await request(app).get('/projects')
  assert.equal(res.body.data[0].id, 'p2')
  cleanup()
})

test('GET /projects/:id returns the project', async () => {
  const { app, cleanup } = bootApp()
  await request(app).post('/projects').send({ id: 'p1', title: 'Hello' })
  const res = await request(app).get('/projects/p1')
  assert.equal(res.body.data.id, 'p1')
  cleanup()
})

test('DELETE /projects/:id removes the project', async () => {
  const { app, cleanup } = bootApp()
  await request(app).post('/projects').send({ id: 'p1', title: 'Hello' })
  const del = await request(app).delete('/projects/p1')
  assert.equal(del.status, 200)
  const get = await request(app).get('/projects/p1')
  assert.equal(get.status, 404)
  cleanup()
})

test('PATCH /projects/:id/metadata bumps revision on success', async () => {
  const { app, cleanup } = bootApp()
  await request(app).post('/projects').send({ id: 'p1', title: 'Hello' })
  const res = await request(app)
    .patch('/projects/p1/metadata')
    .send({ title: 'Updated', expectedRevision: 1 })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.data.title, { 'zh-CN': 'Updated' })
  assert.equal(res.body.data.metadata.revision, 2)
  cleanup()
})

test('PATCH /projects/:id/metadata rejects stale revision', async () => {
  const { app, cleanup } = bootApp()
  await request(app).post('/projects').send({ id: 'p1', title: 'Hello' })
  const res = await request(app)
    .patch('/projects/p1/metadata')
    .send({ title: 'Updated', expectedRevision: 99 })
  assert.equal(res.status, 409)
  cleanup()
})

test('PUT /projects/:id/knowledge replaces the knowledge tree', async () => {
  const { app, cleanup } = bootApp()
  const create = await request(app).post('/projects').send({ id: 'p1', title: 'Hello' })
  const rev = create.body.data.metadata.revision
  const knowledge = {
    stages: [
      { key: 'upstream', label: { 'en-US': 'Upstream' }, order: 1, categories: [] },
      { key: 'midstream', label: { 'en-US': 'Midstream' }, order: 2, categories: [] },
      { key: 'downstream', label: { 'en-US': 'Downstream' }, order: 3, categories: [] },
    ],
    items: {},
  }
  const res = await request(app)
    .put('/projects/p1/knowledge')
    .set('x-expected-revision', String(rev))
    .send(knowledge)
  assert.equal(res.status, 200)
  cleanup()
})
