/**
 * StaticValidator — verifies a published release directory is fully
 * self-contained: no /api/, no workspace paths, no absolute URLs;
 * every manifest-referenced asset file exists on disk.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { AtlasManifest } from '../../products/atlas/contract/atlas-manifest.js'
import type { CatalogManifest } from '../../products/catalog/contract/catalog-manifest.js'
import type { GalleryManifest } from '../../products/gallery/contract/gallery-manifest.js'
import { assertEs5Syntax } from './browser-runtime-packager.js'
import type { ProductShellProduct } from './product-shell.js'

export interface ValidationFailure {
  code: 'BAD_URL' | 'ABSOLUTE_PATH' | 'MISSING_FILE' | 'BAD_HTML' | 'BAD_SCRIPT'
  message: string
  file?: string
}

export interface ValidationReport {
  ok: boolean
  failures: ValidationFailure[]
}

const FORBIDDEN_PATTERNS = [/\/api\//, /\bworkspace\b/, /^\/workspace\//]

const ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:[\\/]|\/)/

function checkString(
  label: string,
  value: string | undefined,
  failures: ValidationFailure[],
): void {
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
    failures.push({
      code: 'MISSING_FILE',
      message: `manifest asset missing on disk: ${url}`,
      file: abs,
    })
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

function checkGalleryManifest(manifest: GalleryManifest, productDir: string): ValidationFailure[] {
  const failures: ValidationFailure[] = []
  for (const item of manifest.items) {
    checkString(`items[${item.id}].image.url`, item.image.url, failures)
    checkAssetFile(productDir, productDir, item.image.url, failures)
  }
  return failures
}

export function validateRelease(
  releaseDir: string,
  products: readonly ProductShellProduct[] = ['atlas', 'catalog'],
): ValidationReport {
  const failures: ValidationFailure[] = []
  for (const product of products) {
    const productDir = path.join(releaseDir, product)
    failures.push(...validateProduct(productDir, product).failures)
  }
  return { ok: failures.length === 0, failures }
}

export function validateProduct(
  productDir: string,
  product: ProductShellProduct,
): ValidationReport {
  const failures: ValidationFailure[] = []
  const indexFile = path.join(productDir, 'index.html')
  const appFile = path.join(productDir, 'app.js')
  const manifestFile = path.join(productDir, 'manifest.json')

  if (!fs.existsSync(indexFile)) {
    failures.push({
      code: 'MISSING_FILE',
      message: `${product} entry html missing`,
      file: indexFile,
    })
  } else {
    const html = fs.readFileSync(indexFile, 'utf8')
    if (
      /type\s*=\s*["']module["']/i.test(html) ||
      !/<script\s+src=["']\.\/app\.js["']><\/script>/i.test(html)
    ) {
      failures.push({
        code: 'BAD_HTML',
        message: `${product} index.html must load ./app.js as a classic script`,
        file: indexFile,
      })
    }
  }

  if (!fs.existsSync(appFile)) {
    failures.push({ code: 'MISSING_FILE', message: `${product} app.js missing`, file: appFile })
  } else {
    const appJs = fs.readFileSync(appFile, 'utf8')
    try {
      assertEs5Syntax(appJs, `${product} app.js`)
    } catch (error) {
      failures.push({
        code: 'BAD_SCRIPT',
        message: (error as Error).message,
        file: appFile,
      })
    }
  }

  if (!fs.existsSync(manifestFile)) {
    failures.push({
      code: 'MISSING_FILE',
      message: `${product} manifest.json missing`,
      file: manifestFile,
    })
  } else {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as
        | AtlasManifest
        | CatalogManifest
        | GalleryManifest
      failures.push(
        ...(product === 'atlas'
          ? checkAtlasManifest(manifest as AtlasManifest, productDir)
          : product === 'catalog'
            ? checkCatalogManifest(manifest as CatalogManifest, productDir)
            : checkGalleryManifest(manifest as GalleryManifest, productDir)),
      )
    } catch (error) {
      failures.push({
        code: 'BAD_URL',
        message: `failed to parse ${product} manifest: ${(error as Error).message}`,
        file: manifestFile,
      })
    }
  }

  return { ok: failures.length === 0, failures }
}
