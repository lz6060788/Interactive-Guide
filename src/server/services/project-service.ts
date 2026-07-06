/**
 * ProjectService — orchestrates project CRUD with revision locking and
 * Zod shape validation. Each update touches only one logical sub-section
 * of the project to make concurrent edits from two editors safe.
 *
 * Field-level patch operations (knowledge, panorama, scenes, navigation,
 * atlas config, catalog config, integrations) carry their own
 * `expectedRevision`. The base update is reserved for metadata.
 */
import type { GuideProject } from '../../domain/project-types.js'
import {
  GuideProjectSchema,
} from '../../domain/project-schema.js'
import {
  ProjectRepository,
  type ListEntry,
} from '../storage/project-repository.js'
import { normalizeProject, createDraftProject } from '../../domain/project-normalizer.js'

export interface ProjectServiceOptions {
  now?: () => string
}

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectValidationError'
  }
}

export class ProjectService {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly opts: ProjectServiceOptions = {},
  ) {}

  list(): ListEntry[] {
    return this.repo.list()
  }

  get(projectId: string): GuideProject {
    return this.repo.get(projectId)
  }

  create(input: { id: string; title: string; locale?: string }): GuideProject {
    if (!input.id || !input.title) {
      throw new ProjectValidationError('create requires id and title')
    }
    if (this.repo.tryGet(input.id)) {
      throw new ProjectValidationError(`project "${input.id}" already exists`)
    }
    const draft = createDraftProject(input)
    // Allow panorama.assetId='' for a freshly-created empty project; the next
    // PATCH (upload a panorama image) will fill it in. We bypass the
    // normalizer's "panorama.assetId is required" check by saving directly.
    const result = this.repo.save(draft, { expectedRevision: 0 })
    if (result.conflict) {
      throw new ProjectValidationError(`project "${input.id}" was created concurrently`)
    }
    return result.project
  }

  updateMetadata(
    projectId: string,
    patch: { title?: string; version?: string; locale?: string },
    expectedRevision: number,
  ): GuideProject {
    return this.patch(projectId, expectedRevision, (project) => ({
      ...project,
      title: patch.title ?? project.title,
      version: patch.version ?? project.version,
      locale: patch.locale ?? project.locale,
    }))
  }

  updateKnowledge(projectId: string, knowledge: GuideProject['knowledge'], expectedRevision: number): GuideProject {
    return this.patch(projectId, expectedRevision, (project) => ({ ...project, knowledge }))
  }

  updatePanorama(projectId: string, panorama: GuideProject['panorama'], expectedRevision: number): GuideProject {
    return this.patch(projectId, expectedRevision, (project) => ({ ...project, panorama }))
  }

  updateScenes(projectId: string, scenes: GuideProject['scenes'], expectedRevision: number): GuideProject {
    return this.patch(projectId, expectedRevision, (project) => ({ ...project, scenes }))
  }

  updateNavigation(projectId: string, navigation: GuideProject['navigation'], expectedRevision: number): GuideProject {
    return this.patch(projectId, expectedRevision, (project) => ({ ...project, navigation }))
  }

  updateAtlasConfig(
    projectId: string,
    atlas: GuideProject['products']['atlas'],
    expectedRevision: number,
  ): GuideProject {
    return this.patch(projectId, expectedRevision, (project) => ({
      ...project,
      products: { ...project.products, atlas },
    }))
  }

  updateCatalogConfig(
    projectId: string,
    catalog: GuideProject['products']['catalog'],
    expectedRevision: number,
  ): GuideProject {
    return this.patch(projectId, expectedRevision, (project) => ({
      ...project,
      products: { ...project.products, catalog },
    }))
  }

  updateIntegrations(
    projectId: string,
    integrations: GuideProject['integrations'],
    expectedRevision: number,
  ): GuideProject {
    return this.patch(projectId, expectedRevision, (project) => ({ ...project, integrations }))
  }

  delete(projectId: string): void {
    this.repo.delete(projectId)
  }

  /** Read+normalize+save. Used by bootstrap Skill when creating a fresh project. */
  importNormalized(project: GuideProject): GuideProject {
    const parsed = GuideProjectSchema.safeParse(project)
    if (!parsed.success) {
      throw new ProjectValidationError(
        `importNormalized shape invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      )
    }
    const normalized = normalizeProject(parsed.data)
    const result = this.repo.save(normalized, { expectedRevision: 0 })
    if (result.conflict) {
      throw new ProjectValidationError(`project "${project.id}" already exists`)
    }
    return result.project
  }

  private patch(
    projectId: string,
    expectedRevision: number,
    mutator: (project: GuideProject) => GuideProject,
  ): GuideProject {
    const current = this.repo.get(projectId)
    const next = mutator(current)
    const parsed = GuideProjectSchema.safeParse(next)
    if (!parsed.success) {
      throw new ProjectValidationError(
        `project update shape invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      )
    }
    const result = this.repo.save(parsed.data, { expectedRevision })
    if (result.conflict) {
      throw new RevisionConflictErrorPublic(result.currentRevision, result.currentUpdatedAt)
    }
    return result.project
  }
}

export class RevisionConflictErrorPublic extends Error {
  constructor(public readonly currentRevision: number, public readonly currentUpdatedAt: string) {
    super(`revision conflict: current revision is ${currentRevision}`)
    this.name = 'RevisionConflictError'
  }
}

function blankAtlasConfig(): GuideProject['products']['atlas'] {
  return {
    enabled: true,
    viewport: { width: 375, height: 808 },
    theme: { hotspotVariant: 'default', calloutVariant: 'classic' },
    chrome: {},
    interaction: { wheelZoom: true, dragPan: true, pinchZoom: true, resetCameraEnabled: true },
    categoryIds: [],
  }
}

function blankCatalogConfig(): GuideProject['products']['catalog'] {
  return {
    enabled: true,
    viewport: { width: 375, height: 808 },
    theme: { listDensity: 'comfortable', focusVariant: 'rect' },
    chrome: {},
    interaction: { listActivation: 'center-nearest', markerActivation: true, viewportAnimationMs: 360 },
    stageOrder: ['upstream', 'midstream', 'downstream'],
  }
}
