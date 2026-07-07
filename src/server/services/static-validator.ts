/**
 * StaticValidator — verifies a published release directory is fully
 * self-contained: no /api/, no workspace paths, no absolute URLs;
 * every manifest-referenced asset file exists on disk.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { AtlasManifest } from '../../products/atlas/contract/atlas-manifest.js'
import type { CatalogManifest } from '../../products/catalog/contract/catalog-manifest.js'

export interface ValidationFailure {
  code: 'BAD_URL' | 'ABSOLUTE_PATH' | 'MISSING_FILE'
  message: string
  file?: string
}

export interface ValidationReport {
  ok: boolean
  failures: ValidationFailure[]
}

const FORBIDDEN_PATTERNS = [
  /\/api\//,
  /\bworkspace\b/,
  /^\/workspace\//,
]

const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\/)/

function checkString(label: string, value: string | undefined, failures: ValidationFailure[]): void {
  if (!value) return
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(value)) {
      failures.push({ code: 'BAD_URL', message: `${label} contains forbidden pattern: ${value}` })
    }
  }
  if (ABSOLUTE_PATH_PATTERN.test(value)) {
    failures.push({ code: 'ABSOLUTE_PATH', message: `${label} is absolute: ${value}` })
  }
}

function checkAssetFile(
  baseDir: string,
  productDir: string,
  url: string | undefined,
  failures: ValidationFailure[],
): void {
  if (!url) return
  // Strip the leading './' to get a relative path inside the product dir.
  const rel = url.replace(/^\.\//, '')
  const abs = path.join(productDir, rel)
  if (!fs.existsSync(abs)) {
    failures.push({ code: 'MISSING_FILE', message: `manifest asset missing on disk: ${url}`, file: abs })
  }
  void baseDir
}

function checkAtlasManifest(manifest: AtlasManifest, productDir: string): ValidationFailure[] {
  const failures: ValidationFailure[] = []
  checkString('panorama.url', manifest.panorama.url, failures)
  checkAssetFile(productDir, productDir, manifest.panorama.url, failures)
  for (const scene of manifest.scenes) {
    checkString(`scene[${scene.sceneId}].entryUrl`, scene.entryUrl, failures)
    checkAssetFile(productDir, productDir, scene.entryUrl, failures)
  }
  return failures
}

function checkCatalogManifest(manifest: CatalogManifest, productDir: string): ValidationFailure[] {
  const failures: ValidationFailure[] = []
  checkString('panorama.url', manifest.panorama.url, failures)
  checkAssetFile(productDir, productDir, manifest.panorama.url, failures)
  for (const scene of manifest.scenes) {
    checkString(`scene[${scene.sceneId}].entryUrl`, scene.entryUrl, failures)
    checkAssetFile(productDir, productDir, scene.entryUrl, failures)
  }
  return failures
}

export function validateRelease(releaseDir: string): ValidationReport {
  const failures: ValidationFailure[] = []
  for (const product of ['atlas', 'catalog'] as const) {
    const productDir = path.join(releaseDir, product)
    const indexFile = path.join(productDir, 'index.html')
    const appFile = path.join(productDir, 'app.js')
    if (!fs.existsSync(indexFile)) {
      failures.push({ code: 'MISSING_FILE', message: `${product} entry html missing`, file: indexFile })
    }
    if (!fs.existsSync(appFile)) {
      failures.push({ code: 'MISSING_FILE', message: `${product} app.js missing`, file: appFile })
    }
  }
  const atlasManifestPath = path.join(releaseDir, 'atlas', 'manifest.json')
  const catalogManifestPath = path.join(releaseDir, 'catalog', 'manifest.json')

  if (fs.existsSync(atlasManifestPath)) {
    try {
      const atlas = JSON.parse(fs.readFileSync(atlasManifestPath, 'utf-8')) as AtlasManifest
      failures.push(...checkAtlasManifest(atlas, path.join(releaseDir, 'atlas')))
    } catch (err) {
      failures.push({
        code: 'BAD_URL',
        message: `failed to parse atlas manifest: ${(err as Error).message}`,
      })
    }
  }
  if (fs.existsSync(catalogManifestPath)) {
    try {
      const catalog = JSON.parse(fs.readFileSync(catalogManifestPath, 'utf-8')) as CatalogManifest
      failures.push(...checkCatalogManifest(catalog, path.join(releaseDir, 'catalog')))
    } catch (err) {
      failures.push({
        code: 'BAD_URL',
        message: `failed to parse catalog manifest: ${(err as Error).message}`,
      })
    }
  }
  return { ok: failures.length === 0, failures }
}
