import type {
  PanoramaGroup,
  PanoramaHtmlProduct,
  PanoramaItem,
  PanoramaRuntimeState,
  PanoramaSection,
} from '../../shared/panorama-types.js'
import { buildPanoramaRenderModel } from '../panorama-renderer.js'
import {
  resolveInitialPanoramaRuntimeState,
  transitionToGroup,
  transitionToItem,
  transitionToSection,
} from '../panorama-state-machine.js'

export interface PanoramaPlayerHostRefs {
  container: HTMLElement
}

export interface PanoramaPlayerHostOptions {
  onStateChange?: (state: PanoramaRuntimeState) => void
}

type InteractionMode = PanoramaRuntimeState['interactionMode']

interface ProjectedFocusRect {
  x: number
  y: number
  width: number
  height: number
  radius: number
  maskOpacity: number
}

interface PanoramaListItemRefs {
  cardEl: HTMLDivElement
  dividerEl: HTMLDivElement
  titleEl: HTMLDivElement
}

interface SceneGeometry {
  viewportLeft: number
  viewportTop: number
  viewportSize: number
  left: number
  top: number
  width: number
  height: number
}

export class PanoramaPlayerHost {
  private product: PanoramaHtmlProduct | null = null
  private state: PanoramaRuntimeState | null = null
  private readonly shadowRoot: ShadowRoot
  private readonly rootEl: HTMLDivElement
  private readonly viewportEl: HTMLDivElement
  private readonly sceneLayerEl: HTMLDivElement
  private readonly blurViewportEl: HTMLDivElement
  private readonly blurSceneLayerEl: HTMLDivElement
  private readonly markerLayerEl: HTMLDivElement
  private readonly sectionTabsEl: HTMLDivElement
  private readonly groupTabsEl: HTMLDivElement
  private readonly listEl: HTMLDivElement
  private readonly hintFadeEl: HTMLDivElement
  private readonly hintTextEl: HTMLDivElement
  private readonly overlayLayerEl: HTMLDivElement
  private readonly overlayCanvasEl: HTMLCanvasElement
  private readonly overlayContext: CanvasRenderingContext2D | null
  private readonly blurMaskSvgEl: SVGSVGElement
  private readonly blurMaskBackgroundEl: SVGRectElement
  private readonly blurMaskHoleEl: SVGRectElement
  private readonly blurMaskId: string
  private readonly itemElements = new Map<string, PanoramaListItemRefs>()
  private readonly markerElements = new Map<string, HTMLButtonElement>()
  private currentMarkerGroupId: string | null = null
  private readonly resizeObserver: ResizeObserver | null
  private focusAnimationFrame: number | null = null
  private displayedFocusRect: ProjectedFocusRect | null = null
  private lastSceneSignature: string | null = null
  private backgroundImageUrl: string | null = null
  private backgroundImageAspectRatio = 1
  private activeItemId: string | null = null
  private scrollSyncLocked = false
  private scrollSyncTimer: number | null = null

