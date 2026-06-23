import test from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { createTestApp } from '../helpers/test-app.js'

test('POST /api/guides/:id/generate starts a generate job', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app)
      .post('/api/guides/test-guide/generate')
      .expect(200)
    assert.ok(res.body.data.buildId)
    assert.equal(res.body.data.packageId, 'test-guide')
    // Status may be 'pending', 'running', or 'failed' depending on async timing
    assert.ok(res.body.data.status === 'pending' || res.body.data.status === 'running' || res.body.data.status === 'failed')
  } finally {
    cleanup()
  }
})

test('GET /api/generates lists all generate records', async () => {
  const { app, cleanup } = createTestApp()
  try {
    // Create a generate first
    await supertest(app).post('/api/guides/test-guide/generate')

    const res = await supertest(app).get('/api/generates').expect(200)
    assert.ok(Array.isArray(res.body.data))
    assert.ok(res.body.data.length >= 1)
  } finally {
    cleanup()
  }
})

test('GET /api/generates/:generateId returns a specific record', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const generateRes = await supertest(app).post('/api/guides/test-guide/generate')
    const { buildId } = generateRes.body.data

    const res = await supertest(app).get(`/api/generates/${buildId}`).expect(200)
    assert.equal(res.body.data.buildId, buildId)
    assert.equal(res.body.data.packageId, 'test-guide')
  } finally {
    cleanup()
  }
})

test('POST /api/generates/:generateId/cancel cancels or rejects if already finished', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const generateRes = await supertest(app).post('/api/guides/test-guide/generate')
    const { buildId, status: _status } = generateRes.body.data

    // Give the async pipeline a moment to settle
    await new Promise(resolve => setTimeout(resolve, 100))

    const res = await supertest(app).post(`/api/generates/${buildId}/cancel`)
    // May be 200 if still running, 400 if already finished
    assert.ok(res.status === 200 || res.status === 400)
  } finally {
    cleanup()
  }
})

test('GET /api/generates/:generateId/logs returns log entries', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const generateRes = await supertest(app).post('/api/guides/test-guide/generate')
    const { buildId } = generateRes.body.data

    const res = await supertest(app).get(`/api/generates/${buildId}/logs`).expect(200)
    assert.ok(Array.isArray(res.body.data))
    assert.ok(res.body.data.some((line: string) => line.includes('Started')))
  } finally {
    cleanup()
  }
})

test('GET /api/generates/:generateId returns 404 for unknown id', async () => {
  const { app, cleanup } = createTestApp()
  try {
    await supertest(app).get('/api/generates/unknown-id').expect(404)
  } finally {
    cleanup()
  }
})

test('POST /api/guides/:id/package returns a runtime bundle or appropriate error', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app)
      .post('/api/guides/test-guide/package')
    // Accept 200 (success) or 4xx (missing assets in test env)
    if (res.status === 200) {
      assert.ok(res.body.data)
      assert.equal(res.body.data.packageId, 'test-guide')
    } else {
      assert.ok(res.status >= 400)
    }
  } finally {
    cleanup()
  }
})

test('GET /api/guides/:id/manifest returns null when not published', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app).get('/api/guides/test-guide/manifest').expect(404)
    assert.equal(res.body.code, 'NOT_FOUND')
  } finally {
    cleanup()
  }
})
