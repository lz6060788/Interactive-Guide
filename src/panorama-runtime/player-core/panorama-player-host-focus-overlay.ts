import type { PanoramaHtmlProduct, PanoramaItem, PanoramaRuntimeState } from '../../shared/panorama-types.js'
import type { ProjectedFocusRect } from './panorama-player-host-utils.js'
import { easeOutCubic, interpolateProjectedFocusRect, isProjectedFocusRectEqual, clampSceneOffset } from './panorama-player-host-utils.js'
import type { PanoramaListItemRefs } from './panorama-player-host-list.js'

export interface SceneGeometry {
  viewportLeft: number
  viewportTop: number
  viewportSize: number
  left: number
  top: number
  width: number
  height: number
}

export interface FocusOverlayRendererEnv {
  readonly viewportEl: HTMLDivElement
  readonly overlayCanvasEl: HTMLCanvasElement
  readonly overlayContext: CanvasRenderingContext2D | null
  readonly blurMaskSvgEl: SVGSVGElement
  readonly blurMaskBackgroundEl: SVGRectElement
  readonly blurMaskHoleEl: SVGRectElement
  readonly blurViewportEl: HTMLDivElement
  readonly sceneLayerEl: HTMLDivElement
  readonly blurSceneLayerEl: HTMLDivElement
  readonly markerLayerEl: HTMLDivElement

  get backgroundImageAspectRatio(): number
  set backgroundImageAspectRatio(v: number)
  get backgroundImageUrl(): string | null
  set backgroundImageUrl(v: string | null)
  get displayedFocusRect(): ProjectedFocusRect | null
  set displayedFocusRect(v: ProjectedFocusRect | null)
  get focusAnimationFrame(): number | null
  set focusAnimationFrame(v: number | null)
  get lastSceneSignature(): string | null
  set lastSceneSignature(v: string | null)

  readonly prefersSimpleFocusOverlay: boolean
  readonly product: PanoramaHtmlProduct | null
  readonly state: PanoramaRuntimeState | null
  readonly activeItemId: string | null
  readonly itemElements: Map<string, PanoramaListItemRefs>

  render: () => void
}

export class FocusOverlayRenderer {
  constructor(private env: FocusOverlayRendererEnv) {}

  projectFocusRect(item: PanoramaItem, sceneGeometry: SceneGeometry): ProjectedFocusRect {
    return {
      x: sceneGeometry.left + item.focusRect.x * sceneGeometry.width,
      y: sceneGeometry.top + item.focusRect.y * sceneGeometry.height,
      width: item.focusRect.width * sceneGeometry.width,
      height: item.focusRect.height * sceneGeometry.height,
      radius: item.focusRect.radius ?? 10,
      maskOpacity: 0.5,
    }
  }

  computeSceneGeometry(zoom: number): SceneGeometry {
    const viewportWidth = Math.max(this.env.viewportEl.clientWidth, 1)
    const viewportHeight = Math.max(this.env.viewportEl.clientHeight, 1)
    const imageAspectRatio = Math.max(this.env.backgroundImageAspectRatio, 0.01)
    const viewportSize = Math.min(viewportWidth, viewportHeight)
    const viewportLeft = (viewportWidth - viewportSize) / 2
    const viewportTop = (viewportHeight - viewportSize) / 2

    const baseHeight = viewportSize
    const baseWidth = viewportSize * imageAspectRatio

    const sceneWidth = baseWidth * zoom
    const sceneHeight = baseHeight * zoom
    const activeViewport = this.env.state?.activeViewport ?? { centerX: 0.5, centerY: 0.5, zoom: 1 }
    const unclampedLeft = viewportLeft + viewportSize / 2 - activeViewport.centerX * sceneWidth
    const unclampedTop = viewportTop + viewportSize / 2 - activeViewport.centerY * sceneHeight

    return {
      viewportLeft,
      viewportTop,
      viewportSize,
      left: clampSceneOffset(unclampedLeft, viewportLeft, viewportSize, sceneWidth),
      top: clampSceneOffset(unclampedTop, viewportTop, viewportSize, sceneHeight),
      width: sceneWidth,
      height: sceneHeight,
    }
  }

