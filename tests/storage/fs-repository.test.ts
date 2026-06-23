import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { FsRepository } from '../../src/server/storage/fs-repository.js'
import type { KnowledgePackage, PackageBuildRecord } from '../../src/shared/types.js'

function createRepo(): { repo: FsRepository; dir: string; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-test-repo-'))
  const workspaceDir = path.join(tmpDir, 'workspace')
  fs.mkdirSync(workspaceDir, { recursive: true })
  const repo = new FsRepository(tmpDir)
  return { repo, dir: tmpDir, cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) }
}

function makeGuide(id: string): KnowledgePackage {
  return {
    id,
    title: `Guide ${id}`,
    version: '1.0.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [{ id: 'root', title: 'Root', keyContent: 'content', nodeKind: 'image' as const, imageUrl: '', hotspots: [] }],
    edges: [],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
  }
}

function makeGenerate(guideId: string, buildId: string): PackageBuildRecord {
  return {
    buildId,
    packageId: guideId,
    packageVersion: '1.0.0',
    status: 'running',
    currentStage: 'gen_nodes',
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt: '2026-06-23T00:00:00.000Z',
    summary: { nodeTotal: 1, nodeSuccess: 0, hotspotTotal: 0, hotspotReady: 0, edgeTotal: 0, edgeSuccess: 0 },
  }
}

// ─── Guide persistence ────────────────────────────────────────

test('FsRepository saves and loads a guide from workspace', () => {
  const { repo, cleanup } = createRepo()
  try {
    const guide = makeGuide('g1')
    repo.saveGuide(guide)

    const loaded = repo.loadAllGuides().get('g1')
    assert.ok(loaded)
    assert.equal(loaded.title, 'Guide g1')
  } finally {
    cleanup()
  }
})

test('FsRepository.refresh reloads guides from disk', () => {
  const { repo, dir, cleanup } = createRepo()
  try {
    // Write directly to workspace dir (bypassing repo)
    const guide = makeGuide('disk-guide')
    const guideDir = path.join(dir, 'workspace', 'disk-guide')
    fs.mkdirSync(guideDir, { recursive: true })
    fs.writeFileSync(path.join(guideDir, 'guide.json'), JSON.stringify(guide, null, 2))

    // Before refresh, old state
    assert.equal(repo.loadAllGuides().size, 0)

    repo.refresh()
    assert.equal(repo.loadAllGuides().size, 1)
    assert.ok(repo.loadAllGuides().get('disk-guide'))
  } finally {
    cleanup()
  }
})

test('FsRepository.deleteGuide removes guide from disk and memory', () => {
  const { repo, dir, cleanup } = createRepo()
  try {
    const guide = makeGuide('g1')
    repo.saveGuide(guide)

    repo.deleteGuide('g1')
    assert.equal(repo.loadAllGuides().size, 0)

    // Verify disk removal
    const guidePath = path.join(dir, 'workspace', 'g1', 'guide.json')
    assert.equal(fs.existsSync(guidePath), false)
  } finally {
    cleanup()
  }
})

// ─── Generate records ──────────────────────────────────────────

test('FsRepository saves and loads generate records', () => {
  const { repo, cleanup } = createRepo()
  try {
    const gen = makeGenerate('g1', 'gen-123')
    repo.saveGenerateRecord(gen)

    const loaded = repo.loadGenerateRecord('gen-123')
    assert.ok(loaded)
    assert.equal(loaded.packageId, 'g1')
    assert.equal(loaded.status, 'running')

    const all = repo.loadAllGenerates()
    assert.equal(all.size, 1)
  } finally {
    cleanup()
  }
})

// ─── File I/O helpers ──────────────────────────────────────────

test('FsRepository.writeJson and readJson roundtrip', () => {
  const { repo, cleanup } = createRepo()
  try {
    const data = { key: 'value', nested: { a: 1 } }
    repo.writeJson('test/data.json', data)

    const loaded = repo.readJson<typeof data>('test/data.json')
    assert.ok(loaded)
    assert.equal(loaded.key, 'value')
    assert.equal(loaded.nested.a, 1)
  } finally {
    cleanup()
  }
})

test('FsRepository.readJson returns null for missing file', () => {
  const { repo, cleanup } = createRepo()
  try {
    const result = repo.readJson('nonexistent/file.json')
    assert.equal(result, null)
  } finally {
    cleanup()
  }
})

test('FsRepository.writeFile and readFile roundtrip binary data', () => {
  const { repo, cleanup } = createRepo()
  try {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff])
    repo.writeFile('test/binary.bin', buf)

    const loaded = repo.readFile('test/binary.bin')
    assert.ok(loaded)
    assert.ok(Buffer.isBuffer(loaded))
    assert.equal(loaded.length, 4)
    assert.equal(loaded[0], 0x00)
    assert.equal(loaded[3], 0xff)
  } finally {
    cleanup()
  }
})

test('FsRepository.readFile returns null for missing file', () => {
  const { repo, cleanup } = createRepo()
  try {
    const result = repo.readFile('nonexistent/file.bin')
    assert.equal(result, null)
  } finally {
    cleanup()
  }
})

test('FsRepository.fileExists reports correctly', () => {
  const { repo, cleanup } = createRepo()
  try {
    assert.equal(repo.fileExists('nothing/here.txt'), false)
    repo.writeJson('test/check.json', { ok: true })
    assert.equal(repo.fileExists('test/check.json'), true)
  } finally {
    cleanup()
  }
})

test('FsRepository.ensureDir creates directory structure', () => {
  const { repo, dir, cleanup } = createRepo()
  try {
    repo.ensureDir('deep/nested/path')
    const fullPath = path.join(dir, 'deep', 'nested', 'path')
    assert.equal(fs.existsSync(fullPath), true)
    assert.equal(fs.statSync(fullPath).isDirectory(), true)
  } finally {
    cleanup()
  }
})
