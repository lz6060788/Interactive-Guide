import type {
  PanoramaGroup,
  PanoramaHtmlGroup,
  PanoramaHtmlProduct,
  PanoramaItem,
  PanoramaRuntimeState,
  PanoramaSection,
} from '../../shared/panorama-types.js'
import { isPanoramaGroup } from '../../shared/panorama-types.js'
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

interface PanoramaListDragState {
  pointerId: number
  startY: number
  startScrollTop: number
  moved: boolean
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

const STANDALONE_PRODUCT_BASE_URL = 'http://o.thsi.cn/datav.narrative-vision/interactive-guide'

export class PanoramaPlayerHost {
  private static readonly LIST_SCROLL_SMOOTH_LOCK_MS = 720
  private product: PanoramaHtmlProduct | null = null
  private state: PanoramaRuntimeState | null = null
  private readonly shadowRoot: ShadowRoot
  private readonly rootEl: HTMLDivElement
  private readonly viewportEl: HTMLDivElement
  private readonly sceneLayerEl: HTMLDivElement
  private readonly htmlLayerEl: HTMLDivElement
  private readonly htmlFrameEl: HTMLIFrameElement
  private readonly htmlEmptyEl: HTMLDivElement
  private readonly blurViewportEl: HTMLDivElement
  private readonly blurSceneLayerEl: HTMLDivElement
  private readonly markerLayerEl: HTMLDivElement
  private readonly sectionTabsEl: HTMLDivElement
  private readonly groupTabsEl: HTMLDivElement
  private readonly listEl: HTMLDivElement
  private readonly hintFadeEl: HTMLDivElement
  private readonly hintTextEl: HTMLDivElement
  private readonly floatingActionButtonEl: HTMLButtonElement
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
  private currentListGroupId: string | null = null
  private readonly resizeObserver: ResizeObserver | null
  private focusAnimationFrame: number | null = null
  private displayedFocusRect: ProjectedFocusRect | null = null
  private lastSceneSignature: string | null = null
  private backgroundImageUrl: string | null = null
  private backgroundImageAspectRatio = 1
  private readonly prefersSimpleFocusOverlay = shouldUseAppleFocusOverlayFallback()
  private activeItemId: string | null = null
  private previewItemId: string | null = null
  private ignoreListClick = false
  private scrollSyncLocked = false
  private scrollSyncTimer: number | null = null
  private scrollSettleTimer: number | null = null
  private listDragState: PanoramaListDragState | null = null
  private listPressTarget: EventTarget | null = null

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

    this.htmlLayerEl = document.createElement('div')
    this.htmlLayerEl.className = 'panorama-html-layer'

    this.htmlFrameEl = document.createElement('iframe')
    this.htmlFrameEl.className = 'panorama-html-frame'
    this.htmlFrameEl.setAttribute('title', 'Panorama HTML View')
    this.htmlFrameEl.setAttribute('referrerpolicy', 'no-referrer')

    this.htmlEmptyEl = document.createElement('div')
    this.htmlEmptyEl.className = 'panorama-html-empty'
    this.htmlEmptyEl.textContent = '请先在编辑器中配置 HTML 入口 URL'

    this.htmlLayerEl.append(this.htmlFrameEl, this.htmlEmptyEl)

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
    this.listEl.addEventListener('click', this.handleListClick)
    this.listEl.addEventListener('pointerdown', this.handleListPointerDown)
    this.listEl.addEventListener('pointermove', this.handleListPointerMove)
    this.listEl.addEventListener('pointerup', this.handleListPointerUp)
    this.listEl.addEventListener('pointercancel', this.handleListPointerUp)

    this.hintFadeEl = document.createElement('div')
    this.hintFadeEl.className = 'panorama-hint-fade'

    this.hintTextEl = document.createElement('div')
    this.hintTextEl.className = 'panorama-hint-text'

