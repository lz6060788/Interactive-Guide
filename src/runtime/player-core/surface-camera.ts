import type {
  CameraBounds,
  CameraState,
  SurfaceCard,
  SurfaceFocusLayer,
  SurfaceHotspot,
  SurfaceLayerVisibilityRule,
} from '../../shared/types.js'

export interface SurfaceCameraLayoutInput {
  viewportWidth: number
  viewportHeight: number
  sourceAspect: number
  camera: CameraState
  bounds: CameraBounds
}

export interface SurfaceCameraLayout {
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

export interface SurfaceViewportPoint {
  x: number
  y: number
}

export interface SurfaceVisibleAnnotations {
  layers: SurfaceFocusLayer[]
  cards: SurfaceCard[]
  hotspots: SurfaceHotspot[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function roundCamera(camera: CameraState): CameraState {
  return {
    centerX: Number(camera.centerX.toFixed(6)),
    centerY: Number(camera.centerY.toFixed(6)),
    zoom: Number(camera.zoom.toFixed(6)),
  }
}

export function clampSurfaceCamera(
  camera: CameraState,
  viewportWidth: number,
  viewportHeight: number,
  sourceAspect: number,
  bounds: CameraBounds,
): CameraState {
  const safeViewportWidth = Math.max(viewportWidth, 1)
  const safeViewportHeight = Math.max(viewportHeight, 1)
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

  return roundCamera({
    centerX: clamp(camera.centerX, visibleWidthNorm / 2, 1 - visibleWidthNorm / 2),
    centerY: clamp(camera.centerY, visibleHeightNorm / 2, 1 - visibleHeightNorm / 2),
    zoom,
  })
}

export function resolveSurfaceCameraLayout(
  input: SurfaceCameraLayoutInput,
): SurfaceCameraLayout {
  const { viewportWidth, viewportHeight, sourceAspect, bounds } = input
  const camera = clampSurfaceCamera(input.camera, viewportWidth, viewportHeight, sourceAspect, bounds)

  const safeViewportWidth = Math.max(viewportWidth, 1)
  const safeViewportHeight = Math.max(viewportHeight, 1)
  const safeSourceAspect = Math.max(sourceAspect, 0.0001)
  let baseWidth = safeViewportWidth
  let baseHeight = baseWidth / safeSourceAspect
  if (baseHeight < safeViewportHeight) {
    baseHeight = safeViewportHeight
    baseWidth = baseHeight * safeSourceAspect
  }

  const originX = (safeViewportWidth - baseWidth) / 2
  const originY = (safeViewportHeight - baseHeight) / 2
  const scaledWidth = baseWidth * camera.zoom
  const scaledHeight = baseHeight * camera.zoom
  const translateX = safeViewportWidth / 2 - originX - camera.centerX * scaledWidth
  const translateY = safeViewportHeight / 2 - originY - camera.centerY * scaledHeight

  return {
    camera,
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

export function projectSurfacePoint(
  point: SurfaceViewportPoint,
  layout: SurfaceCameraLayout,
): SurfaceViewportPoint {
  return {
    x: layout.originX + layout.translateX + point.x * layout.scaledWidth,
    y: layout.originY + layout.translateY + point.y * layout.scaledHeight,
  }
}

export function getVisibleSurfaceLayers(
  layers: SurfaceFocusLayer[] | undefined,
  camera: CameraState,
): SurfaceFocusLayer[] {
  if (!layers?.length) return []
  return layers.filter(layer => isThresholdVisible(layer.visibility, camera.zoom))
}

function isThresholdVisible(
  visibility: SurfaceLayerVisibilityRule | undefined,
  zoom: number,
): boolean {
  if (!visibility) return false
  return zoom >= visibility.minZoom
}

export function getVisibleSurfaceCards(
  layers: SurfaceFocusLayer[] | undefined,
  camera: CameraState,
): SurfaceCard[] {
  if (!layers?.length) return []
  return layers.flatMap(layer => (
    isThresholdVisible(layer.visibility, camera.zoom)
      ? layer.cards
      : []
  ))
}

export function getVisibleSurfaceHotspots(
  layers: SurfaceFocusLayer[] | undefined,
  camera: CameraState,
): SurfaceHotspot[] {
  if (!layers?.length) return []
  return layers.flatMap(layer => (
    isThresholdVisible(layer.visibility, camera.zoom)
      ? layer.hotspots
      : []
  ))
}

export function resolveVisibleSurfaceAnnotations(
  layers: SurfaceFocusLayer[] | undefined,
  camera: CameraState,
): SurfaceVisibleAnnotations {
  const visibleLayers = getVisibleSurfaceLayers(layers, camera)
  const cards = getVisibleSurfaceCards(visibleLayers, camera)
  return {
    layers: visibleLayers,
    cards,
    hotspots: cards.length > 0 ? [] : getVisibleSurfaceHotspots(visibleLayers, camera),
  }
}

export function interpolateCamera(
  from: CameraState,
  to: CameraState,
  progress: number,
): CameraState {
  return {
    centerX: from.centerX + (to.centerX - from.centerX) * progress,
    centerY: from.centerY + (to.centerY - from.centerY) * progress,
    zoom: from.zoom + (to.zoom - from.zoom) * progress,
  }
}
