import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorkspaceInUseError, acquireWorkspaceLock } from '../../src/server/workspace-lock.js'

test('workspace lock prevents two workbench instances from writing the same workspace', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-workbench-lock-'))
  try {
    const first = acquireWorkspaceLock(workspace, 'instance-a')
    assert.throws(
      () => acquireWorkspaceLock(workspace, 'instance-b'),
      (error: unknown) => error instanceof WorkspaceInUseError && error.instanceId === 'instance-a',
    )

    first.release()
    const second = acquireWorkspaceLock(workspace, 'instance-b')
    second.release()
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})

test('workspace lock reclaims a stale owner record', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-workbench-stale-lock-'))
  try {
    fs.writeFileSync(
      path.join(workspace, '.guide-workbench.lock'),
      JSON.stringify({ instanceId: 'stale', pid: 999999, startedAt: '2020-01-01T00:00:00.000Z' }),
    )

    const lock = acquireWorkspaceLock(workspace, 'fresh', {
      isProcessAlive: () => false,
    })
    assert.equal(lock.instanceId, 'fresh')
    lock.release()
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})