  ensureBackgroundImageAspectRatio(backgroundImageUrl: string): void {
    if (!backgroundImageUrl) {
      this.env.backgroundImageUrl = null
      this.env.backgroundImageAspectRatio = 1
      return
    }

    if (this.env.backgroundImageUrl === backgroundImageUrl) return

    this.env.backgroundImageUrl = backgroundImageUrl
    this.env.backgroundImageAspectRatio = 1

    const image = new Image()
    image.onload = () => {
      if (this.env.backgroundImageUrl !== backgroundImageUrl) return
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return
      this.env.backgroundImageAspectRatio = image.naturalWidth / image.naturalHeight
      this.env.lastSceneSignature = null
      if (this.env.product && this.env.state) {
        this.env.render()
      }
    }
    image.src = backgroundImageUrl
  }

  animateFocusRect(nextRect: ProjectedFocusRect): void {
    if (!this.syncOverlayCanvasSize() || !this.env.overlayContext) return

    if (!this.env.displayedFocusRect) {
      this.env.displayedFocusRect = nextRect
      this.updateBlurMask(nextRect)
      this.drawFocusOverlay(nextRect)
      return
    }

    if (isProjectedFocusRectEqual(this.env.displayedFocusRect, nextRect)) {
      this.env.displayedFocusRect = nextRect
      this.updateBlurMask(nextRect)
      this.drawFocusOverlay(nextRect)
      return
    }

    if (this.env.focusAnimationFrame !== null) {
      window.cancelAnimationFrame(this.env.focusAnimationFrame)
      this.env.focusAnimationFrame = null
    }

    const fromRect = { ...this.env.displayedFocusRect }
    const startTime = performance.now()
    const duration = 520

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = easeOutCubic(progress)
      const current = interpolateProjectedFocusRect(fromRect, nextRect, eased)

      this.env.displayedFocusRect = current
      this.updateBlurMask(current)
      this.drawFocusOverlay(current)

      if (progress < 1) {
        this.env.focusAnimationFrame = window.requestAnimationFrame(tick)
      } else {
        this.env.focusAnimationFrame = null
        this.env.displayedFocusRect = nextRect
        this.updateBlurMask(nextRect)
        this.drawFocusOverlay(nextRect)
      }
    }

