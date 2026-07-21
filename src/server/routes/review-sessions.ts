import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { ReviewNotFoundError } from '../storage/review-repository.js'
import { ProjectNotFoundError } from '../storage/project-repository.js'
import {
  ReviewAlreadyApprovedError,
  ReviewApprovalRevisionMismatchError,
  ReviewApprovalReceiptMismatchError,
  ReviewApprovalStaleError,
  ReviewNotApprovedError,
  ReviewProjectMismatchError,
  ReviewProjectNotReadyError,
  ReviewRevisionConflictError,
  ReviewService,
} from '../services/review-service.js'
import { AssetIntegrityError } from '../services/asset-integrity.js'
import type {
  ReviewSessionResource,
  ReviewSessionView,
} from '../../automation/contracts/review-session-v1.js'

const ApproveBody = z
  .object({
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()

export function createReviewSessionsRouter(service: ReviewService): Router {
  const router = Router()

  router.post('/automation/v1/projects/:id/review-sessions', (req, res) => {
    const expectedRevision = requireExpectedRevision(req, res)
    if (expectedRevision === null) return
    try {
      const view = service.open(String(req.params.id), expectedRevision)
      res.status(201).json({ data: withReviewLinks(req, view) })
    } catch (error) {
      if (!mapReviewError(error, res)) throw error
    }
  })

  router.get('/automation/v1/review-sessions/:reviewId', (req, res) => {
    try {
      const view = service.get(String(req.params.reviewId))
      res.json({ data: withReviewLinks(req, view) })
    } catch (error) {
      if (!mapReviewError(error, res)) throw error
    }
  })

  router.post('/automation/v1/review-sessions/:reviewId/approve', (req, res) => {
    const expectedRevision = requireExpectedRevision(req, res)
    if (expectedRevision === null) return
    const body = ApproveBody.safeParse(req.body ?? {})
    if (!body.success) {
      res
        .status(400)
        .json({ error: 'invalid body', code: 'BAD_REQUEST', issues: body.error.issues })
      return
    }
    try {
      const view = service.approve(String(req.params.reviewId), expectedRevision, body.data.notes)
      res.json({ data: withReviewLinks(req, view) })
    } catch (error) {
      if (!mapReviewError(error, res)) throw error
    }
  })

  return router
}

function requireExpectedRevision(req: Request, res: Response): number | null {
  const raw = req.header('x-expected-revision')
  const revision = raw === undefined ? Number.NaN : Number(raw)
  if (!Number.isInteger(revision) || revision < 0) {
    res.status(400).json({
      error: 'x-expected-revision is required',
      code: 'EXPECTED_REVISION_REQUIRED',
    })
    return null
  }
  return revision
}

function withReviewLinks(req: Request, view: ReviewSessionView): ReviewSessionResource {
  const reviewPath = `/projects/${encodeURIComponent(view.projectId)}/review/${encodeURIComponent(view.id)}`
  const origin = `${req.protocol}://${req.get('host') ?? '127.0.0.1'}`
  return { ...view, reviewPath, reviewUrl: new URL(reviewPath, origin).toString() }
}

export function mapReviewError(error: unknown, res: Response): boolean {
  if (error instanceof ReviewNotFoundError) {
    res.status(404).json({ error: error.message, code: 'REVIEW_NOT_FOUND' })
    return true
  }
  if (error instanceof ProjectNotFoundError) {
    res.status(404).json({ error: error.message, code: 'PROJECT_NOT_FOUND' })
    return true
  }
  if (error instanceof ReviewRevisionConflictError) {
    res.status(409).json({
      error: error.message,
      code: 'REVISION_CONFLICT',
      currentRevision: error.currentRevision,
      currentUpdatedAt: error.currentUpdatedAt,
    })
    return true
  }
  if (error instanceof ReviewAlreadyApprovedError) {
    res.status(409).json({ error: error.message, code: 'REVIEW_ALREADY_APPROVED' })
    return true
  }
  if (error instanceof ReviewApprovalStaleError) {
    res.status(409).json({
      error: error.message,
      code: 'APPROVAL_STALE',
      approvedRevision: error.approvedRevision,
      currentRevision: error.currentRevision,
      reason: error.reason,
    })
    return true
  }
  if (error instanceof ReviewApprovalRevisionMismatchError) {
    res.status(409).json({
      error: error.message,
      code: 'APPROVAL_REVISION_MISMATCH',
      approvedRevision: error.approvedRevision,
      requestedRevision: error.requestedRevision,
    })
    return true
  }
  if (error instanceof ReviewApprovalReceiptMismatchError) {
    res.status(409).json({ error: error.message, code: 'APPROVAL_RECEIPT_MISMATCH' })
    return true
  }
  if (error instanceof ReviewNotApprovedError) {
    res.status(409).json({ error: error.message, code: 'APPROVAL_REQUIRED' })
    return true
  }
  if (error instanceof ReviewProjectMismatchError) {
    res.status(409).json({ error: error.message, code: 'APPROVAL_PROJECT_MISMATCH' })
    return true
  }
  if (error instanceof ReviewProjectNotReadyError) {
    res.status(400).json({
      error: error.message,
      code: 'REVIEW_NOT_RELEASE_READY',
      issues: error.issues,
    })
    return true
  }
  if (error instanceof AssetIntegrityError) {
    res.status(409).json({
      error: error.message,
      code: 'ASSET_INTEGRITY_FAILED',
      assetId: error.assetId,
    })
    return true
  }
  return false
}
