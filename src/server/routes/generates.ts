// ============================================================
// Interactive Guide - Generate Routes
// ============================================================
// Generate trigger, status query, cancel, logs.
// Thin controller — delegates to GenerateService.

import { Router, type Request, type Response, type NextFunction } from 'express'
import { GenerateService } from '../services/generate-service.js'

export function createGeneratesRouter(generateService: GenerateService): Router {
  const router = Router()

  // ─── Generate Trigger ──────────────────────────────────

  router.post('/guides/:id/generate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = generateService.startGenerate(String(req.params.id))
      res.json({ data: record })
    } catch (err) {
      next(err)
    }
  })

  // ─── Generate Status ───────────────────────────────────

  router.get('/generates', (_req: Request, res: Response) => {
    res.json({ data: generateService.listGenerates() })
  })

  router.get('/generates/:generateId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const record = generateService.getRecord(String(req.params.generateId))
      res.json({ data: record })
    } catch (err) {
      next(err)
    }
  })

  router.post('/generates/:generateId/cancel', (req: Request, res: Response, next: NextFunction) => {
    try {
      generateService.cancelGenerate(String(req.params.generateId))
      res.json({ data: { ok: true } })
    } catch (err) {
      next(err)
    }
  })

  router.get('/generates/:generateId/logs', (req: Request, res: Response, next: NextFunction) => {
    try {
      const logs = generateService.getLogs(String(req.params.generateId))
      res.json({ data: logs })
    } catch (err) {
      next(err)
    }
  })

  // ─── Regenerate (Phase 5) ──────────────────────────────

  router.post('/guides/:guideId/nodes/:nodeId/regenerate', (req: Request, res: Response, next: NextFunction) => {
    try {
      generateService.regenerateNode(String(req.params.guideId), String(req.params.nodeId))
      // Find latest build for this guide to return buildId
      const generates = generateService.listGenerates()
        .filter(g => g.packageId === String(req.params.guideId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      res.json({
        data: {
          ok: true,
          buildId: generates[0]?.buildId,
          nodeId: String(req.params.nodeId),
        },
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/guides/:guideId/edges/:edgeId/regenerate', (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = generateService.regenerateEdge(
        String(req.params.guideId),
        String(req.params.edgeId),
      )
      res.json({ data: { ok: true, ...result } })
    } catch (err) {
      next(err)
    }
  })

  router.post('/guides/:guideId/nodes/:nodeId/hotspots/regenerate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await generateService.regenerateHotspots(
        String(req.params.guideId),
        String(req.params.nodeId),
      )
      res.json({ data: result })
    } catch (err) {
      next(err)
    }
  })

  return router
}
