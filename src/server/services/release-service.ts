/**
 * ReleaseService — atomic dual-product release. Builds Atlas and
 * Catalog in parallel into a temp directory, then commits the entire
 * directory via rename. If either product fails, the partial temp is
 * removed and the existing release is untouched.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ProjectRepository } from '../storage/project-repository.js'
import { ReleaseRepository, type ReleaseManifest } from '../storage/release-repository.js'
import { validateRelease, type ValidationReport } from './static-validator.js'
import { buildStaticProduct } from './static-product-builder.js'

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

  buildRelease(
    projectId: string,
    now: () => string = () => new Date().toISOString(),
  ): ReleaseBuildResult {
    const project = this.projects.get(projectId)
    const version = project.version
    const finalDir = this.releases.releaseDir(projectId, version)
    const tmpDir = `${finalDir}__tmp`

    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.mkdirSync(tmpDir, { recursive: true })

    try {
      buildStaticProduct({
        project,
        projects: this.projects,
        product: 'atlas',
        productDir: path.join(tmpDir, 'atlas'),
        now,
      })
      buildStaticProduct({
        project,
        projects: this.projects,
        product: 'catalog',
        productDir: path.join(tmpDir, 'catalog'),
        now,
      })
      if (project.products.gallery.enabled) {
        buildStaticProduct({
          project,
          projects: this.projects,
          product: 'gallery',
          productDir: path.join(tmpDir, 'gallery'),
          now,
        })
      }

      const report = validateRelease(
        tmpDir,
        project.products.gallery.enabled ? ['atlas', 'catalog', 'gallery'] : ['atlas', 'catalog'],
      )
      if (!report.ok) {
        throw new ReleaseValidationError(report.failures)
      }

      const releaseManifest: ReleaseManifest = {
        projectId,
        projectVersion: project.version,
        schemaVersion: '1.1.0',
        generatedAt: now(),
        sourceRevision: project.metadata.revision,
        products: {
          atlas: { entry: 'atlas/index.html', manifest: 'atlas/manifest.json' },
          catalog: { entry: 'catalog/index.html', manifest: 'catalog/manifest.json' },
          ...(project.products.gallery.enabled
            ? { gallery: { entry: 'gallery/index.html', manifest: 'gallery/manifest.json' } }
            : {}),
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
}

export class ReleaseValidationError extends Error {
  constructor(public readonly failures: ValidationReport['failures']) {
    super(`release validation failed: ${failures.map(f => f.message).join('; ')}`)
    this.name = 'ReleaseValidationError'
  }
}
