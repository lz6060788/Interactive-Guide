import express, { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  GUIDE_AUTHORING_BUNDLE_CONTRACT,
  GUIDE_AUTHORING_BUNDLE_VERSION,
  GuideAuthoringBundleV1Schema,
} from '../../automation/contracts/authoring-bundle-v1.js'
import {
  AuthoringBlobHashMismatchError,
  AuthoringBlobRepository,
  AuthoringBlobSizeMismatchError,
  AuthoringBlobTooLargeError,
  InvalidAuthoringBlobDigestError,
  InvalidAuthoringBlobSizeError,
} from '../storage/authoring-blob-repository.js'
import {
  AuthoringOperationBusyError,
  AuthoringOperationCorruptError,
  AuthoringOperationFingerprintConflictError,
} from '../storage/authoring-operation-repository.js'
import {
  AuthoringApplyAtomicityError,
  AuthoringOperationRecoveryRequiredError,
  AuthoringProjectExistsError,
  AuthoringService,
  AuthoringValidationFailedError,
  AuthoringValidationTokenStaleError,
} from '../services/authoring-service.js'

const ApplyBodySchema = z
  .object({
    bundle: GuideAuthoringBundleV1Schema,
    validationToken: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

const jsonBody = express.json({ limit: '50mb' })

export function createAuthoringRouter(
  blobs: AuthoringBlobRepository,
  service: AuthoringService,
): Router {
  const router = Router()

  // This route is intentionally mounted before any JSON middleware. Authoring
  // inputs may themselves be JSON files, but they are opaque content-addressed
  // bytes at this boundary.
  router.put('/automation/v1/authoring/blobs/:sha256', async (req, res, next) => {
    try {
      const sha256 = String(req.params.sha256)
      const size = requireBlobSize(req, res)
      if (size === null) return
      const encoding = req.header('content-encoding')
      if (encoding && encoding.toLowerCase() !== 'identity') {
        res.status(400).json({
          error: 'content-encoding is not supported for content-addressed blobs',
          code: 'BAD_REQUEST',
        })
        return
      }
      const created = !blobs.has(sha256)
      const record = await blobs.putStream({ sha256, size, chunks: req })
      res.status(created ? 201 : 200).json({ data: { ...record, created } })
    } catch (error) {
      if (!mapAuthoringError(error, res)) next(error)
    }
  })

  router.post(
    '/automation/v1/authoring/bundles/validate',
    jsonBody,
    handle((req, res) => {
      if (rejectUnsupportedContract(req.body, res)) return
      const parsed = GuideAuthoringBundleV1Schema.safeParse(req.body)
      if (!parsed.success) return sendBadRequest(res, parsed.error)
      res.json({ data: service.validate(parsed.data) })
    }),
  )

  router.post(
    '/automation/v1/authoring/bundles/apply',
    jsonBody,
    handle((req, res) => {
      const candidate = isRecord(req.body) ? req.body.bundle : undefined
      if (rejectUnsupportedContract(candidate, res)) return
      const parsed = ApplyBodySchema.safeParse(req.body)
      if (!parsed.success) return sendBadRequest(res, parsed.error)
      const result = service.apply(parsed.data.bundle, parsed.data.validationToken)
      res.status(200).json({ data: result })
    }),
  )

  return router
}

function handle(
  fn: (req: Request, res: Response) => Promise<void> | void,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    try {
      const result = fn(req, res)
      if (result instanceof Promise) {
        result.catch(error => {
          if (!mapAuthoringError(error, res)) next(error)
        })
      }
    } catch (error) {
      if (!mapAuthoringError(error, res)) next(error)
    }
  }
}

function requireBlobSize(req: Request, res: Response): number | null {
  const explicit = req.header('x-blob-size')
  const contentLength = req.header('content-length')
  if (explicit && contentLength && explicit !== contentLength) {
    res.status(400).json({
      error: 'x-blob-size must match content-length when both are supplied',
      code: 'BAD_REQUEST',
    })
    return null
  }
  const raw = explicit ?? contentLength
  const size = raw === undefined ? Number.NaN : Number(raw)
  if (!Number.isSafeInteger(size) || size < 0) {
    res.status(400).json({
      error: 'x-blob-size or content-length must be a non-negative integer',
      code: 'BAD_REQUEST',
    })
    return null
  }
  return size
}

function rejectUnsupportedContract(candidate: unknown, res: Response): boolean {
  if (!isRecord(candidate)) return false
  if (
    candidate.contract !== GUIDE_AUTHORING_BUNDLE_CONTRACT ||
    candidate.contractVersion !== GUIDE_AUTHORING_BUNDLE_VERSION
  ) {
    res.status(400).json({
      error: 'authoring contract or contractVersion is unsupported',
      code: 'CONTRACT_UNSUPPORTED',
      supported: [
        {
          name: GUIDE_AUTHORING_BUNDLE_CONTRACT,
          versions: [GUIDE_AUTHORING_BUNDLE_VERSION],
        },
      ],
    })
    return true
  }
  return false
}

function sendBadRequest(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: 'invalid authoring request',
    code: 'BAD_REQUEST',
    issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  })
}

export function mapAuthoringError(error: unknown, res: Response): boolean {
  if (error instanceof InvalidAuthoringBlobDigestError) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' })
    return true
  }
  if (error instanceof InvalidAuthoringBlobSizeError) {
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' })
    return true
  }
  if (error instanceof AuthoringBlobTooLargeError) {
    res.status(413).json({
      error: error.message,
      code: 'BLOB_TOO_LARGE',
      maxBytes: error.maxBytes,
      actualBytes: error.actualBytes,
    })
    return true
  }
  if (error instanceof AuthoringBlobSizeMismatchError) {
    res.status(400).json({
      error: error.message,
      code: 'BLOB_SIZE_MISMATCH',
      expectedSize: error.expectedSize,
      actualSize: error.actualSize,
    })
    return true
  }
  if (error instanceof AuthoringBlobHashMismatchError) {
    res.status(400).json({
      error: error.message,
      code: 'BLOB_HASH_MISMATCH',
      expectedSha256: error.expectedSha256,
      actualSha256: error.actualSha256,
    })
    return true
  }
  if (error instanceof AuthoringProjectExistsError) {
    res.status(409).json({ error: error.message, code: 'PROJECT_EXISTS' })
    return true
  }
  if (error instanceof AuthoringOperationFingerprintConflictError) {
    res.status(409).json({ error: error.message, code: 'IDEMPOTENCY_KEY_REUSED' })
    return true
  }
  if (error instanceof AuthoringValidationTokenStaleError) {
    res.status(409).json({ error: error.message, code: 'VALIDATION_TOKEN_STALE' })
    return true
  }
  if (error instanceof AuthoringValidationFailedError) {
    res.status(400).json({
      error: error.message,
      code: 'AUTHORING_VALIDATION_FAILED',
      issues: error.issues,
    })
    return true
  }
  if (
    error instanceof AuthoringOperationRecoveryRequiredError ||
    error instanceof AuthoringOperationCorruptError
  ) {
    res.status(409).json({ error: error.message, code: 'OPERATION_RECOVERY_REQUIRED' })
    return true
  }
  if (error instanceof AuthoringOperationBusyError) {
    res.status(409).json({ error: error.message, code: 'OPERATION_IN_PROGRESS' })
    return true
  }
  if (error instanceof AuthoringApplyAtomicityError) {
    res.status(500).json({ error: error.message, code: 'APPLY_ATOMICITY_FAILED' })
    return true
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
