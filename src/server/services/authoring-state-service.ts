import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  AuthoringSourceFileSchema,
  type AuthoringKnowledgeSchema,
} from '../../automation/contracts/authoring-bundle-v1.js'
import {
  GUIDE_AUTHORING_STATE_CONTRACT,
  GUIDE_AUTHORING_STATE_VERSION,
  GuideAuthoringStateV1Schema,
  PROJECT_TREE_HASH_ALGORITHM,
  type AuthoringRuntimeAssetState,
  type GuideAuthoringStateV1,
} from '../../automation/contracts/authoring-state-v1.js'
import type { AssetDefinition, GuideProject } from '../../domain/project-types.js'
import { WORKBENCH_VERSION } from '../workbench-version.js'
import { ProjectNotFoundError, ProjectRepository } from '../storage/project-repository.js'
import { hashProjectTree } from './authoring-service.js'
import { hashGuideProject } from './review-service.js'

const AuthoringSourceManifestSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    files: z.array(AuthoringSourceFileSchema.omit({ usage: true })),
  })
  .strict()

type AuthoringKnowledge = z.infer<typeof AuthoringKnowledgeSchema>
type AuthoringSource = z.infer<typeof AuthoringSourceManifestSchema>['files'][number]

export class AuthoringStateCorruptError extends Error {
  constructor(
    public readonly projectId: string,
    cause: unknown,
  ) {
    super(`authoring state for "${projectId}" is corrupt: ${(cause as Error).message}`)
    this.name = 'AuthoringStateCorruptError'
  }
}

export class AuthoringSourceManifestCorruptError extends AuthoringStateCorruptError {
  constructor(projectId: string, cause: unknown) {
    super(projectId, cause)
    this.name = 'AuthoringSourceManifestCorruptError'
  }
}

/** Stable, path-free projection used by automation clients for safe updates. */
export class AuthoringStateService {
  constructor(private readonly projects: ProjectRepository) {}

  get(projectId: string): GuideAuthoringStateV1 {
    try {
      const project = this.projects.get(projectId)
      const projectRoot = path.dirname(this.projects.resolveAssetDir(projectId))

      return GuideAuthoringStateV1Schema.parse({
        contract: GUIDE_AUTHORING_STATE_CONTRACT,
        contractVersion: GUIDE_AUTHORING_STATE_VERSION,
        workbenchVersion: WORKBENCH_VERSION,
        projectId: project.id,
        revision: project.metadata.revision,
        projectSha256: hashGuideProject(project),
        projectTreeSha256: hashProjectTree(projectRoot),
        projectTreeHashAlgorithm: PROJECT_TREE_HASH_ALGORITHM,
        project: {
          title: structuredClone(project.title),
          version: project.version,
          localization: structuredClone(project.localization),
          createdAt: project.metadata.createdAt,
          updatedAt: project.metadata.updatedAt,
        },
        knowledge: toAuthoringKnowledge(project),
        runtimeAssets: Object.values(project.assets.byId)
          .sort((left, right) => compareText(left.id, right.id))
          .map(toRuntimeAssetState),
        panorama: {
          imageAssetId: project.panorama.assetId || null,
          cameraBounds: structuredClone(project.panorama.cameraBounds),
          initialViewport: structuredClone(project.panorama.initialViewport),
        },
        spatial: {
          categories: Object.entries(project.panorama.categories)
            .sort(([left], [right]) => compareText(left, right))
            .map(([categoryId, layout]) => ({ categoryId, layout: structuredClone(layout) })),
          items: Object.entries(project.panorama.items)
            .sort(([left], [right]) => compareText(left, right))
            .map(([itemId, layout]) => ({ itemId, layout: structuredClone(layout) })),
        },
        scenes: structuredClone(project.scenes),
        navigation: structuredClone(project.navigation),
        products: structuredClone(project.products),
        integrations: structuredClone(project.integrations),
        authoringSources: readAuthoringSources(projectRoot, projectId),
      })
    } catch (error) {
      if (error instanceof ProjectNotFoundError || error instanceof AuthoringStateCorruptError) {
        throw error
      }
      throw new AuthoringStateCorruptError(projectId, error)
    }
  }
}

function toAuthoringKnowledge(project: GuideProject): AuthoringKnowledge {
  const stages = project.knowledge.stages.map(stage => ({
    key: stage.key,
    label: structuredClone(stage.label),
    categories: stage.categories.map(category => ({
      id: category.id,
      title: structuredClone(category.title),
      ...(category.description === undefined
        ? {}
        : { description: structuredClone(category.description) }),
      experience: structuredClone(category.experience),
      items: category.itemIds.map(itemId => {
        const item = project.knowledge.items[itemId]
        if (!item) throw new Error(`knowledge item "${itemId}" is missing`)
        return {
          id: item.id,
          title: structuredClone(item.title),
          description: structuredClone(item.description),
        }
      }),
    })),
  }))
  return { stages: stages as AuthoringKnowledge['stages'] }
}

function toRuntimeAssetState(asset: AssetDefinition): AuthoringRuntimeAssetState {
  return {
    assetId: asset.id,
    kind: asset.kind,
    ...(asset.entryPath === undefined ? {} : { entryPath: asset.entryPath }),
    ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }),
    ...(asset.width === undefined ? {} : { width: asset.width }),
    ...(asset.height === undefined ? {} : { height: asset.height }),
    ...(asset.sha256 === undefined ? {} : { sha256: asset.sha256 }),
    ...(asset.size === undefined ? {} : { size: asset.size }),
  }
}

function readAuthoringSources(projectRoot: string, projectId: string): AuthoringSource[] {
  const manifestPath = path.join(projectRoot, 'authoring-sources', 'manifest.json')
  if (!fs.existsSync(manifestPath)) return []
  try {
    const parsed = AuthoringSourceManifestSchema.parse(
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    )
    return parsed.files
      .sort((left, right) => compareText(left.fileRef, right.fileRef))
      .map(file => structuredClone(file))
  } catch (error) {
    throw new AuthoringSourceManifestCorruptError(projectId, error)
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
