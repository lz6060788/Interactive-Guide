/**
 * Preview routes — per-product draft builds. POST returns the entry URL
 * the editor can mount to preview the latest project state.
 */
import { Router } from 'express'
import { ProjectRepository } from '../storage/project-repository.js'
import { DraftBuildService, type DraftProduct } from '../services/draft-build-service.js'

export function createPreviewsRouter(projects: ProjectRepository = new ProjectRepository()): Router {
  const router = Router()
  const draft = new DraftBuildService(projects)

  router.post('/projects/:id/previews/:product', (req, res) => {
    const product = String(req.params.product)
    if (product !== 'atlas' && product !== 'catalog') {
      res.status(400).json({ error: `unknown product "${product}"`, code: 'BAD_PRODUCT' })
      return
    }
    try {
      const result = draft.buildDraft(String(req.params.id), product as DraftProduct)
      res.json({ data: result })
    } catch (err) {
      const msg = (err as Error).message
      res.status(500).json({ error: msg, code: 'BUILD_FAILED' })
    }
  })

  return router
}