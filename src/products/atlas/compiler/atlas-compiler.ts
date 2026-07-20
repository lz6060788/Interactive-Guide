/**
 * AtlasCompiler — projects a NormalizedProject into an AtlasManifest.
 *
 * Inputs:
 *   - `normalizedProject`: a NormalizedProject (already passed through
 *     `normalizeProject` and the release-tier validator).
 *   - `assetClosure`: closure function that, given a source path
 *     relative to `{projectsRoot}/{projectId}/`, returns the
 *     package-relative URL (e.g. `./assets/images/pano-abc123.jpg`).
 *
 * Output:
 *   - `manifest`: AtlasManifest ready to hand to AtlasRuntime.
 *   - `assets`: AssetDefinition list actually referenced (so the
 *     publisher can copy them into the release package).
 *
 * Rules:
 *   - Never invent a placeholder. Missing panorama → throws.
 *   - URL closure is deterministic: same input → same URL.
 *   - Key order is stable (sort by id) so two compilations produce
 *     byte-identical manifests for the same project.
 */
import type { GuideProject } from '../../../domain/project-types.js'
import type { AssetDefinition } from '../../../domain/project-types.js'
import type { AtlasManifest, AtlasRouteTransitionAsset } from '../contract/atlas-manifest.js'
import { compileRuntimeIntegrations } from '../../contracts/runtime-integrations.js'

export interface AtlasCompileResult {
  manifest: AtlasManifest
  assets: AssetDefinition[]
}

export type AssetClosure = (projectId: string, sourcePath: string) => string

export class AtlasCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AtlasCompileError'
  }
}

