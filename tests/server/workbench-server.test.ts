import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startWorkbenchServer } from '../../src/server/workbench-server.js'

test('startWorkbenchServer binds locally on an automatic port and exposes one UI/API origin', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-workbench-server-'))
  const workspace = path.join(root, 'workspace')
  const adminDir = path.join(root, 'admin')
  fs.mkdirSync(adminDir, { recursive: true })
  fs.writeFileSync(
    path.join(adminDir, 'index.html'),
    '<!doctype html><title>Local Workbench</title>',
  )

  const instance = await startWorkbenchServer({
    workspace,
    adminDir,
    port: 0,
  })

  try {
    assert.equal(instance.host, '127.0.0.1')
    assert.ok(instance.port > 0)
    assert.equal(instance.apiUrl, `${instance.uiUrl}/api`)
    assert.equal(instance.workspace, path.resolve(workspace))

    const health = await fetch(`${instance.apiUrl}/health`)
    assert.equal(health.status, 200)

    const admin = await fetch(instance.uiUrl)
    assert.equal(admin.status, 200)
    assert.match(await admin.text(), /Local Workbench/)
  } finally {
    await instance.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
