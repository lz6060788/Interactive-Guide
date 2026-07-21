import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { createWorkbenchApp } from '../../src/server/app.js'

function createFixture(): { root: string; dataDir: string; adminDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-workbench-app-'))
  const dataDir = path.join(root, 'workspace')
  const adminDir = path.join(root, 'admin')
  fs.mkdirSync(path.join(adminDir, 'assets'), { recursive: true })
  fs.writeFileSync(
    path.join(adminDir, 'index.html'),
    '<!doctype html><title>Workbench Admin</title>',
  )
  fs.writeFileSync(path.join(adminDir, 'assets', 'app.js'), 'window.WORKBENCH_ADMIN = true')
  return { root, dataDir, adminDir }
}

test('createWorkbenchApp serves API, built Admin assets, and BrowserRouter fallbacks', async () => {
  const fixture = createFixture()
  try {
    const app = createWorkbenchApp({
      dataDir: fixture.dataDir,
      adminDir: fixture.adminDir,
    })

    const health = await request(app).get('/api/health')
    assert.equal(health.status, 200)
    assert.equal(health.body.status, 'ok')

    const asset = await request(app).get('/assets/app.js')
    assert.equal(asset.status, 200)
    assert.match(asset.text, /WORKBENCH_ADMIN/)

    const editor = await request(app).get('/projects/demo/atlas-editor')
    assert.equal(editor.status, 200)
    assert.match(editor.text, /Workbench Admin/)

    const missingApi = await request(app).get('/api/not-a-route')
    assert.equal(missingApi.status, 404)
    assert.equal(missingApi.body.code, 'NOT_FOUND')
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('createWorkbenchApp fails fast when the configured Admin build is missing', () => {
  const fixture = createFixture()
  try {
    assert.throws(
      () =>
        createWorkbenchApp({
          dataDir: fixture.dataDir,
          adminDir: path.join(fixture.root, 'missing'),
        }),
      /Admin build is missing/,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})
