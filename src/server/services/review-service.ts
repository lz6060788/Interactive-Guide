import crypto from 'node:crypto'
import type { GuideProject } from '../../domain/project-types.js'
import {
  REVIEW_ASSET_HASH_ALGORITHM,
  REVIEW_PROJECT_HASH_ALGORITHM,
  REVIEW_SESSION_SCHEMA_VERSION,
  type ReviewSessionRecord,
  type ReviewSessionView,
  type ReviewApprovalReceipt,
  type ReviewStaleReason,
} from '../../automation/contracts/review-session-v1.js'
import { validateReleaseProject, type ValidationIssue } from '../../domain/project-validator.js'
import { ProjectRepository } from '../storage/project-repository.js'
import { ReviewRepository } from '../storage/review-repository.js'
import { AssetIntegrityError, hashProjectAssetClosure } from './asset-integrity.js'
import { WORKBENCH_VERSION } from '../workbench-version.js'

export class ReviewRevisionConflictError extends Error {
  constructor(
    public readonly currentRevision: number,
    public readonly currentUpdatedAt: string,
  ) {
    super(`revision conflict: current revision is ${currentRevision}`)
    this.name = 'ReviewRevisionConflictError'
  }
}

export class ReviewAlreadyApprovedError extends Error {
  constructor(public readonly reviewId: string) {
    super(`review session "${reviewId}" is already approved`)
    this.name = 'ReviewAlreadyApprovedError'
  }
}

export class ReviewProjectMismatchError extends Error {
  constructor(public readonly reviewId: string) {
    super(`review session "${reviewId}" belongs to another project`)
    this.name = 'ReviewProjectMismatchError'
  }
}

export class ReviewNotApprovedError extends Error {
  constructor(public readonly reviewId: string) {
    super(`review session "${reviewId}" has not been approved`)
    this.name = 'ReviewNotApprovedError'
  }
}

export class ReviewApprovalStaleError extends Error {
  constructor(
    public readonly reviewId: string,
    public readonly approvedRevision: number,
    public readonly currentRevision: number,
    public readonly reason: ReviewStaleReason,
  ) {
    super(
      `review session "${reviewId}" approved revision ${approvedRevision}, current revision is ${currentRevision}`,
    )
    this.name = 'ReviewApprovalStaleError'
  }
}

export class ReviewApprovalReceiptMismatchError extends Error {
  constructor(public readonly reviewId: string) {
    super(`review approval receipt for "${reviewId}" does not match the stored approval`)
    this.name = 'ReviewApprovalReceiptMismatchError'
  }
}

export class ReviewProjectNotReadyError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(
      `project is not ready for review approval: ${issues.map(issue => issue.message).join('; ')}`,
    )
    this.name = 'ReviewProjectNotReadyError'
  }
}

export class ReviewApprovalRevisionMismatchError extends Error {
  constructor(
    public readonly reviewId: string,
    public readonly approvedRevision: number,
    public readonly requestedRevision: number,
  ) {
    super(
      `review session "${reviewId}" approved revision ${approvedRevision}, requested revision is ${requestedRevision}`,
    )
    this.name = 'ReviewApprovalRevisionMismatchError'
  }
}

export interface ApprovedReviewSnapshot {
  project: GuideProject
  reviewId: string
  approvedRevision: number
  approvedWorkbenchVersion: string
  approvedProjectSha256: string
  approvedAssetClosureSha256: string
  approvedAt: string
}

