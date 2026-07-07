/**
 * StaticValidator tests — verify forbidden patterns and missing files
 * are detected.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { validateRelease } from '../../../src/server/services/static-validator.js'

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'release-'))
}

function writeAtlasManifest(dir: string, manifest: object): void {
  const atlasDir = path.join(dir, 'atlas')
  fs.mkdirSync(atlasDir, { recursive: true })
  fs.writeFileSync(path.join(atlasDir, 'index.html'), '<!doctype html>')
  fs.writeFileSync(path.join(atlasDir, 'app.js'), 'console.log("atlas")')
  fs.writeFileSync(path.join(atlasDir, 'manifest.json'), JSON.stringify(manifest))
}

function writeCatalogManifest(dir: string, manifest: object): void {
  const catDir = path.join(dir, 'catalog')
  fs.mkdirSync(catDir, { recursive: true })
  fs.writeFileSync(path.join(catDir, 'index.html'), '<!doctype html>')
  fs.writeFileSync(path.join(catDir, 'app.js'), 'console.log("catalog")')
  fs.writeFileSync(path.join(catDir, 'manifest.json'), JSON.stringify(manifest))
}

test('validateRelease passes for clean manifests', () => {
  const dir = mkTmp()
  writeAtlasManifest(dir, {
    panorama: { url: './assets/images/pano/image.jpg' },
    scenes: [],
  })
  writeCatalogManifest(dir, {
    panorama: { url: './assets/images/pano/image.jpg' },
    scenes: [],
  })
  // Create the referenced asset file so MISSING_FILE doesn't fire.
  const assetsDir = path.join(dir, 'atlas', 'assets', 'images', 'pano')
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(path.join(assetsDir, 'image.jpg'), 'fake')
  const catAssetsDir = path.join(dir, 'catalog', 'assets', 'images', 'pano')
  fs.mkdirSync(catAssetsDir, { recursive: true })
  fs.writeFileSync(path.join(catAssetsDir, 'image.jpg'), 'fake')

  const report = validateRelease(dir)
  assert.equal(report.ok, true, JSON.stringify(report.failures))
})

test('validateRelease flags /api/ URLs', () => {
  const dir = mkTmp()
  writeAtlasManifest(dir, {
    panorama: { url: '/api/projects/x/assets/pano/image.jpg' },
    scenes: [],
  })
  writeCatalogManifest(dir, {
    panorama: { url: './assets/images/pano/image.jpg' },
    scenes: [],
  })
  const report = validateRelease(dir)
  assert.equal(report.ok, false)
  assert.ok(report.failures.some((f) => f.code === 'BAD_URL'))
})

test('validateRelease flags absolute paths', () => {
  const dir = mkTmp()
  writeAtlasManifest(dir, {
    panorama: { url: '/etc/passwd' },
    scenes: [],
  })
  writeCatalogManifest(dir, {
    panorama: { url: './assets/images/pano/image.jpg' },
    scenes: [],
  })
  const report = validateRelease(dir)
  assert.ok(report.failures.some((f) => f.code === 'BAD_URL' || f.code === 'ABSOLUTE_PATH'))
})

test('validateRelease flags missing asset files', () => {
  const dir = mkTmp()
  writeAtlasManifest(dir, {
    panorama: { url: './assets/images/pano/image.jpg' },
    scenes: [],
  })
  writeCatalogManifest(dir, {
    panorama: { url: './assets/images/pano/image.jpg' },
    scenes: [],
  })
  // Do NOT create the referenced file.
  const report = validateRelease(dir)
  assert.equal(report.ok, false)
  assert.ok(report.failures.some((f) => f.code === 'MISSING_FILE'))
})

test('validateRelease flags missing shell entry files', () => {
  const dir = mkTmp()
  const atlasDir = path.join(dir, 'atlas')
  const catalogDir = path.join(dir, 'catalog')
  fs.mkdirSync(atlasDir, { recursive: true })
  fs.mkdirSync(catalogDir, { recursive: true })
  fs.writeFileSync(path.join(atlasDir, 'manifest.json'), JSON.stringify({
    panorama: { url: './assets/images/pano/image.jpg' },
    scenes: [],
  }))
  fs.writeFileSync(path.join(catalogDir, 'manifest.json'), JSON.stringify({
    panorama: { url: './assets/images/pano/image.jpg' },
    scenes: [],
  }))
  const report = validateRelease(dir)
  assert.equal(report.ok, false)
  assert.ok(report.failures.some((f) => f.file?.endsWith(path.join('atlas', 'index.html'))))
  assert.ok(report.failures.some((f) => f.file?.endsWith(path.join('catalog', 'app.js'))))
})
