/**
 * Asset routes — image, video, html-bundle upload + delete.
 *
 * Each upload accepts either `multipart/form-data` (Phase 3+ UI) or
 * `application/octet-stream` (raw bytes) so the bootstrap CLI can post
 * directly.
 */
import express, { Router, type Request, type Response, type NextFunction } from 'express'
import fs from 'node:fs'
import type { ProjectService } from '../services/project-service.js'
import type { AssetService } from '../services/asset-service.js'
import { AssetConflictError, RevisionConflictError } from '../services/asset-service.js'
import {
  AssetConflictError as StoredAssetConflictError,
  AssetValidationError,
  AssetNotFoundError,
} from '../storage/asset-repository.js'
import { mapServiceError } from './projects.js'

export function createAssetsRouter(
  projectService: ProjectService,
  assetService: AssetService,
): Router {
  const router = Router()
  router.use(express.json({ limit: '200mb' }))

  const handle =
    (fn: (req: Request, res: Response) => Promise<void> | void) =>
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const r = fn(req, res)
        if (r instanceof Promise) r.catch(next)
      } catch (err) {
        if (mapAssetError(err, res)) return
        if (mapServiceError(err, res)) return
        next(err)
      }
    }

  router.post(
    '/projects/:id/assets/image',
    express.raw({ type: '*/*', limit: '200mb' }),
    handle((req, res) => {
      const expectedRevision = parseRevision(req, res)
      if (expectedRevision === null) return
      const id = String(req.query.id ?? '').trim()
      if (!id) {
        res.status(400).json({ error: 'id query parameter is required', code: 'BAD_REQUEST' })
        return
      }
      const mimeType = String(req.headers['content-type'] ?? 'application/octet-stream')
      const ext = pickImageExt(mimeType, req)
      const buf = req.body as Buffer
      const def = assetService.registerImage(
        String(req.params.id),
        { id, bytes: buf, mimeType, extension: ext },
        { expectedRevision },
      )
      res.status(201).json({ data: def })
    }),
  )

  router.post(
    '/projects/:id/assets/video',
    express.raw({ type: '*/*', limit: '200mb' }),
    handle((req, res) => {
      const expectedRevision = parseRevision(req, res)
      if (expectedRevision === null) return
      const id = String(req.query.id ?? '').trim()
      if (!id) {
        res.status(400).json({ error: 'id query parameter is required', code: 'BAD_REQUEST' })
        return
      }
      const mimeType = String(req.headers['content-type'] ?? 'application/octet-stream')
      const ext = pickVideoExt(mimeType, req)
      const buf = req.body as Buffer
      const def = assetService.registerVideo(
        String(req.params.id),
        { id, bytes: buf, mimeType, extension: ext },
        { expectedRevision },
      )
      res.status(201).json({ data: def })
    }),
  )

  router.post(
    '/projects/:id/assets/html-bundle',
    express.raw({ type: '*/*', limit: '200mb' }),
    handle((req, res) => {
      const expectedRevision = parseRevision(req, res)
      if (expectedRevision === null) return
      const id = String(req.query.id ?? '').trim()
      if (!id) {
        res.status(400).json({ error: 'id query parameter is required', code: 'BAD_REQUEST' })
        return
      }
      const buf = req.body as Buffer
      const def = assetService.registerHtmlBundle(
        String(req.params.id),
        { id, bytes: buf },
        { expectedRevision },
      )
      res.status(201).json({ data: def })
    }),
  )

  router.delete(
    '/projects/:id/assets/:assetId',
    handle((req, res) => {
      const expectedRevision = parseRevision(req, res)
      if (expectedRevision === null) return
      assetService.remove(String(req.params.id), String(req.params.assetId), expectedRevision)
      res.json({ data: { ok: true } })
    }),
  )

  // GET — stream an asset blob back to the admin (or preview runtime) so the
  // editor can render the panorama image / play the transition video without
  // needing direct file-system access. The mime type comes from the asset
  // definition; missing assets return 404.
  router.get(
    '/projects/:id/assets/blob/:assetId',
    handle((req, res) => {
      const projectId = String(req.params.id)
      const assetId = String(req.params.assetId)
      const project = projectService.get(projectId)
      const def = project.assets.byId[assetId]
      if (!def) {
        res.status(404).json({ error: `asset ${assetId} not found`, code: 'NOT_FOUND' })
        return
      }
      let abs: string
      try {
        abs = assetService.absolutePathFor(projectId, assetId)
      } catch (err) {
        if (err instanceof AssetNotFoundError) {
          res.status(404).json({ error: err.message, code: 'NOT_FOUND' })
          return
        }
        throw err
      }
      if (!fs.existsSync(abs)) {
        res.status(404).json({ error: 'asset blob missing on disk', code: 'NOT_FOUND' })
        return
      }
      if (def.mimeType) res.setHeader('content-type', def.mimeType)
      res.setHeader('cache-control', 'private, max-age=300')
      fs.createReadStream(abs).pipe(res)
    }),
  )

  router.get(
    /^\/projects\/([^/]+)\/assets\/html-bundle\/([^/]+)\/(.+)$/,
    handle((req, res) => {
      const params = req.params as unknown as Record<string, string | undefined>
      const projectId = String(params['0'] ?? '')
      const assetId = String(params['1'] ?? '')
      const rawFilePath = String(params['2'] ?? '')
      const filePath = String(rawFilePath || '').trim()
      if (!filePath) {
        res.status(400).json({ error: 'file path is required', code: 'BAD_REQUEST' })
        return
      }
      let abs: string
      try {
        abs = assetService.absoluteHtmlBundleFilePathFor(projectId, assetId, filePath)
      } catch (err) {
        if (err instanceof AssetNotFoundError) {
          res.status(404).json({ error: err.message, code: 'NOT_FOUND' })
          return
        }
        throw err
      }
      if (!fs.existsSync(abs)) {
        res.status(404).json({ error: 'html bundle file missing on disk', code: 'NOT_FOUND' })
        return
      }
      res.setHeader('content-type', mimeForSceneFile(abs))
      res.setHeader('cache-control', 'private, max-age=300')
      fs.createReadStream(abs).pipe(res)
    }),
  )

  return router
}

