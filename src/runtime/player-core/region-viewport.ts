interface Point {
  x: number
  y: number
}

interface Quad {
  topLeft: Point
  topRight: Point
  bottomRight: Point
  bottomLeft: Point
}

interface RegionViewportConfig {
  sourceNodeId: string
  coordSpace: string
  panRange: Quad
  initialWindowRule: {
    mode: string
    fitBy: 'height' | 'width'
  }
}

interface RegionViewportInput {
  viewportWidth: number
  viewportHeight: number
  sourceAspect: number
  imageFitMode: string
  regionViewport: RegionViewportConfig
}

export interface RegionViewportResult {
  initialWindow: Quad
  fitMode: string
  canPanHorizontally: boolean
  clipPath: string
  visibleWindowWidthPx?: number
  offsetY?: number
}

export function resolveInitialRegionViewport(input: RegionViewportInput): RegionViewportResult {
  const { viewportWidth, viewportHeight, sourceAspect, imageFitMode, regionViewport } = input
  const { panRange, initialWindowRule } = regionViewport

  const panWidth = panRange.topRight.x - panRange.topLeft.x
  const panHeight = panRange.bottomLeft.y - panRange.topLeft.y
  const panCenterX = (panRange.topLeft.x + panRange.topRight.x + panRange.bottomRight.x + panRange.bottomLeft.x) / 4
  const panCenterY = (panRange.topLeft.y + panRange.topRight.y + panRange.bottomRight.y + panRange.bottomLeft.y) / 4

  const viewportAspect = viewportWidth / viewportHeight

  if (imageFitMode === 'fill') {
    return {
      initialWindow: {
        topLeft: { x: panRange.topLeft.x, y: panRange.topLeft.y },
        topRight: { x: panRange.topRight.x, y: panRange.topRight.y },
        bottomRight: { x: panRange.bottomRight.x, y: panRange.bottomRight.y },
        bottomLeft: { x: panRange.bottomLeft.x, y: panRange.bottomLeft.y },
      },
      fitMode: 'fill',
      canPanHorizontally: false,
      clipPath: '',
    }
  }

  let fitMode: string
  let windowWidth: number
  let windowHeight: number
  let windowCenterX: number
  let windowCenterY: number
  const result: RegionViewportResult = {
    initialWindow: {} as Quad,
    fitMode: '',
    canPanHorizontally: false,
    clipPath: '',
  }

  if (initialWindowRule.fitBy === 'height') {
    windowHeight = panHeight
    windowWidth = panHeight * viewportAspect / sourceAspect

    if (windowWidth <= panWidth) {
      fitMode = 'fitHeight'
      windowCenterX = panCenterX
      windowCenterY = panCenterY
    } else {
      fitMode = 'fitWidth'
      windowWidth = panWidth
      windowHeight = panWidth * viewportHeight / (viewportWidth * sourceAspect)
      windowCenterX = panCenterX
      windowCenterY = panRange.bottomLeft.y - windowHeight / 2
      result.visibleWindowWidthPx = viewportWidth
      result.offsetY = viewportHeight - panRange.bottomLeft.y * viewportWidth / (sourceAspect * panWidth)
    }
  } else {
    windowWidth = panWidth
    windowHeight = panWidth * viewportHeight / (viewportWidth * sourceAspect)
    fitMode = 'fitWidth'
    windowCenterX = panCenterX
    windowCenterY = panCenterY
  }

  const windowLeft = windowCenterX - windowWidth / 2
  const windowRight = windowCenterX + windowWidth / 2
  const windowTop = windowCenterY - windowHeight / 2
  const windowBottom = windowCenterY + windowHeight / 2

  result.initialWindow = {
    topLeft: { x: windowLeft, y: windowTop },
    topRight: { x: windowRight, y: windowTop },
    bottomRight: { x: windowRight, y: windowBottom },
    bottomLeft: { x: windowLeft, y: windowBottom },
  }
  result.fitMode = fitMode
  result.canPanHorizontally = windowWidth < panWidth

  return result
}
