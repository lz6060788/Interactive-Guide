/**
 * GuideProject 2.0 — the single source of truth for project content.
 *
 * This module replaces the legacy `KnowledgePackage` / `KnowledgeNode` /
 * `KnowledgeEdge` / `PublishManifest` shapes. Any code that needs to
 * describe a project must use these types. Legacy aliases in
 * src/shared/types.ts are slated for removal in Phase 7.
 *
 * Field-name forbidden list (verified by `npm test` grep gate in Phase 8):
 *   - nodes, edges, rootNodeId, resolution
 *   - visualStyle, transitionStyle, panoramaEditorDocument
 *   - surfaceHierarchyCatalog, surfaceLayers
 */
import type { ZodType } from 'zod'
import type { SceneProtocol, SceneProtocolSchema } from './scene-protocol.js'
import type { ExperienceNavigationSchema, ExperienceNavigation } from './experience-navigation.js'

// ─── Primitives ──────────────────────────────────────────────

export type SchemaVersion = '3.0.0'
export type ReleaseSchemaVersion = '1.0.0'

export type LocaleCode = string
export type LocalizedText = Partial<Record<LocaleCode, string>>

export interface LocalizationConfig {
  defaultLocale: LocaleCode
  supportedLocales: LocaleCode[]
}

export interface NormalizedPoint {
  x: number
  y: number
}

export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export type CoordinateSpace = 'normalized'

// ─── Asset Registry ─────────────────────────────────────────

export type AssetKind = 'image' | 'video' | 'html-bundle'

export interface AssetDefinition {
  id: string
  kind: AssetKind
  sourcePath: string
  entryPath?: string
  mimeType?: string
  width?: number
  height?: number
  sha256?: string
  size?: number
}

export interface AssetRegistry {
  byId: Record<string, AssetDefinition>
}

// ─── Panorama / Spatial Model ───────────────────────────────

export interface Viewport {
  centerX: number
  centerY: number
  zoom: number
}

export interface CameraBounds {
  minZoom: number
  maxZoom: number
}

export interface CategorySpatialLayout {
  viewport: Viewport
  hotspot?: NormalizedPoint
  /** Hide this hotspot when camera zoom falls below this value. */
  hotspotMinZoom?: number
}

export interface ItemCallout {
  markerPosition: 'top' | 'bottom'
  markerGapPx: number
  /** Hide this callout when camera zoom falls below this value. */
  minZoom?: number
}

/** Focus rect shape (radius + maskOpacity are visual-only, validated in [0,1] for opacity). */
export interface NormalizedFocusRect extends NormalizedRect {
  radius?: number
  maskOpacity?: number
}

export interface ItemSpatialLayout {
  marker: NormalizedPoint
  /** Catalog-only: required for items exposed in catalog; optional for atlas-only items. */
  focusRect?: NormalizedFocusRect
  /** Catalog-only: background camera used while this item is selected. */
  viewportOverride?: Viewport
  callout?: ItemCallout
  /** Hide this item marker when camera zoom falls below this value. */
  markerMinZoom?: number
}

export interface PanoramaModel {
  assetId: string
  coordinateSpace: CoordinateSpace
  cameraBounds: CameraBounds
  initialViewport: Viewport
  categories: Record<string, CategorySpatialLayout>
  items: Record<string, ItemSpatialLayout>
}

// ─── Industry Chain ─────────────────────────────────────────

export type IndustryStageKey = 'upstream' | 'midstream' | 'downstream'

export type CategoryExperienceBinding =
  | { kind: 'panorama' }
  | { kind: 'html-scene'; sceneId: string; viewId: string }

export interface IndustryItem {
  id: string
  categoryId: string
  title: LocalizedText
  description: LocalizedText
  order: number
}

export interface IndustryCategory {
  id: string
  title: LocalizedText
  order: number
  description?: LocalizedText
  itemIds: string[]
  experience: CategoryExperienceBinding
}

export interface IndustryStage {
  key: IndustryStageKey
  label: LocalizedText
  order: 1 | 2 | 3
  categories: IndustryCategory[]
}

export interface IndustryChain {
  stages: [IndustryStage, IndustryStage, IndustryStage]
  items: Record<string, IndustryItem>
}

// ─── HTML Scenes ────────────────────────────────────────────

export interface SceneFocusCommand {
  type: string
  payload?: Record<string, unknown>
}

export interface SceneChromeConfig {
  textColor?: string
}

