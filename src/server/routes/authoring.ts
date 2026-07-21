import express, { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { ProjectIdSchema } from '../../domain/project-schema.js'
import {
  GUIDE_AUTHORING_BUNDLE_CONTRACT,
  GUIDE_AUTHORING_BUNDLE_VERSION,
  GuideAuthoringBundleV1Schema,
} from '../../automation/contracts/authoring-bundle-v1.js'
import {
  GUIDE_AUTHORING_CHANGESET_CONTRACT,
  GUIDE_AUTHORING_CHANGESET_VERSION,
  GuideAuthoringChangeSetV1Schema,
} from '../../automation/contracts/authoring-changeset-v1.js'
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
import {
  AuthoringChangeSetAssetConflictError,
  AuthoringChangeSetRevisionConflictError,
  AuthoringChangeSetService,
} from '../services/authoring-changeset-service.js'
import {
  AuthoringStateCorruptError,
  AuthoringStateService,
} from '../services/authoring-state-service.js'
import { ProjectNotFoundError } from '../storage/project-repository.js'

const ApplyBodySchema = z
  .object({
    bundle: GuideAuthoringBundleV1Schema,
    validationToken: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

const ApplyChangeSetBodySchema = z
  .object({
    changeSet: GuideAuthoringChangeSetV1Schema,
    validationToken: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

const jsonBody = express.json({ limit: '50mb' })
const BundleContract = {
  name: GUIDE_AUTHORING_BUNDLE_CONTRACT,
  version: GUIDE_AUTHORING_BUNDLE_VERSION,
} as const
const ChangeSetContract = {
  name: GUIDE_AUTHORING_CHANGESET_CONTRACT,
  version: GUIDE_AUTHORING_CHANGESET_VERSION,
} as const

export function createAuthoringRouter(
  blobs: AuthoringBlobRepository,
  service: AuthoringService,
  changeSetService: AuthoringChangeSetService,
  stateService: AuthoringStateService,
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

  router.get(
    '/automation/v1/projects/:projectId/authoring-state',
    handle((req, res) => {
      const projectId = ProjectIdSchema.safeParse(String(req.params.projectId))
      if (!projectId.success) {
        res.status(400).json({ error: 'invalid project id', code: 'BAD_REQUEST' })
        return
      }
      res.json({ data: stateService.get(projectId.data) })
    }),
  )

  router.post(
    '/automation/v1/authoring/bundles/validate',
    jsonBody,
    handle((req, res) => {
      if (rejectUnsupportedContract(req.body, res, BundleContract)) return
      const parsed = GuideAuthoringBundleV1Schema.safeParse(req.body)
      if (!parsed.success) return sendBadRequest(res, parsed.error)
      res.json({ data: service.validate(parsed.data) })
    }),
  )

  router.post(
    '/automation/v1/authoring/changesets/validate',
    jsonBody,
    handle((req, res) => {
      if (rejectUnsupportedContract(req.body, res, ChangeSetContract)) return
      const parsed = GuideAuthoringChangeSetV1Schema.safeParse(req.body)
      if (!parsed.success) return sendBadRequest(res, parsed.error)
      res.json({ data: changeSetService.validate(parsed.data) })
    }),
  )

  router.post(
    '/automation/v1/authoring/changesets/apply',
    jsonBody,
    handle((req, res) => {
      const candidate = isRecord(req.body) ? req.body.changeSet : undefined
      if (rejectUnsupportedContract(candidate, res, ChangeSetContract)) return
      const parsed = ApplyChangeSetBodySchema.safeParse(req.body)
      if (!parsed.success) return sendBadRequest(res, parsed.error)
      const result = changeSetService.apply(parsed.data.changeSet, parsed.data.validationToken)
      res.status(200).json({ data: result })
    }),
  )

  router.post(
    '/automation/v1/authoring/bundles/apply',
    jsonBody,
    handle((req, res) => {
      const candidate = isRecord(req.body) ? req.body.bundle : undefined
      if (rejectUnsupportedContract(candidate, res, BundleContract)) return
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

function rejectUnsupportedContract(
  candidate: unknown,
  res: Response,
  expected: { name: string; version: string },
): boolean {
  if (!isRecord(candidate)) return false
  const isSupported =
    candidate.contract === expected.name && candidate.contractVersion === expected.version
  if (!isSupported) {
    res.status(400).json({
      error: 'authoring contract or contractVersion is unsupported',
      code: 'CONTRACT_UNSUPPORTED',
      supported: [{ name: expected.name, versions: [expected.version] }],
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
  if (error instanceof ProjectNotFoundError) {
    res.status(404).json({ error: error.message, code: 'PROJECT_NOT_FOUND' })
    return true
  }
  if (error instanceof AuthoringStateCorruptError) {
    res.status(500).json({ error: error.message, code: 'AUTHORING_STATE_CORRUPT' })
    return true
  }
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
  if (error instanceof AuthoringChangeSetRevisionConflictError) {
    res.status(409).json({
      error: error.message,
      code: 'REVISION_CONFLICT',
      expectedRevision: error.expectedRevision,
      currentRevision: error.currentRevision,
    })
    return true
  }
  if (error instanceof AuthoringChangeSetAssetConflictError) {
    res.status(409).json({
      error: error.message,
      code: 'ASSET_CONFLICT',
      targetId: error.targetId,
    })
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