function mapAssetError(err: unknown, res: Response): boolean {
  if (err instanceof AssetConflictError || err instanceof StoredAssetConflictError) {
    res.status(409).json({ error: err.message, code: 'ASSET_CONFLICT' })
    return true
  }
  if (err instanceof AssetValidationError) {
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' })
    return true
  }
  if (err instanceof AssetNotFoundError) {
    res.status(404).json({ error: err.message, code: 'NOT_FOUND' })
    return true
  }
  if (err instanceof RevisionConflictError) {
    res.status(409).json({ error: err.message, code: 'REVISION_CONFLICT' })
    return true
  }
  return false
}

function parseRevision(req: Request, res: Response): number | null {
  const raw = req.query.expectedRevision ?? req.header('x-expected-revision')
  if (raw === undefined) {
    res.status(400).json({ error: 'expectedRevision is required', code: 'BAD_REQUEST' })
    return null
  }
  const num = Number(raw)
  if (!Number.isInteger(num) || num < 0) {
    res
      .status(400)
      .json({ error: 'expectedRevision must be a non-negative integer', code: 'BAD_REQUEST' })
    return null
  }
  return num
}

function pickImageExt(mime: string, req: Request): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return requireSafeFilenameExtension(req)
}

function pickVideoExt(mime: string, req: Request): string {
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('quicktime')) return 'mov'
  return requireSafeFilenameExtension(req)
}

function requireSafeFilenameExtension(req: Request): string {
  const filename = String(req.query.filename ?? '')
  const extension = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : undefined
  if (!extension || !/^[a-z0-9]{1,10}$/.test(extension)) {
    throw new AssetValidationError('a safe filename extension is required for this content type')
  }
  return extension
}

function mimeForSceneFile(absPath: string): string {
  const lower = absPath.toLowerCase()
  if (lower.endsWith('.html')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  return 'application/octet-stream'
}