  constructor(
    private readonly refs: PanoramaPlayerHostRefs,
    private readonly options: PanoramaPlayerHostOptions = {},
  ) {
    this.shadowRoot = refs.container.shadowRoot ?? refs.container.attachShadow({ mode: 'open' })
    this.shadowRoot.replaceChildren()

    const styleEl = document.createElement('style')
    styleEl.textContent = hostStyles

    this.rootEl = document.createElement('div')
    this.rootEl.className = 'panorama-host'

    this.viewportEl = document.createElement('div')
    this.viewportEl.className = 'panorama-viewport'

    this.sceneLayerEl = document.createElement('div')
    this.sceneLayerEl.className = 'panorama-scene-layer'

    this.blurViewportEl = document.createElement('div')
    this.blurViewportEl.className = 'panorama-blur-viewport'

    this.blurSceneLayerEl = document.createElement('div')
    this.blurSceneLayerEl.className = 'panorama-blur-scene-layer'
    this.blurViewportEl.appendChild(this.blurSceneLayerEl)

    this.markerLayerEl = document.createElement('div')
    this.markerLayerEl.className = 'panorama-marker-layer'

    this.overlayLayerEl = document.createElement('div')
    this.overlayLayerEl.className = 'panorama-overlay-layer'

    this.overlayCanvasEl = document.createElement('canvas')
    this.overlayCanvasEl.className = 'panorama-overlay-canvas'
    this.overlayContext = this.overlayCanvasEl.getContext('2d')

    const svgNamespace = 'http://www.w3.org/2000/svg'
    this.blurMaskId = `panorama-blur-mask-${Math.random().toString(36).slice(2)}`
    this.blurMaskSvgEl = document.createElementNS(svgNamespace, 'svg')
    this.blurMaskSvgEl.setAttribute('class', 'panorama-blur-mask-defs')
    this.blurMaskSvgEl.setAttribute('aria-hidden', 'true')
    this.blurMaskSvgEl.setAttribute('focusable', 'false')

    const defsEl = document.createElementNS(svgNamespace, 'defs')
    const maskEl = document.createElementNS(svgNamespace, 'mask')
    maskEl.setAttribute('id', this.blurMaskId)
    maskEl.setAttribute('maskUnits', 'userSpaceOnUse')
    maskEl.setAttribute('maskContentUnits', 'userSpaceOnUse')

    this.blurMaskBackgroundEl = document.createElementNS(svgNamespace, 'rect')
    this.blurMaskBackgroundEl.setAttribute('fill', 'white')

    this.blurMaskHoleEl = document.createElementNS(svgNamespace, 'rect')
    this.blurMaskHoleEl.setAttribute('fill', 'black')

    maskEl.append(this.blurMaskBackgroundEl, this.blurMaskHoleEl)
    defsEl.appendChild(maskEl)
    this.blurMaskSvgEl.appendChild(defsEl)

    this.sectionTabsEl = document.createElement('div')
    this.sectionTabsEl.className = 'panorama-section-tabs'

    this.groupTabsEl = document.createElement('div')
    this.groupTabsEl.className = 'panorama-group-tabs'

    this.listEl = document.createElement('div')
    this.listEl.className = 'panorama-list'
    this.listEl.addEventListener('scroll', this.handleListScroll, { passive: true })

    this.hintFadeEl = document.createElement('div')
    this.hintFadeEl.className = 'panorama-hint-fade'

    this.hintTextEl = document.createElement('div')
    this.hintTextEl.className = 'panorama-hint-text'

    this.overlayLayerEl.appendChild(this.overlayCanvasEl)

    this.viewportEl.append(
      this.sceneLayerEl,
      this.blurViewportEl,
      this.markerLayerEl,
      this.overlayLayerEl,
      this.sectionTabsEl,
      this.groupTabsEl,
      this.listEl,
      this.hintFadeEl,
      this.hintTextEl,
    )
    this.rootEl.appendChild(this.viewportEl)
    this.shadowRoot.append(styleEl, this.blurMaskSvgEl, this.rootEl)

    this.blurViewportEl.style.mask = `url(#${this.blurMaskId})`
    this.blurViewportEl.style.webkitMask = `url(#${this.blurMaskId})`

    this.resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (this.product && this.state) {
            this.lastSceneSignature = null
            this.render()
            return
          }
          this.syncBlurMaskSize()
          this.syncOverlayCanvasSize()
          if (this.displayedFocusRect) {
            this.updateBlurMask(this.displayedFocusRect)
            this.drawFocusOverlay(this.displayedFocusRect)
          }
        })
      : null
    this.resizeObserver?.observe(this.viewportEl)
  }

  loadProduct(product: PanoramaHtmlProduct): void {
    this.product = product
    this.state = resolveInitialPanoramaRuntimeState(product)
    this.render()
    this.emitState()
  }

  getState(): PanoramaRuntimeState | null {
    return this.state
  }

  selectSection(section: PanoramaSection): void {
    if (!this.state) return
    const nextGroup = section.groups.find(entry => entry.id === section.defaultGroupId) ?? section.groups[0]
    const nextItem = nextGroup?.items.find(entry => entry.id === nextGroup.defaultItemId) ?? nextGroup?.items[0]
    this.lockScrollSync()
    this.state = transitionToSection(this.state, section)
    this.render()
    this.emitState()
    if (nextItem) {
      this.scrollItemIntoView(nextItem.id)
    }
  }

  selectGroup(section: PanoramaSection, group: PanoramaGroup): void {
    if (!this.state) return
    const nextItem = group.items.find(entry => entry.id === group.defaultItemId) ?? group.items[0]
    this.lockScrollSync()
    this.state = transitionToGroup(this.state, section, group)
    this.render()
    this.emitState()
    if (nextItem) {
      this.scrollItemIntoView(nextItem.id)
    }
  }

  selectItem(group: PanoramaGroup, item: PanoramaItem, mode: InteractionMode = 'hotspot-sync'): void {
    if (!this.state) return
    if (mode !== 'scroll-sync') {
      this.lockScrollSync()
    }
    this.state = transitionToItem(this.state, group, item, mode)
    this.render()
    this.emitState()
    if (mode !== 'scroll-sync') {
      this.scrollItemIntoView(item.id)
    }
  }

  destroy(): void {
    if (this.scrollSyncTimer !== null) {
      window.clearTimeout(this.scrollSyncTimer)
      this.scrollSyncTimer = null
    }
    if (this.focusAnimationFrame !== null) {
      window.cancelAnimationFrame(this.focusAnimationFrame)
      this.focusAnimationFrame = null
    }
    this.resizeObserver?.disconnect()
    this.listEl.removeEventListener('scroll', this.handleListScroll)
    this.itemElements.clear()
    this.markerElements.clear()
  }

  private render(): void {
    if (!this.product || !this.state) {
      this.sectionTabsEl.replaceChildren()
      this.groupTabsEl.replaceChildren()
      this.markerLayerEl.replaceChildren()
      this.listEl.replaceChildren()
      this.displayedFocusRect = null
      this.lastSceneSignature = null
      this.backgroundImageUrl = null
      this.backgroundImageAspectRatio = 1
      this.blurViewportEl.style.display = 'none'
      this.sceneLayerEl.style.backgroundImage = 'none'
      this.blurSceneLayerEl.style.backgroundImage = 'none'
      this.clearBlurMask()
      this.clearFocusOverlay()
      return
    }

    const model = buildPanoramaRenderModel(this.product, this.state)
    const { product, section, group, item, state } = model
    const zoom = Math.max(state.activeViewport.zoom, 0.1)
    const backgroundImageUrl = product.globalPanoramaAsset?.imageUrl ?? group.panoramaAsset.imageUrl ?? ''
    this.activeItemId = item.id

    this.renderSectionTabs(product.sections, section)
    this.renderGroupTabs(section, group)
    this.renderList(group, item)
    this.renderViewport(group, item, zoom, backgroundImageUrl)
    this.hintTextEl.textContent = product.hintText

    if (state.interactionMode !== 'scroll-sync') {
      this.scrollItemIntoView(item.id)
    }
  }

  private renderSectionTabs(sections: PanoramaSection[], activeSection: PanoramaSection): void {
    this.sectionTabsEl.replaceChildren(
      ...sections.map(section => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `panorama-section-button ${section.id === activeSection.id ? 'is-active' : ''}`
        button.textContent = section.label
        button.addEventListener('click', () => this.selectSection(section))
        return button
      }),
    )
  }

  private renderGroupTabs(section: PanoramaSection, activeGroup: PanoramaGroup): void {
    const nodes: HTMLElement[] = []

    section.groups.forEach((group, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `panorama-group-button ${group.id === activeGroup.id ? 'is-active' : ''}`
      button.textContent = group.title
      button.addEventListener('click', () => this.selectGroup(section, group))
      nodes.push(button)

      if (index < section.groups.length - 1) {
        const divider = document.createElement('span')
        divider.className = 'panorama-group-divider'
        nodes.push(divider)
      }
    })

    this.groupTabsEl.replaceChildren(...nodes)
  }

  private renderViewport(
    group: PanoramaGroup,
    item: PanoramaItem,
    zoom: number,
    backgroundImageUrl: string,
  ): void {
    this.ensureBackgroundImageAspectRatio(backgroundImageUrl)
    const sceneGeometry = this.computeSceneGeometry(zoom)
    const sceneSignature = [
      backgroundImageUrl,
      this.backgroundImageAspectRatio.toFixed(6),
      sceneGeometry.left.toFixed(2),
      sceneGeometry.top.toFixed(2),
      sceneGeometry.width.toFixed(2),
      sceneGeometry.height.toFixed(2),
      group.id,
    ].join('|')

    if (sceneSignature !== this.lastSceneSignature) {
      this.sceneLayerEl.style.left = `${sceneGeometry.left}px`
      this.sceneLayerEl.style.top = `${sceneGeometry.top}px`
      this.sceneLayerEl.style.width = `${sceneGeometry.width}px`
      this.sceneLayerEl.style.height = `${sceneGeometry.height}px`
      this.sceneLayerEl.style.backgroundImage = backgroundImageUrl ? `url("${backgroundImageUrl}")` : 'none'

      this.blurSceneLayerEl.style.left = `${sceneGeometry.left}px`
      this.blurSceneLayerEl.style.top = `${sceneGeometry.top}px`
      this.blurSceneLayerEl.style.width = `${sceneGeometry.width}px`
      this.blurSceneLayerEl.style.height = `${sceneGeometry.height}px`
      this.blurSceneLayerEl.style.backgroundImage = backgroundImageUrl ? `url("${backgroundImageUrl}")` : 'none'

      this.markerLayerEl.style.left = `${sceneGeometry.left}px`
      this.markerLayerEl.style.top = `${sceneGeometry.top}px`
      this.markerLayerEl.style.width = `${sceneGeometry.width}px`
      this.markerLayerEl.style.height = `${sceneGeometry.height}px`
      this.lastSceneSignature = sceneSignature
    }

    this.blurViewportEl.style.display = backgroundImageUrl ? 'block' : 'none'

    const projectedFocusRect = this.projectFocusRect(item, sceneGeometry)
    this.animateFocusRect(projectedFocusRect)

    this.renderMarkers(group, item)
  }

  private projectFocusRect(item: PanoramaItem, sceneGeometry: SceneGeometry): ProjectedFocusRect {
    return {
      x: sceneGeometry.left + item.focusRect.x * sceneGeometry.width,
      y: sceneGeometry.top + item.focusRect.y * sceneGeometry.height,
      width: item.focusRect.width * sceneGeometry.width,
      height: item.focusRect.height * sceneGeometry.height,
      radius: item.focusRect.radius ?? 10,
      maskOpacity: clamp(item.focusRect.maskOpacity ?? 0.6, 0.3, 0.88),
    }
  }

  private computeSceneGeometry(zoom: number): SceneGeometry {
    const viewportWidth = Math.max(this.viewportEl.clientWidth, 1)
    const viewportHeight = Math.max(this.viewportEl.clientHeight, 1)
    const imageAspectRatio = Math.max(this.backgroundImageAspectRatio, 0.01)
    const viewportSize = Math.min(viewportWidth, viewportHeight)
    const viewportLeft = (viewportWidth - viewportSize) / 2
    const viewportTop = (viewportHeight - viewportSize) / 2

    const baseHeight = viewportSize
    const baseWidth = viewportSize * imageAspectRatio

    const sceneWidth = baseWidth * zoom
    const sceneHeight = baseHeight * zoom
    const unclampedLeft = viewportLeft + viewportSize / 2 - this.state!.activeViewport.centerX * sceneWidth
    const unclampedTop = viewportTop + viewportSize / 2 - this.state!.activeViewport.centerY * sceneHeight

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

  private ensureBackgroundImageAspectRatio(backgroundImageUrl: string): void {
    if (!backgroundImageUrl) {
      this.backgroundImageUrl = null
      this.backgroundImageAspectRatio = 1
      return
    }

    if (this.backgroundImageUrl === backgroundImageUrl) return

    this.backgroundImageUrl = backgroundImageUrl
    this.backgroundImageAspectRatio = 1

    const image = new Image()
    image.onload = () => {
      if (this.backgroundImageUrl !== backgroundImageUrl) return
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return
      this.backgroundImageAspectRatio = image.naturalWidth / image.naturalHeight
      this.lastSceneSignature = null
      if (this.product && this.state) {
        this.render()
      }
    }
    image.src = backgroundImageUrl
  }

  private animateFocusRect(nextRect: ProjectedFocusRect): void {
    if (!this.syncOverlayCanvasSize() || !this.overlayContext) return

    if (!this.displayedFocusRect) {
      this.displayedFocusRect = nextRect
      this.updateBlurMask(nextRect)
      this.drawFocusOverlay(nextRect)
      return
    }

    if (isProjectedFocusRectEqual(this.displayedFocusRect, nextRect)) {
      this.displayedFocusRect = nextRect
      this.updateBlurMask(nextRect)
      this.drawFocusOverlay(nextRect)
      return
    }

    if (this.focusAnimationFrame !== null) {
      window.cancelAnimationFrame(this.focusAnimationFrame)
      this.focusAnimationFrame = null
    }

    const fromRect = { ...this.displayedFocusRect }
    const startTime = performance.now()
    const duration = 520

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = easeOutCubic(progress)
      const current = interpolateProjectedFocusRect(fromRect, nextRect, eased)

      this.displayedFocusRect = current
      this.updateBlurMask(current)
      this.drawFocusOverlay(current)

      if (progress < 1) {
        this.focusAnimationFrame = window.requestAnimationFrame(tick)
      } else {
        this.focusAnimationFrame = null
        this.displayedFocusRect = nextRect
        this.updateBlurMask(nextRect)
        this.drawFocusOverlay(nextRect)
      }
    }

    this.focusAnimationFrame = window.requestAnimationFrame(tick)
  }

  private syncOverlayCanvasSize(): boolean {
    const width = Math.max(Math.round(this.viewportEl.clientWidth), 0)
    const height = Math.max(Math.round(this.viewportEl.clientHeight), 0)
    if (width === 0 || height === 0) return false

    const dpr = window.devicePixelRatio || 1
    const canvasWidth = Math.round(width * dpr)
    const canvasHeight = Math.round(height * dpr)

    if (this.overlayCanvasEl.width !== canvasWidth || this.overlayCanvasEl.height !== canvasHeight) {
      this.overlayCanvasEl.width = canvasWidth
      this.overlayCanvasEl.height = canvasHeight
      this.overlayCanvasEl.style.width = `${width}px`
      this.overlayCanvasEl.style.height = `${height}px`
    }

    this.overlayContext?.setTransform(dpr, 0, 0, dpr, 0, 0)
    return true
  }

  private syncBlurMaskSize(): void {
    const width = Math.max(Math.round(this.viewportEl.clientWidth), 0)
    const height = Math.max(Math.round(this.viewportEl.clientHeight), 0)
    this.blurMaskSvgEl.setAttribute('width', `${width}`)
    this.blurMaskSvgEl.setAttribute('height', `${height}`)
    this.blurMaskSvgEl.setAttribute('viewBox', `0 0 ${width} ${height}`)
    this.blurMaskBackgroundEl.setAttribute('x', '0')
    this.blurMaskBackgroundEl.setAttribute('y', '0')
    this.blurMaskBackgroundEl.setAttribute('width', `${width}`)
    this.blurMaskBackgroundEl.setAttribute('height', `${height}`)
  }

  private updateBlurMask(rect: ProjectedFocusRect): void {
    this.syncBlurMaskSize()
    this.blurMaskHoleEl.setAttribute('x', `${rect.x}`)
    this.blurMaskHoleEl.setAttribute('y', `${rect.y}`)
    this.blurMaskHoleEl.setAttribute('width', `${Math.max(rect.width, 0)}`)
    this.blurMaskHoleEl.setAttribute('height', `${Math.max(rect.height, 0)}`)
    this.blurMaskHoleEl.setAttribute('rx', `${Math.max(rect.radius, 0)}`)
    this.blurMaskHoleEl.setAttribute('ry', `${Math.max(rect.radius, 0)}`)
  }

  private clearBlurMask(): void {
    this.syncBlurMaskSize()
    this.blurMaskHoleEl.setAttribute('x', '0')
    this.blurMaskHoleEl.setAttribute('y', '0')
    this.blurMaskHoleEl.setAttribute('width', '0')
    this.blurMaskHoleEl.setAttribute('height', '0')
    this.blurMaskHoleEl.setAttribute('rx', '0')
    this.blurMaskHoleEl.setAttribute('ry', '0')
  }

  private drawFocusOverlay(rect: ProjectedFocusRect): void {
    const context = this.overlayContext
    if (!context || !this.syncOverlayCanvasSize()) return

    const width = this.viewportEl.clientWidth
    const height = this.viewportEl.clientHeight
    context.clearRect(0, 0, width, height)

    context.save()
    context.fillStyle = `rgba(0, 0, 0, ${rect.maskOpacity})`
    context.fillRect(0, 0, width, height)
    context.globalCompositeOperation = 'destination-out'
    this.drawRoundedRectPath(context, rect)
    context.fill()
    context.restore()

    context.save()
    this.drawRoundedRectPath(context, rect)
    context.setLineDash([6, 4])
    context.lineWidth = 1
    context.strokeStyle = 'rgba(255, 255, 255, 0.92)'
    context.stroke()
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

  private clearFocusOverlay(): void {
    if (!this.overlayContext || !this.syncOverlayCanvasSize()) return
    this.overlayContext.clearRect(0, 0, this.viewportEl.clientWidth, this.viewportEl.clientHeight)
  }

  private drawRoundedRectPath(context: CanvasRenderingContext2D, rect: ProjectedFocusRect): void {
    const radius = Math.max(Math.min(rect.radius, rect.width / 2, rect.height / 2), 0)
    context.beginPath()
    context.moveTo(rect.x + radius, rect.y)
    context.lineTo(rect.x + rect.width - radius, rect.y)
    context.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + radius)
    context.lineTo(rect.x + rect.width, rect.y + rect.height - radius)
    context.quadraticCurveTo(rect.x + rect.width, rect.y + rect.height, rect.x + rect.width - radius, rect.y + rect.height)
    context.lineTo(rect.x + radius, rect.y + rect.height)
    context.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - radius)
    context.lineTo(rect.x, rect.y + radius)
    context.quadraticCurveTo(rect.x, rect.y, rect.x + radius, rect.y)
    context.closePath()
  }

  private resolveConnectorLine(rect: ProjectedFocusRect): {
    startX: number
    startY: number
    endX: number
    endY: number
  } | null {
    if (!this.activeItemId) return null
    const itemRefs = this.itemElements.get(this.activeItemId)
    if (!itemRefs) return null

    const viewportBounds = this.viewportEl.getBoundingClientRect()
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

  private renderMarkers(group: PanoramaGroup, activeItem: PanoramaItem): void {
    if (this.currentMarkerGroupId !== group.id) {
      this.markerElements.clear()
      const markerNodes = group.items.map(entry => {
        const markerEl = document.createElement('button')
        markerEl.type = 'button'
        markerEl.className = 'panorama-marker'
        markerEl.style.left = `calc(${entry.marker.x * 100}% - 10.5px)`
        markerEl.style.top = `calc(${entry.marker.y * 100}% - 10.5px)`

        const inner = document.createElement('span')
        inner.className = 'panorama-marker-dot'
        markerEl.appendChild(inner)
        markerEl.addEventListener('click', () => {
          const nextItem = group.items.find(item => item.id === entry.id)
          if (nextItem) {
            this.selectItem(group, nextItem)
          }
        })

        this.markerElements.set(entry.id, markerEl)
        return markerEl
      })

      this.markerLayerEl.replaceChildren(...markerNodes)
      this.currentMarkerGroupId = group.id
    }

    for (const entry of group.items) {
      const markerEl = this.markerElements.get(entry.id)
      if (!markerEl) continue
      markerEl.classList.toggle('is-active', entry.id === activeItem.id)
    }
  }

  private renderList(group: PanoramaGroup, activeItem: PanoramaItem): void {
    this.itemElements.clear()

    const itemCards = group.items.map(entry => {
      const cardEl = document.createElement('div')
      cardEl.className = `panorama-list-item ${entry.id === activeItem.id ? 'is-active' : ''}`
      cardEl.addEventListener('click', () => this.selectItem(group, entry))

      const dividerEl = document.createElement('div')
      dividerEl.className = 'panorama-list-divider'
      cardEl.appendChild(dividerEl)

      const titleEl = document.createElement('div')
      titleEl.className = 'panorama-list-title'
      titleEl.textContent = entry.title

      cardEl.appendChild(titleEl)

      if (entry.id === activeItem.id) {
        const bodyEl = document.createElement('div')
        bodyEl.className = 'panorama-list-body'
        bodyEl.textContent = entry.description || '暂无说明'
        cardEl.appendChild(bodyEl)
      }

      this.itemElements.set(entry.id, {
        cardEl,
        dividerEl,
        titleEl,
      })
      return cardEl
    })

    this.listEl.replaceChildren(...itemCards)
  }

  private scrollItemIntoView(itemId: string): void {
    window.requestAnimationFrame(() => {
      this.itemElements.get(itemId)?.cardEl.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
    })
  }

  private lockScrollSync(): void {
    this.scrollSyncLocked = true
    if (this.scrollSyncTimer !== null) {
      window.clearTimeout(this.scrollSyncTimer)
    }
    this.scrollSyncTimer = window.setTimeout(() => {
      this.scrollSyncLocked = false
      this.scrollSyncTimer = null
    }, 320)
  }

  private readonly handleListScroll = () => {
    if (this.scrollSyncLocked || !this.product || !this.state) return
    const model = buildPanoramaRenderModel(this.product, this.state)
    const containerRect = this.listEl.getBoundingClientRect()
    const containerCenter = containerRect.top + containerRect.height / 2

    let nextItem = model.item
    let closestDistance = Number.POSITIVE_INFINITY

    for (const entry of model.group.items) {
      const element = this.itemElements.get(entry.id)
      if (!element) continue
      const rect = element.cardEl.getBoundingClientRect()
      const center = rect.top + rect.height / 2
      const distance = Math.abs(center - containerCenter)
      if (distance < closestDistance) {
        closestDistance = distance
        nextItem = entry
      }
    }

    if (nextItem.id !== model.item.id) {
      this.selectItem(model.group, nextItem, 'scroll-sync')
    }
  }

  private emitState(): void {
    if (!this.state) return
    this.options.onStateChange?.(this.state)
  }
}

