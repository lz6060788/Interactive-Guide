/**
 * Preview routes — placeholder for Phase 6 implementation.
 * Returns 501 with a clear error code so the editor can show a useful
 * "not implemented" state.
 */
import { Router } from 'express'

export function createPreviewsRouter(): Router {
  const router = Router()
  router.post('/projects/:id/previews/atlas', (_req, res) => {
    res.status(501).json({
      error: 'Atlas preview is implemented in Phase 6 (dual-product compile).',
      code: 'NOT_IMPLEMENTED',
    })
  })
  router.post('/projects/:id/previews/catalog', (_req, res) => {
    res.status(501).json({
      error: 'Catalog preview is implemented in Phase 6 (dual-product compile).',
      code: 'NOT_IMPLEMENTED',
    })
  })
  return router
}
