/**
 * CatalogCompiler — projects a NormalizedProject into a CatalogManifest.
 *
 * Same rules as AtlasCompiler (deterministic, no placeholders, stable
 * key order). Catalog additionally requires per-item `focusRect` for
 * the focus-overlay rendering.
 */
import type { GuideProject, AssetDefinition } from '../../../domain/project-types.js'
import type {
  CatalogManifest,
  CatalogCategoryEntry,
  CatalogItemEntry,
  CatalogStageEntry,
} from '../contract/catalog-manifest.js'
import type { AssetClosure } from '../../atlas/compiler/atlas-compiler.js'

export interface CatalogCompileResult {
  manifest: CatalogManifest
  assets: AssetDefinition[]
}

export class CatalogCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogCompileError'
  }
}

export function compileCatalog(
  normalizedProject: GuideProject,
  assetClosure: AssetClosure,
  now: () => string = () => new Date().toISOString(),
): CatalogCompileResult {
  if (!normalizedProject.panorama.assetId) {
    throw new CatalogCompileError('panorama.assetId is required for Catalog compilation')
  }
  const panoramaAsset = normalizedProject.assets.byId[normalizedProject.panorama.assetId]
  if (!panoramaAsset || panoramaAsset.kind !== 'image') {
    throw new CatalogCompileError(
      `panorama.assetId "${normalizedProject.panorama.assetId}" must reference an image asset`,
    )
  }

  // Build stages with their categories. Each category includes viewport
  // (the operator-set view of the panorama that the focus overlay will
  // animate to when an item is selected).
  const stages: CatalogStageEntry[] = normalizedProject.knowledge.stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    order: stage.order,
    categories: [...stage.categories]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c): CatalogCategoryEntry => {
        const layout = normalizedProject.panorama.categories[c.id]
        return {
          id: c.id,
          title: c.title,
          order: c.order,
          ...(c.description ? { description: c.description } : {}),
          itemIds: [...c.itemIds].sort(),
          experience: c.experience,
          viewport: layout?.viewport ?? { centerX: 0.5, centerY: 0.5, zoom: 2 },
        }
      }),
  }))

  // Items: every item needs a focusRect for the focus overlay.
  const allItems: CatalogItemEntry[] = []
  for (const stage of normalizedProject.knowledge.stages) {
    for (const cat of stage.categories) {
      for (const itemId of [...cat.itemIds].sort()) {
        const item = normalizedProject.knowledge.items[itemId]
        const layout = normalizedProject.panorama.items[itemId]
        if (!item || !layout?.marker || !layout?.focusRect) continue
        allItems.push({
          id: item.id,
          categoryId: item.categoryId,
          title: item.title,
          description: item.description ?? '',
          order: item.order ?? 0,
          ...(item.tags ? { tags: item.tags } : {}),
          marker: { x: layout.marker.x, y: layout.marker.y },
          focusRect: {
            x: layout.focusRect.x,
            y: layout.focusRect.y,
            width: layout.focusRect.width,
            height: layout.focusRect.height,
            ...(layout.focusRect.radius !== undefined ? { radius: layout.focusRect.radius } : {}),
            ...(layout.focusRect.maskOpacity !== undefined
              ? { maskOpacity: layout.focusRect.maskOpacity }
              : {}),
          },
        })
      }
    }
  }

  // Scenes + routes
  const sceneIds = new Set(normalizedProject.scenes.map((s) => s.id))
  const reachableRoutes = normalizedProject.navigation.routes.filter(
    (r) => r.from.kind === 'panorama' || ('sceneId' in r.from && sceneIds.has(r.from.sceneId)),
  )
  const reachableSceneIds = new Set<string>()
  for (const r of reachableRoutes) {
    if (r.to.kind === 'scene') reachableSceneIds.add(r.to.sceneId)
    if (r.from.kind === 'scene') reachableSceneIds.add(r.from.sceneId)
  }
  const scenes = normalizedProject.scenes
    .filter((s) => reachableSceneIds.size === 0 || reachableSceneIds.has(s.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({
      sceneId: s.id,
      title: s.title,
      entryUrl: assetClosure(
        normalizedProject.id,
        resolveSceneEntrySourcePath(
          normalizedProject.assets.byId[s.assetId] ?? {
            id: s.assetId,
            kind: 'html-bundle',
            sourcePath: `assets/scenes/${s.id}`,
            entryPath: 'index.html',
          },
        ),
      ),
      views: [...s.views]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((view) => ({
          id: view.id,
          title: view.title,
          activationMessage: view.activationMessage,
          ...(view.chrome ? { chrome: view.chrome } : {}),
        })),
      protocol: s.protocol,
    }))

  // Asset list
  const referencedAssets = new Set<string>([panoramaAsset.id])
  for (const s of normalizedProject.scenes) referencedAssets.add(s.assetId)
  for (const r of reachableRoutes) {
    if (r.transition?.assetId) referencedAssets.add(r.transition.assetId)
  }
  const assets = Object.values(normalizedProject.assets.byId)
    .filter((a) => referencedAssets.has(a.id))
    .sort((a, b) => a.id.localeCompare(b.id))

  const manifest: CatalogManifest = {
    schemaVersion: '2.0.0',
    product: 'catalog',
    projectId: normalizedProject.id,
    projectTitle: normalizedProject.title,
    projectVersion: normalizedProject.version,
    locale: normalizedProject.locale,
    generatedAt: now(),
    panorama: {
      assetId: panoramaAsset.id,
      url: assetClosure(normalizedProject.id, panoramaAsset.sourcePath),
      ...(panoramaAsset.mimeType ? { mimeType: panoramaAsset.mimeType } : {}),
      ...(panoramaAsset.sha256 ? { sha256: panoramaAsset.sha256 } : {}),
      ...(panoramaAsset.size !== undefined ? { size: panoramaAsset.size } : {}),
    },
    stages,
    items: allItems,
    scenes,
    routes: [...reachableRoutes].sort((a, b) => a.id.localeCompare(b.id)),
    config: {
      viewport: normalizedProject.products.catalog.viewport,
      ...(normalizedProject.products.catalog.hintText
        ? { hintText: normalizedProject.products.catalog.hintText }
        : {}),
      interaction: normalizedProject.products.catalog.interaction,
      chrome: normalizedProject.products.catalog.chrome ?? {},
      theme: normalizedProject.products.catalog.theme,
    },
    integrations: normalizedProject.integrations,
  }

  return { manifest, assets }
}

function resolveSceneEntrySourcePath(asset: AssetDefinition): string {
  const base = asset.kind === 'html-bundle' ? stripLegacyAssetsPrefix(asset.sourcePath) : asset.sourcePath
  const entryPath = asset.entryPath?.trim() || 'index.html'
  return `${base.replace(/\/+$/, '')}/${entryPath.replace(/^\/+/, '')}`
}

function stripLegacyAssetsPrefix(sourcePath: string): string {
  return sourcePath.startsWith('assets/') ? sourcePath.slice('assets/'.length) : sourcePath
}
