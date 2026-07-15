import type { AnalyticsConfig, GuideProject, ShareConfig } from '../../domain/project-types.js'

export interface RuntimeShareConfig extends ShareConfig {
  /** Package-relative URL resolved by the compiler for runtime sharing. */
  imageUrl?: string
}

export interface RuntimeIntegrations {
  analytics?: AnalyticsConfig
  share?: RuntimeShareConfig
}

export function compileRuntimeIntegrations(
  project: GuideProject,
  assetClosure: (projectId: string, sourcePath: string) => string,
  options: { includeAnalytics: boolean },
): RuntimeIntegrations {
  const analytics = options.includeAnalytics ? project.integrations.analytics : undefined
  const share = project.integrations.share
  if (!share) return analytics ? { analytics } : {}

  let imageUrl: string | undefined
  if (share.imageAssetId) {
    const image = project.assets.byId[share.imageAssetId]
    if (!image || image.kind !== 'image') {
      throw new Error(
        `integrations.share.imageAssetId "${share.imageAssetId}" must reference an image asset`,
      )
    }
    imageUrl = assetClosure(project.id, image.sourcePath)
  }

  return {
    ...(analytics ? { analytics } : {}),
    share: {
      ...share,
      ...(imageUrl ? { imageUrl } : {}),
    },
  }
}
