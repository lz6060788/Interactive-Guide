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
import { hostStyles } from './panorama-player-host-styles.js'
import {
  type ProjectedFocusRect,
  shouldUseAppleFocusOverlayFallback,
} from './panorama-player-host-utils.js'
import { ListController, type ListControllerEnv, type PanoramaListItemRefs, type PanoramaListDragState } from './panorama-player-host-list.js'
import { FocusOverlayRenderer, type FocusOverlayRendererEnv } from './panorama-player-host-focus-overlay.js'
import { PanoramaShareManager, type PanoramaShareManagerEnv } from './panorama-player-host-share.js'

export interface PanoramaPlayerHostRefs {
  container: HTMLElement
}

export interface PanoramaPlayerHostOptions {
  onStateChange?: (state: PanoramaRuntimeState) => void
}

type InteractionMode = PanoramaRuntimeState['interactionMode']

export class PanoramaPlayerHost {
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
  private listController!: ListController
  private focusOverlayRenderer!: FocusOverlayRenderer
  private shareManager!: PanoramaShareManager

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
      void this.shareManager.openStandaloneProduct()
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
          this.focusOverlayRenderer.syncBlurMaskSize()
          this.focusOverlayRenderer.syncOverlayCanvasSize()
          if (this.displayedFocusRect) {
            this.focusOverlayRenderer.updateBlurMask(this.displayedFocusRect)
            this.focusOverlayRenderer.drawFocusOverlay(this.displayedFocusRect)
          }
        })
      : null
    this.resizeObserver?.observe(this.viewportEl)

    const self = this
    const listEnv: ListControllerEnv = {
      listEl: this.listEl,
      itemElements: this.itemElements,
      get currentListGroupId() { return self.currentListGroupId },
      set currentListGroupId(v) { self.currentListGroupId = v },
      get previewItemId() { return self.previewItemId },
      set previewItemId(v) { self.previewItemId = v },
      get activeItemId() { return self.activeItemId },
      get scrollSyncLocked() { return self.scrollSyncLocked },
      set scrollSyncLocked(v) { self.scrollSyncLocked = v },
      get scrollSyncTimer() { return self.scrollSyncTimer },
      set scrollSyncTimer(v) { self.scrollSyncTimer = v },
      get scrollSettleTimer() { return self.scrollSettleTimer },
      set scrollSettleTimer(v) { self.scrollSettleTimer = v },
      get listDragState() { return self.listDragState },
      set listDragState(v) { self.listDragState = v },
      get listPressTarget() { return self.listPressTarget },
      set listPressTarget(v) { self.listPressTarget = v },
      get ignoreListClick() { return self.ignoreListClick },
      set ignoreListClick(v) { self.ignoreListClick = v },
      get product() { return self.product },
      get state() { return self.state },
      get displayedFocusRect() { return self.displayedFocusRect },
      selectItem: (group, item, mode) => this.selectItem(group, item, mode),
      drawFocusOverlay: (rect) => this.focusOverlayRenderer.drawFocusOverlay(rect),
    }
    this.listController = new ListController(listEnv)
    this.listController.bindEvents()

    const focusOverlayEnv: FocusOverlayRendererEnv = {
      viewportEl: this.viewportEl,
      overlayCanvasEl: this.overlayCanvasEl,
      overlayContext: this.overlayContext,
      blurMaskSvgEl: this.blurMaskSvgEl,
      blurMaskBackgroundEl: this.blurMaskBackgroundEl,
      blurMaskHoleEl: this.blurMaskHoleEl,
      blurViewportEl: this.blurViewportEl,
      sceneLayerEl: this.sceneLayerEl,
      blurSceneLayerEl: this.blurSceneLayerEl,
      markerLayerEl: this.markerLayerEl,
      get backgroundImageAspectRatio() { return self.backgroundImageAspectRatio },
      set backgroundImageAspectRatio(v) { self.backgroundImageAspectRatio = v },
      get backgroundImageUrl() { return self.backgroundImageUrl },
      set backgroundImageUrl(v) { self.backgroundImageUrl = v },
      get displayedFocusRect() { return self.displayedFocusRect },
      set displayedFocusRect(v) { self.displayedFocusRect = v },
      get focusAnimationFrame() { return self.focusAnimationFrame },
      set focusAnimationFrame(v) { self.focusAnimationFrame = v },
      get lastSceneSignature() { return self.lastSceneSignature },
      set lastSceneSignature(v) { self.lastSceneSignature = v },
      prefersSimpleFocusOverlay: this.prefersSimpleFocusOverlay,
      get product() { return self.product },
      get state() { return self.state },
      get activeItemId() { return self.activeItemId },
      itemElements: this.itemElements,
      render: () => this.render(),
    }
    this.focusOverlayRenderer = new FocusOverlayRenderer(focusOverlayEnv)

    const shareEnv: PanoramaShareManagerEnv = {
      get product() { return self.product },
      get state() { return self.state },
      htmlFrameEl: this.htmlFrameEl,
    }
    this.shareManager = new PanoramaShareManager(shareEnv)
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
    this.listController.lockScrollSync()
    this.state = transitionToSection(this.state, section)
    this.render()
    this.emitState()
    if (nextItem) {
      this.listController.scrollItemIntoView(nextItem.id)
    }
  }

  selectGroup(section: PanoramaSection, group: PanoramaGroup): void {
    if (!this.state) return
    const nextItem = isPanoramaGroup(group)
      ? group.items.find(entry => entry.id === group.defaultItemId) ?? group.items[0]
      : null
    this.listController.lockScrollSync()
    this.state = transitionToGroup(this.state, section, group)
    this.render()
    this.emitState()
    if (nextItem) {
      this.listController.scrollItemIntoView(nextItem.id)
    }
  }

  selectItem(group: PanoramaGroup, item: PanoramaItem, mode: InteractionMode = 'hotspot-sync'): void {
    if (!this.state) return
    if (!isPanoramaGroup(group)) return
    if (mode !== 'scroll-sync') {
      this.listController.lockScrollSync()
    }
    this.state = transitionToItem(this.state, group, item, mode)
    this.render()
    this.emitState()
    if (mode !== 'scroll-sync') {
      this.listController.scrollItemIntoView(item.id)
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
    this.listController.unbindEvents()
    this.focusOverlayRenderer.resetFocusOverlayState()
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
      this.focusOverlayRenderer.resetFocusOverlayState()
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
    this.listController.renderList(group, item)
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
    this.focusOverlayRenderer.resetFocusOverlayState()

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
    this.focusOverlayRenderer.ensureBackgroundImageAspectRatio(backgroundImageUrl)
    const sceneGeometry = this.focusOverlayRenderer.computeSceneGeometry(zoom)
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

    const projectedFocusRect = this.focusOverlayRenderer.projectFocusRect(item, sceneGeometry)
    this.focusOverlayRenderer.animateFocusRect(projectedFocusRect)

    this.renderMarkers(group, item)
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

}

declare global {
  interface Window {
    PanoramaPlayerHost?: typeof PanoramaPlayerHost
  }
}

if (typeof window !== 'undefined') {
  window.PanoramaPlayerHost = PanoramaPlayerHost
}
