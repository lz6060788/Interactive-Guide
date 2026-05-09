// ============================================================
// Interactive Guide - Guide Routes
// ============================================================
// All guide/node/edge CRUD endpoints.
// Thin controller — delegates to GuideService, no business logic here.

import { Router, type Request, type Response, type NextFunction } from 'express'
import { GuideService } from '../services/guide-service.js'

export function createGuidesRouter(guideService: GuideService): Router {
  const router = Router()

  // ─── Guide CRUD ────────────────────────────────────────

  router.get('/guides', (_req: Request, res: Response) => {
    res.json({ data: guideService.listGuides() })
  })

  router.get('/guides/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const guide = guideService.getGuide(String(req.params.id))
      res.json({ data: guide })
    } catch (err) {
      next(err)
    }
  })

  router.post('/guides/import', (req: Request, res: Response, next: NextFunction) => {
    try {
      const guide = guideService.importGuide(req.body)
      res.status(201).json({ data: guide })
    } catch (err) {
      next(err)
    }
  })

  router.put('/guides/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const guide = guideService.updateGuide(String(req.params.id), req.body)
      res.json({ data: guide })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/guides/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      guideService.deleteGuide(String(req.params.id))
      res.json({ data: { ok: true } })
    } catch (err) {
      next(err)
    }
  })

  // ─── Node CRUD ─────────────────────────────────────────

  router.post('/guides/:guideId/nodes', (req: Request, res: Response, next: NextFunction) => {
    try {
      const node = guideService.addNode(
        String(req.params.guideId),
        String(req.body.parentId),
        req.body.nodeData,
      )
      res.status(201).json({ data: node })
    } catch (err) {
      next(err)
    }
  })

  router.delete('/guides/:guideId/nodes/:nodeId', (req: Request, res: Response, next: NextFunction) => {
    try {
      guideService.deleteNode(
        String(req.params.guideId),
        String(req.params.nodeId),
      )
      res.json({ data: { ok: true } })
    } catch (err) {
      next(err)
    }
  })

  router.put('/guides/:guideId/nodes/:nodeId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const node = guideService.updateNode(
        String(req.params.guideId),
        String(req.params.nodeId),
        req.body,
      )
      res.json({ data: node })
    } catch (err) {
      next(err)
    }
  })

  router.put('/guides/:guideId/nodes/:nodeId/hotspots', (req: Request, res: Response, next: NextFunction) => {
    try {
      const node = guideService.updateHotspots(
        String(req.params.guideId),
        String(req.params.nodeId),
        req.body,
      )
      res.json({ data: node })
    } catch (err) {
      next(err)
    }
  })

  // ─── Edge CRUD ─────────────────────────────────────────

  router.put('/guides/:guideId/edges/:edgeId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const edge = guideService.updateEdge(
        String(req.params.guideId),
        String(req.params.edgeId),
        req.body,
      )
      res.json({ data: edge })
    } catch (err) {
      next(err)
    }
  })

  // ─── Manifest ──────────────────────────────────────────

  router.get('/guides/:id/manifest', (req: Request, res: Response, next: NextFunction) => {
    try {
      const manifest = guideService.getManifest(String(req.params.id))
      if (!manifest) {
        res.status(404).json({ error: 'No published manifest found', code: 'NOT_FOUND' })
        return
      }
      res.json({ data: manifest })
    } catch (err) {
      next(err)
    }
  })

  return router
}
