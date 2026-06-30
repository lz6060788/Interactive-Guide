/**
 * ReleaseRepository — file-system storage for published releases.
 *
 * Layout:
 *   data/releases/{projectId}/{version}/
 *   ├─ release.json
 *   ├─ atlas/
 *   │  ├─ index.html
 *   │  ├─ app.js
 *   │  ├─ manifest.json
 *   │  └─ assets/...
 *   └─ catalog/
 *      └─ (same structure)
 */
import fs from 'node:fs'
import path from 'node:path'
import type { AtlasManifest } from '../../products/atlas/contract/atlas-manifest.js'
import type { CatalogManifest } from '../../products/catalog/contract/catalog-manifest.js'

export interface ReleaseManifest {
  projectId: string
  projectVersion: string
  schemaVersion: '1.0.0'
  generatedAt: string
  sourceRevision: number
  products: {
    atlas: { entry: string; manifest: string }
    catalog: { entry: string; manifest: string }
  }
}

export class ReleaseRepository {
  private readonly root: string

  constructor(opts: { dataDir?: string } = {}) {
    this.root = path.join(opts.dataDir ?? path.resolve('data'), 'releases')
    fs.mkdirSync(this.root, { recursive: true })
  }

  releaseDir(projectId: string, version: string): string {
    return path.join(this.root, projectId, version)
  }

  listVersions(projectId: string): string[] {
    const dir = path.join(this.root, projectId)
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  }

  readRelease(projectId: string, version: string): ReleaseManifest | null {
    const file = path.join(this.releaseDir(projectId, version), 'release.json')
    if (!fs.existsSync(file)) return null
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as ReleaseManifest
    } catch {
      return null
    }
  }

  writeRelease(projectId: string, version: string, manifest: ReleaseManifest): void {
    const dir = this.releaseDir(projectId, version)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(manifest, null, 2))
  }

  writeAtlasFiles(projectId: string, version: string, files: { 'index.html': string; 'app.js': string; 'manifest.json': string; assets: Map<string, Buffer> }): void {
    const dir = path.join(this.releaseDir(projectId, version), 'atlas')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), files['index.html'])
    fs.writeFileSync(path.join(dir, 'app.js'), files['app.js'])
    fs.writeFileSync(path.join(dir, 'manifest.json'), files['manifest.json'])
    const assetsDir = path.join(dir, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    for (const [name, buf] of files.assets) {
      const target = path.join(assetsDir, name)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, buf)
    }
  }

  writeCatalogFiles(projectId: string, version: string, files: { 'index.html': string; 'app.js': string; 'manifest.json': string; assets: Map<string, Buffer> }): void {
    const dir = path.join(this.releaseDir(projectId, version), 'catalog')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), files['index.html'])
    fs.writeFileSync(path.join(dir, 'app.js'), files['app.js'])
    fs.writeFileSync(path.join(dir, 'manifest.json'), files['manifest.json'])
    const assetsDir = path.join(dir, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    for (const [name, buf] of files.assets) {
      const target = path.join(assetsDir, name)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, buf)
    }
  }

  /**
   * Atomically swap a release directory. Writes everything to a sibling
   * _tmp directory first, then renames into place. Existing release is
   * preserved if any step fails.
   */
  commit(projectId: string, version: string): void {
    const finalDir = this.releaseDir(projectId, version)
    const tmpDir = `${finalDir}__tmp`
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
    if (!fs.existsSync(tmpDir)) {
      throw new Error(`commit: tmp dir ${tmpDir} does not exist — caller must build first`)
    }
    if (fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true, force: true })
    fs.renameSync(tmpDir, finalDir)
  }
}
