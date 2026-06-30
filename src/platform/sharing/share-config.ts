/**
 * ShareConfig — derives share metadata (og:title, og:image, og:url)
 * from the GuideProject so a deployed HTML page can inject the right
 * open-graph tags without the runtime reaching into the DOM directly.
 *
 * The integrations.share entry stores only the `imageAssetId` (no URL
 * fallback in the domain model). The deployed base URL is supplied at
 * release time.
 */
import type { GuideProject, ProjectIntegrations } from '../../domain/project-types.js'

export interface ShareMetaConfig {
  url: string
  title: string
  description: string
  imageUrl?: string
  imageAssetId?: string
}

export function deriveShareConfig(
  project: GuideProject,
  manifestEntryUrl: string,
  baseUrl?: string,
  share?: ProjectIntegrations['share'],
): ShareMetaConfig {
  const url = baseUrl ? joinUrl(baseUrl, manifestEntryUrl) : manifestEntryUrl
  const imageAssetId = share?.imageAssetId
  // og:image is relative to the release root, not to the manifest entry.
  const imageUrl = imageAssetId
    ? baseUrl
      ? joinUrl(baseUrl, `assets/images/${imageAssetId}/image.jpg`)
      : joinUrl(manifestEntryUrl, `../assets/images/${imageAssetId}/image.jpg`)
    : undefined
  const cfg: ShareMetaConfig = {
    url,
    title: share?.title ?? project.title,
    description: share?.description ?? project.title,
  }
  if (imageUrl) cfg.imageUrl = imageUrl
  if (imageAssetId) cfg.imageAssetId = imageAssetId
  return cfg
}

/** Render og:* meta tags for injection into the HTML head. */
export function shareConfigToMetaTags(
  cfg: ShareMetaConfig,
): Array<{ property: string; content: string }> {
  const tags: Array<{ property: string; content: string }> = [
    { property: 'og:url', content: cfg.url },
    { property: 'og:title', content: cfg.title },
    { property: 'og:description', content: cfg.description },
  ]
  if (cfg.imageUrl) tags.push({ property: 'og:image', content: cfg.imageUrl })
  return tags
}

function joinUrl(base: string, rel: string): string {
  if (!rel) return base
  if (rel.startsWith('http://') || rel.startsWith('https://')) return rel
  if (base.endsWith('/') && rel.startsWith('/')) return base + rel.slice(1)
  if (!base.endsWith('/') && !rel.startsWith('/')) return `${base}/${rel}`
  return base + rel
}