import type { PublishManifest } from '../../shared/types.js'
import { getResolutionDimensions } from '../../shared/utils.js'

export interface StageLayoutInput {
  manifest: PublishManifest
  viewport: HTMLElement
  stage: HTMLElement
  chromeRoot: HTMLElement
  layout?: {
    mode?: 'immersive-mobile' | 'contain-center'
    getViewport?: () => { width: number; height: number }
  }
}

export interface StageLayoutResult {
  stageLeft: number
  stageTop: number
  stageWidth: number
  stageHeight: number
}

export function resolveViewportSize(
  viewport: HTMLElement,
  layout?: StageLayoutInput['layout'],
): { width: number; height: number } {
  const customViewport = layout?.getViewport?.()
  if (customViewport) return customViewport
  const rect = viewport.getBoundingClientRect()
  return {
    width: rect.width,
    height: rect.height,
  }
}

export function applyStageLayout(input: StageLayoutInput): StageLayoutResult {
  const { manifest, viewport, stage, chromeRoot, layout: layoutOpts } = input

  const viewportSize = resolveViewportSize(viewport, layoutOpts)
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return { stageLeft: 0, stageTop: 0, stageWidth: viewportSize.width, stageHeight: viewportSize.height }
  }

  const { width: designWidth, height: designHeight } = getResolutionDimensions(manifest.resolution)
  const designAspect = designWidth / Math.max(designHeight, 1)
  const viewportAspect = viewportSize.width / Math.max(viewportSize.height, 1)
  const layoutMode = layoutOpts?.mode ?? 'immersive-mobile'

  let stageWidth = viewportSize.width
  let stageHeight = viewportSize.width / Math.max(designAspect, 0.0001)
  let stageLeft = 0
  let stageTop = 0

  if (layoutMode === 'contain-center') {
    if (viewportAspect > designAspect) {
      stageHeight = viewportSize.height
      stageWidth = stageHeight * designAspect
    }
    stageLeft = (viewportSize.width - stageWidth) / 2
    stageTop = (viewportSize.height - stageHeight) / 2
  } else if (viewportAspect > designAspect) {
    stageWidth = viewportSize.width
    stageHeight = viewportSize.height
    stageLeft = 0
    stageTop = 0
  } else {
    stageTop = (viewportSize.height - stageHeight) / 2
  }

  Object.assign(stage.style, {
    left: `${stageLeft}px`,
    top: `${stageTop}px`,
    width: `${stageWidth}px`,
    height: `${stageHeight}px`,
    aspectRatio: `${designWidth} / ${designHeight}`,
  })

  updateChromeFrame(chromeRoot, viewportSize.width, viewportSize.height, stageLeft, stageTop, stageWidth, stageHeight)

  return { stageLeft, stageTop, stageWidth, stageHeight }
}

export function updateChromeFrame(
  chromeRoot: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
  stageLeft: number,
  stageTop: number,
  stageWidth: number,
  stageHeight: number,
): void {
  const visibleLeft = Math.max(stageLeft, 0)
  const visibleTop = Math.max(stageTop, 0)
  const visibleRight = Math.min(stageLeft + stageWidth, viewportWidth)
  const visibleBottom = Math.min(stageTop + stageHeight, viewportHeight)
  const visibleWidth = Math.max(visibleRight - visibleLeft, 0)
  const visibleHeight = Math.max(visibleBottom - visibleTop, 0)

  Object.assign(chromeRoot.style, {
    left: `${visibleLeft}px`,
    top: `${visibleTop}px`,
    width: `${visibleWidth}px`,
    height: `${visibleHeight}px`,
    overflow: 'hidden',
  })
}
