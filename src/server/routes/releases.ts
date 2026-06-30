/**
 * Release routes — list, read, and build releases.
 */
import { Router } from 'express'
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
  return router
}