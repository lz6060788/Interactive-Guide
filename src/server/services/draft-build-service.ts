/**
 * DraftBuildService — compiles a single product (atlas or catalog)
 * preview for a project. Writes the manifest + asset closure into a
 * scratch directory and returns the entry URL the editor can mount.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { GuideProject } from '../../domain/project-types.js'
import { ProjectRepository } from '../storage/project-repository.js'
import { compileAtlas } from '../../products/atlas/compiler/atlas-compiler.js'
import { compileCatalog } from '../../products/catalog/compiler/catalog-compiler.js'
import {
  buildAssetClosure,
  computeReferencedAssetIds,
} from './asset-closure.js'
import { writeBrowserRuntimePackage } from './browser-runtime-packager.js'
import { buildProductShell } from './product-shell.js'

export type DraftProduct = 'atlas' | 'catalog'

export interface DraftBuildResult {
  product: DraftProduct
  entryUrl: string
  manifestPath: string
  draftDir: string
}

export class DraftBuildService {
  private readonly projects: ProjectRepository
  private readonly root: string

  constructor(projects: ProjectRepository, opts: { dataDir?: string } = {}) {
    this.projects = projects
    this.root = path.join(opts.dataDir ?? path.resolve('data'), 'draft-builds')
    fs.mkdirSync(this.root, { recursive: true })
  }

  rootDir(): string {
    return this.root
  }

  buildDraft(projectId: string, product: DraftProduct, now: () => string = () => new Date().toISOString()): DraftBuildResult {
    const project = this.projects.get(projectId)
    if (!project.panorama.assetId) {
      throw new Error(`project "${projectId}" has no panorama bound; cannot draft build`)
    }

    const sceneAssetIds = new Set(project.scenes.map((s) => s.assetId))
    const transitionAssetIds = new Set<string>()
    const reachableRoutes = project.navigation.routes.filter(
      (r) => r.from.kind === 'panorama' || ('sceneId' in r.from && sceneAssetIds.has(r.from.sceneId)),
    )
    for (const r of reachableRoutes) {
      if (r.transition?.assetId) transitionAssetIds.add(r.transition.assetId)
    }
    const referencedAssetIds = computeReferencedAssetIds(
      project.panorama.assetId,
      sceneAssetIds,
      transitionAssetIds,
    )

    const { closure, assets } = buildAssetClosure({
      projectId,
      assets: project.assets.byId,
      referencedAssetIds,
    })

    const draftDir = path.join(this.root, projectId, `${product}-${Date.now()}`)
    fs.mkdirSync(draftDir, { recursive: true })
    const productDir = path.join(draftDir, product)
    fs.mkdirSync(productDir, { recursive: true })

    const manifest =
      product === 'atlas'
        ? compileAtlas(project, closure, now).manifest
        : compileCatalog(project, closure, now).manifest

    const runtimePackage = writeBrowserRuntimePackage({
      entrySourcePath: path.join(
        path.resolve('src'),
        'product-shell',
        'browser',
        product === 'atlas' ? 'atlas-entry.ts' : 'catalog-entry.ts',
      ),
      outputDir: productDir,
    })
    const shellFiles = buildProductShell(product, runtimePackage.entryModulePath)
    fs.writeFileSync(path.join(productDir, 'index.html'), shellFiles['index.html'])
    fs.writeFileSync(path.join(productDir, 'app.js'), shellFiles['app.js'])
    const manifestPath = path.join(productDir, 'manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    this.copyReferencedAssets(project, assets, productDir)

    return {
      product,
      entryUrl: `./${product}/index.html`,
      manifestPath,
      draftDir,
    }
  }

  private copyReferencedAssets(
    project: GuideProject,
    assets: Array<{ id: string; kind: string; sourcePath: string }>,
    productDir: string,
  ): void {
    const projectAssetsRoot = this.projects.resolveAssetDir(project.id)
    for (const asset of assets) {
      const normalizedSourcePath = normalizeAssetSourcePath(asset.sourcePath)
      const sourceAbsolutePath = path.join(projectAssetsRoot, normalizedSourcePath)
      const targetAbsolutePath = path.join(productDir, 'assets', normalizedSourcePath)
      fs.mkdirSync(path.dirname(targetAbsolutePath), { recursive: true })
      if (asset.kind === 'html-bundle') {
        fs.cpSync(sourceAbsolutePath, targetAbsolutePath, { recursive: true })
      } else {
        fs.copyFileSync(sourceAbsolutePath, targetAbsolutePath)
      }
    }
  }
}

function normalizeAssetSourcePath(sourcePath: string): string {
  return sourcePath.startsWith('assets/') ? sourcePath.slice('assets/'.length) : sourcePath
}
