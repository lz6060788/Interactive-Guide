import type { NormalizedPoint, Viewport } from '../../../domain/project-types.js'
import type { CameraBounds } from './camera.js'

export interface PanoramaProjectionInput {
  viewportWidth: number
  viewportHeight: number
  sourceWidth: number
  sourceHeight: number
  camera: Viewport
  bounds: CameraBounds
}

export interface PanoramaProjection {
  camera: Viewport
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

export interface ScreenPoint {
  x: number
  y: number
}

const positive = (value: number): number => Math.max(value, 1)
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export function clampPanoramaCamera(
  camera: Viewport,
  input: Omit<PanoramaProjectionInput, 'camera'>,
): Viewport {
  const viewportWidth = positive(input.viewportWidth)
  const viewportHeight = positive(input.viewportHeight)
  const sourceAspect = positive(input.sourceWidth) / positive(input.sourceHeight)
  const minZoom = Math.max(input.bounds.minZoom, 0.0001)
  const maxZoom = Math.max(input.bounds.maxZoom, minZoom)
  const zoom = clamp(camera.zoom, minZoom, maxZoom)

  let baseWidth = viewportWidth
  let baseHeight = baseWidth / sourceAspect
  if (baseHeight < viewportHeight) {
    baseHeight = viewportHeight
    baseWidth = baseHeight * sourceAspect
  }

  const visibleWidth = Math.min(1, viewportWidth / (baseWidth * zoom))
  const visibleHeight = Math.min(1, viewportHeight / (baseHeight * zoom))

  return {
    centerX: clamp(camera.centerX, visibleWidth / 2, 1 - visibleWidth / 2),
    centerY: clamp(camera.centerY, visibleHeight / 2, 1 - visibleHeight / 2),
    zoom,
  }
}

export function resolvePanoramaProjection(input: PanoramaProjectionInput): PanoramaProjection {
  const viewportWidth = positive(input.viewportWidth)
  const viewportHeight = positive(input.viewportHeight)
  const sourceAspect = positive(input.sourceWidth) / positive(input.sourceHeight)
  const camera = clampPanoramaCamera(input.camera, input)

  let baseWidth = viewportWidth
  let baseHeight = baseWidth / sourceAspect
  if (baseHeight < viewportHeight) {
    baseHeight = viewportHeight
    baseWidth = baseHeight * sourceAspect
  }

  const originX = (viewportWidth - baseWidth) / 2
  const originY = (viewportHeight - baseHeight) / 2
  const scaledWidth = baseWidth * camera.zoom
  const scaledHeight = baseHeight * camera.zoom
  const translateX = viewportWidth / 2 - originX - camera.centerX * scaledWidth
  const translateY = viewportHeight / 2 - originY - camera.centerY * scaledHeight

  return {
    camera,
    viewportWidth,
    viewportHeight,
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

export function projectNormalizedPoint(
  point: NormalizedPoint,
  projection: PanoramaProjection,
): ScreenPoint {
  return {
    x: projection.originX + projection.translateX + point.x * projection.scaledWidth,
    y: projection.originY + projection.translateY + point.y * projection.scaledHeight,
  }
}

export function unprojectScreenPoint(
  point: ScreenPoint,
  projection: PanoramaProjection,
): NormalizedPoint {
  return {
    x: (point.x - projection.originX - projection.translateX) / projection.scaledWidth,
    y: (point.y - projection.originY - projection.translateY) / projection.scaledHeight,
  }
}

export function zoomCameraAtScreenPoint(
  camera: Viewport,
  screenPoint: ScreenPoint,
  nextZoom: number,
  input: Omit<PanoramaProjectionInput, 'camera'>,
): Viewport {
  const before = resolvePanoramaProjection({ ...input, camera })
  const anchor = unprojectScreenPoint(screenPoint, before)
  const zoomed = resolvePanoramaProjection({ ...input, camera: { ...camera, zoom: nextZoom } })
  const anchorAfter = projectNormalizedPoint(anchor, zoomed)
  const adjusted = {
    centerX: zoomed.camera.centerX + (anchorAfter.x - screenPoint.x) / zoomed.scaledWidth,
    centerY: zoomed.camera.centerY + (anchorAfter.y - screenPoint.y) / zoomed.scaledHeight,
    zoom: zoomed.camera.zoom,
  }
  return clampPanoramaCamera(adjusted, input)
}
