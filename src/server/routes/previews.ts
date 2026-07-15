/**
 * Preview routes — per-product draft builds. POST returns the entry URL
 * the editor can mount to preview the latest project state.
 */
import { Router } from 'express'
import AdmZip from 'adm-zip'
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
      const baseUrl = `/api/projects/${encodeURIComponent(String(req.params.id))}/previews/${product}/builds/${encodeURIComponent(buildId)}`
      res.json({
        data: {
          product: result.product,
          buildId,
          sourceRevision: result.sourceRevision,
          entryUrl: `${baseUrl}/index.html`,
          downloadUrl: `${baseUrl}/download.zip`,
        },
      })
    } catch (err) {
      const msg = (err as Error).message
      res.status(500).json({ error: msg, code: 'BUILD_FAILED' })
    }
  })

  router.get('/projects/:id/previews/:product/builds/:buildId/download.zip', (req, res) => {
    const product = String(req.params.product)
    if (product !== 'atlas' && product !== 'catalog') {
      res.status(400).json({ error: `unknown product "${product}"`, code: 'BAD_PRODUCT' })
      return
    }
    const resolved = resolveDraftProductDir(
      draft.rootDir(),
      String(req.params.id),
      product,
      String(req.params.buildId),
    )
    if (!resolved) {
      res.status(400).json({ error: 'invalid preview build path', code: 'BAD_PATH' })
      return
    }
    if (!fs.existsSync(resolved.productDir)) {
      res.status(404).json({ error: 'preview build missing on disk', code: 'NOT_FOUND' })
      return
    }

    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(resolved.productDir, 'manifest.json'), 'utf8'),
      ) as { projectVersion?: string }
      if (!manifest.projectVersion) {
        throw new Error('preview manifest has no projectVersion')
      }
      const zipPath = path.join(resolved.buildDir, `${product}.zip`)
      if (!fs.existsSync(zipPath)) {
        const zip = new AdmZip()
        zip.addLocalFolder(resolved.productDir)
        zip.writeZip(zipPath)
      }
      const filename = `${safeFilenamePart(String(req.params.id))}-${product}-${safeFilenamePart(manifest.projectVersion)}.zip`
      res.download(zipPath, filename)
    } catch (error) {
      res.status(500).json({ error: (error as Error).message, code: 'ZIP_FAILED' })
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
    const resolved = resolveDraftProductDir(draft.rootDir(), projectId, product, buildId)
    if (!resolved) {
      res.status(400).json({ error: 'invalid preview build path', code: 'BAD_PATH' })
      return
    }
    const requestedPath = relPath.replaceAll('\\', '/')
    if (requestedPath.startsWith('/') || requestedPath.includes('..')) {
      res.status(400).json({ error: 'invalid preview asset path', code: 'BAD_PATH' })
      return
    }
    const abs = path.join(resolved.productDir, requestedPath)
    const resolvedRoot = path.resolve(resolved.productDir)
    const resolvedFile = path.resolve(abs)
    if (!resolvedFile.startsWith(resolvedRoot + path.sep) && resolvedFile !== resolvedRoot) {
      res.status(400).json({ error: 'invalid preview asset path', code: 'BAD_PATH' })
      return
    }
    if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
      res.status(404).json({ error: 'preview file missing on disk', code: 'NOT_FOUND' })
      return
    }
    res.sendFile(resolvedFile)
  })

  return router
}

function resolveDraftProductDir(
  rootDir: string,
  projectId: string,
  product: string,
  buildId: string,
): { buildDir: string; productDir: string } | null {
  if (
    !projectId ||
    !buildId ||
    path.basename(projectId) !== projectId ||
    path.basename(buildId) !== buildId ||
    !buildId.startsWith(`${product}-`)
  ) {
    return null
  }
  const root = path.resolve(rootDir)
  const buildDir = path.resolve(root, projectId, buildId)
  if (!buildDir.startsWith(`${root}${path.sep}`)) return null
  const productDir = path.resolve(buildDir, product)
  if (!productDir.startsWith(`${buildDir}${path.sep}`)) return null
  return { buildDir, productDir }
}

function safeFilenamePart(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, '-')
  return safe || 'project'
}
