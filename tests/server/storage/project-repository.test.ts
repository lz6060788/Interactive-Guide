import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ProjectCorruptError,
  ProjectRepository,
} from '../../../src/server/storage/project-repository.js'
import { createDraftProject } from '../../../src/domain/project-normalizer.js'

function tmpDataDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-proj-'))
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

test('ProjectRepository starts empty', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo = new ProjectRepository({ dataDir: dir })
  assert.equal(repo.list().length, 0)
  cleanup()
})

test('ProjectRepository.save creates a new project with revision 1', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  const r = repo.save(project, { expectedRevision: 0 })
  assert.equal(r.conflict, false)
  if (!r.conflict) {
    assert.equal(r.revision, 1)
  }
  cleanup()
})

test('ProjectRepository.save rejects when expectedRevision does not match', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  repo.save(project, { expectedRevision: 0 })
  const r2 = repo.save({ ...project, title: 'T2' }, { expectedRevision: 5 })
  assert.equal(r2.conflict, true)
  cleanup()
})

test('ProjectRepository.save increments revision on subsequent saves', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  const r1 = repo.save(project, { expectedRevision: 0 })
  if (r1.conflict) throw new Error('expected save 1')
  const r2 = repo.save({ ...r1.project, title: 'T2' }, { expectedRevision: r1.revision })
  if (r2.conflict) throw new Error('expected save 2')
  assert.equal(r2.revision, 2)
  cleanup()
})

test('ProjectRepository.save honors a transaction-owned timestamp', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  const timestamp = '2026-07-21T12:34:56.789Z'
  const result = repo.save(project, { expectedRevision: 0, timestamp })
  if (result.conflict) throw new Error('expected save')
  assert.equal(result.project.metadata.createdAt, project.metadata.createdAt)
  assert.equal(result.project.metadata.updatedAt, timestamp)
  cleanup()
})

test('ProjectRepository.save rejects a non-canonical transaction timestamp', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  assert.throws(
    () => repo.save(project, { expectedRevision: 0, timestamp: '2026-07-21T12:34:56Z' }),
    /canonical ISO-8601/,
  )
  cleanup()
})

test('ProjectRepository.save reloads disk state even when project.json mtime is preserved', () => {
  const { dir, cleanup } = tmpDataDir()
  const first = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  const created = first.save(project, { expectedRevision: 0 })
  if (created.conflict) throw new Error('expected create')
  const second = new ProjectRepository({ dataDir: dir })
  const projectFile = path.join(dir, 'projects', 'p1', 'project.json')
  const originalStat = fs.statSync(projectFile)
  const changed = JSON.parse(fs.readFileSync(projectFile, 'utf8')) as {
    metadata: { revision: number; updatedAt: string }
  }
  changed.metadata.revision = 2
  changed.metadata.updatedAt = '2026-07-21T12:34:56.789Z'
  fs.writeFileSync(projectFile, JSON.stringify(changed, null, 2))
  fs.utimesSync(projectFile, originalStat.atime, originalStat.mtime)

  const staleSave = second.save(project, { expectedRevision: 1 })
  assert.equal(staleSave.conflict, true)
  if (staleSave.conflict) assert.equal(staleSave.currentRevision, 2)
  cleanup()
})

test('ProjectRepository evicts cached state when project.json is deleted', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  repo.save(project, { expectedRevision: 0 })
  fs.unlinkSync(path.join(dir, 'projects', 'p1', 'project.json'))
  assert.equal(repo.tryGet('p1'), null)
  cleanup()
})

test('ProjectRepository persists projects to disk and reloads on next instantiation', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo1 = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  repo1.save(project, { expectedRevision: 0 })
  // create a new instance reading from same dir
  const repo2 = new ProjectRepository({ dataDir: dir })
  const reloaded = repo2.get('p1')
  assert.deepEqual(reloaded.title, { 'zh-CN': 'T' })
  assert.equal(reloaded.metadata.revision, 1)
  cleanup()
})

test('ProjectRepository fails closed when a hot-reloaded project file is corrupt', () => {
  const { dir, cleanup } = tmpDataDir()
  try {
    const repo = new ProjectRepository({ dataDir: dir })
    const project = createDraftProject({ id: 'p1', title: 'Test' })
    repo.save(project, { expectedRevision: 0 })
    repo.get('p1')

    const projectFile = path.join(dir, 'projects', 'p1', 'project.json')
    fs.writeFileSync(projectFile, '{invalid-json')
    const future = new Date(Date.now() + 5_000)
    fs.utimesSync(projectFile, future, future)

    assert.throws(() => repo.get('p1'), ProjectCorruptError)
  } finally {
    cleanup()
  }
})

test('ProjectRepository.delete removes the project and its directory', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  repo.save(project, { expectedRevision: 0 })
  repo.delete('p1')
  assert.equal(fs.existsSync(path.join(dir, 'projects', 'p1')), false)
  assert.equal(repo.list().length, 0)
  cleanup()
})

test('ProjectRepository.list orders by updatedAt descending', async () => {
  const { dir, cleanup } = tmpDataDir()
  const repo = new ProjectRepository({ dataDir: dir })
  const a = createDraftProject({ id: 'a', title: 'A' })
  a.panorama.assetId = 'asset-pano'
  const b = createDraftProject({ id: 'b', title: 'B' })
  b.panorama.assetId = 'asset-pano'
  repo.save(a, { expectedRevision: 0 })
  await new Promise(r => setTimeout(r, 5))
  repo.save(b, { expectedRevision: 0 })
  const list = repo.list()
  assert.equal(list[0].id, 'b')
  assert.equal(list[1].id, 'a')
  cleanup()
})