    this.floatingActionButtonEl = document.createElement('button')
    this.floatingActionButtonEl.type = 'button'
    this.floatingActionButtonEl.className = 'panorama-floating-action'
    this.floatingActionButtonEl.setAttribute('aria-label', '打开独立产物')
    this.floatingActionButtonEl.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M1.40978e-05 4.7424L1.42797e-05 0.5824C1.42864e-05 0.427938 0.0613747 0.279802 0.170596 0.170581C0.279817 0.0613594 0.427952 -4.5649e-07 0.582415 -4.49738e-07L4.74241 -2.67898e-07C4.89688 -2.61147e-07 5.04501 0.0613597 5.15423 0.170581C5.26346 0.279802 5.32482 0.427938 5.32482 0.5824C5.32482 0.736862 5.26346 0.884998 5.15423 0.994219C5.04501 1.10344 4.89688 1.1648 4.74241 1.1648L1.16481 1.1648L1.16481 4.7424C1.16481 4.89686 1.10345 5.045 0.994234 5.15422C0.885012 5.26344 0.736876 5.3248 0.582414 5.3248C0.427952 5.3248 0.279816 5.26344 0.170596 5.15422C0.0613744 5.045 1.40911e-05 4.89686 1.40978e-05 4.7424ZM5.54642 10.2888C5.54642 10.1343 5.60777 9.9862 5.717 9.87698C5.82622 9.76776 5.97435 9.7064 6.12881 9.7064L9.70642 9.7064L9.70642 6.1288C9.70642 5.97434 9.76778 5.8262 9.877 5.71698C9.98622 5.60776 10.1344 5.5464 10.2888 5.5464C10.4433 5.5464 10.5914 5.60776 10.7006 5.71698C10.8099 5.8262 10.8712 5.97434 10.8712 6.1288L10.8712 10.2888C10.8712 10.4433 10.8099 10.5914 10.7006 10.7006C10.5914 10.8098 10.4433 10.8712 10.2888 10.8712L6.12881 10.8712C5.97435 10.8712 5.82622 10.8098 5.717 10.7006C5.60777 10.5914 5.54642 10.4433 5.54642 10.2888Z" fill="white"/>
      </svg>
    `
    this.floatingActionButtonEl.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.openStandaloneProduct()
    })

    this.overlayLayerEl.appendChild(this.overlayCanvasEl)

    this.viewportEl.append(
      this.sceneLayerEl,
      this.htmlLayerEl,
      this.blurViewportEl,
      this.overlayLayerEl,
      this.markerLayerEl,
      this.sectionTabsEl,
      this.groupTabsEl,
      this.listEl,
      this.hintFadeEl,
      this.hintTextEl,
      this.floatingActionButtonEl,
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
    const nextItem = nextGroup && isPanoramaGroup(nextGroup)
      ? nextGroup.items.find(entry => entry.id === nextGroup.defaultItemId) ?? nextGroup.items[0]
      : null
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
    const nextItem = isPanoramaGroup(group)
      ? group.items.find(entry => entry.id === group.defaultItemId) ?? group.items[0]
      : null
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
    if (!isPanoramaGroup(group)) return
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
    if (this.scrollSettleTimer !== null) {
      window.clearTimeout(this.scrollSettleTimer)
      this.scrollSettleTimer = null
    }
    if (this.focusAnimationFrame !== null) {
      window.cancelAnimationFrame(this.focusAnimationFrame)
      this.focusAnimationFrame = null
    }
    this.resizeObserver?.disconnect()
    this.listEl.removeEventListener('scroll', this.handleListScroll)
    this.listEl.removeEventListener('click', this.handleListClick)
    this.listEl.removeEventListener('pointerdown', this.handleListPointerDown)
    this.listEl.removeEventListener('pointermove', this.handleListPointerMove)
    this.listEl.removeEventListener('pointerup', this.handleListPointerUp)
    this.listEl.removeEventListener('pointercancel', this.handleListPointerUp)
    this.itemElements.clear()
    this.markerElements.clear()
  }

  private render(): void {
    if (!this.product || !this.state) {
      this.sectionTabsEl.replaceChildren()
      this.groupTabsEl.replaceChildren()
      this.markerLayerEl.replaceChildren()
      this.listEl.replaceChildren()
      this.previewItemId = null
      this.listDragState = null
      this.currentListGroupId = null
      this.lastSceneSignature = null
      this.backgroundImageUrl = null
      this.backgroundImageAspectRatio = 1
      this.htmlLayerEl.style.display = 'none'
      this.htmlFrameEl.removeAttribute('src')
      this.htmlFrameEl.srcdoc = ''
      this.blurViewportEl.style.display = 'none'
      this.sceneLayerEl.style.backgroundImage = 'none'
      this.blurSceneLayerEl.style.backgroundImage = 'none'
      this.resetFocusOverlayState()
      return
    }

    const model = buildPanoramaRenderModel(this.product, this.state)
    const { product, section, group, item, state } = model

    this.renderSectionTabs(product.sections, section)
    this.renderGroupTabs(section, group)
    this.hintTextEl.textContent = product.hintText

    if (!item) {
      this.activeItemId = null
      this.renderHtmlGroup(group)
      return
    }

    const zoom = Math.max(state.activeViewport?.zoom ?? 1, 0.1)
    const backgroundImageUrl = product.globalPanoramaAsset?.imageUrl ?? group.panoramaAsset.imageUrl ?? ''
    this.activeItemId = item.id
    this.renderList(group, item)
    this.renderViewport(group, item, zoom, backgroundImageUrl)

  }

  private renderHtmlGroup(group: PanoramaHtmlGroup): void {
    this.lastSceneSignature = null
    this.backgroundImageUrl = null
    this.backgroundImageAspectRatio = 1
    this.sceneLayerEl.style.display = 'none'
    this.blurViewportEl.style.display = 'none'
    this.markerLayerEl.replaceChildren()
    this.markerLayerEl.style.display = 'none'
    this.markerLayerEl.style.pointerEvents = 'none'
    this.listEl.replaceChildren()
    this.currentListGroupId = null
    this.listEl.style.display = 'none'
    this.hintFadeEl.style.display = 'none'
    this.resetFocusOverlayState()

    this.htmlLayerEl.style.display = 'block'
    const entryUrl = group.htmlAsset.entryUrl.trim()
    this.hintTextEl.style.display = entryUrl ? 'block' : 'none'
    this.htmlEmptyEl.style.display = entryUrl ? 'none' : 'flex'
    this.htmlFrameEl.style.display = entryUrl ? 'block' : 'none'

    if (!entryUrl) {
      this.htmlFrameEl.removeAttribute('src')
      this.htmlFrameEl.srcdoc = ''
      return
    }

    const nextSrc = entryUrl
    if (this.htmlFrameEl.getAttribute('src') !== nextSrc) {
      this.htmlFrameEl.onload = () => this.postHtmlActivation(group)
      this.htmlFrameEl.setAttribute('src', nextSrc)
      return
    }

    this.postHtmlActivation(group)
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
    group: Extract<PanoramaGroup, { renderMode?: 'panorama' }>,
    item: PanoramaItem,
    zoom: number,
    backgroundImageUrl: string,
  ): void {
    this.sceneLayerEl.style.display = 'block'
    this.htmlLayerEl.style.display = 'none'
    this.markerLayerEl.style.display = 'block'
    this.markerLayerEl.style.pointerEvents = 'auto'
    this.listEl.style.display = 'block'
    this.hintFadeEl.style.display = 'none'
    this.hintTextEl.style.display = 'block'
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

    this.blurViewportEl.style.display = backgroundImageUrl && !this.prefersSimpleFocusOverlay ? 'block' : 'none'

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
      maskOpacity: 0.5,
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
    const activeViewport = this.state?.activeViewport ?? { centerX: 0.5, centerY: 0.5, zoom: 1 }
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

  private clearFocusOverlay(): void {
    if (!this.overlayContext || !this.syncOverlayCanvasSize()) return
    this.overlayContext.clearRect(0, 0, this.viewportEl.clientWidth, this.viewportEl.clientHeight)
  }

  private resetFocusOverlayState(): void {
    if (this.focusAnimationFrame !== null) {
      window.cancelAnimationFrame(this.focusAnimationFrame)
      this.focusAnimationFrame = null
    }
    this.displayedFocusRect = null
    this.clearBlurMask()
    this.clearFocusOverlay()
  }

  private drawRoundedRectPath(context: CanvasRenderingContext2D, rect: ProjectedFocusRect): void {
    context.beginPath()
    this.appendRoundedRectPath(context, rect)
    context.closePath()
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

  private renderMarkers(group: Extract<PanoramaGroup, { renderMode?: 'panorama' }>, activeItem: PanoramaItem): void {
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

  private renderList(group: Extract<PanoramaGroup, { renderMode?: 'panorama' }>, activeItem: PanoramaItem): void {
    if (this.currentListGroupId !== group.id) {
      this.itemElements.clear()

      const itemCards = group.items.map(entry => {
        const cardEl = document.createElement('div')
        cardEl.className = `panorama-list-item ${entry.id === activeItem.id ? 'is-active' : ''}`
        cardEl.dataset.itemId = entry.id

        const dividerEl = document.createElement('div')
        dividerEl.className = 'panorama-list-divider'
        cardEl.appendChild(dividerEl)

        const titleEl = document.createElement('div')
        titleEl.className = 'panorama-list-title'
        titleEl.textContent = entry.title

        cardEl.appendChild(titleEl)

        const bodyEl = document.createElement('div')
        bodyEl.className = 'panorama-list-body'
        bodyEl.textContent = entry.description || '暂无说明'
        cardEl.appendChild(bodyEl)

        this.itemElements.set(entry.id, {
          cardEl,
          dividerEl,
          titleEl,
        })
        return cardEl
      })

      const topSpacerEl = document.createElement('div')
      topSpacerEl.className = 'panorama-list-edge-spacer panorama-list-edge-spacer-top'
      topSpacerEl.setAttribute('aria-hidden', 'true')

      const bottomSpacerEl = document.createElement('div')
      bottomSpacerEl.className = 'panorama-list-edge-spacer panorama-list-edge-spacer-bottom'
      bottomSpacerEl.setAttribute('aria-hidden', 'true')

      this.listEl.replaceChildren(topSpacerEl, ...itemCards, bottomSpacerEl)
      this.currentListGroupId = group.id
    }
    this.updateListEdgeSpacers()
    this.syncListSelectionClasses(activeItem.id)
  }

  private scrollItemIntoView(itemId: string): void {
    this.centerItemInList(itemId, 'smooth')
  }

  private lockScrollSync(duration = 320): void {
    this.scrollSyncLocked = true
    if (this.scrollSyncTimer !== null) {
      window.clearTimeout(this.scrollSyncTimer)
    }
    this.scrollSyncTimer = window.setTimeout(() => {
      this.scrollSyncLocked = false
      this.scrollSyncTimer = null
    }, duration)
  }

  private readonly handleListScroll = () => {
    if (this.displayedFocusRect) {
      this.drawFocusOverlay(this.displayedFocusRect)
    }
    if (this.scrollSyncLocked || !this.product || !this.state) return
    const model = buildPanoramaRenderModel(this.product, this.state)
    if (!model.item || !isPanoramaGroup(model.group)) return
    const nextItem = this.resolveNearestListItem(model.group)
    if (!nextItem) return

    this.setPreviewItem(nextItem.id)
    if (!this.listDragState?.moved) {
      this.scheduleListSettleCommit(nextItem.id)
    }
  }

  private readonly handleListPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    this.clearScrollSettleTimer()
    this.listPressTarget = event.target
    this.listDragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: this.listEl.scrollTop,
      moved: false,
    }
    this.listEl.classList.add('is-dragging')
    this.listEl.setPointerCapture(event.pointerId)
  }

  private readonly handleListPointerMove = (event: PointerEvent) => {
    if (!this.listDragState || this.listDragState.pointerId !== event.pointerId) return
    const deltaY = event.clientY - this.listDragState.startY
    if (Math.abs(deltaY) > 3) {
      this.listDragState.moved = true
      this.ignoreListClick = true
    }
    this.listEl.scrollTop = this.listDragState.startScrollTop - deltaY
    if (event.cancelable) {
      event.preventDefault()
    }
  }

  private readonly handleListPointerUp = (event: PointerEvent) => {
    if (!this.listDragState || this.listDragState.pointerId !== event.pointerId) return
    this.listEl.classList.remove('is-dragging')
    try {
      this.listEl.releasePointerCapture(event.pointerId)
    } catch {}

    if (this.listDragState.moved) {
      this.listDragState = null
      const model = this.product && this.state ? buildPanoramaRenderModel(this.product, this.state) : null
      const nextItem = model?.item && isPanoramaGroup(model.group)
        ? this.resolveNearestListItem(model.group)
        : null
      if (nextItem) {
        this.commitListSelection(nextItem.id)
      } else if (this.activeItemId) {
        this.commitListSelection(this.activeItemId)
      } else {
        this.setPreviewItem(null)
      }
      window.setTimeout(() => {
        this.ignoreListClick = false
        this.listPressTarget = null
      }, 0)
    } else {
      this.setPreviewItem(null)
      this.ignoreListClick = false
      this.listDragState = null
    }
  }

  private readonly handleListClick = (event: MouseEvent) => {
    if (this.ignoreListClick) {
      this.ignoreListClick = false
      this.listPressTarget = null
      return
    }
    if (!this.product || !this.state) {
      this.listPressTarget = null
      return
    }
    const fallbackTarget = event.target
    const target = this.listPressTarget instanceof Element
      ? this.listPressTarget
      : fallbackTarget instanceof Element
        ? fallbackTarget
        : fallbackTarget instanceof Node
          ? fallbackTarget.parentElement
          : null
    this.listPressTarget = null
    if (!(target instanceof Element)) return
    const cardEl = target.closest<HTMLDivElement>('.panorama-list-item')
    const itemId = cardEl?.dataset.itemId
    if (!itemId) return
    const model = buildPanoramaRenderModel(this.product, this.state)
    if (!model.item || !isPanoramaGroup(model.group)) return
    const nextItem = model.group.items.find(entry => entry.id === itemId)
    if (!nextItem) return
    this.selectItem(model.group, nextItem)
  }

  private clearScrollSettleTimer(): void {
    if (this.scrollSettleTimer !== null) {
      window.clearTimeout(this.scrollSettleTimer)
      this.scrollSettleTimer = null
    }
  }

  private scheduleListSettleCommit(itemId: string): void {
    this.clearScrollSettleTimer()
    this.scrollSettleTimer = window.setTimeout(() => {
      this.scrollSettleTimer = null
      if (this.listDragState?.moved) return
      this.commitListSelection(itemId)
    }, 140)
  }

  private commitListSelection(itemId: string): void {
    if (!this.product || !this.state) return
    const model = buildPanoramaRenderModel(this.product, this.state)
    if (!model.item || !isPanoramaGroup(model.group)) return
    const nextItem = model.group.items.find(entry => entry.id === itemId)
    if (!nextItem) return

    this.setPreviewItem(null)
    this.lockScrollSync()
    if (nextItem.id !== model.item.id) {
      this.selectItem(model.group, nextItem, 'scroll-sync')
      this.centerItemInList(nextItem.id, 'smooth')
    }
  }

  private setPreviewItem(itemId: string | null): void {
    this.previewItemId = itemId
    this.syncListSelectionClasses(this.activeItemId)
  }

  private syncListSelectionClasses(activeItemId: string | null): void {
    for (const [itemId, refs] of this.itemElements.entries()) {
      refs.cardEl.classList.toggle('is-active', itemId === activeItemId)
      refs.cardEl.classList.toggle('is-preview', itemId === this.previewItemId && itemId !== activeItemId)
    }
  }

  private updateListEdgeSpacers(): void {
    const topSpacerEl = this.listEl.querySelector<HTMLDivElement>('.panorama-list-edge-spacer-top')
    const bottomSpacerEl = this.listEl.querySelector<HTMLDivElement>('.panorama-list-edge-spacer-bottom')
    const itemCards = Array.from(this.itemElements.values())
    if (!topSpacerEl || !bottomSpacerEl || itemCards.length === 0) return

    const viewportHeight = this.listEl.clientHeight
    const firstHeight = itemCards[0].cardEl.getBoundingClientRect().height
    const lastHeight = itemCards[itemCards.length - 1].cardEl.getBoundingClientRect().height
    const topSpacerHeight = Math.max((viewportHeight - firstHeight) / 2, 0)
    const bottomSpacerHeight = Math.max((viewportHeight - lastHeight) / 2, 0)
    topSpacerEl.style.height = `${topSpacerHeight}px`
    bottomSpacerEl.style.height = `${bottomSpacerHeight}px`

  }

  private getItemCenterScrollTop(itemId: string): number {
    const refs = this.itemElements.get(itemId)
    if (!refs) return this.listEl.scrollTop

    const listRect = this.listEl.getBoundingClientRect()
    const itemRect = refs.cardEl.getBoundingClientRect()
    const deltaToCenter = itemRect.top + itemRect.height / 2 - (listRect.top + listRect.height / 2)
    const nextScrollTop = this.listEl.scrollTop + deltaToCenter
    const maxScrollTop = Math.max(this.listEl.scrollHeight - this.listEl.clientHeight, 0)
    const clampedScrollTop = clamp(nextScrollTop, 0, maxScrollTop)

    return clampedScrollTop
  }

  private centerItemInList(itemId: string, behavior: ScrollBehavior = 'smooth'): void {
    if (behavior === 'smooth') {
      this.lockScrollSync(PanoramaPlayerHost.LIST_SCROLL_SMOOTH_LOCK_MS)
    }
    window.requestAnimationFrame(() => {
      const nextScrollTop = this.getItemCenterScrollTop(itemId)
      this.listEl.scrollTo({ top: nextScrollTop, behavior })
    })
  }

  private resolveNearestListItem(group: Extract<PanoramaGroup, { renderMode?: 'panorama' }>): PanoramaItem | null {
    const containerRect = this.listEl.getBoundingClientRect()
    const containerCenter = containerRect.top + containerRect.height / 2

    let nextItem: PanoramaItem | null = null
    let closestDistance = Number.POSITIVE_INFINITY

    for (const entry of group.items) {
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

    return nextItem
  }

  private emitState(): void {
    if (!this.state) return
    this.options.onStateChange?.(this.state)
  }

  private postHtmlActivation(group: PanoramaHtmlGroup): void {
    if (!group.activationMessage || !this.htmlFrameEl.contentWindow) return
    this.htmlFrameEl.contentWindow.postMessage(
      {
        source: 'panorama-player-host',
        namespace: group.htmlBridge?.namespace ?? 'panorama-runtime',
        ...group.activationMessage,
      },
      group.htmlBridge?.targetOrigin || '*',
    )
  }

  private openStandaloneProduct(): void {
    const targetUrl = this.buildStandaloneProductUrl()
    if (!targetUrl) return
    this.openInBestAvailableWindow(targetUrl)
  }

  private openInBestAvailableWindow(targetUrl: string): void {
    const features = 'noopener,noreferrer'
    try {
      const topWindow = window.top
      if (topWindow && typeof topWindow.open === 'function') {
        const openedByTop = topWindow.open(targetUrl, '_blank', features)
        if (openedByTop) {
          return
        }
      }
    } catch {
      // Fall back to the current browsing context when top-level open is blocked.
    }
    window.open(targetUrl, '_blank', features)
  }

  private buildStandaloneProductUrl(): string | null {
    if (!this.product?.packageId || !this.product.version) return null
    const targetUrl = new URL(
      `${encodeURIComponent(this.product.packageId)}/${encodeURIComponent(this.product.version)}/index.html`,
      `${STANDALONE_PRODUCT_BASE_URL}/`,
    )
    const focusName = this.resolveStandaloneFocusName()
    if (focusName) {
      targetUrl.searchParams.set('focus', focusName)
    }
    return targetUrl.toString()
  }

  private resolveStandaloneFocusName(): string | null {
    if (!this.product || !this.state) return null
    const section = this.product.sections.find(entry => entry.id === this.state?.activeSectionId)
    const group = section?.groups.find(entry => entry.id === this.state?.activeGroupId)
    if (!group) return null
    if (isPanoramaGroup(group)) {
      const activeItem = group.items.find(entry => entry.id === this.state?.activeItemId)
      return activeItem?.title?.trim() || null
    }
    return this.resolveHtmlStandaloneFocusName()
  }

  private resolveHtmlStandaloneFocusName(): string | null {
    const iframeWindow = this.htmlFrameEl.contentWindow as (Window & {
      __interactiveGuideGetCurrentFocusName?: () => unknown
    }) | null
    if (!iframeWindow || typeof iframeWindow.__interactiveGuideGetCurrentFocusName !== 'function') {
      return null
    }
    try {
      const focusName = iframeWindow.__interactiveGuideGetCurrentFocusName()
      return typeof focusName === 'string' && focusName.trim() ? focusName.trim() : null
    } catch {
      return null
    }
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
  overflow: hidden;
  --panorama-side-inset: clamp(10px, 3.6%, 16px);
  --panorama-hint-bottom: 12px;
  --panorama-bottom-alignment: calc(clamp(10px, 3.6%, 16px) - 4px);
  --panorama-floating-action-size: 16px;
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
.panorama-html-layer {
  position: absolute;
  inset: 0;
  display: none;
  z-index: 0;
  background: #060b14;
}
.panorama-html-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
}
.panorama-html-empty {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: rgba(255,255,255,0.72);
  font-size: 13px;
  text-align: center;
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
  z-index: 4;
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
  left: clamp(10px, 3.6%, 16px);
  right: clamp(10px, 3.6%, 16px);
  top: clamp(10px, 3.2%, 14px);
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
  border: 1px solid rgba(255,255,255,0.1);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
  color: rgba(255,255,255,0.78);
  font-size: 14px;
  line-height: 20px;
  font-weight: 400;
  cursor: pointer;
  pointer-events: auto;
  text-align: center;
  align-self: stretch;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
  backdrop-filter: blur(8px) saturate(125%);
  -webkit-backdrop-filter: blur(8px) saturate(125%);
}
.panorama-section-button.is-active {
  background: linear-gradient(0deg, rgba(146,146,146,0.1), rgba(146,146,146,0.1)), #ffffff;
  border-color: rgba(255,255,255,0.78);
  color: rgba(0,0,0,0.84);
  font-weight: 500;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.4),
    0 10px 24px rgba(0,0,0,0.14);
}
.panorama-group-tabs {
  position: absolute;
  left: clamp(10px, 3.6%, 16px);
  right: clamp(10px, 3.6%, 16px);
  top: clamp(46px, 13%, 58px);
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
  right: clamp(8px, 3%, 14px);
  top: clamp(88px, 24%, 108px);
  bottom: clamp(42px, 12%, 56px);
  width: clamp(112px, 30%, 138px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 4px 0 0;
  z-index: 4;
  scrollbar-width: none;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.panorama-list::-webkit-scrollbar {
  display: none;
}
.panorama-list.is-dragging {
  cursor: grabbing;
}
.panorama-list-edge-spacer {
  flex: 0 0 auto;
  width: 100%;
  pointer-events: none;
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
.panorama-list-item.is-preview .panorama-list-title {
  color: rgba(255,255,255,0.92);
  font-weight: 600;
  text-shadow: 0 1px 6px rgba(0,0,0,0.33);
}
.panorama-list-body {
  margin-top: 10px;
  color: rgba(255,255,255,0.5);
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
  text-shadow: 0 1px 4px rgba(0,0,0,0.32);
}
.panorama-list-item.is-active .panorama-list-body {
  color: rgba(255,255,255,0.92);
  font-weight: 500;
  text-shadow: 0 1px 6px rgba(0,0,0,0.4);
}
.panorama-list-item.is-preview .panorama-list-body {
  color: rgba(255,255,255,0.72);
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
.panorama-list-item.is-preview .panorama-list-divider {
  opacity: 0.72;
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
  min-width: 9px;
  min-height: 9px;
  flex: 0 0 auto;
  aspect-ratio: 1 / 1;
  display: block;
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
  height: clamp(28px, 8%, 36px);
  background: linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%);
  z-index: 4;
}
.panorama-hint-text {
  position: absolute;
  left: var(--panorama-side-inset);
  right: calc(var(--panorama-side-inset) + var(--panorama-floating-action-size) + 12px);
  bottom: var(--panorama-hint-bottom);
  min-height: var(--panorama-floating-action-size);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.6);
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  text-align: center;
  letter-spacing: 0;
  z-index: 5;
  pointer-events: none;
  padding: 0 4px;
}
.panorama-floating-action {
  position: absolute;
  right: var(--panorama-side-inset);
  bottom: var(--panorama-bottom-alignment);
  width: var(--panorama-floating-action-size);
  height: var(--panorama-floating-action-size);
  padding: 0;
  border: none;
  background: transparent;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 6;
  cursor: pointer;
  opacity: 0.92;
  transition: opacity 180ms ease, transform 180ms ease;
}
.panorama-floating-action:hover {
  opacity: 1;
  transform: scale(1.06);
}
.panorama-floating-action:active {
  transform: scale(0.96);
}
.panorama-floating-action:focus-visible {
  outline: 1px solid rgba(255,255,255,0.62);
  outline-offset: 4px;
  border-radius: 4px;
}
.panorama-floating-action svg {
  display: block;
  width: 11px;
  height: 11px;
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

function shouldUseAppleFocusOverlayFallback(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform || ''
  const vendor = navigator.vendor || ''
  const userAgent = navigator.userAgent || ''
  const maxTouchPoints = navigator.maxTouchPoints || 0
  const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
  const isSafariOnMac = /Mac/.test(platform) && /Apple/i.test(vendor)
  return isIOSDevice || isSafariOnMac
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
