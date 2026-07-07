/**
 * Release routes — list, read, and build releases.
 */
import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { ProjectRepository } from '../storage/project-repository.js'
import { ReleaseRepository } from '../storage/release-repository.js'
import { ReleaseService, ReleaseValidationError } from '../services/release-service.js'

export function createReleasesRouter(
  projects: ProjectRepository = new ProjectRepository(),
  repo: ReleaseRepository = new ReleaseRepository(),
): Router {
  const router = Router()
  const service = new ReleaseService(projects, repo)

  router.get('/projects/:id/releases', (req, res) => {
    const versions = repo.listVersions(String(req.params.id))
    res.json({ data: versions })
  })
  router.get('/projects/:id/releases/:version', (req, res) => {
    const manifest = repo.readRelease(String(req.params.id), String(req.params.version))
    if (!manifest) {
      res.status(404).json({ error: 'release not found', code: 'NOT_FOUND' })
      return
    }
    res.json({ data: manifest })
  })
  router.post('/projects/:id/releases', (req, res) => {
    try {
      const result = service.buildRelease(String(req.params.id))
      res.json({ data: result })
    } catch (err) {
      if (err instanceof ReleaseValidationError) {
        res.status(400).json({ error: err.message, code: 'VALIDATION_FAILED', failures: err.failures })
        return
      }
      const msg = (err as Error).message
      res.status(500).json({ error: msg, code: 'BUILD_FAILED' })
    }
  })

  router.get(/^\/projects\/([^/]+)\/releases\/([^/]+)\/files\/(.+)$/, (req, res) => {
    const captures = req.params as unknown as Record<number, string>
    const projectId = captures[0] ?? ''
    const version = captures[1] ?? ''
    const relPath = captures[2] ?? ''
    const releaseDir = repo.releaseDir(projectId, version)
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
