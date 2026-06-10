// ============================================================
// Interactive Guide - Panorama HTML Shared Types
// ============================================================
// Shared contract for the standalone panorama-html product.

export type PanoramaProductType = 'panorama-html'
export type PanoramaSchemaVersion = '1.0.0'
export type PanoramaConnectorMode = 'divider-left'
export type PanoramaMarkerStyle = 'default' | 'highlight'
export type PanoramaDetailExpandMode = 'active-only'
export type PanoramaInteractionMode =
  | 'idle'
  | 'scroll-sync'
  | 'hotspot-sync'
  | 'tab-switch'
  | 'group-switch'

export interface PanoramaThemeTokens {
  panelBg?: string
  panelText?: string
  accentColor?: string
  maskColor?: string
  maskOpacity?: number
  connectorColor?: string
  connectorDash?: string
}

export interface PanoramaMetadata {
  generatedAt?: string
  updatedAt?: string
  schemaVersion: PanoramaSchemaVersion
}

export interface PanoramaAssetRef {
  assetId: string
  imageUrl: string
  width?: number
  height?: number
}

export interface PanoramaMarker {
  x: number
  y: number
  style?: PanoramaMarkerStyle
}

export interface PanoramaViewport {
  centerX: number
  centerY: number
  zoom: number
}

export interface PanoramaFocusRect {
  x: number
  y: number
  width: number
  height: number
  radius?: number
  maskOpacity?: number
}

export interface PanoramaConnectorTarget {
  mode: PanoramaConnectorMode
  offsetX?: number
  offsetY?: number
}

export interface PanoramaDetailBehavior {
  expandMode?: PanoramaDetailExpandMode
  collapsedLines?: number
}

export interface PanoramaItem {
  id: string
  title: string
  description: string
  order: number
  marker: PanoramaMarker
  focusRect: PanoramaFocusRect
  viewportOverride?: PanoramaViewport
  connectorTarget?: PanoramaConnectorTarget
  detailBehavior?: PanoramaDetailBehavior
}

export interface PanoramaGroup {
  id: string
  title: string
  order: number
  panoramaAsset: PanoramaAssetRef
  defaultViewport: PanoramaViewport
  defaultItemId?: string
  items: PanoramaItem[]
}

export interface PanoramaSection {
  id: string
  label: string
  order: number
  defaultGroupId?: string
  groups: PanoramaGroup[]
}

export interface PanoramaHtmlProduct {
  id: string
  packageId: string
  version: string
  title: string
  productType: PanoramaProductType
  hintText: string
  globalPanoramaAsset?: PanoramaAssetRef
  theme?: PanoramaThemeTokens
  sections: PanoramaSection[]
  metadata: PanoramaMetadata
}

export interface PanoramaEditorDraftState {
  selectedSectionId?: string
  selectedGroupId?: string
  selectedItemId?: string
  viewportMode?: 'group-default' | 'item-override'
  overlayMode?: 'marker' | 'focusRect' | 'connector'
}

export interface PanoramaEditorDocument {
  product: PanoramaHtmlProduct
  draftState: PanoramaEditorDraftState
}

export interface PanoramaRuntimeState {
  activeSectionId: string
  activeGroupId: string
  activeItemId: string
  activeViewport: PanoramaViewport
  activeFocusRect: PanoramaFocusRect
  activeMarkerId: string
  scrollingItemId?: string
  interactionMode: PanoramaInteractionMode
}
