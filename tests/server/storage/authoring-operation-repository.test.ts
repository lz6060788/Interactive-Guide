import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AuthoringOperationBusyError,
  AuthoringOperationCorruptError,
  AuthoringOperationFingerprintConflictError,
  AuthoringOperationNotFoundError,
  AuthoringOperationRepository,
  InvalidAuthoringOperationFieldError,
} from '../../../src/server/storage/authoring-operation-repository.js'

const REQUEST_FINGERPRINT = '1'.repeat(64)
const TARGET_PROJECT_SHA256 = '2'.repeat(64)
const TARGET_ASSET_TREE_SHA256 = 'a'.repeat(64)

test('AuthoringOperationRepository persists a prepared operation without exposing its raw key', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-operation-'))
  try {
    const repo = new AuthoringOperationRepository({
      dataDir,
      now: () => new Date('2026-07-21T01:02:03.000Z'),
    })
    const idempotencyKey = 'client/request:001'
    const keyHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex')
    const record = repo.prepare({
      projectId: 'memory-chip-industry-chain',
      idempotencyKey,
      requestFingerprint: REQUEST_FINGERPRINT,
      targetProjectSha256: TARGET_PROJECT_SHA256,
      targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
      projectedRevision: 1,
      operationId: 'operation-001',
      stagingRelativePath: 'create-operation-001',
    })

    assert.deepEqual(record, {
      schemaVersion: '1.0.0',
      projectId: 'memory-chip-industry-chain',
      idempotencyKeyHash: keyHash,
      requestFingerprint: REQUEST_FINGERPRINT,
      targetProjectSha256: TARGET_PROJECT_SHA256,
      targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
      status: 'prepared',
      preparedAt: '2026-07-21T01:02:03.000Z',
      projectedRevision: 1,
      operationId: 'operation-001',
      stagingRelativePath: 'create-operation-001',
    })
    assert.deepEqual(repo.get('memory-chip-industry-chain', idempotencyKey), record)
    const storedFile = path.join(repo.rootDir(), 'memory-chip-industry-chain', `${keyHash}.json`)
    assert.equal(fs.existsSync(storedFile), true)
    assert.equal(fs.readFileSync(storedFile, 'utf8').includes(idempotencyKey), false)
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringOperationRepository returns the original record for the same key and fingerprint', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-operation-idempotent-'))
  try {
    const repo = new AuthoringOperationRepository({ dataDir })
    const first = repo.prepare({
      projectId: 'p1',
      idempotencyKey: 'same-key',
      requestFingerprint: REQUEST_FINGERPRINT,
      targetProjectSha256: TARGET_PROJECT_SHA256,
      targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
      preparedAt: '2026-07-21T00:00:00.000Z',
      stagingRelativePath: 'first-stage',
    })
    const replay = repo.prepare({
      projectId: 'p1',
      idempotencyKey: 'same-key',
      requestFingerprint: REQUEST_FINGERPRINT,
      targetProjectSha256: '3'.repeat(64),
      targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
      preparedAt: '2026-07-22T00:00:00.000Z',
      stagingRelativePath: 'different-input-ignored-because-fingerprint-is-authoritative',
    })

    assert.deepEqual(replay, first)
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringOperationRepository rejects reuse of a key for a different request fingerprint', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-operation-conflict-'))
  try {
    const repo = new AuthoringOperationRepository({ dataDir })
    repo.prepare({
      projectId: 'p1',
      idempotencyKey: 'same-key',
      requestFingerprint: REQUEST_FINGERPRINT,
      targetProjectSha256: TARGET_PROJECT_SHA256,
      targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
    })

    assert.throws(
      () =>
        repo.prepare({
          projectId: 'p1',
          idempotencyKey: 'same-key',
          requestFingerprint: '3'.repeat(64),
          targetProjectSha256: TARGET_PROJECT_SHA256,
          targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
        }),
      (error: unknown) =>
        error instanceof AuthoringOperationFingerprintConflictError &&
        error.existingFingerprint === REQUEST_FINGERPRINT &&
        error.receivedFingerprint === '3'.repeat(64),
    )
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringOperationRepository atomically advances prepared to succeeded and replays the first result', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-operation-success-'))
  try {
    const repo = new AuthoringOperationRepository({ dataDir })
    repo.prepare({
      projectId: 'p1',
      idempotencyKey: 'apply-1',
      requestFingerprint: REQUEST_FINGERPRINT,
      targetProjectSha256: TARGET_PROJECT_SHA256,
      targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
      preparedAt: '2026-07-21T00:00:00.000Z',
      projectedRevision: 1,
    })
    const succeeded = repo.succeed({
      projectId: 'p1',
      idempotencyKey: 'apply-1',
      requestFingerprint: REQUEST_FINGERPRINT,
      succeededAt: '2026-07-21T00:01:00.000Z',
      result: { projectId: 'p1', revision: 1, products: ['atlas', 'catalog'] },
    })
    const replay = repo.succeed({
      projectId: 'p1',
      idempotencyKey: 'apply-1',
      requestFingerprint: REQUEST_FINGERPRINT,
      succeededAt: '2026-07-21T00:02:00.000Z',
      result: { projectId: 'should-not-replace-the-original' },
    })

    assert.equal(succeeded.status, 'succeeded')
    assert.equal(succeeded.succeededAt, '2026-07-21T00:01:00.000Z')
    assert.deepEqual(replay, succeeded)
    const reloaded = new AuthoringOperationRepository({ dataDir })
    assert.deepEqual(reloaded.get('p1', 'apply-1'), succeeded)
    const operationFiles = fs
      .readdirSync(path.join(repo.rootDir(), 'p1'))
      .filter(name => name.endsWith('.json'))
    assert.equal(operationFiles.length, 1)
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringOperationRepository rejects succeed before prepare and non-JSON results', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-operation-result-'))
  try {
    const repo = new AuthoringOperationRepository({ dataDir })
    assert.throws(
      () =>
        repo.succeed({
          projectId: 'p1',
          idempotencyKey: 'missing',
          requestFingerprint: REQUEST_FINGERPRINT,
          result: { ok: true },
        }),
      (error: unknown) => error instanceof AuthoringOperationNotFoundError,
    )

    repo.prepare({
      projectId: 'p1',
      idempotencyKey: 'circular',
      requestFingerprint: REQUEST_FINGERPRINT,
      targetProjectSha256: TARGET_PROJECT_SHA256,
      targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
    })
    const circular: { self?: unknown } = {}
    circular.self = circular
    assert.throws(
      () =>
        repo.succeed({
          projectId: 'p1',
          idempotencyKey: 'circular',
          requestFingerprint: REQUEST_FINGERPRINT,
          result: circular,
        }),
      (error: unknown) => error instanceof InvalidAuthoringOperationFieldError,
    )
    assert.throws(
      () =>
        repo.succeed({
          projectId: 'p1',
          idempotencyKey: 'circular',
          requestFingerprint: REQUEST_FINGERPRINT,
          result: { unsupported: 1n },
        }),
      (error: unknown) => error instanceof InvalidAuthoringOperationFieldError,
    )
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringOperationRepository validates path-bearing fields and rejects corrupt records', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-operation-path-'))
  try {
    const repo = new AuthoringOperationRepository({ dataDir })
    const sentinel = path.join(dataDir, 'sentinel')
    fs.writeFileSync(sentinel, 'keep')
    for (const projectId of ['../p1', 'P1', 'p1/p2', 'p1\\p2']) {
      assert.throws(
        () => repo.get(projectId, 'key'),
        (error: unknown) => error instanceof InvalidAuthoringOperationFieldError,
      )
    }
    for (const stagingRelativePath of ['../stage', 'nested/stage', 'nested\\stage', '.', 'CON']) {
      assert.throws(
        () =>
          repo.prepare({
            projectId: 'p1',
            idempotencyKey: `key-${stagingRelativePath}`,
            requestFingerprint: REQUEST_FINGERPRINT,
            targetProjectSha256: TARGET_PROJECT_SHA256,
            targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
            stagingRelativePath,
          }),
        (error: unknown) => error instanceof InvalidAuthoringOperationFieldError,
      )
    }

    repo.prepare({
      projectId: 'p1',
      idempotencyKey: '../raw-key-is-hashed',
      requestFingerprint: REQUEST_FINGERPRINT,
      targetProjectSha256: TARGET_PROJECT_SHA256,
      targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
    })
    const keyHash = crypto.createHash('sha256').update('../raw-key-is-hashed').digest('hex')
    const operationFile = path.join(repo.rootDir(), 'p1', `${keyHash}.json`)
    const corrupt = JSON.parse(fs.readFileSync(operationFile, 'utf8')) as Record<string, unknown>
    corrupt.unexpected = true
    fs.writeFileSync(operationFile, JSON.stringify(corrupt))
    assert.throws(
      () => repo.get('p1', '../raw-key-is-hashed'),
      (error: unknown) => error instanceof AuthoringOperationCorruptError,
    )
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep')
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringOperationRepository reports a live per-key journal lock', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-operation-lock-'))
  try {
    const repo = new AuthoringOperationRepository({ dataDir })
    const key = 'locked-key'
    const keyHash = crypto.createHash('sha256').update(key).digest('hex')
    const operationDir = path.join(repo.rootDir(), 'p1')
    fs.mkdirSync(operationDir, { recursive: true })
    fs.writeFileSync(
      path.join(operationDir, `${keyHash}.json.lock`),
      JSON.stringify({ pid: process.pid }),
    )

    assert.throws(
      () =>
        repo.prepare({
          projectId: 'p1',
          idempotencyKey: key,
          requestFingerprint: REQUEST_FINGERPRINT,
          targetProjectSha256: TARGET_PROJECT_SHA256,
          targetAssetTreeSha256: TARGET_ASSET_TREE_SHA256,
        }),
      (error: unknown) => error instanceof AuthoringOperationBusyError,
    )
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})
