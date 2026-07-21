import fs from 'node:fs'
import path from 'node:path'
import type { GuideProject } from '../../domain/project-types.js'
import { compileAtlas } from '../../products/atlas/compiler/atlas-compiler.js'
import { compileCatalog } from '../../products/catalog/compiler/catalog-compiler.js'
import { ProjectRepository } from '../storage/project-repository.js'
import { buildAssetClosure, computeProjectReleaseAssetIds } from './asset-closure.js'
import { buildBrowserRuntimeBundle } from './browser-runtime-packager.js'
import { buildProductShell, type ProductShellProduct } from './product-shell.js'
import { validateProduct, type ValidationReport } from './static-validator.js'
import { requireLocalizedText } from '../../domain/localization.js'

export interface StaticProductBuildResult {
  product: ProductShellProduct
  productDir: string
  manifestPath: string
  report: ValidationReport
}

/** Build one complete, self-contained Atlas or Catalog directory. */
export function buildStaticProduct(options: {
  project: GuideProject
  projects: ProjectRepository
  product: ProductShellProduct
  productDir: string
  now?: () => string
}): StaticProductBuildResult {
  const now = options.now ?? (() => new Date().toISOString())
  const { project, projects, product, productDir } = options
  if (!project.panorama.assetId) {
    throw new Error(`project "${project.id}" has no panorama bound; cannot build ${product}`)
  }

  const referencedAssetIds = computeProjectReleaseAssetIds(project)
  const { closure, assets } = buildAssetClosure({
    projectId: project.id,
    assets: project.assets.byId,
    referencedAssetIds,
  })
  const manifest =
    product === 'atlas'
      ? compileAtlas(project, closure, now).manifest
      : compileCatalog(project, closure, now).manifest

  fs.mkdirSync(productDir, { recursive: true })
  const runtime = buildBrowserRuntimeBundle({ product })
  const defaultLocale = project.localization.defaultLocale
  const shell = buildProductShell(
    requireLocalizedText(project.title, defaultLocale, 'title'),
    runtime.appJs,
    defaultLocale,
  )
  fs.writeFileSync(path.join(productDir, 'index.html'), shell['index.html'])
  fs.writeFileSync(path.join(productDir, 'app.js'), shell['app.js'])
  const manifestPath = path.join(productDir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  copyReferencedAssets(project, projects, assets, productDir)

  const report = validateProduct(productDir, product)
  if (!report.ok) {
    throw new StaticProductValidationError(product, report.failures)
  }
  return { product, productDir, manifestPath, report }
}

function copyReferencedAssets(
  project: GuideProject,
  projects: ProjectRepository,
  assets: Array<{ id: string; kind: string; sourcePath: string }>,
  productDir: string,
): void {
  const projectAssetsRoot = projects.resolveAssetDir(project.id)
  for (const asset of assets) {
    const relativeSourcePath = normalizeAssetSourcePath(asset.sourcePath)
    const sourceAbsolutePath = resolveInside(projectAssetsRoot, relativeSourcePath, asset.id)
    const targetAbsolutePath = resolveInside(
      path.join(productDir, 'assets'),
      relativeSourcePath,
      asset.id,
    )
    if (!fs.existsSync(sourceAbsolutePath)) {
      throw new Error(`asset "${asset.id}" is missing on disk: ${relativeSourcePath}`)
    }
    fs.mkdirSync(path.dirname(targetAbsolutePath), { recursive: true })
    if (asset.kind === 'html-bundle') {
      fs.cpSync(sourceAbsolutePath, targetAbsolutePath, { recursive: true })
    } else {
      fs.copyFileSync(sourceAbsolutePath, targetAbsolutePath)
    }
  }
}

function normalizeAssetSourcePath(sourcePath: string): string {
  return sourcePath
    .replaceAll('\\', '/')
    .replace(/^assets\//, '')
    .replace(/^\/+/, '')
}

function resolveInside(root: string, relativePath: string, assetId: string): string {
  if (!relativePath || relativePath.split('/').includes('..')) {
    throw new Error(`asset "${assetId}" has an invalid sourcePath: ${relativePath}`)
  }
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`asset "${assetId}" escapes its asset directory`)
  }
  return resolvedPath
}

export class StaticProductValidationError extends Error {
  constructor(
    public readonly product: ProductShellProduct,
    public readonly failures: ValidationReport['failures'],
  ) {
    super(
      `${product} static product validation failed: ${failures.map(item => item.message).join('; ')}`,
    )
    this.name = 'StaticProductValidationError'
  }
}
