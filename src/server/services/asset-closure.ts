/**
 * AssetClosure — resolves the set of assets referenced by a manifest
 * and rewrites their URLs to be package-relative. The compiler accepts
 * an `assetClosure` callback to inject this resolution at compile
 * time so the runtime never sees an absolute `/api/...` URL.
 */
import type { AssetDefinition, GuideProject } from '../../domain/project-types.js'

export type AssetClosureFn = (projectId: string, sourcePath: string) => string

export interface AssetClosureOptions {
  projectId: string
  assets: Record<string, AssetDefinition>
  /** All asset ids that the product's manifest must ship. */
  referencedAssetIds: ReadonlySet<string>
  /** URL prefix prepended to every sourcePath (e.g. './assets'). */
  urlPrefix?: string
}

/**
 * Build the closure: returns the URL-rewrite function and the filtered
 * asset list (only the ones the manifest references).
 */
export function buildAssetClosure(opts: AssetClosureOptions): {
  closure: AssetClosureFn
  assets: AssetDefinition[]
} {
  const prefix = opts.urlPrefix ?? './assets'
  const assets = Object.values(opts.assets)
    .filter(a => opts.referencedAssetIds.has(a.id))
    .sort((a, b) => a.id.localeCompare(b.id))

  const closure: AssetClosureFn = (_projectId: string, sourcePath: string): string => {
    return `${prefix}/${sourcePath.replace(/^\/+/, '')}`
  }

  return { closure, assets }
}

/**
 * Compute the set of asset ids a product needs: panorama + every scene
 * referenced by a reachable route + every route's transition asset.
 */
export function computeReferencedAssetIds(
  panoramaAssetId: string,
  sceneAssetIds: ReadonlySet<string>,
  transitionAssetIds: Iterable<string> = [],
): Set<string> {
  const ids = new Set<string>()
  if (panoramaAssetId) ids.add(panoramaAssetId)
  for (const id of sceneAssetIds) ids.add(id)
  for (const id of transitionAssetIds) ids.add(id)
  return ids
}

/** One source of truth for the asset set copied into either released product. */
export function computeProjectReleaseAssetIds(project: GuideProject): Set<string> {
  const sceneAssetIds = new Set(project.scenes.map(scene => scene.assetId))
  const sceneIds = new Set(project.scenes.map(scene => scene.id))
  const transitionAssetIds = new Set<string>()
  for (const route of project.navigation.routes) {
    const reachable =
      route.from.kind === 'panorama' ||
      ('sceneId' in route.from && sceneIds.has(route.from.sceneId))
    if (reachable && route.transition) {
      transitionAssetIds.add(route.transition.assetId)
      if (route.transition.posterAssetId) {
        transitionAssetIds.add(route.transition.posterAssetId)
      }
    }
  }
  const referencedAssetIds = computeReferencedAssetIds(
    project.panorama.assetId,
    sceneAssetIds,
    transitionAssetIds,
  )
  if (project.integrations.share?.imageAssetId) {
    referencedAssetIds.add(project.integrations.share.imageAssetId)
  }
  return referencedAssetIds
}
