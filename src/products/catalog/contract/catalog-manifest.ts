/**
 * CatalogManifest contract — the data shape consumed by CatalogRuntime.
 *
 * Catalog is the structured-knowledge product: three industry-chain
 * stages, each with categories, each with items. It does NOT show
 * hotspots or panorama imagery — that's Atlas. Catalog shows a
 * vertical list with focusRect overlays on the panorama when an item
 * is selected (the runtime fetches the panorama image separately for
 * the focus overlay).
 */
import type {
  AssetDefinition,
  ExperienceNavigation,
  ExperienceRoute,
  ProductChromeConfig,
  ProjectIntegrations,
  SchemaVersion,
  Viewport,
} from '../../../domain/project-types.js'

export interface CatalogAssetRef {
  assetId: string
  url: string
  mimeType?: string
  sha256?: string
  size?: number
}

export interface CatalogHtmlSceneManifest {
  sceneId: string
  title: string
  entryUrl: string
  views: Array<{
    id: string
    title: string
    activationMessage: { type: string; payload?: Record<string, unknown> }
  }>
  protocol: { channel: 'interactive-guide:scene-bridge'; version: '1.0.0' }
}

export interface CatalogCategoryEntry {
  id: string
  title: string
  order: number
  description?: string
  itemIds: string[]
  experience:
    | { kind: 'panorama' }
    | { kind: 'html-scene'; sceneId: string; viewId: string }
  viewport: Viewport
}

export interface CatalogItemEntry {
  id: string
  categoryId: string
  title: string
  description: string
  order: number
  tags?: string[]
  marker: { x: number; y: number }
  focusRect: {
    x: number
    y: number
    width: number
    height: number
    radius?: number
    maskOpacity?: number
  }
}

export interface CatalogStageEntry {
  key: 'upstream' | 'midstream' | 'downstream'
  label: string
  order: 1 | 2 | 3
  categories: CatalogCategoryEntry[]
}

export interface CatalogManifest {
  schemaVersion: SchemaVersion
  product: 'catalog'
  projectId: string
  projectTitle: string
  projectVersion: string
  locale: string
  generatedAt: string
  /** Catalog needs the panorama for focus overlay rendering. */
  panorama: CatalogAssetRef
  stages: CatalogStageEntry[]
  items: CatalogItemEntry[]
  scenes: CatalogHtmlSceneManifest[]
  routes: ExperienceRoute[]
  config: {
    viewport: { width: number; height: number }
    hintText?: string
    interaction: {
      listActivation: 'center-nearest'
      markerActivation: boolean
      viewportAnimationMs: number
    }
    chrome: ProductChromeConfig
    theme: {
      listDensity: 'compact' | 'comfortable'
      focusVariant: 'rect' | 'pill'
    }
  }
  integrations: ProjectIntegrations
}

export type { AssetDefinition, ExperienceNavigation }