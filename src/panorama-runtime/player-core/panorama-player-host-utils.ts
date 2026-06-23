export interface ProjectedFocusRect {
  x: number
  y: number
  width: number
  height: number
  radius: number
  maskOpacity: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function shouldUseAppleFocusOverlayFallback(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform || ''
  const vendor = navigator.vendor || ''
  const userAgent = navigator.userAgent || ''
  const maxTouchPoints = navigator.maxTouchPoints || 0
  const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
  const isSafariOnMac = /Mac/.test(platform) && /Apple/i.test(vendor)
  return isIOSDevice || isSafariOnMac
}

export function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3)
}

export function interpolateProjectedFocusRect(
  fromRect: ProjectedFocusRect,
  toRect: ProjectedFocusRect,
  progress: number,
): ProjectedFocusRect {
  return {
    x: lerp(fromRect.x, toRect.x, progress),
    y: lerp(fromRect.y, toRect.y, progress),
    width: lerp(fromRect.width, toRect.width, progress),
    height: lerp(fromRect.height, toRect.height, progress),
    radius: lerp(fromRect.radius, toRect.radius, progress),
    maskOpacity: lerp(fromRect.maskOpacity, toRect.maskOpacity, progress),
  }
}

export function isProjectedFocusRectEqual(
  leftRect: ProjectedFocusRect,
  rightRect: ProjectedFocusRect,
): boolean {
  return (
    Math.abs(leftRect.x - rightRect.x) < 0.5 &&
    Math.abs(leftRect.y - rightRect.y) < 0.5 &&
    Math.abs(leftRect.width - rightRect.width) < 0.5 &&
    Math.abs(leftRect.height - rightRect.height) < 0.5 &&
    Math.abs(leftRect.radius - rightRect.radius) < 0.25 &&
    Math.abs(leftRect.maskOpacity - rightRect.maskOpacity) < 0.01
  )
}

export function lerp(fromValue: number, toValue: number, progress: number): number {
  return fromValue + (toValue - fromValue) * progress
}

export function clampSceneOffset(
  offset: number,
  viewportStart: number,
  viewportSize: number,
  sceneSize: number,
): number {
  if (sceneSize <= viewportSize) {
    return viewportStart + (viewportSize - sceneSize) / 2
  }

  return clamp(offset, viewportStart + viewportSize - sceneSize, viewportStart)
}
