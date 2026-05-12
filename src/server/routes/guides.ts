// ============================================================
// Interactive Guide - Guide Routes
// ============================================================
// All guide/node/edge CRUD endpoints.
// Thin controller — delegates to GuideService, no business logic here.

import fs from 'node:fs'
import path from 'node:path'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { GuideService } from '../services/guide-service.js'
import type { KnowledgePackage } from '../../shared/types.js'

function hydrateGuideEdgeTransitions(guide: KnowledgePackage): KnowledgePackage {
  const generatesDir = path.resolve('data', 'generates')
  if (!fs.existsSync(generatesDir)) return guide

  const latest = fs.readdirSync(generatesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const generatePath = path.join(generatesDir, entry.name, 'generate.json')
      if (!fs.existsSync(generatePath)) return null
      try {
        const record = JSON.parse(fs.readFileSync(generatePath, 'utf-8'))
        return record?.packageId === guide.id
          ? { buildId: String(record.buildId), createdAt: String(record.createdAt ?? '') }
          : null
      } catch {
        return null
      }
    })
    .filter((item): item is { buildId: string; createdAt: string } => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  if (!latest) return guide

  guide.edges = guide.edges.map(edge => {
    const transitionPath = path.join(generatesDir, latest.buildId, 'edges', edge.id, 'transition.json')
    if (!fs.existsSync(transitionPath)) return edge

    try {
      const transition = JSON.parse(fs.readFileSync(transitionPath, 'utf-8'))
      return {
        ...edge,
        transitionStrategyMode: transition.strategyMode ?? edge.transitionStrategyMode,
        transitionStrategyReason: transition.strategyReason ?? edge.transitionStrategyReason,
        transitionPlan: transition.visualPlan ?? edge.transitionPlan,
        transitionPrompt: transition.prompt ?? edge.transitionPrompt,
        transitionPath: `generates/${latest.buildId}/edges/${edge.id}/transition.json`,
      }
    } catch {
      return edge
    }
  })

  return guide
}

export function createGuidesRouter(guideService: GuideService): Router {
  const router = Router()

  // ─── Guide CRUD ────────────────────────────────────────

  router.get('/guides', (_req: Request, res: Response) => {
    res.json({ data: guideService.listGuides() })
  })

  router.get('/guides/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const guide = hydrateGuideEdgeTransitions(guideService.getGuide(String(req.params.id)))
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
      // Allow passing ?t=timestamp to bypass frontend cache but extract pure ID for service
      // Note: req.params.id will NOT include the query string in Express (it's in req.query.t)
      // So we just use req.params.id directly. The query string cache-buster works at the network layer.
      const guideId = String(req.params.id)
      
      const manifest = guideService.getManifest(guideId)
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
