import type { CameraState, SurfaceCard, SurfaceConfig, SurfaceFocusLayer, SurfaceHotspot } from '../../../shared/types'

// Re-export types that consumers need
export type { CameraState, SurfaceCard, SurfaceConfig, SurfaceFocusLayer, SurfaceHotspot }

export interface PreviewViewportRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SurfacePreviewLayout {
  camera: CameraState
  viewportWidth: number
  viewportHeight: number
  baseWidth: number
  baseHeight: number
  originX: number
  originY: number
  scaledWidth: number
  scaledHeight: number
  translateX: number
  translateY: number
}

export type PreviewMode = 'browse' | 'cards' | 'hotspots'
export type EditMode = 'card-anchor' | 'hotspot-anchor' | null
export type PreviewDragKind = 'pan' | 'card-anchor' | 'hotspot-anchor'
export type HotspotMarkerPosition = 'top' | 'bottom'

export const BORDER = '#2a2d3a'
export const PANEL_BG = '#0a0b0f'
export const MIN_PREVIEW_HEIGHT = 320
export const DEFAULT_SOURCE_ASPECT = 375 / 808
export const ZOOM_STEP = 1.12

export function parseJsonSafe<T>(value: string): T | null {
  if (!value.trim()) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function round(value: number): number {
  return Number(value.toFixed(6))
}

export function getDefaultSurfaceConfig(imageUrl?: string): SurfaceConfig {
  return {
    sourceImageUrl: imageUrl ?? '',
    coordSpace: 'surface-normalized',
    initialCamera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    bounds: { minZoom: 1, maxZoom: 4 },
    gesture: { wheelZoom: true, dragPan: true },
  }
}

export function getDefaultLayer(index: number): SurfaceFocusLayer {
  return {
    id: `layer_${index}`,
    title: `图层 ${index}`,
    visibility: {
      minZoom: 1,
      hotspotsMinZoom: 1,
      cardsMinZoom: 1.8,
    },
    cards: [],
    hotspots: [],
  }
}

export function resolveDefaultHotspotTarget(
  layers: SurfaceFocusLayer[],
  currentLayerId: string | null,
  previewCamera: CameraState,
): SurfaceHotspot['target'] {
  const fallbackLayer = layers.find(layer => layer.id !== currentLayerId) ?? layers[0]
  if (fallbackLayer) {
    return {
      type: 'focus-layer',
      layerId: fallbackLayer.id,
    }
  }
  return {
    type: 'camera-preset',
    camera: previewCamera,
  }
}

export function resolveSharedLayerThreshold(
  layers: SurfaceFocusLayer[],
  key: 'minZoom' | 'hotspotsMinZoom' | 'cardsMinZoom',
  fallback: number,
): number {
  const firstLayer = layers[0]
  if (!firstLayer) return fallback
  if (key === 'minZoom') return firstLayer.visibility.minZoom
  return firstLayer.visibility[key] ?? firstLayer.visibility.minZoom
}

export function resolveLayerThreshold(
  layer: SurfaceFocusLayer,
): number {
  return layer.visibility.minZoom
}

export function clampCameraToBounds(camera: CameraState, bounds: SurfaceConfig['bounds']): CameraState {
  return {
    centerX: round(clamp(camera.centerX, 0, 1)),
    centerY: round(clamp(camera.centerY, 0, 1)),
    zoom: round(clamp(camera.zoom, bounds.minZoom, bounds.maxZoom)),
  }
}

export function clampSurfaceCameraForPreview(
  camera: CameraState,
  viewportRect: PreviewViewportRect,
  sourceAspect: number,
  bounds: SurfaceConfig['bounds'],
): CameraState {
  const safeViewportWidth = Math.max(viewportRect.width, 1)
  const safeViewportHeight = Math.max(viewportRect.height, 1)
  const safeSourceAspect = Math.max(sourceAspect, 0.0001)
  const minZoom = Math.max(bounds.minZoom, 0.0001)
  const maxZoom = Math.max(bounds.maxZoom, minZoom)
  const zoom = clamp(camera.zoom, minZoom, maxZoom)

  let baseWidth = safeViewportWidth
  let baseHeight = baseWidth / safeSourceAspect
  if (baseHeight < safeViewportHeight) {
    baseHeight = safeViewportHeight
    baseWidth = baseHeight * safeSourceAspect
  }

  const visibleWidthNorm = Math.min(safeViewportWidth / Math.max(baseWidth * zoom, 1), 1)
  const visibleHeightNorm = Math.min(safeViewportHeight / Math.max(baseHeight * zoom, 1), 1)

  return {
    centerX: round(clamp(camera.centerX, visibleWidthNorm / 2, 1 - visibleWidthNorm / 2)),
    centerY: round(clamp(camera.centerY, visibleHeightNorm / 2, 1 - visibleHeightNorm / 2)),
    zoom: round(zoom),
  }
}

export function resolvePreviewLayout(
  viewportRect: PreviewViewportRect,
  sourceAspect: number,
  camera: CameraState,
  bounds: SurfaceConfig['bounds'],
): SurfacePreviewLayout {
  const safeViewportWidth = Math.max(viewportRect.width, 1)
  const safeViewportHeight = Math.max(viewportRect.height, 1)
  const safeSourceAspect = Math.max(sourceAspect, 0.0001)
  const nextCamera = clampSurfaceCameraForPreview(
    camera,
    viewportRect,
    safeSourceAspect,
    bounds,
  )

  let baseWidth = safeViewportWidth
  let baseHeight = baseWidth / safeSourceAspect
  if (baseHeight < safeViewportHeight) {
    baseHeight = safeViewportHeight
    baseWidth = baseHeight * safeSourceAspect
  }

  const originX = viewportRect.x + (safeViewportWidth - baseWidth) / 2
  const originY = viewportRect.y + (safeViewportHeight - baseHeight) / 2
  const scaledWidth = baseWidth * nextCamera.zoom
  const scaledHeight = baseHeight * nextCamera.zoom
  const translateX = viewportRect.x + safeViewportWidth / 2 - originX - nextCamera.centerX * scaledWidth
  const translateY = viewportRect.y + safeViewportHeight / 2 - originY - nextCamera.centerY * scaledHeight

  return {
    camera: nextCamera,
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
    baseWidth,
    baseHeight,
    originX,
    originY,
    scaledWidth,
    scaledHeight,
    translateX,
    translateY,
  }
}

export function resolveDeviceViewportRect(
  containerWidth: number,
  containerHeight: number,
  aspectRatio: number,
): PreviewViewportRect {
  const height = Math.max(containerHeight, 1)
  const width = Math.max(height * Math.max(aspectRatio, 0.0001), 1)
  return {
    x: (containerWidth - width) / 2,
    y: 0,
    width,
    height,
  }
}

export function projectPoint(point: { x: number; y: number }, layout: SurfacePreviewLayout) {
  return {
    x: layout.originX + layout.translateX + point.x * layout.scaledWidth,
    y: layout.originY + layout.translateY + point.y * layout.scaledHeight,
  }
}

export function normalizePointFromViewport(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  layout: SurfacePreviewLayout,
) {
  return {
    x: clamp01((clientX - rect.left - layout.originX - layout.translateX) / Math.max(layout.scaledWidth, 1)),
    y: clamp01((clientY - rect.top - layout.originY - layout.translateY) / Math.max(layout.scaledHeight, 1)),
  }
}

export function getBrowseAnnotations(layers: SurfaceFocusLayer[], camera: CameraState) {
  const visibleLayers = layers.filter(layer => camera.zoom >= resolveLayerThreshold(layer))
  const cards = visibleLayers.flatMap(layer => layer.cards)
  const hotspots = cards.length > 0
    ? []
    : visibleLayers.flatMap(layer => layer.hotspots)
  return { layers: visibleLayers, cards, hotspots }
}

export function updateSelectedCard(
  layers: SurfaceFocusLayer[],
  selectedLayerId: string | null,
  selectedCardId: string | null,
  updater: (card: SurfaceCard) => SurfaceCard,
): SurfaceFocusLayer[] {
  return layers.map(layer => {
    if (layer.id !== selectedLayerId) return layer
    return {
      ...layer,
      cards: layer.cards.map(card => (card.id === selectedCardId ? updater(card) : card)),
    }
  })
}

export function updateSelectedHotspot(
  layers: SurfaceFocusLayer[],
  selectedLayerId: string | null,
  selectedHotspotId: string | null,
  updater: (hotspot: SurfaceHotspot) => SurfaceHotspot,
): SurfaceFocusLayer[] {
  return layers.map(layer => {
    if (layer.id !== selectedLayerId) return layer
    return {
      ...layer,
      hotspots: layer.hotspots.map(hotspot => (
        hotspot.id === selectedHotspotId ? updater(hotspot) : hotspot
      )),
    }
  })
}

export function updateSelectedLayer(
  layers: SurfaceFocusLayer[],
  selectedLayerId: string | null,
  updater: (layer: SurfaceFocusLayer) => SurfaceFocusLayer,
): SurfaceFocusLayer[] {
  return layers.map(layer => (
    layer.id === selectedLayerId ? updater(layer) : layer
  ))
}

export function resolvePreviewCameraForLayer(
  layer: SurfaceFocusLayer | null,
  surfaceConfig: SurfaceConfig,
): CameraState {
  if (!layer) return surfaceConfig.initialCamera
  if (layer.cameraPreset) {
    return clampCameraToBounds({
      ...layer.cameraPreset,
      zoom: resolveLayerThreshold(layer),
    }, surfaceConfig.bounds)
  }

  const points = [
    ...layer.cards.map(card => card.anchor),
    ...layer.cards.flatMap(card => (card.callout ? [card.callout.target] : [])),
    ...layer.hotspots.map(hotspot => hotspot.anchor),
  ]
  if (!points.length) return surfaceConfig.initialCamera

  const minX = Math.min(...points.map(point => point.x))
  const maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  const maxY = Math.max(...points.map(point => point.y))
  const padding = 0.08
  const targetZoom = resolveLayerThreshold(layer)

  return clampCameraToBounds({
    centerX: clamp01((minX + maxX) / 2),
    centerY: clamp01((minY + maxY) / 2),
    zoom: Math.max(targetZoom, 1 / Math.max(maxX - minX + padding, maxY - minY + padding, 0.0001)),
  }, surfaceConfig.bounds)
}

export function parseInlineStyleMap(styleText?: string): Map<string, string> {
  const entries = new Map<string, string>()
  for (const part of (styleText ?? '').split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex <= 0) continue
    const property = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (!property || !value) continue
    entries.set(property, value)
  }
  return entries
}

