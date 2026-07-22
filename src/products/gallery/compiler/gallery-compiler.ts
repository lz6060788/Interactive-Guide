import type { AssetDefinition, GuideProject } from '../../../domain/project-types.js'
import type { AssetClosure } from '../../atlas/compiler/atlas-compiler.js'
import { compileRuntimeIntegrations } from '../../contracts/runtime-integrations.js'
import type {
  GalleryCategoryEntry,
  GalleryItemEntry,
  GalleryManifest,
  GalleryStageEntry,
} from '../contract/gallery-manifest.js'

export interface GalleryCompileResult {
  manifest: GalleryManifest
  assets: AssetDefinition[]
}

export class GalleryCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GalleryCompileError'
  }
}

export function compileGallery(
  project: GuideProject,
  assetClosure: AssetClosure,
  now: () => string = () => new Date().toISOString(),
): GalleryCompileResult {
  if (!project.products.gallery.enabled) {
    throw new GalleryCompileError('Gallery is disabled for this project')
  }

  const imageAssetIds = new Set<string>()
  const items: GalleryItemEntry[] = []
  const stages: GalleryStageEntry[] = project.knowledge.stages
    .slice()
    .sort(
      (left, right) =>
        project.products.gallery.stageOrder.indexOf(left.key) -
        project.products.gallery.stageOrder.indexOf(right.key),
    )
    .map(stage => ({
      key: stage.key,
      label: stage.label,
      order: stage.order,
      categories: [...stage.categories]
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map((category): GalleryCategoryEntry => {
          for (const itemId of category.itemIds) {
            const item = project.knowledge.items[itemId]
            if (!item) {
              throw new GalleryCompileError(
                `category "${category.id}" references missing item "${itemId}"`,
              )
            }
            const assetId = project.products.gallery.itemImageAssetIds[itemId]
            if (!assetId) {
              throw new GalleryCompileError(
                `Gallery image missing for ${stage.key}/${category.id}/${itemId}`,
              )
            }
            const asset = project.assets.byId[assetId]
            if (!asset || asset.kind !== 'image') {
              throw new GalleryCompileError(
                `Gallery item "${itemId}" must reference an image asset; got "${assetId}"`,
              )
            }
            imageAssetIds.add(assetId)
            items.push({
              id: item.id,
              categoryId: item.categoryId,
              title: item.title,
              description: item.description,
              order: item.order,
              image: {
                assetId,
                url: assetClosure(project.id, asset.sourcePath),
                ...(asset.width ? { width: asset.width } : {}),
                ...(asset.height ? { height: asset.height } : {}),
                ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
                ...(asset.sha256 ? { sha256: asset.sha256 } : {}),
                ...(asset.size !== undefined ? { size: asset.size } : {}),
              },
            })
          }
          return {
            id: category.id,
            title: category.title,
            ...(category.description ? { description: category.description } : {}),
            order: category.order,
            itemIds: [...category.itemIds],
          }
        }),
    }))

  if (items.length === 0) {
    throw new GalleryCompileError('Gallery requires at least one third-level item')
  }

  if (project.integrations.share?.imageAssetId) {
    imageAssetIds.add(project.integrations.share.imageAssetId)
  }
  const assets = Object.values(project.assets.byId)
    .filter(asset => imageAssetIds.has(asset.id))
    .sort((left, right) => left.id.localeCompare(right.id))

  return {
    manifest: {
      schemaVersion: '1.0.0',
      product: 'gallery',
      projectId: project.id,
      projectTitle: project.title,
      projectVersion: project.version,
      localization: project.localization,
      generatedAt: now(),
      stages,
      items,
      config: {
        viewport: project.products.gallery.viewport,
        ...(project.products.gallery.hintText
          ? { hintText: project.products.gallery.hintText }
          : {}),
        ...(project.products.gallery.atlasLaunchUrl
          ? { atlasLaunchUrl: project.products.gallery.atlasLaunchUrl }
          : {}),
        interaction: project.products.gallery.interaction,
        chrome: project.products.gallery.chrome,
        theme: project.products.gallery.theme,
      },
      integrations: compileRuntimeIntegrations(project, assetClosure, {
        includeAnalytics: false,
      }),
    },
    assets,
  }
}
