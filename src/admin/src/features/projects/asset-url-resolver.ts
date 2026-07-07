import type { GuideProject } from '@domain/project-types'
import { assetBlobUrl, assetHtmlBundleFileUrl } from './api'

export type ProjectAssetUrlResolver = (_projectId: string, sourcePath: string) => string

export function createProjectAssetUrlResolver(project: GuideProject): ProjectAssetUrlResolver {
  const bySourcePath = new Map<string, string>()
  for (const asset of Object.values(project.assets.byId)) {
    bySourcePath.set(asset.sourcePath, asset.id)
  }

  return (_projectId: string, sourcePath: string): string => {
    const directAssetId = bySourcePath.get(sourcePath)
    if (directAssetId) {
      const asset = project.assets.byId[directAssetId]
      if (asset?.kind === 'html-bundle') {
        return assetHtmlBundleFileUrl(project.id, directAssetId, asset.entryPath ?? 'index.html')
      }
      return assetBlobUrl(project.id, directAssetId)
    }

    for (const asset of Object.values(project.assets.byId)) {
      if (asset.kind !== 'html-bundle') continue
      const bases = [
        asset.sourcePath.replace(/\/+$/, ''),
        asset.sourcePath.startsWith('assets/')
          ? asset.sourcePath.slice('assets/'.length).replace(/\/+$/, '')
          : asset.sourcePath.replace(/\/+$/, ''),
      ]
      for (const base of bases) {
        if (!sourcePath.startsWith(`${base}/`)) continue
        return assetHtmlBundleFileUrl(project.id, asset.id, sourcePath.slice(base.length + 1))
      }
    }

    return `./${sourcePath}`
  }
}
