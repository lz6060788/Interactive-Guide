import test from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { createTestApp, createTestGuide } from '../helpers/test-app.js'

test('GET /api/guides lists all guides', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app).get('/api/guides').expect(200)
    assert.ok(Array.isArray(res.body.data))
    assert.ok(res.body.data.length >= 1)
    const guide = res.body.data.find((g: any) => g.id === 'test-guide')
    assert.ok(guide)
    assert.equal(guide.title, 'Test Guide')
    assert.equal(guide.nodeCount, 2)
    assert.equal(guide.edgeCount, 1)
  } finally {
    cleanup()
  }
})

test('GET /api/guides/:id returns a single guide with hydrated edges', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app).get('/api/guides/test-guide').expect(200)
    assert.equal(res.body.data.id, 'test-guide')
    assert.equal(res.body.data.title, 'Test Guide')
    assert.equal(res.body.data.nodes.length, 2)
    assert.equal(res.body.data.edges.length, 1)
  } finally {
    cleanup()
  }
})

test('GET /api/guides/:id returns 404 for unknown guide', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app).get('/api/guides/nonexistent').expect(404)
    assert.ok(res.body.error.includes('not found') || res.body.error.includes('Not found'))
  } finally {
    cleanup()
  }
})

test('POST /api/guides/import creates a new guide', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const newGuide = createTestGuide({ id: 'imported-guide', title: 'Imported Guide' })
    const res = await supertest(app)
      .post('/api/guides/import')
      .send(newGuide)
      .expect(201)
    assert.equal(res.body.data.id, 'imported-guide')
    assert.equal(res.body.data.title, 'Imported Guide')

    // Verify it appears in list
    const listRes = await supertest(app).get('/api/guides').expect(200)
    const found = listRes.body.data.find((g: any) => g.id === 'imported-guide')
    assert.ok(found)
  } finally {
    cleanup()
  }
})

test('DELETE /api/guides/:id removes a guide', async () => {
  const { app, cleanup } = createTestApp()
  try {
    await supertest(app).delete('/api/guides/test-guide').expect(200)

    // Verify it's gone
    const res = await supertest(app).get('/api/guides/test-guide').expect(404)
    assert.ok(res.body.error)
  } finally {
    cleanup()
  }
})

test('POST /api/guides/:id/copy duplicates a guide', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app)
      .post('/api/guides/test-guide/copy')
      .expect(201)
    assert.ok(res.body.data.id !== 'test-guide')
    // Copy may append suffix to title
    assert.ok(res.body.data.title.includes('Test Guide'))
    assert.equal(res.body.data.nodes.length, 2)
  } finally {
    cleanup()
  }
})

test('PUT /api/guides/:id updates guide metadata', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app)
      .put('/api/guides/test-guide')
      .send({ title: 'Updated Title' })
      .expect(200)
    assert.equal(res.body.data.title, 'Updated Title')
  } finally {
    cleanup()
  }
})

test('POST /api/guides/:guideId/nodes creates a node', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app)
      .post('/api/guides/test-guide/nodes')
      .send({
        parentId: 'root',
        nodeData: { title: 'New Node', nodeKind: 'image' },
      })
      .expect(201)
    assert.ok(res.body.data.id)
    assert.equal(res.body.data.title, 'New Node')
  } finally {
    cleanup()
  }
})

test('PUT /api/guides/:guideId/nodes/:nodeId updates a node', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app)
      .put('/api/guides/test-guide/nodes/root')
      .send({ title: 'Updated Root' })
      .expect(200)
    assert.equal(res.body.data.title, 'Updated Root')
  } finally {
    cleanup()
  }
})

test('DELETE /api/guides/:guideId/nodes/:nodeId removes a node', async () => {
  const { app, cleanup } = createTestApp()
  try {
    await supertest(app)
      .delete('/api/guides/test-guide/nodes/node-2')
      .expect(200)

    const res = await supertest(app).get('/api/guides/test-guide').expect(200)
    assert.equal(res.body.data.nodes.length, 1)
  } finally {
    cleanup()
  }
})
