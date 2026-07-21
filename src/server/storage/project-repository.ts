/**
 * ProjectRepository — file-system storage for GuideProject 2.0.
 *
 * Layout:
 *   data/projects/{projectId}/
 *   ├─ project.json
 *   └─ assets/
 *      ├─ images/
 *      ├─ videos/
 *      └─ scenes/{assetId}/...
 *
 * Replaces legacy FsRepository's KnowledgePackage/PublishManifest path.
 * The legacy `data/workspace/` directory is removed in Phase 7.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { GuideProject } from '../../domain/project-types.js'
import { migrateGuideProject } from '../../domain/project-migration.js'
import { readLocalizedText } from '../../domain/localization.js'

export interface ListEntry {
  id: string
  title: string
  version: string
  locale: string
  revision: number
  updatedAt: string
  createdAt: string
  schemaVersion: string
}

export interface SaveOptions {
  expectedRevision?: number
}

export interface SaveResult {
  project: GuideProject
  conflict: false
  revision: number
}

export interface SaveConflict {
  conflict: true
  currentRevision: number
  currentUpdatedAt: string
}

export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: string) {
    super(`project "${projectId}" not found`)
    this.name = 'ProjectNotFoundError'
  }
}

export class ProjectCorruptError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly filePath: string,
    cause: unknown,
  ) {
    super(`project "${projectId}" is corrupt: ${(cause as Error).message}`)
    this.name = 'ProjectCorruptError'
  }
}

export class RevisionConflictError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly expectedRevision: number,
    public readonly currentRevision: number,
  ) {
    super(
      `revision conflict on project "${projectId}": expected ${expectedRevision}, current ${currentRevision}`,
    )
    this.name = 'RevisionConflictError'
  }
}

export class ProjectRepository {
  private readonly projectsRoot: string
  private readonly projects: Map<string, GuideProject> = new Map()
  /** projectId -> mtimeMs of project.json for hot-reload detection */
  private readonly loadedAt: Map<string, number> = new Map()

  constructor(opts: { dataDir?: string } = {}) {
    const dataDir = opts.dataDir ?? path.resolve('data')
    this.projectsRoot = path.join(dataDir, 'projects')
    fs.mkdirSync(this.projectsRoot, { recursive: true })
    this.loadAll()
  }

  private loadAll(): void {
    this.projects.clear()
    this.loadedAt.clear()
    if (!fs.existsSync(this.projectsRoot)) return
    for (const entry of fs.readdirSync(this.projectsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const projectId = entry.name
      const filePath = path.join(this.projectsRoot, projectId, 'project.json')
      try {
        const stat = fs.statSync(filePath)
        const project = migrateGuideProject(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
        this.projects.set(projectId, project)
        this.loadedAt.set(projectId, stat.mtimeMs)
      } catch (err) {
        throw new ProjectCorruptError(projectId, filePath, err)
      }
    }
  }

  list(): ListEntry[] {
    return Array.from(this.projects.values())
      .map(p => toListEntry(p))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(projectId: string): GuideProject {
    this.maybeReload(projectId)
    const project = this.projects.get(projectId)
    if (!project) throw new ProjectNotFoundError(projectId)
    return project
  }

  tryGet(projectId: string): GuideProject | null {
    this.maybeReload(projectId)
    return this.projects.get(projectId) ?? null
  }

  /** Persist a project with optional optimistic-lock revision check. */
  save(project: GuideProject, options: SaveOptions = {}): SaveResult | SaveConflict {
    const projectId = project.id
    const existing = this.projects.get(projectId)
    const now = new Date().toISOString()
    let nextRevision: number
    if (existing) {
      if (
        options.expectedRevision !== undefined &&
        existing.metadata.revision !== options.expectedRevision
      ) {
        return {
          conflict: true,
          currentRevision: existing.metadata.revision,
          currentUpdatedAt: existing.metadata.updatedAt,
        }
      }
      nextRevision = existing.metadata.revision + 1
    } else {
      if (options.expectedRevision !== undefined && options.expectedRevision !== 0) {
        return { conflict: true, currentRevision: 0, currentUpdatedAt: '' }
      }
      nextRevision = 1
    }
    const next: GuideProject = {
      ...project,
      metadata: {
        ...project.metadata,
        revision: nextRevision,
        updatedAt: now,
        createdAt: existing?.metadata.createdAt ?? project.metadata.createdAt ?? now,
        schemaVersion: '3.0.0',
      },
    }
    this.writeToDisk(next)
    this.projects.set(projectId, next)
    this.loadedAt.set(projectId, Date.now())
    return { project: next, conflict: false, revision: nextRevision }
  }

  delete(projectId: string): void {
    if (!this.projects.has(projectId)) throw new ProjectNotFoundError(projectId)
    const dir = path.join(this.projectsRoot, projectId)
    fs.rmSync(dir, { recursive: true, force: true })
    this.projects.delete(projectId)
    this.loadedAt.delete(projectId)
  }

  resolveAssetDir(projectId: string): string {
    return path.join(this.projectsRoot, projectId, 'assets')
  }

  /** Reload a project from disk if the file mtime changed since load. */
  private maybeReload(projectId: string): void {
    const filePath = path.join(this.projectsRoot, projectId, 'project.json')
    if (!fs.existsSync(filePath)) return
    const stat = fs.statSync(filePath)
    const last = this.loadedAt.get(projectId) ?? 0
    if (stat.mtimeMs <= last) return
    try {
      const project = migrateGuideProject(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
      this.projects.set(projectId, project)
      this.loadedAt.set(projectId, stat.mtimeMs)
    } catch (err) {
      throw new ProjectCorruptError(projectId, filePath, err)
    }
  }

  private writeToDisk(project: GuideProject): void {
    const dir = path.join(this.projectsRoot, project.id)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, 'project.json')
    const tmp = path.join(dir, `.project.${crypto.randomBytes(4).toString('hex')}.tmp`)
    fs.writeFileSync(tmp, JSON.stringify(project, null, 2))
    fs.renameSync(tmp, filePath)
  }
}

function toListEntry(project: GuideProject): ListEntry {
  const locale = project.localization.defaultLocale
  return {
    id: project.id,
    title: readLocalizedText(project.title, locale),
    version: project.version,
    locale,
    revision: project.metadata.revision,
    updatedAt: project.metadata.updatedAt,
    createdAt: project.metadata.createdAt,
    schemaVersion: project.metadata.schemaVersion,
  }
}
