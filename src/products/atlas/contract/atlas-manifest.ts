/**
 * AtlasManifest contract — the data shape consumed by AtlasRuntime.
 *
 * This is the runtime's view of a project. It contains only the fields
 * the player actually needs (no editor draft state, no AIGC state, no
 * Catalog data). The compiler is responsible for projecting a
 * NormalizedProject into this shape.
 *
 * Asset URLs are package-relative (e.g. `./assets/images/pano.jpg`).
 */
import type {
  AssetDefinition,
  ExperienceNavigation,
  ExperienceRoute,
  ProductChromeConfig,
  LocalizedText,
  LocalizationConfig,
  Viewport,
} from '../../../domain/project-types.js'
import type { RuntimeIntegrations } from '../../contracts/runtime-integrations.js'

export type { Viewport }

export interface AtlasAssetRef {
  assetId: string
  /** Package-relative URL, e.g. `./assets/images/pano-abc123.jpg`. */
  url: string
  width?: number
  height?: number
  mimeType?: string
  sha256?: string
  size?: number
}

export interface AtlasHtmlSceneManifest<TText = LocalizedText> {
  sceneId: string
  title: TText
  /** Package-relative URL of the entry HTML file. */
  entryUrl: string
  views: Array<{
    id: string
    title: TText
    activationMessage: { type: string; payload?: Record<string, unknown> }
    chrome?: { textColor?: string }
  }>
  /** Bridge protocol used by this scene (always 1.0.0). */
  protocol: { channel: 'interactive-guide:scene-bridge'; version: '1.0.0' }
}

export interface AtlasCategoryEntry<TText = LocalizedText> {
  id: string
  title: TText
  stageLabel?: TText
  order: number
  description?: TText
  itemIds: string[]
  experience: { kind: 'panorama' } | { kind: 'html-scene'; sceneId: string; viewId: string }
  viewport: Viewport
  /** Click target on the panorama (normalized [0,1]). */
  hotspot?: { x: number; y: number }
  /** Hide this hotspot when camera zoom falls below this value. */
  hotspotMinZoom?: number
}

export interface AtlasItemEntry<TText = LocalizedText> {
  id: string
  categoryId: string
  title: TText
  description: TText
  order: number
  marker: { x: number; y: number }
  /** Hide this item marker when camera zoom falls below this value. */
  markerMinZoom?: number
  callout?: {
    markerPosition: 'top' | 'bottom'
    markerGapPx: number
    /** Hide this callout when camera zoom falls below this value. */
    minZoom?: number
  }
}

export interface AtlasRouteTransitionAsset {
  url: string
  posterUrl?: string
  timeoutMs?: number
  onFailure: 'abort-navigation' | 'cut'
}

export interface AtlasManifest<TText = LocalizedText> {
  schemaVersion: '2.0.0'
  product: 'atlas'
  projectId: string
  projectTitle: TText
  projectVersion: string
  localization: LocalizationConfig
  locale?: string
  generatedAt: string
  panorama: AtlasAssetRef & {
    initialViewport: Viewport
    cameraBounds: { minZoom: number; maxZoom: number }
  }
  categories: AtlasCategoryEntry<TText>[]
  items: AtlasItemEntry<TText>[]
  scenes: AtlasHtmlSceneManifest<TText>[]
  routes: ExperienceRoute[]
  routeTransitions?: Record<string, AtlasRouteTransitionAsset>
  config: {
    viewport: { width: number; height: number }
    hintText?: TText
    interaction: {
      wheelZoom: boolean
      dragPan: boolean
      pinchZoom: boolean
      resetCameraEnabled: boolean
    }
    chrome: ProductChromeConfig
    theme: {
      hotspotVariant: 'default' | 'highlight' | 'minimal'
      calloutVariant: 'classic' | 'connector' | 'none'
      /** Hide hotspots when camera zoom < this. */
      hotspotMinZoom?: number
      /** Hide callouts when camera zoom < this. */
      calloutMinZoom?: number
      /** Hide item markers when camera zoom < this. */
      itemMarkerMinZoom?: number
    }
  }
  integrations: RuntimeIntegrations<TText>
}

export type ResolvedAtlasManifest = AtlasManifest<string> & { locale: string }
export type ResolvedAtlasCategoryEntry = AtlasCategoryEntry<string>
export type ResolvedAtlasItemEntry = AtlasItemEntry<string>
export type ResolvedAtlasHtmlSceneManifest = AtlasHtmlSceneManifest<string>

export type { AssetDefinition, ExperienceNavigation }