declare global {
  interface Window {
    PanoramaPlayerHost?: typeof PanoramaPlayerHost
  }
}

if (typeof window !== 'undefined') {
  window.PanoramaPlayerHost = PanoramaPlayerHost
}

const hostStyles = `
:host {
  color-scheme: dark;
}
* {
  box-sizing: border-box;
}
.panorama-host {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: #f8fafc;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
}
.panorama-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
  overflow: hidden;
  border-radius: 10px;
  background: #1d1d1d;
  border: 1px solid rgba(255,255,255,0.08);
}
.panorama-scene-layer {
  position: absolute;
  background-color: #111827;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  will-change: left, top, width, height;
  transition:
    left 520ms cubic-bezier(0.22, 1, 0.36, 1),
    top 520ms cubic-bezier(0.22, 1, 0.36, 1),
    width 520ms cubic-bezier(0.22, 1, 0.36, 1),
    height 520ms cubic-bezier(0.22, 1, 0.36, 1);
}
.panorama-blur-mask-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}
.panorama-blur-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}
.panorama-blur-scene-layer {
  position: absolute;
  background-color: transparent;
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  filter: blur(2px);
  opacity: 0.96;
  will-change: left, top, width, height;
  transition:
    left 520ms cubic-bezier(0.22, 1, 0.36, 1),
    top 520ms cubic-bezier(0.22, 1, 0.36, 1),
    width 520ms cubic-bezier(0.22, 1, 0.36, 1),
    height 520ms cubic-bezier(0.22, 1, 0.36, 1);
}
.panorama-marker-layer {
  position: absolute;
  background: transparent;
  will-change: left, top, width, height;
  transition:
    left 520ms cubic-bezier(0.22, 1, 0.36, 1),
    top 520ms cubic-bezier(0.22, 1, 0.36, 1),
    width 520ms cubic-bezier(0.22, 1, 0.36, 1),
    height 520ms cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 2;
}
.panorama-overlay-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.panorama-overlay-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.panorama-section-tabs {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 4;
  pointer-events: none;
}
.panorama-section-button,
.panorama-group-button,
.panorama-marker {
  appearance: none;
  border: none;
  font: inherit;
}
.panorama-section-button {
  flex: 1 1 0;
  min-width: 0;
  height: 30px;
  padding: 5px 8px;
  border-radius: 4px;
  background: rgba(245,245,245,0.12);
  color: rgba(255,255,255,0.84);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  cursor: pointer;
  pointer-events: auto;
  text-align: center;
  align-self: stretch;
}
.panorama-section-button.is-active {
  background: linear-gradient(0deg, rgba(146,146,146,0.1), rgba(146,146,146,0.1)), #ffffff;
  color: rgba(0,0,0,0.84);
  font-weight: 500;
}
.panorama-group-tabs {
  position: absolute;
  left: 16px;
  right: 16px;
  top: 58px;
  display: flex;
  align-items: center;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 4px;
  z-index: 4;
  scrollbar-width: none;
}
.panorama-group-tabs::-webkit-scrollbar {
  display: none;
}
.panorama-group-button {
  background: transparent;
  color: rgba(255,255,255,0.6);
  font-size: 14px;
  line-height: 18px;
  font-weight: 400;
  white-space: nowrap;
  cursor: pointer;
  text-shadow: 0 1px 2px rgba(0,0,0,0.4);
}
.panorama-group-button.is-active {
  color: #ffffff;
  font-weight: 500;
}
.panorama-group-divider {
  width: 1px;
  height: 12px;
  background: rgba(255,255,255,0.2);
  flex: 0 0 auto;
}
.panorama-list {
  position: absolute;
  right: 14px;
  top: 108px;
  bottom: 56px;
  width: 138px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 2px 0 0;
  z-index: 4;
  scrollbar-width: none;
}
.panorama-list::-webkit-scrollbar {
  display: none;
}
.panorama-list-item {
  cursor: pointer;
  padding-bottom: 10px;
  margin-bottom: 10px;
}
.panorama-list-title {
  margin-top: 10px;
  color: rgba(255,255,255,0.6);
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  text-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
.panorama-list-item.is-active .panorama-list-title {
  color: #ffffff;
  font-weight: 600;
  text-shadow: 0 1px 6px rgba(0,0,0,0.33);
}
.panorama-list-body {
  margin-top: 10px;
  color: #ffffff;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  text-shadow: 0 1px 6px rgba(0,0,0,0.4);
}
.panorama-list-divider {
  margin-top: 0;
  margin-bottom: 10px;
  width: 100%;
  height: 1px;
  background: rgba(255,255,255,0.84);
  opacity: 0.4;
}
.panorama-list-item.is-active .panorama-list-divider {
  opacity: 0.84;
}
.panorama-marker {
  position: absolute;
  width: 21px;
  height: 21px;
  border-radius: 999px;
  border: 0.5px solid rgba(255,255,255,0.96);
  background: rgba(255,255,255,0.1);
  cursor: pointer;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: left, top, background, border-color;
  transition:
    left 520ms cubic-bezier(0.22, 1, 0.36, 1),
    top 520ms cubic-bezier(0.22, 1, 0.36, 1),
    background 220ms ease,
    border-color 220ms ease,
    transform 220ms ease;
}
.panorama-marker-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #ffffff;
  transition:
    width 220ms ease,
    height 220ms ease,
    background 220ms ease,
    border 220ms ease;
}
.panorama-marker.is-active {
  border-color: #ff2436;
  background: rgba(255,36,54,0.1);
  transform: scale(1.04);
}
.panorama-marker.is-active .panorama-marker-dot {
  width: 11px;
  height: 11px;
  background: #ff2436;
  border: 1px solid #ffffff;
}
.panorama-hint-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 36px;
  background: linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%);
  z-index: 4;
}
.panorama-hint-text {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  color: rgba(255,255,255,0.6);
  font-size: 10px;
  line-height: 14px;
  font-weight: 400;
  text-align: center;
  z-index: 4;
  width: calc(100% - 32px);
  pointer-events: none;
}
@media (max-width: 980px) {
  .panorama-list {
    width: 124px;
    top: 104px;
  }
  .panorama-section-tabs {
    justify-content: flex-start;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .panorama-section-tabs::-webkit-scrollbar {
    display: none;
  }
}
`

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3)
}

function interpolateProjectedFocusRect(
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

function isProjectedFocusRectEqual(
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

function lerp(fromValue: number, toValue: number, progress: number): number {
  return fromValue + (toValue - fromValue) * progress
}

function clampSceneOffset(
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
