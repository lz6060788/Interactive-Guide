/**
 * ReleaseService — immutable dual-product release. It validates the domain
 * snapshot, builds both products into a unique staging directory, and then
 * commits that directory with one rename.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ProjectRepository } from '../storage/project-repository.js'
import { ReleaseRepository, type ReleaseManifest } from '../storage/release-repository.js'
import { validateRelease, type ValidationReport } from './static-validator.js'
import { buildStaticProduct } from './static-product-builder.js'
import { validateReleaseProject, type ValidationIssue } from '../../domain/project-validator.js'

export interface ReleaseBuildResult {
  projectId: string
  version: string
  sourceRevision: number
  report: ValidationReport
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
    const domainValidation = validateReleaseProject(project)
    if (!domainValidation.ok) {
      throw new ReleaseProjectValidationError(domainValidation.issues)
    }
    const transaction = this.releases.beginRelease(projectId, version)

    try {
      buildStaticProduct({
        project,
        projects: this.projects,
        product: 'atlas',
        productDir: path.join(transaction.stagingDir, 'atlas'),
        now,
      })
      buildStaticProduct({
        project,
        projects: this.projects,
        product: 'catalog',
        productDir: path.join(transaction.stagingDir, 'catalog'),
        now,
      })

      const report = validateRelease(transaction.stagingDir)
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
      fs.writeFileSync(
        path.join(transaction.stagingDir, 'release.json'),
        JSON.stringify(releaseManifest, null, 2),
      )
      transaction.commit()

      return { projectId, version, sourceRevision: project.metadata.revision, report }
    } catch (err) {
      transaction.rollback()
      throw err
    }
  }
}

export class ReleaseProjectValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`project is not release ready: ${issues.map(issue => issue.message).join('; ')}`)
    this.name = 'ReleaseProjectValidationError'
  }
}

export class ReleaseValidationError extends Error {
  constructor(public readonly failures: ValidationReport['failures']) {
    super(`release validation failed: ${failures.map(f => f.message).join('; ')}`)
    this.name = 'ReleaseValidationError'
  }
}
