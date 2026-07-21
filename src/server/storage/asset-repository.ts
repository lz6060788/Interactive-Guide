/**
 * AssetRepository — file-system storage for asset blobs and registry.
 *
 * The project.json carries the asset registry (AssetRegistry). This class
 * owns the on-disk blobs and ensures paths stay inside the project root.
 *
 * All paths returned to the project file are relative to
 * `{projectsRoot}/{projectId}/` so the manifest compiler can rewrite them
 * to package-relative URLs at release time.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import AdmZip from 'adm-zip'
import type { AssetDefinition, AssetKind } from '../../domain/project-types.js'
import type { ProjectRepository } from './project-repository.js'

export interface RegisterImageInput {
  id: string
  bytes: Buffer
  mimeType: string
  extension: string
}

export interface RegisterVideoInput {
  id: string
  bytes: Buffer
  mimeType: string
  extension: string
}

export interface RegisterHtmlBundleInput {
  id: string
  /** Buffer of a zip file produced by `zip -r` or similar. */
  bytes: Buffer
}

export interface RegisterResult {
  definition: AssetDefinition
}

export class AssetConflictError extends Error {
  constructor(public readonly assetId: string) {
    super(`asset "${assetId}" already exists in the project`)
    this.name = 'AssetConflictError'
  }
}

export class AssetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssetValidationError'
  }
}

export class AssetNotFoundError extends Error {
  constructor(public readonly assetId: string) {
    super(`asset "${assetId}" not found`)
    this.name = 'AssetNotFoundError'
  }
}

const HTML_BUNDLE_LIMITS = {
  maxFiles: 200,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
}

export class AssetRepository {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly opts: {
      dataDir?: string
    } = {},
  ) {}

  registerImage(projectId: string, input: RegisterImageInput): RegisterResult {
    const root = this.projects.resolveAssetDir(projectId)
    const dir = this.imageDir(root, input.id)
    fs.mkdirSync(dir, { recursive: true })
    const ext = input.extension.replace(/^\./, '')
    const rel = path.posix.join('images', input.id, `image.${ext}`)
    fs.writeFileSync(path.join(root, rel), input.bytes)
    return {
      definition: {
        id: input.id,
        kind: 'image',
        sourcePath: rel,
        mimeType: input.mimeType,
        size: input.bytes.length,
        sha256: hash(input.bytes),
      },
    }
  }

  registerVideo(projectId: string, input: RegisterVideoInput): RegisterResult {
    const root = this.projects.resolveAssetDir(projectId)
    const dir = this.videoDir(root, input.id)
    fs.mkdirSync(dir, { recursive: true })
    const ext = input.extension.replace(/^\./, '')
    const rel = path.posix.join('videos', input.id, `video.${ext}`)
    fs.writeFileSync(path.join(root, rel), input.bytes)
    return {
      definition: {
        id: input.id,
        kind: 'video',
        sourcePath: rel,
        mimeType: input.mimeType,
        size: input.bytes.length,
        sha256: hash(input.bytes),
      },
    }
  }

  registerHtmlBundle(projectId: string, input: RegisterHtmlBundleInput): RegisterResult {
    const root = this.projects.resolveAssetDir(projectId)
    const dir = this.sceneDir(root, input.id)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const files = unzipSafely(input.bytes, dir)
    if (!files.includes('index.html')) {
      throw new AssetValidationError('html bundle must contain index.html at root')
    }
    return {
      definition: {
        id: input.id,
        kind: 'html-bundle',
        sourcePath: path.posix.join('scenes', input.id),
        entryPath: 'index.html',
        size: input.bytes.length,
        sha256: hash(input.bytes),
      },
    }
  }

  remove(projectId: string, assetId: string): void {
    const project = this.projects.tryGet(projectId)
    if (!project) throw new AssetNotFoundError(assetId)
    const def = project.assets.byId[assetId]
    if (!def) throw new AssetNotFoundError(assetId)
    const abs = path.join(this.projects.resolveAssetDir(projectId), def.sourcePath)
    fs.rmSync(abs, { recursive: true, force: true })
    // Also remove the assetId directory itself (e.g. `assets/images/asset-pano/`)
    // so a subsequent re-registration of the same asset id starts clean.
    const parent = path.dirname(abs)
    if (parent !== this.projects.resolveAssetDir(projectId)) {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  }

  absolutePathFor(projectId: string, sourcePath: string): string {
    const safe = assertInsideProject(projectId, sourcePath)
    return path.join(this.projects.resolveAssetDir(projectId), safe)
  }

  absoluteHtmlBundleFilePathFor(projectId: string, assetId: string, filePath: string): string {
    const safeFile = assertInsideProject(projectId, filePath)
    return path.join(this.sceneDir(this.projects.resolveAssetDir(projectId), assetId), safeFile)
  }

  private imageDir(root: string, assetId: string): string {
    return path.join(root, 'images', assetId)
  }
  private videoDir(root: string, assetId: string): string {
    return path.join(root, 'videos', assetId)
  }
  private sceneDir(root: string, assetId: string): string {
    return path.join(root, 'scenes', assetId)
  }
}

function hash(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/**
 * Safely unzip a buffer into `targetDir`, rejecting path traversal and
 * enforcing file count / size limits.
 *
 * Implementation uses adm-zip (already a dependency for legacy zip
 * uploads) to walk the entries, then re-checks each path against the
 * target root before writing. adm-zip itself does not fully guard
 * against traversal entries like `../../escape.txt`, so the explicit
 * re-check is required.
 */
function unzipSafely(zipBuf: Buffer, targetDir: string): string[] {
  const zip = new AdmZip(zipBuf)
  const entries = zip.getEntries()
  if (entries.length > HTML_BUNDLE_LIMITS.maxFiles) {
    throw new AssetValidationError(`html bundle exceeds ${HTML_BUNDLE_LIMITS.maxFiles} file limit`)
  }
  const files: string[] = []
  let totalBytes = 0
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const name = entry.entryName
    if (files.length >= HTML_BUNDLE_LIMITS.maxFiles) {
      throw new AssetValidationError(`html bundle exceeds ${HTML_BUNDLE_LIMITS.maxFiles} file limit`)
    }
    const size = entry.header.size
    if (size > HTML_BUNDLE_LIMITS.maxFileBytes) {
      throw new AssetValidationError(
        `file "${name}" exceeds ${HTML_BUNDLE_LIMITS.maxFileBytes} byte limit`,
      )
    }
    totalBytes += size
    if (totalBytes > HTML_BUNDLE_LIMITS.maxTotalBytes) {
      throw new AssetValidationError(
        `html bundle exceeds ${HTML_BUNDLE_LIMITS.maxTotalBytes} total bytes`,
      )
    }
    const target = path.join(targetDir, name)
    const resolved = path.resolve(target)
    const rootResolved = path.resolve(targetDir)
    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
      throw new AssetValidationError(`path traversal in zip entry: ${name}`)
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, entry.getData())
    files.push(name)
  }
  return files
}

function assertInsideProject(_projectId: string, sourcePath: string): string {
  const normalized = sourcePath.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.includes('..')) {
    throw new AssetValidationError(`asset path "${sourcePath}" must be project-relative and inside the project root`)
  }
  return normalized
}

export function kindFromMime(mime: string): AssetKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'html-bundle'
}
