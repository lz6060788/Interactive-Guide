/**
 * Release routes — placeholder for Phase 6 implementation.
 * Lists existing releases (read-only) and 501s on build.
 */
import { Router } from 'express'
import { ReleaseRepository } from '../storage/release-repository.js'

export function createReleasesRouter(repo: ReleaseRepository = new ReleaseRepository()): Router {
  const router = Router()
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
  router.post('/projects/:id/releases', (_req, res) => {
    res.status(501).json({
      error: 'Release build is implemented in Phase 6 (dual-product atomic release).',
      code: 'NOT_IMPLEMENTED',
    })
  })
  return router
}