export class ReviewService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly reviews: ReviewRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  open(projectId: string, expectedRevision: number): ReviewSessionView {
    const project = this.requireRevision(projectId, expectedRevision)
    const record: ReviewSessionRecord = {
      schemaVersion: REVIEW_SESSION_SCHEMA_VERSION,
      id: `review-${crypto.randomUUID()}`,
      projectId,
      openedRevision: project.metadata.revision,
      openedAt: this.now(),
    }
    this.reviews.create(record)
    return this.toView(record, project)
  }

  get(reviewId: string): ReviewSessionView {
    const record = this.reviews.get(reviewId)
    return this.toView(record, this.projects.get(record.projectId))
  }

  approve(reviewId: string, expectedRevision: number, notes?: string): ReviewSessionView {
    const record = this.reviews.get(reviewId)
    if (record.approval) throw new ReviewAlreadyApprovedError(reviewId)
    const project = this.requireRevision(record.projectId, expectedRevision)
    const validation = validateReleaseProject(project)
    if (!validation.ok) throw new ReviewProjectNotReadyError(validation.issues)
    const approved: ReviewSessionRecord = {
      ...record,
      approval: {
        approvedRevision: project.metadata.revision,
        approvedWorkbenchVersion: WORKBENCH_VERSION,
        approvedProjectSha256: hashGuideProject(project),
        approvedAssetClosureSha256: hashProjectAssetClosure(project, this.projects),
        hashAlgorithm: REVIEW_PROJECT_HASH_ALGORITHM,
        assetHashAlgorithm: REVIEW_ASSET_HASH_ALGORITHM,
        approvedAt: this.now(),
        ...(notes ? { notes } : {}),
      },
    }
    this.reviews.save(approved)
    return this.toView(approved, project)
  }

  requireApproved(projectId: string, receipt: ReviewApprovalReceipt): ApprovedReviewSnapshot {
    const { reviewId } = receipt
    const record = this.reviews.get(reviewId)
    if (record.projectId !== projectId) throw new ReviewProjectMismatchError(reviewId)
    if (!record.approval) throw new ReviewNotApprovedError(reviewId)
    if (record.approval.approvedRevision !== receipt.approvedRevision) {
      throw new ReviewApprovalRevisionMismatchError(
        reviewId,
        record.approval.approvedRevision,
        receipt.approvedRevision,
      )
    }
    if (
      record.approval.approvedWorkbenchVersion !== receipt.approvedWorkbenchVersion ||
      record.approval.approvedProjectSha256 !== receipt.approvedProjectSha256 ||
      record.approval.approvedAssetClosureSha256 !== receipt.approvedAssetClosureSha256
    ) {
      throw new ReviewApprovalReceiptMismatchError(reviewId)
    }
    const project = this.projects.get(projectId)
    if (record.approval.approvedWorkbenchVersion !== WORKBENCH_VERSION) {
      throw new ReviewApprovalStaleError(
        reviewId,
        record.approval.approvedRevision,
        project.metadata.revision,
        'WORKBENCH_VERSION_CHANGED',
      )
    }
    if (project.metadata.revision !== record.approval.approvedRevision) {
      throw new ReviewApprovalStaleError(
        reviewId,
        record.approval.approvedRevision,
        project.metadata.revision,
        'REVISION_CHANGED',
      )
    }
    if (hashGuideProject(project) !== record.approval.approvedProjectSha256) {
      throw new ReviewApprovalStaleError(
        reviewId,
        record.approval.approvedRevision,
        project.metadata.revision,
        'PROJECT_HASH_CHANGED',
      )
    }
    let currentAssetClosureSha256: string
    try {
      currentAssetClosureSha256 = hashProjectAssetClosure(project, this.projects)
    } catch (error) {
      if (!(error instanceof AssetIntegrityError)) throw error
      throw new ReviewApprovalStaleError(
        reviewId,
        record.approval.approvedRevision,
        project.metadata.revision,
        'ASSET_CLOSURE_CHANGED',
      )
    }
    if (currentAssetClosureSha256 !== record.approval.approvedAssetClosureSha256) {
      throw new ReviewApprovalStaleError(
        reviewId,
        record.approval.approvedRevision,
        project.metadata.revision,
        'ASSET_CLOSURE_CHANGED',
      )
    }
    return {
      project,
      reviewId,
      approvedRevision: record.approval.approvedRevision,
      approvedWorkbenchVersion: record.approval.approvedWorkbenchVersion,
      approvedProjectSha256: record.approval.approvedProjectSha256,
      approvedAssetClosureSha256: record.approval.approvedAssetClosureSha256,
      approvedAt: record.approval.approvedAt,
    }
  }

  private requireRevision(projectId: string, expectedRevision: number): GuideProject {
    const project = this.projects.get(projectId)
    if (project.metadata.revision !== expectedRevision) {
      throw new ReviewRevisionConflictError(project.metadata.revision, project.metadata.updatedAt)
    }
    return project
  }

  private toView(record: ReviewSessionRecord, project: GuideProject): ReviewSessionView {
    const approval = record.approval
    let staleReason: ReviewStaleReason | undefined
    if (approval?.approvedWorkbenchVersion !== undefined) {
      if (approval.approvedWorkbenchVersion !== WORKBENCH_VERSION) {
        staleReason = 'WORKBENCH_VERSION_CHANGED'
      } else if (approval.approvedRevision !== project.metadata.revision) {
        staleReason = 'REVISION_CHANGED'
      } else if (approval.approvedProjectSha256 !== hashGuideProject(project)) {
        staleReason = 'PROJECT_HASH_CHANGED'
      } else {
        try {
          if (
            approval.approvedAssetClosureSha256 !== hashProjectAssetClosure(project, this.projects)
          ) {
            staleReason = 'ASSET_CLOSURE_CHANGED'
          }
        } catch (error) {
          if (!(error instanceof AssetIntegrityError)) throw error
          staleReason = 'ASSET_CLOSURE_CHANGED'
        }
      }
    }
    const status = !approval ? 'pending' : staleReason ? 'stale' : 'approved'
    return {
      schemaVersion: record.schemaVersion,
      id: record.id,
      projectId: record.projectId,
      status,
      openedRevision: record.openedRevision,
      currentRevision: project.metadata.revision,
      openedAt: record.openedAt,
      ...(approval
        ? {
            approvedRevision: approval.approvedRevision,
            approvedWorkbenchVersion: approval.approvedWorkbenchVersion,
            approvedProjectSha256: approval.approvedProjectSha256,
            approvedAssetClosureSha256: approval.approvedAssetClosureSha256,
            hashAlgorithm: approval.hashAlgorithm,
            assetHashAlgorithm: approval.assetHashAlgorithm,
            approvedAt: approval.approvedAt,
            ...(approval.notes ? { notes: approval.notes } : {}),
            ...(staleReason ? { staleReason } : {}),
          }
        : {}),
    }
  }
}

export function hashGuideProject(project: GuideProject): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(sortJson(project)))
    .digest('hex')
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortJson(child)]),
    )
  }
  return value
}
