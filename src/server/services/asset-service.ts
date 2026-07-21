/**
 * AssetService — registers and removes assets for a project.
 *
 * Each operation:
 *   1. Writes the blob to disk.
 *   2. Updates the project's asset registry via the underlying repository
 *      (not through the field-level ProjectService patches, because a
 *      single asset operation may touch assets + scenes + navigation).
 *   3. Bumps revision with optimistic-lock semantics.
 */
import type { AssetDefinition, GuideProject } from '../../domain/project-types.js'
import {
  AssetRepository,
  AssetNotFoundError,
  type RegisterResult,
} from '../storage/asset-repository.js'
import { ProjectRepository } from '../storage/project-repository.js'

export interface RegisterAssetOptions {
  expectedRevision: number
}

export class AssetConflictError extends Error {
  constructor(public readonly assetId: string) {
    super(`asset "${assetId}" already exists in the project`)
    this.name = 'AssetConflictError'
  }
}

export class RevisionConflictError extends Error {
  constructor(public readonly currentRevision: number) {
    super(`revision conflict: current revision is ${currentRevision}`)
    this.name = 'RevisionConflictError'
  }
}

export class AssetService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly assets: AssetRepository,
  ) {}

  registerImage(
    projectId: string,
    input: { id: string; bytes: Buffer; mimeType: string; extension: string },
    options: RegisterAssetOptions,
  ): AssetDefinition {
    return this.register(projectId, this.assets.registerImage(projectId, input), options)
  }

  registerVideo(
    projectId: string,
    input: { id: string; bytes: Buffer; mimeType: string; extension: string },
    options: RegisterAssetOptions,
  ): AssetDefinition {
    return this.register(projectId, this.assets.registerVideo(projectId, input), options)
  }

  registerHtmlBundle(
    projectId: string,
    input: { id: string; bytes: Buffer },
    options: RegisterAssetOptions,
  ): AssetDefinition {
    return this.register(projectId, this.assets.registerHtmlBundle(projectId, input), options)
  }

  remove(projectId: string, assetId: string, expectedRevision: number): void {
    const project = this.projects.get(projectId)
    if (!project.assets.byId[assetId]) {
      throw new Error(`asset "${assetId}" not found in project "${projectId}"`)
    }
    this.assets.remove(projectId, assetId)
    const next: GuideProject = {
      ...project,
      assets: { byId: { ...project.assets.byId } },
    }
    delete next.assets.byId[assetId]
    if (next.panorama.assetId === assetId) {
      next.panorama = { ...next.panorama, assetId: '' }
    }
    next.scenes = next.scenes.filter((s) => s.assetId !== assetId)
    next.navigation.routes = next.navigation.routes.map((r) =>
      r.transition?.assetId === assetId ? { ...r, transition: undefined } : r,
    )
    this.saveBumped(project, next, expectedRevision)
  }

  /**
   * Resolves an asset id to its on-disk absolute path. Throws
   * AssetNotFoundError if either the project or the asset id is missing.
   */
  absolutePathFor(projectId: string, assetId: string): string {
    const project = this.projects.tryGet(projectId)
    if (!project) {
      throw new AssetNotFoundError(assetId)
    }
    const def = project.assets.byId[assetId]
    if (!def) {
      throw new AssetNotFoundError(assetId)
    }
    return this.assets.absolutePathFor(projectId, def.sourcePath)
  }

  absoluteHtmlBundleFilePathFor(projectId: string, assetId: string, filePath: string): string {
    const project = this.projects.tryGet(projectId)
    if (!project) {
      throw new AssetNotFoundError(assetId)
    }
    const def = project.assets.byId[assetId]
    if (!def || def.kind !== 'html-bundle') {
      throw new AssetNotFoundError(assetId)
    }
    return this.assets.absoluteHtmlBundleFilePathFor(projectId, assetId, filePath)
  }

  private register(projectId: string, reg: RegisterResult, options: RegisterAssetOptions): AssetDefinition {
    const project = this.projects.get(projectId)
    if (project.assets.byId[reg.definition.id]) {
      throw new AssetConflictError(reg.definition.id)
    }
    const next: GuideProject = {
      ...project,
      assets: { byId: { ...project.assets.byId, [reg.definition.id]: reg.definition } },
    }
    this.saveBumped(project, next, options.expectedRevision)
    return reg.definition
  }

  private saveBumped(previous: GuideProject, next: GuideProject, expectedRevision: number): void {
    const result = this.projects.save(next, { expectedRevision })
    if (result.conflict) {
      throw new RevisionConflictError(result.currentRevision)
    }
  }
}
