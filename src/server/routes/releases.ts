/**
 * Release routes — list, read, and build releases.
 */
import { Router, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { ReviewApprovalReceiptSchema } from '../../automation/contracts/review-session-v1.js'
import { ProjectRepository } from '../storage/project-repository.js'
import { ReviewRepository } from '../storage/review-repository.js'
import {
  InvalidReleasePathError,
  ReleaseAlreadyExistsError,
  ReleaseBuildInProgressError,
  ReleaseRepository,
} from '../storage/release-repository.js'
import {
  ReleaseApprovalSnapshotMismatchError,
  ReleaseProjectValidationError,
  ReleaseService,
  ReleaseValidationError,
} from '../services/release-service.js'
import { ReviewService } from '../services/review-service.js'
import { mapReviewError } from './review-sessions.js'

const ReleaseApprovalBody = ReviewApprovalReceiptSchema

export function createReleasesRouter(
  projects: ProjectRepository = new ProjectRepository(),
  repo: ReleaseRepository = new ReleaseRepository(),
  reviews: ReviewService = new ReviewService(
    projects,
    new ReviewRepository({ dataDir: path.dirname(repo.rootDir()) }),
  ),
): Router {
  const router = Router()
  const service = new ReleaseService(projects, repo)

  router.get('/projects/:id/releases', (req, res) => {
    try {
      const versions = repo.listVersions(String(req.params.id))
      res.json({ data: versions })
    } catch (error) {
      if (!mapReleaseError(error, res)) sendUnexpectedReleaseError(res)
    }
  })
  router.get('/projects/:id/releases/:version', (req, res) => {
    try {
      const manifest = repo.readRelease(String(req.params.id), String(req.params.version))
      if (!manifest) {
        res.status(404).json({ error: 'release not found', code: 'NOT_FOUND' })
        return
      }
      res.json({ data: manifest })
    } catch (error) {
      if (!mapReleaseError(error, res)) sendUnexpectedReleaseError(res)
    }
  })
  const buildRelease = (req: Request, res: Response): void => {
    const approval = ReleaseApprovalBody.safeParse(req.body ?? {})
    if (!approval.success) {
      res.status(400).json({
        error: 'a valid review approval is required',
        code: 'APPROVAL_REQUIRED',
        issues: approval.error.issues,
      })
      return
    }
    try {
      const projectId = String(req.params.id)
      const snapshot = reviews.requireApproved(projectId, approval.data)
      const result = service.buildRelease(snapshot)
      res.json({ data: result })
    } catch (err) {
      if (!mapReviewError(err, res) && !mapReleaseError(err, res)) {
        const msg = (err as Error).message
        res.status(500).json({ error: msg, code: 'BUILD_FAILED' })
      }
    }
  }
  // External orchestrators use only the protocol-versioned path. The legacy
  // path remains available to existing Workbench clients during migration.
  router.post('/automation/v1/projects/:id/releases', buildRelease)
  router.post('/projects/:id/releases', buildRelease)

  router.get(/^\/projects\/([^/]+)\/releases\/([^/]+)\/files\/(.+)$/, (req, res) => {
    const captures = req.params as unknown as Record<number, string>
    const projectId = captures[0] ?? ''
    const version = captures[1] ?? ''
    const relPath = captures[2] ?? ''
    let releaseDir: string
    try {
      if (!repo.readRelease(projectId, version)) {
        res.status(404).json({ error: 'release not found', code: 'NOT_FOUND' })
        return
      }
      releaseDir = repo.releaseDir(projectId, version)
    } catch (error) {
      mapReleaseError(error, res)
      return
    }
    const requestedPath = relPath.replaceAll('\\', '/')
    if (requestedPath.startsWith('/') || requestedPath.includes('..')) {
      res.status(400).json({ error: 'invalid release asset path', code: 'BAD_PATH' })
      return
    }
    const abs = path.join(releaseDir, requestedPath)
    const resolvedRoot = path.resolve(releaseDir)
    const resolvedFile = path.resolve(abs)
    if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
      res.status(400).json({ error: 'invalid release asset path', code: 'BAD_PATH' })
      return
    }
    if (!fs.existsSync(resolvedFile)) {
      res.status(404).json({ error: 'release file missing on disk', code: 'NOT_FOUND' })
      return
    }
    res.sendFile(resolvedFile)
  })

  return router
}

function mapReleaseError(error: unknown, res: import('express').Response): boolean {
  if (error instanceof InvalidReleasePathError) {
    res.status(400).json({ error: error.message, code: 'BAD_RELEASE_PATH' })
    return true
  }
  if (error instanceof ReleaseAlreadyExistsError) {
    res.status(409).json({ error: error.message, code: 'RELEASE_EXISTS' })
    return true
  }
  if (error instanceof ReleaseBuildInProgressError) {
    res.status(409).json({ error: error.message, code: 'RELEASE_IN_PROGRESS' })
    return true
  }
  if (error instanceof ReleaseApprovalSnapshotMismatchError) {
    res.status(409).json({ error: error.message, code: 'APPROVAL_STALE' })
    return true
  }
  if (error instanceof ReleaseProjectValidationError) {
    res.status(400).json({ error: error.message, code: 'VALIDATION_FAILED', issues: error.issues })
    return true
  }
  if (error instanceof ReleaseValidationError) {
    res
      .status(400)
      .json({ error: error.message, code: 'VALIDATION_FAILED', failures: error.failures })
    return true
  }
  return false
}

function sendUnexpectedReleaseError(res: import('express').Response): void {
  res.status(500).json({ error: 'release operation failed', code: 'RELEASE_FAILED' })
}
