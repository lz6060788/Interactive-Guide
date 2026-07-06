/**
 * Atlas / Catalog manifest contracts.
 *
 * These types are intentionally narrow: each runtime only sees the data
 * it needs. The compilers (Phase 3, 4) are responsible for projecting a
 * NormalizedProject into these shapes.
 *
 * Asset URLs in the manifest are package-relative (e.g. "./assets/...jpg"),
 * never "/api/..." or absolute paths. The static validator in Phase 6
 * enforces this.
 */
import type {
  AssetDefinition,
  ExperienceNavigation,
  ExperienceRoute,
  IndustryCategory,
  IndustryItem,
  IndustryStage,
  ProjectIntegrations,
  SchemaVersion,
  Viewport,
} from '../../domain/project-types.js'

export interface AssetRef {
  assetId: string
  /** Package-relative URL, e.g. "./assets/images/pano-abc123.jpg". */
  url: string
  width?: number
  height?: number
  mimeType?: string
  sha256?: string
  size?: number
}

export interface HtmlSceneManifest {
  sceneId: string
  title: string
  /** Package-relative URL of the entry HTML file. */
  entryUrl: string
  views: Array<{
    id: string
    title: string
    activationMessage: { type: string; payload?: Record<string, unknown> }
  }>
  /** Bridge protocol used by this scene (always 1.0.0 in Phase 1-5). */
  protocol: { channel: 'interactive-guide:scene-bridge'; version: '1.0.0' }
}

export interface CategoryManifestEntry {
  id: string
  title: string
  stageLabel?: string
  order: number
  description?: string
  itemIds: string[]
  experience: { kind: 'panorama' } | { kind: 'html-scene'; sceneId: string; viewId: string }
}

export interface ItemManifestEntry {
  id: string
  categoryId: string
  title: string
  description: string
  order: number
  tags?: string[]
}

export interface ProductManifestBase {
  schemaVersion: SchemaVersion
  product: 'atlas' | 'catalog'
  projectId: string
  projectTitle: string
  projectVersion: string
  locale: string
  generatedAt: string
  panorama: AssetRef & { initialViewport: Viewport; cameraBounds: { minZoom: number; maxZoom: number } }
  /** Only the routes that originate at a location reachable from this product. */
  routes: ExperienceRoute[]
  scenes: HtmlSceneManifest[]
  integrations: ProjectIntegrations
}

export interface AtlasManifest extends ProductManifestBase {
  product: 'atlas'
  /** Categories shown as hotspots in the Atlas UI. */
  categories: Array<CategoryManifestEntry & { viewport: Viewport; hotspot?: { x: number; y: number } }>
  items: Array<ItemManifestEntry & { marker: { x: number; y: number }; viewportOverride?: Viewport; callout?: { markerPosition: 'top' | 'bottom'; markerGapPx: number; minZoom?: number } }>
  /** Product-level configuration. */
  config: {
    viewport: { width: number; height: number }
    hintText?: string
    interaction: { wheelZoom: boolean; dragPan: boolean; pinchZoom: boolean; resetCameraEnabled: boolean }
    chrome: Record<string, unknown>
    theme: { hotspotVariant: 'default' | 'highlight' | 'minimal'; calloutVariant: 'classic' | 'connector' | 'none' }
  }
}

export interface CatalogManifest extends ProductManifestBase {
  product: 'catalog'
  stages: Array<IndustryStage & { categories: Array<CategoryManifestEntry & { viewport: Viewport }> }>
  items: Array<ItemManifestEntry & { marker: { x: number; y: number }; focusRect: { x: number; y: number; width: number; height: number; radius?: number; maskOpacity?: number } }>
  config: {
    viewport: { width: number; height: number }
    hintText?: string
    interaction: { listActivation: 'center-nearest'; markerActivation: boolean; viewportAnimationMs: number }
    chrome: Record<string, unknown>
    theme: { listDensity: 'compact' | 'comfortable'; focusVariant: 'rect' | 'pill' }
  }
}

export type { AssetDefinition, ExperienceNavigation }