export interface HtmlSceneView {
  id: string
  title: LocalizedText
  activationMessage: {
    type: string
    payload?: Record<string, unknown>
  }
  categoryIds: string[]
  itemFocusMap?: Record<string, SceneFocusCommand>
  chrome?: SceneChromeConfig
}

export interface HtmlScenePackage {
  id: string
  title: LocalizedText
  assetId: string
  protocol: SceneProtocol
  views: HtmlSceneView[]
}

// ─── Experience Navigation ──────────────────────────────────

export type {
  ExperienceLocation,
  ExperienceRoute,
  ExperienceNavigation,
} from './experience-navigation.js'

// ─── Product Config ─────────────────────────────────────────

export interface ProductViewportConfig {
  width: number
  height: number
  backgroundColor?: string
}

export interface ProductChromeConfig {
  showToolbar?: boolean
  showZoomIndicator?: boolean
  showHints?: boolean
}

export interface AtlasTheme {
  hotspotVariant: 'default' | 'highlight' | 'minimal'
  calloutVariant: 'classic' | 'connector' | 'none'
  /** Hide hotspots when camera zoom falls below this value. Undefined = always show. */
  hotspotMinZoom?: number
  /** Hide callouts when camera zoom falls below this value. Undefined = always show. */
  calloutMinZoom?: number
  /** Hide item markers when camera zoom falls below this value. Undefined = always show. */
  itemMarkerMinZoom?: number
  accentColor?: string
  backgroundColor?: string
  textColor?: string
}

export interface CatalogTheme {
  listDensity: 'compact' | 'comfortable'
  focusVariant: 'rect' | 'pill'
  accentColor?: string
  backgroundColor?: string
  textColor?: string
  maskOpacity?: number
}

export interface AtlasProductConfig {
  enabled: true
  viewport: ProductViewportConfig
  theme: AtlasTheme
  chrome: ProductChromeConfig
  interaction: {
    wheelZoom: boolean
    dragPan: boolean
    pinchZoom: boolean
    resetCameraEnabled: boolean
  }
  categoryIds: string[]
  hintText?: LocalizedText
}

export interface CatalogProductConfig {
  enabled: true
  viewport: ProductViewportConfig
  theme: CatalogTheme
  chrome: ProductChromeConfig
  interaction: {
    listActivation: 'center-nearest'
    markerActivation: boolean
    viewportAnimationMs: number
  }
  stageOrder: [IndustryStageKey, IndustryStageKey, IndustryStageKey]
  hintText?: LocalizedText
  /** Complete URL of the separately released Atlas bundle, opened from Catalog through F10. */
  atlasLaunchUrl?: string
}

// ─── Integrations & Metadata ────────────────────────────────

export interface AnalyticsConfig {
  enabled: boolean
  provider: 'weblog'
  appKey: string
  pageType: string
  name: string
  defaultSource: string
}

export interface ShareConfig {
  enabled: boolean
  title?: LocalizedText
  description?: LocalizedText
  imageAssetId?: string
}

export interface ProjectIntegrations {
  analytics?: AnalyticsConfig
  share?: ShareConfig
}

export interface ProjectMetadata {
  createdAt: string
  updatedAt: string
  revision: number
  schemaVersion: SchemaVersion
}

// ─── Top-level GuideProject ─────────────────────────────────

export interface GuideProject {
  schemaVersion: SchemaVersion
  id: string
  title: LocalizedText
  version: string
  localization: LocalizationConfig

  knowledge: IndustryChain
  assets: AssetRegistry
  panorama: PanoramaModel
  scenes: HtmlScenePackage[]
  navigation: ExperienceNavigation

  products: {
    atlas: AtlasProductConfig
    catalog: CatalogProductConfig
  }

  integrations: ProjectIntegrations
  metadata: ProjectMetadata
}

// ─── Re-exports for convenience ─────────────────────────────

export type { SceneProtocol } from './scene-protocol.js'

// Forward-declared schemas are exported from project-schema.ts.
// Importing types only here keeps this file free of zod runtime cost.
export interface GuideProjectSchemas {
  GuideProject: ZodType<GuideProject>
  IndustryChain: ZodType<IndustryChain>
  PanoramaModel: ZodType<PanoramaModel>
  AssetRegistry: ZodType<AssetRegistry>
  SceneProtocol: typeof SceneProtocolSchema
  ExperienceNavigation: typeof ExperienceNavigationSchema
}
