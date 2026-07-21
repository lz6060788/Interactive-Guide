/**
 * ReleaseService — immutable dual-product release. It validates the domain
 * snapshot, builds both products into a unique staging directory, and then
 * commits that directory with one rename.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  REVIEW_ASSET_HASH_ALGORITHM,
  REVIEW_PROJECT_HASH_ALGORITHM,
} from '../../automation/contracts/review-session-v1.js'
import { ProjectRepository } from '../storage/project-repository.js'
import { ReleaseRepository, type ReleaseManifest } from '../storage/release-repository.js'
import { validateRelease, type ValidationReport } from './static-validator.js'
import { buildStaticProduct } from './static-product-builder.js'
import { validateReleaseProject, type ValidationIssue } from '../../domain/project-validator.js'
import { hashGuideProject, type ApprovedReviewSnapshot } from './review-service.js'
import {
  AssetIntegrityError,
  hashAssetClosureAtRoot,
  hashProjectAssetClosure,
} from './asset-integrity.js'
import { WORKBENCH_VERSION } from '../workbench-version.js'

export interface ReleaseBuildResult {
  projectId: string
  version: string
  sourceRevision: number
  reviewSessionId: string
  projectSha256: string
  assetClosureSha256: string
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
    snapshot: ApprovedReviewSnapshot,
    now: () => string = () => new Date().toISOString(),
  ): ReleaseBuildResult {
    const { project } = snapshot
    const projectId = project.id
    this.assertSnapshotCurrent(snapshot)
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
      this.assertSnapshotCurrent(snapshot)
      for (const product of ['atlas', 'catalog'] as const) {
        const stagedAssetHash = hashAssetClosureAtRoot(
          project,
          path.join(transaction.stagingDir, product, 'assets'),
        )
        if (stagedAssetHash !== snapshot.approvedAssetClosureSha256) {
          throw new ReleaseApprovalSnapshotMismatchError(snapshot.reviewId)
        }
      }

      const releaseManifest: ReleaseManifest = {
        projectId,
        projectVersion: project.version,
        schemaVersion: '1.1.0',
        generatedAt: now(),
        sourceRevision: snapshot.approvedRevision,
        workbenchVersion: snapshot.approvedWorkbenchVersion,
        projectSha256: snapshot.approvedProjectSha256,
        projectHashAlgorithm: REVIEW_PROJECT_HASH_ALGORITHM,
        assetClosureSha256: snapshot.approvedAssetClosureSha256,
        assetHashAlgorithm: REVIEW_ASSET_HASH_ALGORITHM,
        approval: {
          reviewSessionId: snapshot.reviewId,
          approvedRevision: snapshot.approvedRevision,
          approvedWorkbenchVersion: snapshot.approvedWorkbenchVersion,
          approvedProjectSha256: snapshot.approvedProjectSha256,
          approvedAssetClosureSha256: snapshot.approvedAssetClosureSha256,
          approvedAt: snapshot.approvedAt,
        },
        products: {
          atlas: { entry: 'atlas/index.html', manifest: 'atlas/manifest.json' },
          catalog: { entry: 'catalog/index.html', manifest: 'catalog/manifest.json' },
        },
      }
      fs.writeFileSync(
        path.join(transaction.stagingDir, 'release.json'),
        JSON.stringify(releaseManifest, null, 2),
      )
      this.assertSnapshotCurrent(snapshot)
      transaction.commit()

      return {
        projectId,
        version,
        sourceRevision: snapshot.approvedRevision,
        reviewSessionId: snapshot.reviewId,
        projectSha256: snapshot.approvedProjectSha256,
        assetClosureSha256: snapshot.approvedAssetClosureSha256,
        report,
      }
    } catch (err) {
      transaction.rollback()
      throw err
    }
  }

  private assertSnapshotCurrent(snapshot: ApprovedReviewSnapshot): void {
    const current = this.projects.get(snapshot.project.id)
    let assetClosureSha256: string
    try {
      assetClosureSha256 = hashProjectAssetClosure(current, this.projects)
    } catch (error) {
      if (error instanceof AssetIntegrityError) {
        throw new ReleaseApprovalSnapshotMismatchError(snapshot.reviewId)
      }
      throw error
    }
    if (
      snapshot.approvedWorkbenchVersion !== WORKBENCH_VERSION ||
      current.metadata.revision !== snapshot.approvedRevision ||
      hashGuideProject(current) !== snapshot.approvedProjectSha256 ||
      assetClosureSha256 !== snapshot.approvedAssetClosureSha256
    ) {
      throw new ReleaseApprovalSnapshotMismatchError(snapshot.reviewId)
    }
  }
}

export class ReleaseApprovalSnapshotMismatchError extends Error {
  constructor(public readonly reviewId: string) {
    super(`approved review snapshot "${reviewId}" is inconsistent`)
    this.name = 'ReleaseApprovalSnapshotMismatchError'
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