    this.env.focusAnimationFrame = window.requestAnimationFrame(tick)
  }

  syncOverlayCanvasSize(): boolean {
    const width = Math.max(Math.round(this.env.viewportEl.clientWidth), 0)
    const height = Math.max(Math.round(this.env.viewportEl.clientHeight), 0)
    if (width === 0 || height === 0) return false

    const dpr = window.devicePixelRatio || 1
    const canvasWidth = Math.round(width * dpr)
    const canvasHeight = Math.round(height * dpr)

    if (this.env.overlayCanvasEl.width !== canvasWidth || this.env.overlayCanvasEl.height !== canvasHeight) {
      this.env.overlayCanvasEl.width = canvasWidth
      this.env.overlayCanvasEl.height = canvasHeight
      this.env.overlayCanvasEl.style.width = `${width}px`
      this.env.overlayCanvasEl.style.height = `${height}px`
    }

    this.env.overlayContext?.setTransform(dpr, 0, 0, dpr, 0, 0)
    return true
  }

  syncBlurMaskSize(): void {
    const width = Math.max(Math.round(this.env.viewportEl.clientWidth), 0)
    const height = Math.max(Math.round(this.env.viewportEl.clientHeight), 0)
    this.env.blurMaskSvgEl.setAttribute('width', `${width}`)
    this.env.blurMaskSvgEl.setAttribute('height', `${height}`)
    this.env.blurMaskSvgEl.setAttribute('viewBox', `0 0 ${width} ${height}`)
    this.env.blurMaskBackgroundEl.setAttribute('x', '0')
    this.env.blurMaskBackgroundEl.setAttribute('y', '0')
    this.env.blurMaskBackgroundEl.setAttribute('width', `${width}`)
    this.env.blurMaskBackgroundEl.setAttribute('height', `${height}`)
  }

  updateBlurMask(rect: ProjectedFocusRect): void {
    this.syncBlurMaskSize()
    this.env.blurMaskHoleEl.setAttribute('x', `${rect.x}`)
    this.env.blurMaskHoleEl.setAttribute('y', `${rect.y}`)
    this.env.blurMaskHoleEl.setAttribute('width', `${Math.max(rect.width, 0)}`)
    this.env.blurMaskHoleEl.setAttribute('height', `${Math.max(rect.height, 0)}`)
    this.env.blurMaskHoleEl.setAttribute('rx', `${Math.max(rect.radius, 0)}`)
    this.env.blurMaskHoleEl.setAttribute('ry', `${Math.max(rect.radius, 0)}`)
  }

  clearBlurMask(): void {
    this.syncBlurMaskSize()
    this.env.blurMaskHoleEl.setAttribute('x', '0')
    this.env.blurMaskHoleEl.setAttribute('y', '0')
    this.env.blurMaskHoleEl.setAttribute('width', '0')
    this.env.blurMaskHoleEl.setAttribute('height', '0')
    this.env.blurMaskHoleEl.setAttribute('rx', '0')
    this.env.blurMaskHoleEl.setAttribute('ry', '0')
  }

  drawFocusOverlay(rect: ProjectedFocusRect): void {
    const context = this.env.overlayContext
    if (!context || !this.syncOverlayCanvasSize()) return

    const width = this.env.viewportEl.clientWidth
    const height = this.env.viewportEl.clientHeight
    context.clearRect(0, 0, width, height)

    context.save()
    context.fillStyle = `rgba(0, 0, 0, ${rect.maskOpacity})`
    context.beginPath()
    context.rect(0, 0, width, height)
    this.appendRoundedRectPath(context, rect)
    context.fill('evenodd')
    context.restore()

    const connector = this.resolveConnectorLine(rect)
    if (!connector) return

    context.save()
    context.beginPath()
    context.setLineDash([4, 4])
    context.lineWidth = 1.25
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    context.lineCap = 'round'
    context.moveTo(connector.startX, connector.startY)
    context.lineTo(connector.endX, connector.endY)
    context.stroke()
    context.restore()
  }

  clearFocusOverlay(): void {
    if (!this.env.overlayContext || !this.syncOverlayCanvasSize()) return
    this.env.overlayContext.clearRect(0, 0, this.env.viewportEl.clientWidth, this.env.viewportEl.clientHeight)
  }

  resetFocusOverlayState(): void {
    if (this.env.focusAnimationFrame !== null) {
      window.cancelAnimationFrame(this.env.focusAnimationFrame)
      this.env.focusAnimationFrame = null
    }
    this.env.displayedFocusRect = null
    this.clearBlurMask()
    this.clearFocusOverlay()
  }

  private appendRoundedRectPath(context: CanvasRenderingContext2D, rect: ProjectedFocusRect): void {
    const radius = Math.max(Math.min(rect.radius, rect.width / 2, rect.height / 2), 0)
    context.moveTo(rect.x + radius, rect.y)
    context.lineTo(rect.x + rect.width - radius, rect.y)
    context.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + radius)
    context.lineTo(rect.x + rect.width, rect.y + rect.height - radius)
    context.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - radius, rect.y + rect.height)
    context.lineTo(rect.x + radius, rect.y + rect.height)
    context.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - radius)
    context.lineTo(rect.x, rect.y + radius)
    context.quadraticCurveTo(rect.x, rect.y, rect.x + radius, rect.y)
  }

  private resolveConnectorLine(rect: ProjectedFocusRect): {
    startX: number
    startY: number
    endX: number
    endY: number
  } | null {
    if (!this.env.activeItemId) return null
    const itemRefs = this.env.itemElements.get(this.env.activeItemId)
    if (!itemRefs) return null

    const viewportBounds = this.env.viewportEl.getBoundingClientRect()
    const dividerBounds = itemRefs.dividerEl.getBoundingClientRect()
    if (dividerBounds.width <= 0 && dividerBounds.height <= 0) return null

    const radius = Math.max(Math.min(rect.radius, rect.width / 2, rect.height / 2), 0)
    const connectorPadding = 1.5
    const cornerRatio = Math.SQRT1_2
    const cornerBaseX = radius > 0
      ? rect.x + rect.width - radius + radius * cornerRatio
      : rect.x + rect.width
    const cornerBaseY = radius > 0
      ? rect.y + radius - radius * cornerRatio
      : rect.y

    const startX = cornerBaseX + connectorPadding
    const startY = cornerBaseY - connectorPadding
    const endX = dividerBounds.left - viewportBounds.left - 2
    const endY = dividerBounds.top - viewportBounds.top + dividerBounds.height / 2

    return {
      startX,
      startY,
      endX,
      endY,
    }
  }
}
