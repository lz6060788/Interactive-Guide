import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import { AssetRepository, AssetValidationError } from '../../../src/server/storage/asset-repository.js'
import { AssetService } from '../../../src/server/services/asset-service.js'
import { createDraftProject } from '../../../src/domain/project-normalizer.js'

function tmpDataDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-asset-'))
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

test('AssetRepository.registerImage writes file and returns definition', () => {
  const { dir, cleanup } = tmpDataDir()
  const projects = new ProjectRepository({ dataDir: dir })
  const repo = new AssetRepository(projects, { dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  projects.save(project, { expectedRevision: 0 })
  const r = repo.registerImage('p1', { id: 'asset-pano', bytes: Buffer.from('hello'), mimeType: 'image/jpeg', extension: 'jpg' })
  assert.equal(r.definition.kind, 'image')
  assert.match(r.definition.sha256!, /^[a-f0-9]{64}$/)
  assert.equal(r.definition.size, 5)
  cleanup()
})

test('AssetRepository.registerHtmlBundle accepts a valid zip with index.html', () => {
  const { dir, cleanup } = tmpDataDir()
  const projects = new ProjectRepository({ dataDir: dir })
  const repo = new AssetRepository(projects, { dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  projects.save(project, { expectedRevision: 0 })
  const zip = new AdmZip()
  zip.addFile('index.html', Buffer.from('<!doctype html>'))
  zip.addFile('lib/three.js', Buffer.from('// three'))
  const bytes = zip.toBuffer()
  const r = repo.registerHtmlBundle('p1', { id: 'scene-rocket', bytes })
  assert.equal(r.definition.kind, 'html-bundle')
  assert.equal(r.definition.entryPath, 'index.html')
  assert.ok(fs.existsSync(path.join(dir, 'projects/p1/assets/scenes/scene-rocket/index.html')))
  cleanup()
})

test('AssetRepository.registerHtmlBundle rejects zip without index.html', () => {
  const { dir, cleanup } = tmpDataDir()
  const projects = new ProjectRepository({ dataDir: dir })
  const repo = new AssetRepository(projects, { dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  projects.save(project, { expectedRevision: 0 })
  const zip = new AdmZip()
  zip.addFile('main.html', Buffer.from('x'))
  const bytes = zip.toBuffer()
  assert.throws(() => repo.registerHtmlBundle('p1', { id: 'scene-rocket', bytes }), AssetValidationError)
  cleanup()
})

test('AssetRepository.registerHtmlBundle rejects path traversal', () => {
  const { dir, cleanup } = tmpDataDir()
  const projects = new ProjectRepository({ dataDir: dir })
  const repo = new AssetRepository(projects, { dataDir: dir })
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  projects.save(project, { expectedRevision: 0 })
  // Build a malicious zip with raw entry names containing ../ (adm-zip normalizes,
  // so the only way to exercise the traversal guard is to hand-roll the bytes).
  const bytes = buildMaliciousZipWithTraversal()
  assert.throws(() => repo.registerHtmlBundle('p1', { id: 'scene-x', bytes }), AssetValidationError)
  cleanup()
})

/**
 * Build a tiny STORE-method ZIP containing entries whose names contain `..`
 * segments. adm-zip normalizes pathnames during add, so we cannot use it to
 * exercise the traversal guard — instead construct the local file header,
 * central directory, and EOCD by hand with raw Buffer writes.
 */
function buildMaliciousZipWithTraversal(): Buffer {
  const fileA = '../../escape.txt'
  const dataA = Buffer.from('pwned', 'utf-8')
  const fileB = 'index.html'
  const dataB = Buffer.from('safe', 'utf-8')
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return (c ^ 0xffffffff) >>> 0
  }

  const localA = Buffer.alloc(30)
  localA.writeUInt32LE(0x04034b50, 0)
  localA.writeUInt16LE(20, 4)
  localA.writeUInt16LE(0, 6)
  localA.writeUInt16LE(0, 8) // STORE
  localA.writeUInt16LE(0, 10)
  localA.writeUInt16LE(0x21, 12) // 1980-01-01
  localA.writeUInt32LE(crc32(dataA), 14)
  localA.writeUInt32LE(dataA.length, 18)
  localA.writeUInt32LE(dataA.length, 22)
  localA.writeUInt16LE(fileA.length, 26)
  localA.writeUInt16LE(0, 28)
  const localAAll = Buffer.concat([localA, Buffer.from(fileA, 'utf-8'), dataA])

  const localB = Buffer.alloc(30)
  localB.writeUInt32LE(0x04034b50, 0)
  localB.writeUInt16LE(20, 4)
  localB.writeUInt16LE(0, 6)
  localB.writeUInt16LE(0, 8)
  localB.writeUInt16LE(0, 10)
  localB.writeUInt16LE(0x21, 12)
  localB.writeUInt32LE(crc32(dataB), 14)
  localB.writeUInt32LE(dataB.length, 18)
  localB.writeUInt32LE(dataB.length, 22)
  localB.writeUInt16LE(fileB.length, 26)
  localB.writeUInt16LE(0, 28)
  const localBAll = Buffer.concat([localB, Buffer.from(fileB, 'utf-8'), dataB])

  const cdA = Buffer.alloc(46)
  cdA.writeUInt32LE(0x02014b50, 0)
  cdA.writeUInt16LE(20, 4)
  cdA.writeUInt16LE(20, 6)
  cdA.writeUInt16LE(0, 8)
  cdA.writeUInt16LE(0, 10)
  cdA.writeUInt16LE(0, 12)
  cdA.writeUInt16LE(0x21, 14)
  cdA.writeUInt32LE(crc32(dataA), 16)
  cdA.writeUInt32LE(dataA.length, 20)
  cdA.writeUInt32LE(dataA.length, 24)
  cdA.writeUInt16LE(fileA.length, 28)
  cdA.writeUInt16LE(0, 30)
  cdA.writeUInt16LE(0, 32)
  cdA.writeUInt16LE(0, 34)
  cdA.writeUInt16LE(0, 36)
  cdA.writeUInt32LE(0, 38)
  cdA.writeUInt32LE(0, 42)
  const cdAAll = Buffer.concat([cdA, Buffer.from(fileA, 'utf-8')])

  const cdB = Buffer.alloc(46)
  cdB.writeUInt32LE(0x02014b50, 0)
  cdB.writeUInt16LE(20, 4)
  cdB.writeUInt16LE(20, 6)
  cdB.writeUInt16LE(0, 8)
  cdB.writeUInt16LE(0, 10)
  cdB.writeUInt16LE(0, 12)
  cdB.writeUInt16LE(0x21, 14)
  cdB.writeUInt32LE(crc32(dataB), 16)
  cdB.writeUInt32LE(dataB.length, 20)
  cdB.writeUInt32LE(dataB.length, 24)
  cdB.writeUInt16LE(fileB.length, 28)
  cdB.writeUInt16LE(0, 30)
  cdB.writeUInt16LE(0, 32)
  cdB.writeUInt16LE(0, 34)
  cdB.writeUInt16LE(0, 36)
  cdB.writeUInt32LE(0, 38)
  cdB.writeUInt32LE(localAAll.length, 42)
  const cdBAll = Buffer.concat([cdB, Buffer.from(fileB, 'utf-8')])

  const cd = Buffer.concat([cdAAll, cdBAll])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(2, 8)
  eocd.writeUInt16LE(2, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(localAAll.length + localBAll.length, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([localAAll, localBAll, cd, eocd])
}

test('AssetService.registerImage attaches to the project with revision bump', () => {
  const { dir, cleanup } = tmpDataDir()
  const projects = new ProjectRepository({ dataDir: dir })
  const repo = new AssetRepository(projects, { dataDir: dir })
  const service = new AssetService(projects, repo)
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  const r = projects.save(project, { expectedRevision: 0 })
  if (r.conflict) throw new Error('expected save')
  service.registerImage(
    'p1',
    { id: 'asset-pano', bytes: Buffer.from('hello'), mimeType: 'image/jpeg', extension: 'jpg' },
    { expectedRevision: r.revision },
  )
  const reloaded = projects.get('p1')
  assert.ok(reloaded.assets.byId['asset-pano'])
  assert.equal(reloaded.metadata.revision, 2)
  cleanup()
})

test('AssetService.registerImage rejects duplicate asset id', () => {
  const { dir, cleanup } = tmpDataDir()
  const projects = new ProjectRepository({ dataDir: dir })
  const repo = new AssetRepository(projects, { dataDir: dir })
  const service = new AssetService(projects, repo)
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  const r = projects.save(project, { expectedRevision: 0 })
  if (r.conflict) throw new Error('expected save')
  service.registerImage(
    'p1',
    { id: 'asset-pano', bytes: Buffer.from('a'), mimeType: 'image/jpeg', extension: 'jpg' },
    { expectedRevision: r.revision },
  )
  assert.throws(() =>
    service.registerImage(
      'p1',
      { id: 'asset-pano', bytes: Buffer.from('b'), mimeType: 'image/jpeg', extension: 'jpg' },
      { expectedRevision: 2 },
    ),
  )
  cleanup()
})

test('AssetService.remove cleans up asset and references in scenes / routes', () => {
  const { dir, cleanup } = tmpDataDir()
  const projects = new ProjectRepository({ dataDir: dir })
  const repo = new AssetRepository(projects, { dataDir: dir })
  const service = new AssetService(projects, repo)
  const project = createDraftProject({ id: 'p1', title: 'T' })
  project.panorama.assetId = 'asset-pano'
  const r = projects.save(project, { expectedRevision: 0 })
  if (r.conflict) throw new Error('expected save')
  service.registerImage(
    'p1',
    { id: 'asset-pano', bytes: Buffer.from('a'), mimeType: 'image/jpeg', extension: 'jpg' },
    { expectedRevision: r.revision },
  )
  // Manually attach a scene and route that reference the asset
  let p = projects.get('p1')
  p.scenes.push({
    id: 'scene-x',
    title: 'X',
    assetId: 'asset-pano',
    protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
    views: [{ id: 'v1', title: 'v1', activationMessage: { type: 'init' }, categoryIds: [] }],
  })
  p.navigation.routes.push({
    id: 'r1',
    from: { kind: 'panorama' },
    to: { kind: 'scene', sceneId: 'scene-x' },
    transition: { kind: 'video', assetId: 'asset-pano', onFailure: 'cut' },
  })
  const r2 = projects.save(p, { expectedRevision: 2 })
  if (r2.conflict) throw new Error('expected save 2')
  service.remove('p1', 'asset-pano', r2.revision)
  const after = projects.get('p1')
  assert.equal(after.assets.byId['asset-pano'], undefined)
  assert.equal(after.scenes.length, 0)
  assert.equal(after.navigation.routes[0].transition, undefined)
  cleanup()
})
