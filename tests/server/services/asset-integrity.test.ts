import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDraftProject } from '../../../src/domain/project-normalizer.js'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import {
  AssetIntegrityError,
  hashAssetClosureAtRoot,
  hashProjectAssetClosure,
} from '../../../src/server/services/asset-integrity.js'

test('asset closure hash follows normalized file paths and actual bytes', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-asset-integrity-'))
  try {
    const projects = new ProjectRepository({ dataDir })
    const project = createDraftProject({ id: 'p1', title: 'T' })
    project.panorama.assetId = 'pano'
    project.assets.byId.pano = {
      id: 'pano',
      kind: 'image',
      sourcePath: 'images/pano/image.jpg',
    }
    projects.save(project, { expectedRevision: 0 })
    const sourceRoot = projects.resolveAssetDir('p1')
    fs.mkdirSync(path.join(sourceRoot, 'images', 'pano'), { recursive: true })
    fs.writeFileSync(path.join(sourceRoot, 'images', 'pano', 'image.jpg'), 'approved')

    const approvedHash = hashProjectAssetClosure(projects.get('p1'), projects)
    const stagedRoot = path.join(dataDir, 'staged-assets')
    fs.cpSync(sourceRoot, stagedRoot, { recursive: true })
    assert.equal(hashAssetClosureAtRoot(projects.get('p1'), stagedRoot), approvedHash)

    fs.writeFileSync(path.join(stagedRoot, 'images', 'pano', 'image.jpg'), 'tampered')
    assert.notEqual(hashAssetClosureAtRoot(projects.get('p1'), stagedRoot), approvedHash)
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('html bundle nested file changes update the asset closure hash', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-asset-integrity-bundle-'))
  try {
    const projects = new ProjectRepository({ dataDir })
    const project = createDraftProject({ id: 'p1', title: 'T' })
    project.panorama.assetId = 'bundle'
    project.assets.byId.bundle = {
      id: 'bundle',
      kind: 'html-bundle',
      sourcePath: 'scenes/bundle',
      entryPath: 'index.html',
    }
    projects.save(project, { expectedRevision: 0 })

    const bundleRoot = path.join(projects.resolveAssetDir('p1'), 'scenes', 'bundle')
    fs.mkdirSync(path.join(bundleRoot, 'nested'), { recursive: true })
    fs.writeFileSync(path.join(bundleRoot, 'index.html'), '<main>bundle</main>')
    const nestedFile = path.join(bundleRoot, 'nested', 'content.json')
    fs.writeFileSync(nestedFile, '{"state":"approved"}')

    const approvedHash = hashProjectAssetClosure(projects.get('p1'), projects)
    fs.writeFileSync(nestedFile, '{"state":"changed"}')

    assert.notEqual(hashProjectAssetClosure(projects.get('p1'), projects), approvedHash)
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})

test('asset closure hash rejects symbolic links and junctions', t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-asset-integrity-link-'))
  try {
    const projects = new ProjectRepository({ dataDir })
    const project = createDraftProject({ id: 'p1', title: 'T' })
    project.panorama.assetId = 'bundle'
    project.assets.byId.bundle = {
      id: 'bundle',
      kind: 'html-bundle',
      sourcePath: 'scenes/bundle',
      entryPath: 'index.html',
    }
    projects.save(project, { expectedRevision: 0 })

    const externalRoot = path.join(dataDir, 'external-bundle')
    fs.mkdirSync(externalRoot, { recursive: true })
    fs.writeFileSync(path.join(externalRoot, 'index.html'), '<main>outside</main>')
    const scenesRoot = path.join(projects.resolveAssetDir('p1'), 'scenes')
    fs.mkdirSync(scenesRoot, { recursive: true })
    const bundleLink = path.join(scenesRoot, 'bundle')

    try {
      fs.symlinkSync(externalRoot, bundleLink, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code && ['EACCES', 'EINVAL', 'ENOSYS', 'ENOTSUP', 'EPERM', 'UNKNOWN'].includes(code)) {
        t.skip(`symbolic link creation is unavailable on this platform (${code})`)
        return
      }
      throw error
    }

    assert.throws(
      () => hashProjectAssetClosure(projects.get('p1'), projects),
      (error: unknown) => error instanceof AssetIntegrityError,
    )
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})
