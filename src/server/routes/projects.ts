/**
 * Project routes — the new HTTP surface for GuideProject 2.0.
 *
 * Each PATCH/PUT route requires `expectedRevision` in the request body
 * (or a query parameter for backward compat with the legacy `/guides`
 * routes that Phase 7 will remove). The router maps field-level updates
 * to ProjectService methods.
 */
import express, { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import {
  ProjectService,
  ProjectValidationError,
  RevisionConflictErrorPublic,
} from '../services/project-service.js'
import { GuideProjectSchema } from '../../domain/project-schema.js'
import { ProjectNotFoundError } from '../storage/project-repository.js'

const CreateBody = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
  title: z.string().min(1),
  locale: z.string().min(1).optional(),
})

const MetadataBody = z.object({
  title: z.string().min(1).optional(),
  titleLocale: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  locale: z.string().min(1).optional(),
  expectedRevision: z.number().int().nonnegative(),
})

const LocalizationBody = GuideProjectSchema.shape.localization.extend({
  expectedRevision: z.number().int().nonnegative(),
})

export function createProjectsRouter(projectService: ProjectService): Router {
  const router = Router()
  router.use(express.json({ limit: '20mb' }))

  const handle =
    (fn: (req: Request, res: Response) => Promise<void> | void) =>
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const r = fn(req, res)
        if (r instanceof Promise) r.catch(next)
      } catch (err) {
        if (!mapServiceError(err, res)) next(err)
      }
    }

  router.get('/projects', (_req, res) => {
    res.json({ data: projectService.list() })
  })

  router.post(
    '/projects',
    handle((req, res) => {
      const parsed = CreateBody.safeParse(req.body)
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: 'invalid body', code: 'BAD_REQUEST', issues: parsed.error.issues })
        return
      }
      const project = projectService.create(parsed.data)
      res.status(201).json({ data: project })
    }),
  )

  router.get(
    '/projects/:id',
    handle((req, res) => {
      const project = projectService.get(String(req.params.id))
      res.json({ data: project })
    }),
  )

  router.delete(
    '/projects/:id',
    handle((req, res) => {
      projectService.delete(String(req.params.id))
      res.json({ data: { ok: true } })
    }),
  )

  router.patch(
    '/projects/:id/metadata',
    handle((req, res) => {
      const parsed = MetadataBody.safeParse(req.body)
      if (!parsed.success) return badRequest(res, parsed.error.issues)
      const project = projectService.updateMetadata(
        String(req.params.id),
        parsed.data,
        parsed.data.expectedRevision,
      )
      res.json({ data: project })
    }),
  )

  router.put(
    '/projects/:id/localization',
    handle((req, res) => {
      const parsed = LocalizationBody.safeParse(req.body)
      if (!parsed.success) return badRequest(res, parsed.error.issues)
      const project = projectService.updateLocalization(
        String(req.params.id),
        {
          defaultLocale: parsed.data.defaultLocale,
          supportedLocales: parsed.data.supportedLocales,
        },
        parsed.data.expectedRevision,
      )
      res.json({ data: project })
    }),
  )

  router.put(
    '/projects/:id/knowledge',
    handle((req, res) => {
      const proj = requireExpectedRevision(req, res, projectService.get(String(req.params.id)))
      if (!proj) return
      const parsed = GuideProjectSchema.shape.knowledge.safeParse(req.body)
      if (!parsed.success) return badRequest(res, parsed.error.issues)
      const project = projectService.updateKnowledge(
        String(req.params.id),
        parsed.data,
        proj.metadata.revision,
      )
      res.json({ data: project })
    }),
  )

  router.put(
    '/projects/:id/panorama',
    handle((req, res) => {
      const proj = requireExpectedRevision(req, res, projectService.get(String(req.params.id)))
      if (!proj) return
      const parsed = GuideProjectSchema.shape.panorama.safeParse(req.body)
      if (!parsed.success) return badRequest(res, parsed.error.issues)
      const project = projectService.updatePanorama(
        String(req.params.id),
        parsed.data,
        proj.metadata.revision,
      )
      res.json({ data: project })
    }),
  )

  router.put(
    '/projects/:id/scenes',
    handle((req, res) => {
      const proj = requireExpectedRevision(req, res, projectService.get(String(req.params.id)))
      if (!proj) return
      const parsed = GuideProjectSchema.shape.scenes.safeParse(req.body)
      if (!parsed.success) return badRequest(res, parsed.error.issues)
      const project = projectService.updateScenes(
        String(req.params.id),
        parsed.data,
        proj.metadata.revision,
      )
      res.json({ data: project })
    }),
  )

  router.put(
    '/projects/:id/navigation',
    handle((req, res) => {
      const proj = requireExpectedRevision(req, res, projectService.get(String(req.params.id)))
      if (!proj) return
      const parsed = GuideProjectSchema.shape.navigation.safeParse(req.body)
      if (!parsed.success) return badRequest(res, parsed.error.issues)
      const project = projectService.updateNavigation(
        String(req.params.id),
        parsed.data,
        proj.metadata.revision,
      )
      res.json({ data: project })
    }),
  )

  router.put(
    '/projects/:id/products/atlas',
    handle((req, res) => {
      const proj = requireExpectedRevision(req, res, projectService.get(String(req.params.id)))
      if (!proj) return
      const parsed = GuideProjectSchema.shape.products.shape.atlas.safeParse(req.body)
      if (!parsed.success) return badRequest(res, parsed.error.issues)
      const project = projectService.updateAtlasConfig(
        String(req.params.id),
        parsed.data,
        proj.metadata.revision,
      )
      res.json({ data: project })
    }),
  )

  router.put(
    '/projects/:id/products/catalog',
    handle((req, res) => {
      const proj = requireExpectedRevision(req, res, projectService.get(String(req.params.id)))
      if (!proj) return
      const parsed = GuideProjectSchema.shape.products.shape.catalog.safeParse(req.body)
      if (!parsed.success) return badRequest(res, parsed.error.issues)
      const project = projectService.updateCatalogConfig(
        String(req.params.id),
        parsed.data,
        proj.metadata.revision,
      )
      res.json({ data: project })
    }),
  )

  router.put(
    '/projects/:id/integrations',
    handle((req, res) => {
      const proj = requireExpectedRevision(req, res, projectService.get(String(req.params.id)))
      if (!proj) return
      const parsed = GuideProjectSchema.shape.integrations.safeParse(req.body)
      if (!parsed.success) return badRequest(res, parsed.error.issues)
      const project = projectService.updateIntegrations(
        String(req.params.id),
        parsed.data,
        proj.metadata.revision,
      )
      res.json({ data: project })
    }),
  )

  return router
}

function requireExpectedRevision(
  _req: Request,
  res: Response,
  project: { metadata: { revision: number } } | undefined,
): { metadata: { revision: number } } | null {
  if (!project) {
    res.status(404).json({ error: 'project not found', code: 'NOT_FOUND' })
    return null
  }
  return project
}

export function mapServiceError(err: unknown, res: Response): boolean {
  if (err instanceof ProjectValidationError) {
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' })
    return true
  }
  if (err instanceof RevisionConflictErrorPublic) {
    res.status(409).json({
      error: err.message,
      code: 'REVISION_CONFLICT',
      currentRevision: err.currentRevision,
      currentUpdatedAt: err.currentUpdatedAt,
    })
    return true
  }
  if (err instanceof ProjectNotFoundError) {
    res.status(404).json({ error: err.message, code: 'NOT_FOUND' })
    return true
  }
  return false
}

function badRequest(res: Response, issues: z.ZodIssue[]): void {
  res.status(400).json({
    error: 'invalid body',
    code: 'BAD_REQUEST',
    issues: issues.map(i => ({ path: i.path.join('.'), message: i.message })),
  })
}
