import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  InvalidReleasePathError,
  ReleaseAlreadyExistsError,
  ReleaseBuildInProgressError,
  ReleaseRepository,
} from '../../../src/server/storage/release-repository.js'

test('ReleaseRepository rejects path segments that could escape the release root', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-release-path-'))
  const sentinel = path.join(dataDir, 'sentinel.txt')
  fs.writeFileSync(sentinel, 'keep')
  try {
    const repo = new ReleaseRepository({ dataDir })
    for (const [projectId, version] of [
      ['../project', '1.0.0'],
      ['p1', '..'],
      ['p1', '../..'],
      ['p1', 'nested/version'],
      ['p1', 'nested\\version'],
      ['p1', 'CON'],
    ]) {
      assert.throws(
        () => repo.releaseDir(projectId!, version!),
        (error: unknown) => error instanceof InvalidReleasePathError,
      )
    }
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep')
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('ReleaseRepository commits one immutable version and refuses replacement', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-release-immutable-'))
  try {
    const repo = new ReleaseRepository({ dataDir })
    const transaction = repo.beginRelease('p1', '1.0.0')
    fs.writeFileSync(
      path.join(transaction.stagingDir, 'release.json'),
      JSON.stringify({
        projectId: 'p1',
        projectVersion: '1.0.0',
        schemaVersion: '1.0.0',
        generatedAt: '2026-07-21T00:00:00.000Z',
        sourceRevision: 1,
        products: {
          atlas: { entry: 'atlas/index.html', manifest: 'atlas/manifest.json' },
          catalog: { entry: 'catalog/index.html', manifest: 'catalog/manifest.json' },
        },
      }),
    )
    transaction.commit()

    assert.deepEqual(repo.listVersions('p1'), ['1.0.0'])
    assert.throws(
      () => repo.beginRelease('p1', '1.0.0'),
      (error: unknown) => error instanceof ReleaseAlreadyExistsError,
    )
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('ReleaseRepository hides staging and incomplete directories from version listings', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-release-list-'))
  try {
    const repo = new ReleaseRepository({ dataDir })
    const projectRoot = path.dirname(repo.releaseDir('p1', '1.0.0'))
    const staging = path.join(projectRoot, '.release-staging-dead')
    fs.mkdirSync(staging, { recursive: true })
    fs.writeFileSync(path.join(staging, 'release.json'), '{}')
    fs.mkdirSync(path.join(projectRoot, '2.0.0'), { recursive: true })

    assert.deepEqual(repo.listVersions('p1'), [])
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('ReleaseRepository gives one builder exclusive ownership of a version', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-release-lock-'))
  try {
    const repo = new ReleaseRepository({ dataDir })
    const first = repo.beginRelease('p1', '1.0.0')
    assert.throws(
      () => repo.beginRelease('p1', '1.0.0'),
      (error: unknown) => error instanceof ReleaseBuildInProgressError,
    )
    first.rollback()

    const retry = repo.beginRelease('p1', '1.0.0')
    retry.rollback()
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})