export function stringifyInlineStyleMap(entries: Map<string, string>): string {
  return Array.from(entries.entries())
    .map(([property, value]) => `${property}:${value}`)
    .join('; ')
}

export function parseHotspotPreviewStyle(styleText?: string): React.CSSProperties {
  if (!styleText?.trim() || typeof document === 'undefined') return {}
  const probe = document.createElement('div')
  probe.setAttribute('style', styleText)
  const parsed: React.CSSProperties = {}
  const ignoredKeys = new Set([
    'position',
    'left',
    'top',
    'right',
    'bottom',
    'transform',
    'pointer-events',
    'z-index',
    '--hotspot-marker-display',
    '--hotspot-marker-position',
    '--hotspot-marker-gap',
  ])
  for (let i = 0; i < probe.style.length; i += 1) {
    const propertyName = probe.style[i]
    if (!propertyName || ignoredKeys.has(propertyName)) continue
    const value = probe.style.getPropertyValue(propertyName).trim()
    if (!value) continue
    const reactKey = propertyName.startsWith('--')
      ? propertyName
      : propertyName.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
    ;(parsed as Record<string, string>)[reactKey] = value
  }
  return parsed
}

export function setInlineStyleProperty(styleText: string | undefined, property: string, value?: string | null): string {
  const entries = parseInlineStyleMap(styleText)
  if (!value?.trim()) {
    entries.delete(property)
  } else {
    entries.set(property, value.trim())
  }
  return stringifyInlineStyleMap(entries)
}

