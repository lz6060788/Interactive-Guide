import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  AuthoringBlobHashMismatchError,
  AuthoringBlobNotFoundError,
  AuthoringBlobRepository,
  AuthoringBlobSizeMismatchError,
  AuthoringBlobTooLargeError,
  InvalidAuthoringBlobDigestError,
  InvalidAuthoringBlobSizeError,
} from '../../../src/server/storage/authoring-blob-repository.js'

function fixture(): { bytes: Buffer; sha256: string } {
  const bytes = Buffer.from('offline authoring material')
  return { bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
}

test('AuthoringBlobRepository stores and verifies a content-addressed blob', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-blob-'))
  try {
    const repo = new AuthoringBlobRepository({ dataDir })
    const { bytes, sha256 } = fixture()

    assert.deepEqual(repo.put({ sha256, size: bytes.byteLength, bytes }), {
      sha256,
      size: bytes.byteLength,
    })
    assert.equal(repo.has(sha256), true)
    assert.deepEqual(repo.stat(sha256), { sha256, size: bytes.byteLength })
    assert.deepEqual(repo.verify(sha256, bytes.byteLength), {
      sha256,
      size: bytes.byteLength,
    })
    const storedPath = repo.getPath(sha256)
    assert.equal(path.dirname(storedPath), path.join(repo.rootDir(), sha256.slice(0, 2)))
    assert.deepEqual(fs.readFileSync(storedPath), bytes)
    assert.deepEqual(fs.readdirSync(path.dirname(storedPath)), [sha256])
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringBlobRepository treats an identical repeated put as immutable and idempotent', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-blob-idempotent-'))
  try {
    const repo = new AuthoringBlobRepository({ dataDir })
    const { bytes, sha256 } = fixture()
    repo.put({ sha256, size: bytes.byteLength, bytes })
    const storedPath = repo.getPath(sha256)
    const firstMtime = fs.statSync(storedPath).mtimeMs

    assert.deepEqual(repo.put({ sha256, size: bytes.byteLength, bytes }), {
      sha256,
      size: bytes.byteLength,
    })
    assert.equal(fs.statSync(storedPath).mtimeMs, firstMtime)
    assert.deepEqual(fs.readdirSync(path.dirname(storedPath)), [sha256])
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringBlobRepository streams chunks with bounded accounting before atomic commit', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-blob-stream-'))
  try {
    const repo = new AuthoringBlobRepository({ dataDir })
    const { bytes, sha256 } = fixture()
    async function* chunks(): AsyncIterable<Uint8Array> {
      yield bytes.subarray(0, 3)
      yield bytes.subarray(3, 11)
      yield bytes.subarray(11)
    }

    assert.deepEqual(
      await repo.putStream({ sha256, size: bytes.byteLength, chunks: chunks(), maxBytes: 64 }),
      { sha256, size: bytes.byteLength },
    )
    assert.deepEqual(fs.readFileSync(repo.getPath(sha256)), bytes)
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringBlobRepository rejects truncated, oversized, and incorrectly hashed input without residue', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-blob-invalid-'))
  try {
    const repo = new AuthoringBlobRepository({ dataDir })
    const { bytes, sha256 } = fixture()
    assert.throws(
      () => repo.put({ sha256, size: bytes.byteLength + 1, bytes }),
      (error: unknown) => error instanceof AuthoringBlobSizeMismatchError,
    )
    assert.throws(
      () => repo.put({ sha256: '0'.repeat(64), size: bytes.byteLength, bytes }),
      (error: unknown) => error instanceof AuthoringBlobHashMismatchError,
    )

    async function* oversized(): AsyncIterable<Uint8Array> {
      yield bytes.subarray(0, 4)
      yield bytes.subarray(4)
    }
    await assert.rejects(
      repo.putStream({ sha256, size: bytes.byteLength, chunks: oversized(), maxBytes: 8 }),
      (error: unknown) => error instanceof AuthoringBlobTooLargeError,
    )
    assert.equal(repo.stat(sha256), null)
    const files = fs
      .readdirSync(repo.rootDir(), { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
    assert.equal(files.length, 0)
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringBlobRepository fails closed when an existing digest path is corrupt', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-blob-corrupt-'))
  try {
    const repo = new AuthoringBlobRepository({ dataDir })
    const { bytes, sha256 } = fixture()
    const corruptPath = path.join(repo.rootDir(), sha256.slice(0, 2), sha256)
    fs.mkdirSync(path.dirname(corruptPath), { recursive: true })
    fs.writeFileSync(corruptPath, Buffer.alloc(bytes.byteLength, 1))

    assert.throws(
      () => repo.put({ sha256, size: bytes.byteLength, bytes }),
      (error: unknown) => error instanceof AuthoringBlobHashMismatchError,
    )
    assert.deepEqual(fs.readFileSync(corruptPath), Buffer.alloc(bytes.byteLength, 1))
    assert.deepEqual(fs.readdirSync(path.dirname(corruptPath)), [sha256])
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('AuthoringBlobRepository validates digest, byte counts, limits, and missing objects', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-authoring-blob-path-'))
  try {
    const repo = new AuthoringBlobRepository({ dataDir })
    const sentinel = path.join(dataDir, 'sentinel')
    fs.writeFileSync(sentinel, 'keep')
    for (const digest of ['../blob', 'A'.repeat(64), '0'.repeat(63), '0'.repeat(65)]) {
      assert.throws(
        () => repo.has(digest),
        (error: unknown) => error instanceof InvalidAuthoringBlobDigestError,
      )
    }
    const missing = '0'.repeat(64)
    assert.throws(
      () => repo.getPath(missing),
      (error: unknown) => error instanceof AuthoringBlobNotFoundError,
    )
    assert.throws(
      () => repo.put({ sha256: missing, size: -1, bytes: Buffer.alloc(0) }),
      (error: unknown) => error instanceof InvalidAuthoringBlobSizeError,
    )
    assert.throws(
      () => repo.put({ sha256: missing, size: 1, bytes: Buffer.alloc(1), maxBytes: 0 }),
      (error: unknown) => error instanceof InvalidAuthoringBlobSizeError,
    )
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep')
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})