export function compileAtlas(
  normalizedProject: GuideProject,
  assetClosure: AssetClosure,
  now: () => string = () => new Date().toISOString(),
): AtlasCompileResult {
  if (!normalizedProject.panorama.assetId) {
    throw new AtlasCompileError('panorama.assetId is required for Atlas compilation')
  }
  const panoramaAsset = normalizedProject.assets.byId[normalizedProject.panorama.assetId]
  if (!panoramaAsset || panoramaAsset.kind !== 'image') {
    throw new AtlasCompileError(
      `panorama.assetId "${normalizedProject.panorama.assetId}" must reference an image asset`,
    )
  }

  // Atlas only shows categories whose experience.kind is 'panorama' OR whose
  // scene is included in this release. We include all categories that have a
  // spatial layout, then filter items the same way.
  const panoramaCategories = normalizedProject.knowledge.stages.flatMap(s =>
    s.categories.map(category => ({ stageLabel: s.label, category })),
  )

  // Resolve scene reachability: a route is reachable from Atlas if its `from`
  // is panorama or if its target scene is in the project.
  const sceneIds = new Set(normalizedProject.scenes.map(s => s.id))
  const reachableRoutes = normalizedProject.navigation.routes.filter(
    r => r.from.kind === 'panorama' || ('sceneId' in r.from && sceneIds.has(r.from.sceneId)),
  )

  // Categories follow the authored stage/category order so the runtime,
  // editor and release HTML all agree on "first category / first item"
  // semantics. Use id only as a deterministic tie-breaker.
  const sortedCategories = [...panoramaCategories].sort((a, b) => {
    const orderDelta = (a.category.order ?? 0) - (b.category.order ?? 0)
    if (orderDelta !== 0) return orderDelta
    return a.category.id.localeCompare(b.category.id)
  })

  // Items: by category order, then item id
  const allItems: AtlasManifest['items'] = []
  for (const cat of sortedCategories) {
    for (const itemId of cat.category.itemIds) {
      const item = normalizedProject.knowledge.items[itemId]
      const layout = normalizedProject.panorama.items[itemId]
      if (!item || !layout?.marker) continue
      allItems.push({
        id: item.id,
        categoryId: item.categoryId,
        title: item.title,
        description: item.description ?? '',
        order: item.order ?? 0,
        marker: { x: layout.marker.x, y: layout.marker.y },
        ...(layout.callout
          ? {
              callout: {
                markerPosition: layout.callout.markerPosition,
                markerGapPx: layout.callout.markerGapPx,
                ...(layout.callout.minZoom !== undefined
                  ? { minZoom: layout.callout.minZoom }
                  : {}),
              },
            }
          : {}),
      })
    }
  }

  // Categories
  const categories: AtlasManifest['categories'] = sortedCategories
    .filter(c => normalizedProject.panorama.categories[c.category.id]?.viewport !== undefined)
    .map(c => {
      const layout = normalizedProject.panorama.categories[c.category.id]
      return {
        id: c.category.id,
        title: c.category.title,
        ...(c.stageLabel ? { stageLabel: c.stageLabel } : {}),
        order: c.category.order,
        ...(c.category.description ? { description: c.category.description } : {}),
        itemIds: [...c.category.itemIds],
        experience: c.category.experience,
        viewport: layout.viewport!,
        ...(layout.hotspot ? { hotspot: { ...layout.hotspot } } : {}),
        ...(layout.hotspotMinZoom !== undefined ? { hotspotMinZoom: layout.hotspotMinZoom } : {}),
      }
    })

  // Scenes reachable from Atlas routes
  const reachableSceneIds = new Set<string>()
  for (const r of reachableRoutes) {
    if (r.to.kind === 'scene') reachableSceneIds.add(r.to.sceneId)
    if (r.from.kind === 'scene') reachableSceneIds.add(r.from.sceneId)
  }
  const scenes = normalizedProject.scenes
    .filter(s => reachableSceneIds.size === 0 || reachableSceneIds.has(s.id))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(s => {
      const sceneAsset = normalizedProject.assets.byId[s.assetId]
      return {
        sceneId: s.id,
        title: s.title,
        entryUrl: sceneAsset
          ? assetClosure(normalizedProject.id, resolveSceneEntrySourcePath(sceneAsset))
          : assetClosure(normalizedProject.id, `scenes/${s.id}/index.html`),
        views: [...s.views]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(view => ({
            id: view.id,
            title: view.title,
            activationMessage: view.activationMessage,
            ...(view.chrome ? { chrome: view.chrome } : {}),
          })),
        protocol: s.protocol,
      }
    })

  // Asset list (manifest's referenced assets)
  const referencedAssets = new Set<string>([panoramaAsset.id])
  for (const s of normalizedProject.scenes) referencedAssets.add(s.assetId)
  for (const r of reachableRoutes) {
    if (r.transition?.assetId) referencedAssets.add(r.transition.assetId)
  }
  if (normalizedProject.integrations.share?.imageAssetId) {
    referencedAssets.add(normalizedProject.integrations.share.imageAssetId)
  }
  const assets = Object.values(normalizedProject.assets.byId)
    .filter(a => referencedAssets.has(a.id))
    .sort((a, b) => a.id.localeCompare(b.id))

  const routeTransitions = Object.fromEntries(
    reachableRoutes
      .filter(route => route.transition?.assetId)
      .map(route => {
        const transition = route.transition!
        const asset = normalizedProject.assets.byId[transition.assetId]
        if (!asset) return null
        const entry = [
          route.id,
          {
            url: assetClosure(normalizedProject.id, asset.sourcePath),
            ...(transition.posterAssetId
              ? {
                  posterUrl: resolvePosterUrl(
                    normalizedProject,
                    transition.posterAssetId,
                    assetClosure,
                  ),
                }
              : {}),
            ...(transition.timeoutMs !== undefined ? { timeoutMs: transition.timeoutMs } : {}),
            onFailure: transition.onFailure,
          },
        ] as const
        return entry
      })
      .filter((entry): entry is readonly [string, AtlasRouteTransitionAsset] => Boolean(entry)),
  )

  const manifest: AtlasManifest = {
    schemaVersion: '2.0.0',
    product: 'atlas',
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
      initialViewport: normalizedProject.panorama.initialViewport,
      cameraBounds: normalizedProject.panorama.cameraBounds,
    },
    categories,
    items: allItems,
    scenes,
    routes: [...reachableRoutes].sort((a, b) => a.id.localeCompare(b.id)),
    ...(Object.keys(routeTransitions).length > 0 ? { routeTransitions } : {}),
    config: {
      viewport: normalizedProject.products.atlas.viewport,
      ...(normalizedProject.products.atlas.hintText
        ? { hintText: normalizedProject.products.atlas.hintText }
        : {}),
      interaction: normalizedProject.products.atlas.interaction,
      chrome: normalizedProject.products.atlas.chrome ?? {},
      theme: {
        hotspotVariant: normalizedProject.products.atlas.theme.hotspotVariant,
        calloutVariant: normalizedProject.products.atlas.theme.calloutVariant,
        ...(normalizedProject.products.atlas.theme.hotspotMinZoom !== undefined
          ? { hotspotMinZoom: normalizedProject.products.atlas.theme.hotspotMinZoom }
          : {}),
        ...(normalizedProject.products.atlas.theme.calloutMinZoom !== undefined
          ? { calloutMinZoom: normalizedProject.products.atlas.theme.calloutMinZoom }
          : {}),
        ...(normalizedProject.products.atlas.theme.itemMarkerMinZoom !== undefined
          ? { itemMarkerMinZoom: normalizedProject.products.atlas.theme.itemMarkerMinZoom }
          : {}),
      },
    },
    integrations: compileRuntimeIntegrations(normalizedProject, assetClosure, {
      includeAnalytics: true,
    }),
  }

  return { manifest, assets }
}

function resolveSceneEntrySourcePath(asset: AssetDefinition): string {
  const base =
    asset.kind === 'html-bundle' ? stripLegacyAssetsPrefix(asset.sourcePath) : asset.sourcePath
  const entryPath = asset.entryPath?.trim() || 'index.html'
  return `${base.replace(/\/+$/, '')}/${entryPath.replace(/^\/+/, '')}`
}

function resolvePosterUrl(
  project: GuideProject,
  assetId: string,
  assetClosure: AssetClosure,
): string | undefined {
  const poster = project.assets.byId[assetId]
  if (!poster) return undefined
  return assetClosure(project.id, poster.sourcePath)
}

function stripLegacyAssetsPrefix(sourcePath: string): string {
  return sourcePath.startsWith('assets/') ? sourcePath.slice('assets/'.length) : sourcePath
}
