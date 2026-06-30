/**
 * ReleaseService — atomic dual-product release. Builds Atlas and
 * Catalog in parallel into a temp directory, then commits the entire
 * directory via rename. If either product fails, the partial temp is
 * removed and the existing release is untouched.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { GuideProject } from '../../domain/project-types.js'
import { ProjectRepository } from '../storage/project-repository.js'
import { ReleaseRepository, type ReleaseManifest } from '../storage/release-repository.js'
import { compileAtlas } from '../../products/atlas/compiler/atlas-compiler.js'
import { compileCatalog } from '../../products/catalog/compiler/catalog-compiler.js'
import {
  buildAssetClosure,
  computeReferencedAssetIds,
} from './asset-closure.js'
import { validateRelease, type ValidationReport } from './static-validator.js'

export interface ReleaseBuildResult {
  projectId: string
  version: string
  report: ValidationReport
  releaseDir: string
}

export class ReleaseService {
  private readonly projects: ProjectRepository
  private readonly releases: ReleaseRepository

  constructor(projects: ProjectRepository, releases: ReleaseRepository) {
    this.projects = projects
    this.releases = releases
  }

  buildRelease(projectId: string, now: () => string = () => new Date().toISOString()): ReleaseBuildResult {
    const project = this.projects.get(projectId)
    const version = project.version
    const finalDir = this.releases.releaseDir(projectId, version)
    const tmpDir = `${finalDir}__tmp`

    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.mkdirSync(tmpDir, { recursive: true })

    try {
      this.writeProductFiles(project, tmpDir, 'atlas', now)
      this.writeProductFiles(project, tmpDir, 'catalog', now)

      const report = validateRelease(tmpDir)
      if (!report.ok) {
        throw new ReleaseValidationError(report.failures)
      }

      const releaseManifest: ReleaseManifest = {
        projectId,
        projectVersion: project.version,
        schemaVersion: '1.0.0',
        generatedAt: now(),
        sourceRevision: project.metadata.revision,
        products: {
          atlas: { entry: 'atlas/index.html', manifest: 'atlas/manifest.json' },
          catalog: { entry: 'catalog/index.html', manifest: 'catalog/manifest.json' },
        },
      }
      fs.writeFileSync(path.join(tmpDir, 'release.json'), JSON.stringify(releaseManifest, null, 2))

      // Atomic swap
      if (fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true, force: true })
      fs.renameSync(tmpDir, finalDir)

      return { projectId, version, report, releaseDir: finalDir }
    } catch (err) {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
      throw err
    }
  }

  private writeProductFiles(
    project: GuideProject,
    tmpDir: string,
    product: 'atlas' | 'catalog',
    now: () => string,
  ): void {
    if (!project.panorama.assetId) {
      throw new Error(`project "${project.id}" has no panorama bound; cannot release ${product}`)
    }
    const sceneAssetIds = new Set(project.scenes.map((s) => s.assetId))
    const reachableRoutes = project.navigation.routes.filter(
      (r) => r.from.kind === 'panorama' || ('sceneId' in r.from && sceneAssetIds.has(r.from.sceneId)),
    )
    const transitionAssetIds = new Set<string>()
    for (const r of reachableRoutes) {
      if (r.transition?.assetId) transitionAssetIds.add(r.transition.assetId)
    }
    const referencedAssetIds = computeReferencedAssetIds(
      project.panorama.assetId,
      sceneAssetIds,
      transitionAssetIds,
    )

    const { closure } = buildAssetClosure({
      projectId: project.id,
      assets: project.assets.byId,
      referencedAssetIds,
    })

    const manifest =
      product === 'atlas'
        ? compileAtlas(project, closure, now).manifest
        : compileCatalog(project, closure, now).manifest

    const productDir = path.join(tmpDir, product)
    fs.mkdirSync(productDir, { recursive: true })
    fs.writeFileSync(path.join(productDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  }
}

export class ReleaseValidationError extends Error {
  constructor(public readonly failures: ValidationReport['failures']) {
    super(`release validation failed: ${failures.map((f) => f.message).join('; ')}`)
    this.name = 'ReleaseValidationError'
  }
}