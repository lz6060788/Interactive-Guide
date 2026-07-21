/**
 * AssetService — registers and removes assets for a project.
 *
 * Each operation:
 *   1. Validates revision and id conflicts before any filesystem mutation.
 *   2. Stages the blob and updates the project's asset registry
 *      (not through the field-level ProjectService patches, because a
 *      single asset operation may touch assets + scenes + navigation).
 *   3. Bumps revision with optimistic-lock semantics.
 */
import type { AssetDefinition, GuideProject } from '../../domain/project-types.js'
import {
  AssetRepository,
  AssetNotFoundError,
  type AssetWriteTransaction,
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
    const project = this.requireRegistration(projectId, input.id, options.expectedRevision)
    return this.register(
      project,
      this.assets.beginRegisterImage(projectId, input),
      options.expectedRevision,
    )
  }

  registerVideo(
    projectId: string,
    input: { id: string; bytes: Buffer; mimeType: string; extension: string },
    options: RegisterAssetOptions,
  ): AssetDefinition {
    const project = this.requireRegistration(projectId, input.id, options.expectedRevision)
    return this.register(
      project,
      this.assets.beginRegisterVideo(projectId, input),
      options.expectedRevision,
    )
  }

  registerHtmlBundle(
    projectId: string,
    input: { id: string; bytes: Buffer },
    options: RegisterAssetOptions,
  ): AssetDefinition {
    const project = this.requireRegistration(projectId, input.id, options.expectedRevision)
    return this.register(
      project,
      this.assets.beginRegisterHtmlBundle(projectId, input),
      options.expectedRevision,
    )
  }

  remove(projectId: string, assetId: string, expectedRevision: number): void {
    const project = this.requireRevision(projectId, expectedRevision)
    if (!project.assets.byId[assetId]) {
      throw new Error(`asset "${assetId}" not found in project "${projectId}"`)
    }
    const removal = this.assets.beginRemove(projectId, assetId)
    const next: GuideProject = {
      ...project,
      assets: { byId: { ...project.assets.byId } },
    }
    delete next.assets.byId[assetId]
    if (next.panorama.assetId === assetId) {
      next.panorama = { ...next.panorama, assetId: '' }
    }
    next.scenes = next.scenes.filter(s => s.assetId !== assetId)
    next.navigation.routes = next.navigation.routes.map(r =>
      r.transition?.assetId === assetId ? { ...r, transition: undefined } : r,
    )
    try {
      this.saveBumped(project, next, expectedRevision)
    } catch (error) {
      removal.rollback()
      throw error
    }
    removal.commit()
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

  private register(
    project: GuideProject,
    transaction: AssetWriteTransaction,
    expectedRevision: number,
  ): AssetDefinition {
    const next: GuideProject = {
      ...project,
      assets: {
        byId: {
          ...project.assets.byId,
          [transaction.definition.id]: transaction.definition,
        },
      },
    }
    try {
      transaction.commit()
      this.saveBumped(project, next, expectedRevision)
      transaction.accept()
      return transaction.definition
    } catch (error) {
      transaction.rollback()
      throw error
    }
  }

  private requireRegistration(
    projectId: string,
    assetId: string,
    expectedRevision: number,
  ): GuideProject {
    const project = this.requireRevision(projectId, expectedRevision)
    if (project.assets.byId[assetId]) throw new AssetConflictError(assetId)
    return project
  }

  private requireRevision(projectId: string, expectedRevision: number): GuideProject {
    const project = this.projects.get(projectId)
    if (project.metadata.revision !== expectedRevision) {
      throw new RevisionConflictError(project.metadata.revision)
    }
    return project
  }

  private saveBumped(previous: GuideProject, next: GuideProject, expectedRevision: number): void {
    const result = this.projects.save(next, { expectedRevision })
    if (result.conflict) {
      throw new RevisionConflictError(result.currentRevision)
    }
  }
}
