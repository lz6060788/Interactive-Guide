/**
 * CatalogManifest contract — the data shape consumed by CatalogRuntime.
 *
 * Catalog is the structured-knowledge product: three industry-chain
 * stages, each with categories, each with items. It presents the
 * structured knowledge over the shared panorama scene: stage/category
 * tabs, the selected category's item list, markers and focusRect.
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

export interface CatalogAssetRef {
  assetId: string
  url: string
  mimeType?: string
  sha256?: string
  size?: number
}

export interface CatalogHtmlSceneManifest<TText = LocalizedText> {
  sceneId: string
  title: TText
  entryUrl: string
  views: Array<{
    id: string
    title: TText
    activationMessage: { type: string; payload?: Record<string, unknown> }
    chrome?: { textColor?: string }
  }>
  protocol: { channel: 'interactive-guide:scene-bridge'; version: '1.0.0' }
}

export interface CatalogCategoryEntry<TText = LocalizedText> {
  id: string
  title: TText
  order: number
  description?: TText
  itemIds: string[]
  experience: { kind: 'panorama' } | { kind: 'html-scene'; sceneId: string; viewId: string }
  viewport: Viewport
}

export interface CatalogItemEntry<TText = LocalizedText> {
  id: string
  categoryId: string
  title: TText
  description: TText
  order: number
  marker: { x: number; y: number }
  /** Optional item-level camera; otherwise inherits category.viewport. */
  viewportOverride?: Viewport
  focusRect: {
    x: number
    y: number
    width: number
    height: number
    radius?: number
    maskOpacity?: number
  }
}

export interface CatalogStageEntry<TText = LocalizedText> {
  key: 'upstream' | 'midstream' | 'downstream'
  label: TText
  order: 1 | 2 | 3
  categories: CatalogCategoryEntry<TText>[]
}

export interface CatalogManifest<TText = LocalizedText> {
  schemaVersion: '2.0.0'
  product: 'catalog'
  projectId: string
  projectTitle: TText
  projectVersion: string
  localization: LocalizationConfig
  locale?: string
  generatedAt: string
  /** Catalog needs the panorama for focus overlay rendering. */
  panorama: CatalogAssetRef
  stages: CatalogStageEntry<TText>[]
  items: CatalogItemEntry<TText>[]
  scenes: CatalogHtmlSceneManifest<TText>[]
  routes: ExperienceRoute[]
  config: {
    viewport: { width: number; height: number }
    hintText?: TText
    /** Complete URL of the separately released Atlas bundle. */
    atlasLaunchUrl?: string
    interaction: {
      listActivation: 'center-nearest'
      markerActivation: boolean
      viewportAnimationMs: number
    }
    chrome: ProductChromeConfig
    theme: {
      listDensity: 'compact' | 'comfortable'
      focusVariant: 'rect' | 'pill'
      accentColor?: string
      backgroundColor?: string
      textColor?: string
      maskOpacity?: number
    }
  }
  integrations: RuntimeIntegrations<TText>
}

export type ResolvedCatalogManifest = CatalogManifest<string> & { locale: string }
export type ResolvedCatalogCategoryEntry = CatalogCategoryEntry<string>
export type ResolvedCatalogItemEntry = CatalogItemEntry<string>
export type ResolvedCatalogStageEntry = CatalogStageEntry<string>
export type ResolvedCatalogHtmlSceneManifest = CatalogHtmlSceneManifest<string>

export type { AssetDefinition, ExperienceNavigation }
