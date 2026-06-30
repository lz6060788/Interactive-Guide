/**
 * AssetLoader — single resolution path for runtime assets.
 *
 * Both AtlasRuntime and CatalogRuntime ask the loader to resolve URLs
 * and load images. URLs are package-relative paths (no `/api/` or
 * workspace refs leak through), so the same runtime can be mounted
 * against either a draft preview or a static release.
 */
import type { CatalogHtmlSceneManifest } from '../../products/catalog/contract/catalog-manifest.js'
import type { AtlasHtmlSceneManifest } from '../../products/atlas/contract/atlas-manifest.js'

type CatalogRuntimeAssetLoader = {
  resolveUrl(url: string): string
  loadImage(url: string): Promise<HTMLImageElement>
  openScene(scene: CatalogHtmlSceneManifest, viewId?: string): void
}

type AtlasRuntimeAssetLoader = {
  resolveUrl(url: string): string
  loadImage(url: string): Promise<HTMLImageElement>
  openScene(scene: AtlasHtmlSceneManifest, viewId?: string): void
}

export interface AssetLoaderOptions {
  /** Optional URL prefix; defaults to identity (relative paths only). */
  baseUrl?: string
}

export class AssetLoader {
  private readonly baseUrl: string

  constructor(opts: AssetLoaderOptions = {}) {
    this.baseUrl = opts.baseUrl ?? ''
  }

  resolveUrl(url: string): string {
    if (!this.baseUrl) return url
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    return joinUrl(this.baseUrl, url)
  }

  async loadImage(url: string): Promise<HTMLImageElement> {
    const img = new Image()
    img.src = this.resolveUrl(url)
    await img.decode().catch(() => undefined)
    return img
  }

  /** Adapter for AtlasRuntime / CatalogRuntime asset-loader contract. */
  asCatalogLoader(): CatalogRuntimeAssetLoader {
    return {
      resolveUrl: (u: string) => this.resolveUrl(u),
      loadImage: (u: string) => this.loadImage(u),
      openScene: () => {
        /* opener is configured separately by the host */
      },
    }
  }

  asAtlasLoader(): AtlasRuntimeAssetLoader {
    return {
      resolveUrl: (u: string) => this.resolveUrl(u),
      loadImage: (u: string) => this.loadImage(u),
      openScene: () => {
        /* opener is configured separately by the host */
      },
    }
  }

  /** Helper used by the host when wiring `openScene`. */
  resolveSceneEntryUrl(scene: AtlasHtmlSceneManifest | CatalogHtmlSceneManifest): string {
    return this.resolveUrl(scene.entryUrl)
  }
}

function joinUrl(base: string, rel: string): string {
  if (!rel) return base
  if (base.endsWith('/') && rel.startsWith('/')) return base + rel.slice(1)
  if (!base.endsWith('/') && !rel.startsWith('/')) return `${base}/${rel}`
  return base + rel
}