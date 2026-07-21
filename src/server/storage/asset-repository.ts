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
import { AssetIdSchema } from '../../domain/project-schema.js'
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

export interface AssetWriteTransaction extends RegisterResult {
  commit(): void
  accept(): void
  rollback(): void
}

export interface AssetRemoveTransaction {
  commit(): void
  rollback(): void
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
    return commitStandalone(this.beginRegisterImage(projectId, input))
  }

  beginRegisterImage(projectId: string, input: RegisterImageInput): AssetWriteTransaction {
    const root = this.projects.resolveAssetDir(projectId)
    const assetId = requireAssetId(input.id)
    const ext = requireAssetExtension(input.extension)
    const rel = path.posix.join('images', assetId, `image.${ext}`)
    return this.beginWrite(
      root,
      'images',
      assetId,
      {
        id: assetId,
        kind: 'image',
        sourcePath: rel,
        mimeType: input.mimeType,
        size: input.bytes.length,
        sha256: hash(input.bytes),
      },
      stagingDir => {
        fs.writeFileSync(path.join(stagingDir, `image.${ext}`), input.bytes)
      },
    )
  }

  registerVideo(projectId: string, input: RegisterVideoInput): RegisterResult {
    return commitStandalone(this.beginRegisterVideo(projectId, input))
  }

  beginRegisterVideo(projectId: string, input: RegisterVideoInput): AssetWriteTransaction {
    const root = this.projects.resolveAssetDir(projectId)
    const assetId = requireAssetId(input.id)
    const ext = requireAssetExtension(input.extension)
    const rel = path.posix.join('videos', assetId, `video.${ext}`)
    return this.beginWrite(
      root,
      'videos',
      assetId,
      {
        id: assetId,
        kind: 'video',
        sourcePath: rel,
        mimeType: input.mimeType,
        size: input.bytes.length,
        sha256: hash(input.bytes),
      },
      stagingDir => {
        fs.writeFileSync(path.join(stagingDir, `video.${ext}`), input.bytes)
      },
    )
  }

  registerHtmlBundle(projectId: string, input: RegisterHtmlBundleInput): RegisterResult {
    return commitStandalone(this.beginRegisterHtmlBundle(projectId, input))
  }

  beginRegisterHtmlBundle(
    projectId: string,
    input: RegisterHtmlBundleInput,
  ): AssetWriteTransaction {
    const root = this.projects.resolveAssetDir(projectId)
    const assetId = requireAssetId(input.id)
    return this.beginWrite(
      root,
      'scenes',
      assetId,
      {
        id: assetId,
        kind: 'html-bundle',
        sourcePath: path.posix.join('scenes', assetId),
        entryPath: 'index.html',
        size: input.bytes.length,
        sha256: hash(input.bytes),
      },
      stagingDir => {
        const files = unzipSafely(input.bytes, stagingDir)
        if (!files.includes('index.html')) {
          throw new AssetValidationError('html bundle must contain index.html at root')
        }
      },
    )
  }

  remove(projectId: string, assetId: string): void {
    const transaction = this.beginRemove(projectId, assetId)
    try {
      transaction.commit()
    } catch (error) {
      transaction.rollback()
      throw error
    }
  }

  beginRemove(projectId: string, assetId: string): AssetRemoveTransaction {
    const project = this.projects.tryGet(projectId)
    if (!project) throw new AssetNotFoundError(assetId)
    const def = project.assets.byId[assetId]
    if (!def) throw new AssetNotFoundError(assetId)
    if (def.id !== assetId) {
      throw new AssetValidationError(
        `asset registry key "${assetId}" does not match definition id "${def.id}"`,
      )
    }
    const root = this.projects.resolveAssetDir(projectId)
    const storageDir = this.storageDir(root, def)
    const stagedDir = path.join(
      path.dirname(storageDir),
      `.asset-delete-${def.id}-${crypto.randomUUID()}`,
    )
    const moved = fs.existsSync(storageDir)
    if (moved) fs.renameSync(storageDir, stagedDir)
    let finished = false
    return {
      commit() {
        if (finished) return
        finished = true
        if (moved) {
          try {
            fs.rmSync(stagedDir, { recursive: true, force: true })
          } catch (error) {
            console.warn(
              `[AssetRepository] deferred cleanup required for ${stagedDir}: ${(error as Error).message}`,
            )
          }
        }
      },
      rollback() {
        if (finished) return
        if (moved && fs.existsSync(stagedDir)) {
          if (fs.existsSync(storageDir)) {
            throw new AssetConflictError(def.id)
          }
          fs.renameSync(stagedDir, storageDir)
        }
        finished = true
      },
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

  private beginWrite(
    root: string,
    kindDir: 'images' | 'videos' | 'scenes',
    assetId: string,
    definition: AssetDefinition,
    populate: (stagingDir: string) => void,
  ): AssetWriteTransaction {
    const parent = path.join(root, kindDir)
    const finalDir = path.join(parent, assetId)
    if (fs.existsSync(finalDir)) throw new AssetConflictError(assetId)
    fs.mkdirSync(parent, { recursive: true })
    const stagingDir = path.join(parent, `.asset-staging-${assetId}-${crypto.randomUUID()}`)
    fs.mkdirSync(stagingDir)
    try {
      populate(stagingDir)
    } catch (error) {
      fs.rmSync(stagingDir, { recursive: true, force: true })
      throw error
    }
    let committed = false
    let accepted = false
    return {
      definition,
      commit() {
        if (committed) return
        if (fs.existsSync(finalDir)) throw new AssetConflictError(assetId)
        fs.renameSync(stagingDir, finalDir)
        committed = true
      },
      accept() {
        if (!committed) throw new Error('asset transaction must be committed before acceptance')
        accepted = true
      },
      rollback() {
        if (accepted) return
        fs.rmSync(committed ? finalDir : stagingDir, { recursive: true, force: true })
      },
    }
  }

  private storageDir(root: string, definition: AssetDefinition): string {
    const assetId = requireAssetId(definition.id)
    switch (definition.kind) {
      case 'image':
        return this.imageDir(root, assetId)
      case 'video':
        return this.videoDir(root, assetId)
      case 'html-bundle':
        return this.sceneDir(root, assetId)
    }
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

function commitStandalone(transaction: AssetWriteTransaction): RegisterResult {
  try {
    transaction.commit()
    transaction.accept()
    return { definition: transaction.definition }
  } catch (error) {
    transaction.rollback()
    throw error
  }
}

function requireAssetId(assetId: string): string {
  if (!AssetIdSchema.safeParse(assetId).success) {
    throw new AssetValidationError(`asset id "${assetId}" must be a safe path segment`)
  }
  return assetId
}

function requireAssetExtension(extension: string): string {
  const normalized = extension.replace(/^\./, '').toLowerCase()
  if (!/^[a-z0-9]{1,10}$/.test(normalized)) {
    throw new AssetValidationError(
      `asset extension "${extension}" must be 1-10 alphanumeric characters`,
    )
  }
  return normalized
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
  const files = validateHtmlBundleEntries(zipBuf, entries)
  const entriesByName = new Map(entries.map(entry => [normalizeZipEntryName(entry), entry]))
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const name = normalizeZipEntryName(entry)
    const target = path.join(targetDir, name)
    const resolved = path.resolve(target)
    const rootResolved = path.resolve(targetDir)
    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
      throw new AssetValidationError(`path traversal in zip entry: ${name}`)
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    const data = entriesByName.get(name)!.getData()
    if (data.length !== entry.header.size || data.length > HTML_BUNDLE_LIMITS.maxFileBytes) {
      throw new AssetValidationError(`file "${name}" has an invalid uncompressed size`)
    }
    fs.writeFileSync(resolved, data)
  }
  return files
}

/** Validate an uploaded HTML scene archive without writing it to the workspace. */
export function validateHtmlBundleArchive(zipBuf: Buffer): string[] {
  let entries: AdmZip.IZipEntry[]
  try {
    entries = new AdmZip(zipBuf).getEntries()
  } catch (error) {
    throw new AssetValidationError(`invalid html bundle zip: ${(error as Error).message}`)
  }
  return validateHtmlBundleEntries(zipBuf, entries)
}

function validateHtmlBundleEntries(zipBuf: Buffer, entries: AdmZip.IZipEntry[]): string[] {
  if (zipBuf.length > HTML_BUNDLE_LIMITS.maxTotalBytes) {
    throw new AssetValidationError(
      `html bundle archive exceeds ${HTML_BUNDLE_LIMITS.maxTotalBytes} byte limit`,
    )
  }
  if (entries.length > HTML_BUNDLE_LIMITS.maxFiles) {
    throw new AssetValidationError(`html bundle exceeds ${HTML_BUNDLE_LIMITS.maxFiles} file limit`)
  }
  const files: string[] = []
  const seenCaseFolded = new Map<string, string>()
  let totalBytes = 0
  for (const entry of entries) {
    const name = normalizeZipEntryName(entry)
    const caseFolded = name.toLowerCase()
    const previous = seenCaseFolded.get(caseFolded)
    if (previous) {
      const kind = previous === name ? 'duplicate' : 'case-colliding'
      throw new AssetValidationError(`${kind} path in html bundle: ${previous} / ${name}`)
    }
    seenCaseFolded.set(caseFolded, name)
    if (isZipSymlink(entry)) {
      throw new AssetValidationError(`symbolic link is not allowed in html bundle: ${name}`)
    }
    if (entry.isDirectory) continue
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
    files.push(name)
  }
  if (!files.includes('index.html')) {
    throw new AssetValidationError('html bundle must contain index.html at root')
  }
  return files
}

function normalizeZipEntryName(entry: AdmZip.IZipEntry): string {
  const raw = entry.entryName
  if (
    !raw ||
    raw.includes('\\') ||
    raw.includes('\0') ||
    raw.startsWith('/') ||
    /^[A-Za-z]:/.test(raw)
  ) {
    throw new AssetValidationError(`invalid path in html bundle: ${raw}`)
  }
  const normalized = entry.isDirectory && raw.endsWith('/') ? raw.slice(0, -1) : raw
  const segments = normalized.split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new AssetValidationError(`invalid path in html bundle: ${raw}`)
  }
  return normalized
}

function isZipSymlink(entry: AdmZip.IZipEntry): boolean {
  const unixFileType = (entry.attr >>> 16) & 0xf000
  return unixFileType === 0xa000
}

function assertInsideProject(_projectId: string, sourcePath: string): string {
  const normalized = sourcePath.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.includes('..')) {
    throw new AssetValidationError(
      `asset path "${sourcePath}" must be project-relative and inside the project root`,
    )
  }
  return normalized
}

export function kindFromMime(mime: string): AssetKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'html-bundle'
}
