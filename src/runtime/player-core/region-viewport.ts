import type { ImageFitMode, QuadRange, RegionViewportConfig } from '../../shared/types.js'

export interface RegionViewportSolveInput {
  viewportWidth: number
  viewportHeight: number
  sourceAspect: number
  regionViewport: RegionViewportConfig
  imageFitMode?: ImageFitMode
}

export interface RegionViewportSolveResult {
  scaledImageWidth: number
  scaledImageHeight: number
  offsetX: number
  offsetY: number
  minOffsetX: number
  maxOffsetX: number
  visibleWindowWidthPx: number
  visibleWindowHeightPx: number
  clipLeftPx: number
  clipRightPx: number
  clipPath: string
  canPanHorizontally: boolean
  initialWindow: QuadRange
  fitMode: 'fitHeight' | 'fitWidth' | 'fill'
}

interface NormalizedRect {
  left: number
  top: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function toRect(range: QuadRange): NormalizedRect {
  const left = Math.min(range.topLeft.x, range.bottomLeft.x)
  const right = Math.max(range.topRight.x, range.bottomRight.x)
  const top = Math.min(range.topLeft.y, range.topRight.y)
  const bottom = Math.max(range.bottomLeft.y, range.bottomRight.y)
  return {
    left,
    top,
    width: Math.max(right - left, 0),
    height: Math.max(bottom - top, 0),
  }
}

function toQuad(rect: NormalizedRect): QuadRange {
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  return {
    topLeft: { x: rect.left, y: rect.top },
    topRight: { x: right, y: rect.top },
    bottomRight: { x: right, y: bottom },
    bottomLeft: { x: rect.left, y: bottom },
  }
}

export function resolveInitialRegionViewport(
  input: RegionViewportSolveInput,
): RegionViewportSolveResult {
  const { viewportWidth, viewportHeight, sourceAspect, regionViewport } = input
  const imageFitMode = input.imageFitMode ?? 'fill'
  const panRect = toRect(regionViewport.panRange)
  const safeViewportWidth = Math.max(viewportWidth, 1)
  const safeViewportHeight = Math.max(viewportHeight, 1)
  const safeSourceAspect = Math.max(sourceAspect, 0.0001)
  const safePanHeight = Math.max(panRect.height, 0.0001)
  const safePanWidth = Math.max(panRect.width, 0.0001)
  const viewportAspect = safeViewportWidth / safeViewportHeight
  const cropAspect = (safeSourceAspect * safePanWidth) / safePanHeight

  const fitMode: 'fitHeight' | 'fitWidth' | 'fill'
    = imageFitMode === 'fill'
      ? 'fill'
      : imageFitMode === 'fitWidth'
        ? 'fitWidth'
        : cropAspect > viewportAspect
          ? 'fitHeight'
          : 'fitWidth'

  let initialWindow: NormalizedRect
  let scaledImageWidth: number
  let scaledImageHeight: number
  let visibleWindowWidthPx: number
  let visibleWindowHeightPx: number
  let offsetX: number
  let offsetY: number
  let minOffsetX: number
  let maxOffsetX: number

  if (fitMode === 'fill') {
    initialWindow = {
      left: panRect.left,
      top: panRect.top,
      width: safePanWidth,
      height: safePanHeight,
    }

    scaledImageWidth = safeViewportWidth / safePanWidth
    scaledImageHeight = safeViewportHeight / safePanHeight
    visibleWindowWidthPx = safeViewportWidth
    visibleWindowHeightPx = safeViewportHeight
    offsetX = -scaledImageWidth * panRect.left
    offsetY = -scaledImageHeight * panRect.top
    minOffsetX = offsetX
    maxOffsetX = offsetX
  } else if (fitMode === 'fitHeight') {
    const derivedWindowWidth = clamp(
      safePanHeight * viewportAspect / safeSourceAspect,
      0,
      safePanWidth,
    )

    initialWindow = {
      left: panRect.left + (safePanWidth - derivedWindowWidth) / 2,
      top: panRect.top,
      width: derivedWindowWidth,
      height: safePanHeight,
    }

    scaledImageHeight = safeViewportHeight / safePanHeight
    scaledImageWidth = scaledImageHeight * safeSourceAspect
    visibleWindowWidthPx = safeViewportWidth
    visibleWindowHeightPx = safeViewportHeight

    const centerX = initialWindow.left + initialWindow.width / 2
    const centerY = initialWindow.top + initialWindow.height / 2
    offsetX = safeViewportWidth / 2 - scaledImageWidth * centerX
    offsetY = safeViewportHeight / 2 - scaledImageHeight * centerY

    const minCenterX = panRect.left + initialWindow.width / 2
    const maxCenterX = panRect.left + panRect.width - initialWindow.width / 2
    minOffsetX = safeViewportWidth / 2 - scaledImageWidth * maxCenterX
    maxOffsetX = safeViewportWidth / 2 - scaledImageWidth * minCenterX
  } else {
    const derivedWindowHeight = clamp(
      safePanWidth / (viewportAspect * safeSourceAspect),
      0,
      safePanHeight,
    )

    initialWindow = {
      left: panRect.left,
      top: panRect.top + (safePanHeight - derivedWindowHeight),
      width: safePanWidth,
      height: derivedWindowHeight,
    }

    scaledImageWidth = safeViewportWidth / safePanWidth
    scaledImageHeight = scaledImageWidth / safeSourceAspect
    visibleWindowWidthPx = safeViewportWidth
    visibleWindowHeightPx = safeViewportHeight

    offsetX = -scaledImageWidth * panRect.left
    offsetY = safeViewportHeight - scaledImageHeight * (panRect.top + safePanHeight)
    minOffsetX = offsetX
    maxOffsetX = offsetX
  }

  const clipLeftPx = 0
  const clipRightPx = safeViewportWidth

  return {
    scaledImageWidth,
    scaledImageHeight,
    offsetX,
    offsetY,
    minOffsetX,
    maxOffsetX,
    visibleWindowWidthPx,
    visibleWindowHeightPx,
    clipLeftPx,
    clipRightPx,
    clipPath: '',
    canPanHorizontally: maxOffsetX - minOffsetX > 0.5,
    initialWindow: toQuad(initialWindow),
    fitMode,
  }
}

export function clampRegionOffsetX(offsetX: number, solved: RegionViewportSolveResult): number {
  return clamp(offsetX, solved.minOffsetX, solved.maxOffsetX)
}