export function getHotspotMarkerConfig(styleText?: string): {
  visible: boolean
  position: HotspotMarkerPosition
  gapPx: number
} {
  const entries = parseInlineStyleMap(styleText)
  const display = entries.get('--hotspot-marker-display')?.trim().toLowerCase()
  const position = entries.get('--hotspot-marker-position')?.trim().toLowerCase()
  const gapValue = entries.get('--hotspot-marker-gap')?.trim().toLowerCase() ?? ''
  const parsedGap = Number.parseFloat(gapValue.replace(/px$/i, '').trim())
  return {
    visible: display !== 'none',
    position: position === 'bottom' ? 'bottom' : 'top',
    gapPx: Number.isFinite(parsedGap) ? Math.max(parsedGap, 0) : 6,
  }
}

export function updateHotspotMarkerStyle(
  styleText: string | undefined,
  patch: Partial<{ visible: boolean, position: HotspotMarkerPosition, gapPx: number }>,
): string {
  const current = getHotspotMarkerConfig(styleText)
  const next = {
    ...current,
    ...patch,
  }
  let result = styleText ?? ''
  result = setInlineStyleProperty(result, '--hotspot-marker-display', next.visible ? null : 'none')
  result = setInlineStyleProperty(result, '--hotspot-marker-position', next.position)
  result = setInlineStyleProperty(result, '--hotspot-marker-gap', `${Math.max(next.gapPx, 0)}px`)
  return result
}
