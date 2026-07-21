import crypto, { type Hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { REVIEW_ASSET_HASH_ALGORITHM } from '../../automation/contracts/review-session-v1.js'
import type { GuideProject } from '../../domain/project-types.js'
import type { ProjectRepository } from '../storage/project-repository.js'
import { computeProjectReleaseAssetIds } from './asset-closure.js'

export class AssetIntegrityError extends Error {
  constructor(
    public readonly assetId: string,
    message: string,
  ) {
    super(`asset "${assetId}" failed integrity validation: ${message}`)
    this.name = 'AssetIntegrityError'
  }
}

/** Hash the normalized paths and actual bytes copied into a release, not uploaded ZIP bytes. */
export function hashProjectAssetClosure(
  project: GuideProject,
  projects: ProjectRepository,
): string {
  return hashAssetClosureAtRoot(project, projects.resolveAssetDir(project.id))
}

export function hashAssetClosureAtRoot(project: GuideProject, assetRootInput: string): string {
  const hash = crypto.createHash('sha256')
  updateText(hash, 'algorithm')
  updateText(hash, REVIEW_ASSET_HASH_ALGORITHM)
  const assetIds = [...computeProjectReleaseAssetIds(project)].sort(compareText)
  updateText(hash, String(assetIds.length))
  const assetRoot = path.resolve(assetRootInput)

  for (const assetId of assetIds) {
    const definition = project.assets.byId[assetId]
    if (!definition) throw new AssetIntegrityError(assetId, 'definition is missing')
    const relativePath = normalizeSourcePath(definition.sourcePath, assetId)
    const absolutePath = resolveInside(assetRoot, relativePath, assetId)
    updateText(hash, assetId)
    updateText(hash, definition.kind)
    updateText(hash, relativePath)
    const stat = safeLstat(absolutePath, assetRoot, assetId)
    if (definition.kind === 'html-bundle') {
      if (!stat.isDirectory())
        throw new AssetIntegrityError(assetId, 'bundle path is not a directory')
      hashDirectory(hash, absolutePath, assetRoot, assetId)
    } else {
      if (!stat.isFile()) throw new AssetIntegrityError(assetId, 'blob path is not a regular file')
      updateText(hash, '.')
      hashFile(hash, absolutePath, stat.size)
    }
  }
  return hash.digest('hex')
}

function hashDirectory(hash: Hash, root: string, assetRoot: string, assetId: string): void {
  const files: Array<{ relativePath: string; absolutePath: string; size: number }> = []
  const seenCaseFolded = new Set<string>()
  walkDirectory(root, '', assetRoot, assetId, files, seenCaseFolded)
  files.sort((left, right) => compareText(left.relativePath, right.relativePath))
  updateText(hash, String(files.length))
  for (const file of files) {
    updateText(hash, file.relativePath)
    hashFile(hash, file.absolutePath, file.size)
  }
}

function walkDirectory(
  current: string,
  relativeDir: string,
  assetRoot: string,
  assetId: string,
  files: Array<{ relativePath: string; absolutePath: string; size: number }>,
  seenCaseFolded: Set<string>,
): void {
  const entries = fs
    .readdirSync(current, { withFileTypes: true })
    .sort((left, right) => compareText(left.name, right.name))
  for (const entry of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
    const caseFolded = relativePath.toLowerCase()
    if (seenCaseFolded.has(caseFolded)) {
      throw new AssetIntegrityError(assetId, `case-colliding path "${relativePath}"`)
    }
    seenCaseFolded.add(caseFolded)
    const absolutePath = path.join(current, entry.name)
    const stat = safeLstat(absolutePath, assetRoot, assetId)
    if (stat.isDirectory()) {
      walkDirectory(absolutePath, relativePath, assetRoot, assetId, files, seenCaseFolded)
    } else if (stat.isFile()) {
      files.push({ relativePath, absolutePath, size: stat.size })
    } else {
      throw new AssetIntegrityError(assetId, `unsupported filesystem entry "${relativePath}"`)
    }
  }
}

function safeLstat(absolutePath: string, assetRoot: string, assetId: string): fs.Stats {
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(absolutePath)
  } catch {
    throw new AssetIntegrityError(assetId, 'referenced path is missing')
  }
  if (stat.isSymbolicLink()) {
    throw new AssetIntegrityError(assetId, 'symbolic links and junctions are not allowed')
  }
  let realPath: string
  try {
    realPath = fs.realpathSync(absolutePath)
  } catch {
    throw new AssetIntegrityError(assetId, 'referenced path cannot be resolved')
  }
  if (!isInside(assetRoot, realPath)) {
    throw new AssetIntegrityError(assetId, 'resolved path escapes the project asset root')
  }
  return stat
}

function hashFile(hash: Hash, filePath: string, size: number): void {
  updateText(hash, String(size))
  const descriptor = fs.openSync(filePath, 'r')
  const buffer = Buffer.allocUnsafe(64 * 1024)
  try {
    let offset = 0
    while (offset < size) {
      const bytesRead = fs.readSync(
        descriptor,
        buffer,
        0,
        Math.min(buffer.length, size - offset),
        offset,
      )
      if (bytesRead === 0) throw new Error(`unexpected end of file: ${filePath}`)
      hash.update(buffer.subarray(0, bytesRead))
      offset += bytesRead
    }
  } finally {
    fs.closeSync(descriptor)
  }
}

function updateText(hash: Hash, value: string): void {
  const bytes = Buffer.from(value, 'utf8')
  const length = Buffer.allocUnsafe(8)
  length.writeBigUInt64BE(BigInt(bytes.length))
  hash.update(length)
  hash.update(bytes)
}

function normalizeSourcePath(sourcePath: string, assetId: string): string {
  const normalized = sourcePath.replaceAll('\\', '/').replace(/^assets\//, '')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').includes('..')
  ) {
    throw new AssetIntegrityError(assetId, `invalid sourcePath "${sourcePath}"`)
  }
  return normalized
}

function resolveInside(root: string, relativePath: string, assetId: string): string {
  const resolved = path.resolve(root, relativePath)
  if (!isInside(root, resolved)) {
    throw new AssetIntegrityError(assetId, `sourcePath "${relativePath}" escapes the asset root`)
  }
  return resolved
}

function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root)
  const normalizedCandidate = path.resolve(candidate)
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
  )
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
