import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import { createDraftProject } from '../../../src/domain/project-normalizer.js'
import type { GuideProject } from '../../../src/domain/project-types.js'

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

test('ProjectRepository persists projects to disk and reloads on next instantiation', () => {
  const { dir, cleanup } = tmpDataDir()
  const repo1 = new ProjectRepository({ dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  repo1.save(project, { expectedRevision: 0 })
  // create a new instance reading from same dir
  const repo2 = new ProjectRepository({ dataDir: dir })
  const reloaded = repo2.get('p1')
  assert.equal(reloaded.title, 'T')
  assert.equal(reloaded.metadata.revision, 1)
  cleanup()
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
  await new Promise((r) => setTimeout(r, 5))
  repo.save(b, { expectedRevision: 0 })
  const list = repo.list()
  assert.equal(list[0].id, 'b')
  assert.equal(list[1].id, 'a')
  cleanup()
})
