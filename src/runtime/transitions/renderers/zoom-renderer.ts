import type { TransitionContext, TransitionRenderer, ZoomTransitionConfig } from '../transition-interface.js'

const ZOOM_CSS = `
  .transition-zoom-container { position: absolute; inset: 0; overflow: hidden; }
  .transition-zoom-from { position: absolute; inset: 0; overflow: hidden; will-change: transform, opacity; }
  .transition-zoom-to { position: absolute; inset: 0; overflow: hidden; will-change: transform, opacity; }
`

interface ZoomFrame {
  scale: number
  translateX: number
  translateY: number
}

const IDENTITY_FRAME: ZoomFrame = {
  scale: 1,
  translateX: 0,
  translateY: 0,
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

interface RectLike {
  x: number
  y: number
  width: number
  height: number
}

interface PointLike {
  x: number
  y: number
}

function getContentRect(wrapper: HTMLElement): RectLike {
  const wrapperRect = wrapper.getBoundingClientRect()
  const content = wrapper.firstElementChild as HTMLElement | null
  if (!content) {
    return {
      x: 0,
      y: 0,
      width: wrapperRect.width,
      height: wrapperRect.height,
    }
  }

  const contentRect = content.getBoundingClientRect()
  return {
    x: contentRect.left - wrapperRect.left,
    y: contentRect.top - wrapperRect.top,
    width: contentRect.width,
    height: contentRect.height,
  }
}

function getLayoutOrigin(wrapper: HTMLElement): PointLike {
  const content = wrapper.firstElementChild as HTMLElement | null
  if (!content) {
    return { x: 0, y: 0 }
  }

  return {
    x: content.offsetLeft,
    y: content.offsetTop,
  }
}

function createFrameFromScaleAndCenter(
  scale: number,
  centerX: number,
  centerY: number,
  contentRect: RectLike,
  layoutOrigin: PointLike,
  containerRect: DOMRect,
): ZoomFrame {
  const baseFocusCenterX =
    (contentRect.x - layoutOrigin.x) + contentRect.width * centerX
  const baseFocusCenterY =
    (contentRect.y - layoutOrigin.y) + contentRect.height * centerY

  return {
    scale,
    translateX:
      containerRect.width / 2 - layoutOrigin.x - scale * baseFocusCenterX,
    translateY:
      containerRect.height / 2 - layoutOrigin.y - scale * baseFocusCenterY,
  }
}

function getAspectLockedQuadFrame(
  config: ZoomTransitionConfig,
  contentRect: RectLike,
  layoutOrigin: PointLike,
  containerRect: DOMRect,
): ZoomFrame {
  const quad = config.focusQuad
  if (!quad) {
    return createFrameFromScaleAndCenter(
      Math.max(config.scale ?? 1.5, 1),
      clamp01(config.centerX ?? 0.5),
      clamp01(config.centerY ?? 0.5),
      contentRect,
      layoutOrigin,
      containerRect,
    )
  }

  const left = clamp01(Math.min(quad.topLeft.x, quad.topRight.x))
  const right = clamp01(Math.max(quad.topLeft.x, quad.topRight.x))
  const top = clamp01((quad.topLeft.y + quad.topRight.y) / 2)
  const widthNorm = Math.max(0.0001, right - left)
  const widthPx = contentRect.width * widthNorm
  const containerAspect = containerRect.width / Math.max(containerRect.height, 0.0001)
  const heightPx = widthPx / Math.max(containerAspect, 0.0001)
  const heightNorm = heightPx / Math.max(contentRect.height, 0.0001)
  const clampedTop = clamp01(Math.min(top, 1 - heightNorm))
  const centerX = left + widthNorm / 2
  const centerY = clampedTop + heightNorm / 2
  const scale = containerRect.width / Math.max(widthPx, 0.0001)

  return createFrameFromScaleAndCenter(
    scale,
    centerX,
    centerY,
    contentRect,
    layoutOrigin,
    containerRect,
  )
}

function getFocusFrame(
  config: ZoomTransitionConfig,
  wrapper: HTMLElement,
  container: HTMLElement,
  hotspot: TransitionContext['hotspot'],
): ZoomFrame {
  const containerRect = container.getBoundingClientRect()
  const contentRect = getContentRect(wrapper)
  const layoutOrigin = getLayoutOrigin(wrapper)

  if (config.focusMode === 'quad' && config.focusQuad) {
    return getAspectLockedQuadFrame(config, contentRect, layoutOrigin, containerRect)
  }

  return createFrameFromScaleAndCenter(
    Math.max(config.scale ?? 1.5, 1),
    clamp01(config.centerX ?? hotspot.x),
    clamp01(config.centerY ?? hotspot.y),
    contentRect,
    layoutOrigin,
    containerRect,
  )
}

function interpolateFrame(from: ZoomFrame, to: ZoomFrame, progress: number): ZoomFrame {
  return {
    scale: lerp(from.scale, to.scale, progress),
    translateX: lerp(from.translateX, to.translateX, progress),
    translateY: lerp(from.translateY, to.translateY, progress),
  }
}

function normalizeTransform(value: string): string {
  const trimmed = value.trim()
  return trimmed && trimmed !== 'none' ? trimmed : ''
}

export class ZoomRenderer implements TransitionRenderer {
  readonly transitionType = 'zoom' as const

  private containerEl: HTMLElement | null = null
  private fromEl: HTMLElement | null = null
  private toEl: HTMLElement | null = null
  private fromContentEl: HTMLElement | null = null
  private toContentEl: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null
  private config: ZoomTransitionConfig | null = null
  private focusFrame: ZoomFrame = IDENTITY_FRAME
  private fromBaseTransform = ''
  private toBaseTransform = ''

  private getContentElement(viewport: HTMLElement): HTMLElement {
    return (viewport.firstElementChild as HTMLElement | null) ?? viewport
  }

  private applyCameraTransform(
    contentEl: HTMLElement | null,
    baseTransform: string,
    frame: ZoomFrame,
  ): void {
    if (!contentEl) return
    const prefix = `translate(${frame.translateX}px, ${frame.translateY}px) scale(${frame.scale})`
    contentEl.style.transformOrigin = '0 0'
    contentEl.style.transform = baseTransform
      ? `${prefix} ${baseTransform}`
      : prefix
  }

  renderSetup(context: TransitionContext): void {
    this.config = context.config as ZoomTransitionConfig

    if (!document.getElementById('transition-zoom-styles')) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'transition-zoom-styles'
      this.styleEl.textContent = ZOOM_CSS
      document.head.appendChild(this.styleEl)
    }

    this.containerEl = document.createElement('div')
    this.containerEl.className = 'transition-zoom-container'

    this.fromEl = context.fromNodeEl
    this.fromEl.className = 'transition-zoom-from'
    this.fromEl.style.position = 'absolute'
    this.fromEl.style.inset = '0'
    this.fromEl.style.width = '100%'
    this.fromEl.style.height = '100%'
    this.fromEl.style.display = 'block'
    this.fromEl.style.overflow = 'hidden'
    this.fromEl.style.transition = 'none'

    this.toEl = context.toNodeEl
    this.toEl.className = 'transition-zoom-to'
    this.toEl.style.position = 'absolute'
    this.toEl.style.inset = '0'
    this.toEl.style.width = '100%'
    this.toEl.style.height = '100%'
    this.toEl.style.display = 'block'
    this.toEl.style.overflow = 'hidden'
    this.toEl.style.transition = 'none'

    this.containerEl.appendChild(this.fromEl)
    this.containerEl.appendChild(this.toEl)
    context.container.appendChild(this.containerEl)

    this.fromContentEl = this.getContentElement(this.fromEl)
    this.toContentEl = this.getContentElement(this.toEl)
    this.fromBaseTransform = normalizeTransform(this.fromContentEl.style.transform || '')
    this.toBaseTransform = normalizeTransform(this.toContentEl.style.transform || '')

    this.focusFrame = getFocusFrame(
      this.config,
      this.config.direction === 'out' ? this.toEl : this.fromEl,
      this.containerEl,
      context.hotspot,
    )

    this.applyCameraTransform(this.fromContentEl, this.fromBaseTransform, IDENTITY_FRAME)
    this.applyCameraTransform(
      this.toContentEl,
      this.toBaseTransform,
      this.config.direction === 'out' ? this.focusFrame : IDENTITY_FRAME,
    )
    this.fromEl.style.opacity = '1'
    this.toEl.style.opacity = this.config.direction === 'out' ? '1' : '0'
  }

  applyAnimation(progress: number): void {
    if (!this.fromEl || !this.toEl || !this.config) return

    if (this.config.direction === 'in') {
      this.applyCameraTransform(
        this.fromContentEl,
        this.fromBaseTransform,
        interpolateFrame(IDENTITY_FRAME, this.focusFrame, progress),
      )
      this.fromEl.style.opacity = '1'
      this.toEl.style.opacity = '0'
      this.applyCameraTransform(this.toContentEl, this.toBaseTransform, IDENTITY_FRAME)
    } else {
      this.fromEl.style.opacity = '0'
      this.toEl.style.opacity = '1'
      this.applyCameraTransform(
        this.toContentEl,
        this.toBaseTransform,
        interpolateFrame(this.focusFrame, IDENTITY_FRAME, progress),
      )
    }
  }

  renderCleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl)
    }
    this.containerEl = null
    this.fromEl = null
    this.toEl = null
    this.fromContentEl = null
    this.toContentEl = null
    this.config = null
    this.focusFrame = IDENTITY_FRAME
    this.fromBaseTransform = ''
    this.toBaseTransform = ''
    this.styleEl = null
  }
}
