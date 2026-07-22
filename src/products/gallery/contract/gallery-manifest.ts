import type {
  IndustryStageKey,
  LocalizationConfig,
  LocalizedText,
  ProductChromeConfig,
} from '../../../domain/project-types.js'
import type { RuntimeIntegrations } from '../../contracts/runtime-integrations.js'

export interface GalleryImageRef {
  assetId: string
  url: string
  width?: number
  height?: number
  mimeType?: string
  sha256?: string
  size?: number
}

export interface GalleryItemEntry<TText = LocalizedText> {
  id: string
  categoryId: string
  title: TText
  description: TText
  order: number
  image: GalleryImageRef
}

export interface GalleryCategoryEntry<TText = LocalizedText> {
  id: string
  title: TText
  description?: TText
  order: number
  itemIds: string[]
}

export interface GalleryStageEntry<TText = LocalizedText> {
  key: IndustryStageKey
  label: TText
  order: 1 | 2 | 3
  categories: GalleryCategoryEntry<TText>[]
}

export interface GalleryManifest<TText = LocalizedText> {
  schemaVersion: '1.0.0'
  product: 'gallery'
  projectId: string
  projectTitle: TText
  projectVersion: string
  localization: LocalizationConfig
  locale?: string
  generatedAt: string
  stages: GalleryStageEntry<TText>[]
  items: GalleryItemEntry<TText>[]
  config: {
    viewport: { width: number; height: number }
    hintText?: TText
    atlasLaunchUrl?: string
    interaction: {
      listActivation: 'center-nearest'
      itemTransitionMs: number
      categoryTransitionMs: number
    }
    chrome: ProductChromeConfig
    theme: {
      listDensity: 'compact' | 'comfortable'
      accentColor?: string
      backgroundColor?: string
      textColor?: string
    }
  }
  integrations: RuntimeIntegrations<TText>
}

export type ResolvedGalleryManifest = GalleryManifest<string> & { locale: string }
export type ResolvedGalleryStageEntry = GalleryStageEntry<string>
export type ResolvedGalleryCategoryEntry = GalleryCategoryEntry<string>
export type ResolvedGalleryItemEntry = GalleryItemEntry<string>
