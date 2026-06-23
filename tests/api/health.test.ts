import test from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { createTestApp } from '../helpers/test-app.js'

test('GET /api/health returns ok status', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app).get('/api/health').expect(200)
    assert.equal(res.body.status, 'ok')
    assert.ok(typeof res.body.timestamp === 'string')
  } finally {
    cleanup()
  }
})

test('GET /api/health returns application/json content-type', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app).get('/api/health')
    assert.ok(res.headers['content-type'].includes('application/json'))
  } finally {
    cleanup()
  }
})

test('GET unknown route returns 404', async () => {
  const { app, cleanup } = createTestApp()
  try {
    const res = await supertest(app).get('/api/nonexistent').expect(404)
    assert.equal(res.body.code, 'NOT_FOUND')
  } finally {
    cleanup()
  }
})
