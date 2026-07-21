/** Filesystem storage and immutable staging transactions for dual-product releases. */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  REVIEW_ASSET_HASH_ALGORITHM,
  REVIEW_PROJECT_HASH_ALGORITHM,
} from '../../automation/contracts/review-session-v1.js'
import { ProjectIdSchema, ProjectVersionSchema } from '../../domain/project-schema.js'

interface ReleaseManifestBase {
  projectId: string
  projectVersion: string
  generatedAt: string
  sourceRevision: number
  products: {
    atlas: { entry: string; manifest: string }
    catalog: { entry: string; manifest: string }
  }
}

/** Legacy release manifests remain readable after approval-gated releases are introduced. */
export interface ReleaseManifestV1 extends ReleaseManifestBase {
  schemaVersion: '1.0.0'
}

export interface ReleaseManifestV1_1 extends ReleaseManifestBase {
  schemaVersion: '1.1.0'
  workbenchVersion: string
  projectSha256: string
  projectHashAlgorithm: typeof REVIEW_PROJECT_HASH_ALGORITHM
  assetClosureSha256: string
  assetHashAlgorithm: typeof REVIEW_ASSET_HASH_ALGORITHM
  approval: {
    reviewSessionId: string
    approvedRevision: number
    approvedWorkbenchVersion: string
    approvedProjectSha256: string
    approvedAssetClosureSha256: string
    approvedAt: string
  }
}

export type ReleaseManifest = ReleaseManifestV1 | ReleaseManifestV1_1

export interface ReleaseTransaction {
  projectId: string
  version: string
  stagingDir: string
  finalDir: string
  commit(): void
  rollback(): void
}

export class InvalidReleasePathError extends Error {
  constructor(
    public readonly field: 'projectId' | 'version',
    public readonly value: string,
  ) {
    super(`invalid release ${field}: ${JSON.stringify(value)}`)
    this.name = 'InvalidReleasePathError'
  }
}

export class ReleaseAlreadyExistsError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly version: string,
  ) {
    super(`release "${projectId}" version "${version}" already exists`)
    this.name = 'ReleaseAlreadyExistsError'
  }
}

export class ReleaseBuildInProgressError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly version: string,
  ) {
    super(`release "${projectId}" version "${version}" is already being built`)
    this.name = 'ReleaseBuildInProgressError'
  }
}

export class ReleaseRepository {
  private readonly root: string

  constructor(opts: { dataDir?: string } = {}) {
    this.root = path.resolve(opts.dataDir ?? path.resolve('data'), 'releases')
    fs.mkdirSync(this.root, { recursive: true })
  }

  rootDir(): string {
    return this.root
  }

  releaseDir(projectId: string, version: string): string {
    const projectDir = this.projectDir(projectId)
    assertReleaseVersion(version)
    return resolveContained(projectDir, version, 'version')
  }

  listVersions(projectId: string): string[] {
    const projectDir = this.projectDir(projectId)
    if (!fs.existsSync(projectDir)) return []
    return fs
      .readdirSync(projectDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && ProjectVersionSchema.safeParse(entry.name).success)
      .map(entry => entry.name)
      .filter(version => this.readRelease(projectId, version) !== null)
      .sort()
  }

  readRelease(projectId: string, version: string): ReleaseManifest | null {
    const file = path.join(this.releaseDir(projectId, version), 'release.json')
    if (!fs.existsSync(file)) return null
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as ReleaseManifest
    } catch {
      return null
    }
  }

  beginRelease(projectId: string, version: string): ReleaseTransaction {
    const finalDir = this.releaseDir(projectId, version)
    if (fs.existsSync(finalDir)) throw new ReleaseAlreadyExistsError(projectId, version)

    fs.mkdirSync(path.dirname(finalDir), { recursive: true })
    const lockPath = `${finalDir}.lock`
    acquireBuildLock(lockPath, projectId, version)
    if (fs.existsSync(finalDir)) {
      fs.rmSync(lockPath, { force: true })
      throw new ReleaseAlreadyExistsError(projectId, version)
    }
    const stagingDir = path.join(path.dirname(finalDir), `.release-staging-${crypto.randomUUID()}`)
    try {
      fs.mkdirSync(stagingDir)
    } catch (error) {
      fs.rmSync(lockPath, { force: true })
      throw error
    }
    let finished = false

    return {
      projectId,
      version,
      stagingDir,
      finalDir,
      commit() {
        if (finished) throw new Error('release transaction is already closed')
        if (fs.existsSync(finalDir)) throw new ReleaseAlreadyExistsError(projectId, version)
        fs.renameSync(stagingDir, finalDir)
        finished = true
        fs.rmSync(lockPath, { force: true })
      },
      rollback() {
        if (finished) return
        finished = true
        fs.rmSync(stagingDir, { recursive: true, force: true })
        fs.rmSync(lockPath, { force: true })
      },
    }
  }

  private projectDir(projectId: string): string {
    if (!ProjectIdSchema.safeParse(projectId).success) {
      throw new InvalidReleasePathError('projectId', projectId)
    }
    return resolveContained(this.root, projectId, 'projectId')
  }
}

function acquireBuildLock(lockPath: string, projectId: string, version: string): void {
  try {
    const descriptor = fs.openSync(lockPath, 'wx')
    try {
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      )
    } finally {
      fs.closeSync(descriptor)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const ownerPid = readBuildLockPid(lockPath)
    if (ownerPid !== null && !isProcessAlive(ownerPid)) {
      fs.rmSync(lockPath, { force: true })
      acquireBuildLock(lockPath, projectId, version)
      return
    }
    throw new ReleaseBuildInProgressError(projectId, version)
  }
}

function readBuildLockPid(lockPath: string): number | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid?: unknown }
    return typeof parsed.pid === 'number' && Number.isInteger(parsed.pid) ? parsed.pid : null
  } catch {
    return null
  }
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function assertReleaseVersion(version: string): void {
  if (!ProjectVersionSchema.safeParse(version).success) {
    throw new InvalidReleasePathError('version', version)
  }
}

function resolveContained(
  rootInput: string,
  segment: string,
  field: 'projectId' | 'version',
): string {
  const root = path.resolve(rootInput)
  const resolved = path.resolve(root, segment)
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new InvalidReleasePathError(field, segment)
  }
  return resolved
}
