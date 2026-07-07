/**
 * Preview routes — per-product draft builds. POST returns the entry URL
 * the editor can mount to preview the latest project state.
 */
import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
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
      const buildId = path.basename(result.draftDir)
      res.json({
        data: {
          ...result,
          entryUrl: `/api/projects/${encodeURIComponent(String(req.params.id))}/previews/${product}/builds/${encodeURIComponent(buildId)}/index.html`,
          buildId,
        },
      })
    } catch (err) {
      const msg = (err as Error).message
      res.status(500).json({ error: msg, code: 'BUILD_FAILED' })
    }
  })

  router.get(/^\/projects\/([^/]+)\/previews\/([^/]+)\/builds\/([^/]+)\/(.+)$/, (req, res) => {
    const captures = req.params as unknown as Record<number, string>
    const projectId = captures[0] ?? ''
    const product = captures[1] ?? ''
    const buildId = captures[2] ?? ''
    const relPath = captures[3] ?? ''
    if (product !== 'atlas' && product !== 'catalog') {
      res.status(400).json({ error: `unknown product "${product}"`, code: 'BAD_PRODUCT' })
      return
    }
    const productDir = path.join(draft.rootDir(), projectId, buildId, product)
    const requestedPath = relPath.replaceAll('\\', '/')
    if (requestedPath.startsWith('/') || requestedPath.includes('..')) {
      res.status(400).json({ error: 'invalid preview asset path', code: 'BAD_PATH' })
      return
    }
    const abs = path.join(productDir, requestedPath)
    const resolvedRoot = path.resolve(productDir)
    const resolvedFile = path.resolve(abs)
    if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
      res.status(400).json({ error: 'invalid preview asset path', code: 'BAD_PATH' })
      return
    }
    if (!fs.existsSync(resolvedFile)) {
      res.status(404).json({ error: 'preview file missing on disk', code: 'NOT_FOUND' })
      return
    }
    res.sendFile(resolvedFile)
  })

  return router
}
