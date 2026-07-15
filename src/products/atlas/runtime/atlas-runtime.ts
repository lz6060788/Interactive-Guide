/**
 * AtlasRuntime — browser-side runtime that consumes an AtlasManifest.
 *
 * The runtime has zero knowledge of GuideProject / PublishManifest. It
 * is mounted into a DOM container, given an asset loader, and emits
 * analytics-friendly events.
 *
 * DOM structure:
 *   mountedEl (relative, viewport width × height)
 *     └── viewportLayer (absolute, 100% × 100%, transform-origin 0 0)
 *           ├── img (panorama, object-fit: cover)
 *           ├── hotspot buttons (rendered by MarkerRenderer)
 *           ├── item marker dots (rendered by MarkerRenderer)
 *           ├── callout svgs + labels (rendered by CalloutRenderer)
 *   mountedEl
 *     ├── viewportLayer  (transformed panorama image)
 *     ├── overlayLayer   (fixed-size hotspot / marker / callout overlay)
 *     └── card drawer    (bottom horizontal item cards)
 *
 * The viewport layer's CSS transform is driven by Camera:
 *   transform = translate(${(0.5 - centerX) * 100}%, ...) scale(zoom)
 * At zoom=1, the layer is identity-translated and the panorama fills
 * the viewport (with cover-fit cropping). At zoom=N, the layer is
 * scaled N× around its top-left corner, exposing only the center
 * 1/N × 1/N of the panorama within the viewport.
 *
 * Public API:
 *   - `mount(container)`: render the manifest into the container
 *   - `destroy()`: tear down listeners and child nodes
 *   - events: viewportchange, hotspotclick, itemclick, sceneenter,
 *     routechange, analytics:expose, analytics:click, analytics:stay,
 *     analytics:share
 */
import type {
  AtlasCategoryEntry,
  AtlasHtmlSceneManifest,
  AtlasItemEntry,
  AtlasManifest,
} from '../contract/atlas-manifest.js'
import type { Viewport } from '../../../domain/project-types.js'
import { Camera } from './camera.js'
import { MarkerRenderer } from './marker-renderer.js'
import { CalloutRenderer } from './callout-renderer.js'
import { SceneLauncher } from './scene-launcher.js'
import { CardDrawerController } from './card-drawer-controller.js'
import {
  ATLAS_BOTTOM_HINT_GRADIENT,
  ensureAtlasVisualStyles,
} from './atlas-visual-tokens.js'
import { TransitionVideoController } from '../../../platform/transition-video/transition-video-controller.js'
import { HostToolbarDomController } from '../../../platform/chrome/host-toolbar-dom.js'
import { HOST_SHEET_BACK_ICON_SVG } from '../../../platform/chrome/host-toolbar-icons.js'
const DEFAULT_HOTSPOT_MIN_ZOOM = 1
const DEFAULT_CALLOUT_MIN_ZOOM = 2
const DEFAULT_ITEM_MARKER_MIN_ZOOM = 2
export interface AtlasRuntimeAssetLoader {
  resolveUrl(url: string): string
  loadImage(url: string): Promise<HTMLImageElement>
  openScene(scene: AtlasHtmlSceneManifest, viewId?: string): void
}

export type { AtlasHtmlSceneManifest, AtlasCategoryEntry, AtlasItemEntry }

export type AtlasEvent =
  | { type: 'viewportchange'; viewport: Viewport }
  | { type: 'hotspotclick'; categoryId: string }
  | { type: 'itemclick'; itemId: string }
  | { type: 'sceneenter'; sceneId: string; viewId: string }
  | { type: 'routechange'; routeId: string }
  | { type: 'analytics:expose'; target: { kind: 'category' | 'item'; id: string } }
  | { type: 'analytics:click'; target: { kind: 'category' | 'item'; id: string } }
  | { type: 'analytics:stay'; durationMs: number }
  | { type: 'analytics:share'; channel: string }

export type AtlasListener = (event: AtlasEvent) => void

export interface AtlasRuntimeOptions {
  assets: AtlasRuntimeAssetLoader
  listeners?: AtlasListener[]
  /** Test seam: when provided, Date.now() is replaced with this function. */
  now?: () => number
}

export class AtlasRuntime {
  private manifest: AtlasManifest | null = null
  private mountedEl: HTMLElement | null = null
  private camera: Camera | null = null
  private markers: MarkerRenderer | null = null
  private callouts: CalloutRenderer | null = null
  private drawer: CardDrawerController | null = null
  private sceneLauncher: SceneLauncher | null = null
  private readonly listeners: AtlasListener[]
  private readonly now: () => number
  private mountedAt: number = 0
  private readonly opts: AtlasRuntimeOptions
  // Set to true when destroy() runs. mount() awaits image loading; if
  // destroy() runs during that await, the next DOM access on mountedEl
  // would crash (Cannot read properties of null). Aborting early keeps
  // the contract: destroy() is idempotent and safe to call mid-mount.
  private destroyed: boolean = false
  // The "viewport layer" — the wrapper that gets the camera transform.
  // Image + markers + callouts + bottom panel all live inside it.
  private viewportLayer: HTMLElement | null = null
  private overlayLayer: HTMLElement | null = null
  private toolbar: HostToolbarDomController | null = null
  private bottomGradientEl: HTMLElement | null = null
  private hintEl: HTMLElement | null = null
  private floatingBackEl: HTMLButtonElement | null = null
  private transitionController: TransitionVideoController | null = null
  private transitionOverlayEl: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private resizeFallbackWindow: Window | null = null

  constructor(opts: AtlasRuntimeOptions) {
    this.listeners = opts.listeners ?? []
    this.now = opts.now ?? (() => Date.now())
    this.opts = opts
  }

  loadManifest(manifest: AtlasManifest): void {
    this.manifest = manifest
  }

  on(listener: AtlasListener): void {
    this.listeners.push(listener)
  }

  off(listener: AtlasListener): void {
    const i = this.listeners.indexOf(listener)
    if (i >= 0) this.listeners.splice(i, 1)
  }

  async mount(container: HTMLElement): Promise<void> {
    if (!this.manifest) {
      throw new Error('AtlasRuntime: loadManifest must be called before mount()')
    }
    this.mountedEl = container
    this.mountedEl.innerHTML = ''
    this.mountedEl.style.position = 'relative'
    this.mountedEl.style.width = '100%'
    this.mountedEl.style.height = '100%'
    this.mountedEl.style.overflow = 'hidden'
    ensureAtlasVisualStyles(this.mountedEl.ownerDocument)

    const panoramaLayer = document.createElement('div')
    panoramaLayer.style.position = 'absolute'
    panoramaLayer.style.transformOrigin = '0 0'
    panoramaLayer.dataset.testid = 'atlas-viewport-layer'
    this.mountedEl.appendChild(panoramaLayer)
    this.viewportLayer = panoramaLayer

    const overlayLayer = document.createElement('div')
    overlayLayer.style.position = 'absolute'
    overlayLayer.style.inset = '0'
    overlayLayer.style.pointerEvents = 'none'
    overlayLayer.dataset.testid = 'atlas-overlay-layer'
    this.mountedEl.appendChild(overlayLayer)
    this.overlayLayer = overlayLayer

    this.mountChrome()
    this.mountTransitionOverlay()

    // Panorama image
    const imgUrl = this.opts.assets.resolveUrl(this.manifest.panorama.url)
    const img = await this.opts.assets.loadImage(imgUrl)
    if (this.destroyed || !this.mountedEl || !this.viewportLayer) return
    img.style.position = 'absolute'
    img.style.left = '0'
    img.style.top = '0'
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'fill'
    img.dataset.testid = 'atlas-panorama'
    this.viewportLayer.appendChild(img)

    // Camera
    this.camera = new Camera(
      this.mountedEl,
      this.manifest.panorama.initialViewport,
      this.manifest.panorama.cameraBounds,
      this.manifest.config.interaction,
      {
        width: img.naturalWidth || this.manifest.config.viewport.width,
        height: img.naturalHeight || this.manifest.config.viewport.height,
      },
    )
    this.camera.onChange((viewport) => {
      this.applyTransform()
      this.emit({ type: 'viewportchange', viewport })
    })
    this.applyTransform()

    // Markers + Callouts
    this.markers = new MarkerRenderer(
      this.overlayLayer,
      this.manifest.panorama.cameraBounds,
      this.manifest.config.theme.hotspotVariant,
      { onCategoryClick: (categoryId) => this.handleCategoryClick(categoryId) },
    )
    this.markers.setZoomThresholds({
      hotspotMinZoom: this.manifest.config.theme.hotspotMinZoom ?? DEFAULT_HOTSPOT_MIN_ZOOM,
      itemMarkerMinZoom: this.manifest.config.theme.itemMarkerMinZoom ?? DEFAULT_ITEM_MARKER_MIN_ZOOM,
    })
    for (const cat of this.manifest.categories) this.markers.addCategory(cat)
    for (const item of this.manifest.items) this.markers.addItem(item)
    this.markers.setZoom(this.camera.getViewport().zoom)

    this.callouts = new CalloutRenderer(
      this.overlayLayer,
      this.manifest.config.theme.calloutVariant,
      { onItemClick: (itemId) => this.handleItemClick(itemId) },
    )
    this.callouts.setZoomThresholds({
      calloutMinZoom: this.manifest.config.theme.calloutMinZoom ?? DEFAULT_CALLOUT_MIN_ZOOM,
    })
    for (const item of this.manifest.items) this.callouts.addItem(item)
    this.callouts.setZoom(this.camera.getViewport().zoom)

    this.drawer = new CardDrawerController(this.mountedEl, {
      onItemClick: (itemId) => this.handleDrawerItemClick(itemId),
      onClose: () => {
        this.clearActiveItem()
        this.updateFloatingBackButton()
      },
    })
    this.drawer.mount()
    this.updateFloatingBackButton()

    // Scene launcher
    this.sceneLauncher = new SceneLauncher(this.opts.assets.openScene, this.listeners)
    this.transitionController = new TransitionVideoController({
      mountRoot: this.transitionOverlayEl ?? undefined,
    })

    this.applyTransform()
    this.observeRuntimeSize()
    this.mountedAt = this.now()
  }

  destroy(): void {
    this.destroyed = true
    this.stopObservingRuntimeSize()
    if (this.mountedEl) {
      const stayDuration = this.mountedAt ? this.now() - this.mountedAt : 0
      if (this.mountedAt) this.emit({ type: 'analytics:stay', durationMs: stayDuration })
      this.mountedEl.innerHTML = ''
      this.mountedEl = null
    }
    this.camera?.destroy()
    this.camera = null
    this.markers = null
    this.callouts = null
    this.sceneLauncher = null
    this.transitionController?.cancel()
    this.transitionController = null
    this.drawer?.destroy()
    this.drawer = null
    this.manifest = null
    this.viewportLayer = null
    this.overlayLayer = null
    this.toolbar?.destroy()
    this.toolbar = null
    this.bottomGradientEl = null
    this.hintEl = null
    this.floatingBackEl = null
    this.transitionOverlayEl = null
  }

  private readonly handleRuntimeResize = (): void => {
    this.camera?.refreshLayout()
  }

  private observeRuntimeSize(): void {
    if (!this.mountedEl) return
    this.stopObservingRuntimeSize()
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this.handleRuntimeResize)
      this.resizeObserver.observe(this.mountedEl)
      return
    }
    const runtimeWindow = this.mountedEl.ownerDocument?.defaultView
    if (!runtimeWindow) return
    runtimeWindow.addEventListener('resize', this.handleRuntimeResize)
    runtimeWindow.addEventListener('orientationchange', this.handleRuntimeResize)
    this.resizeFallbackWindow = runtimeWindow
  }

  private stopObservingRuntimeSize(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (!this.resizeFallbackWindow) return
    this.resizeFallbackWindow.removeEventListener('resize', this.handleRuntimeResize)
    this.resizeFallbackWindow.removeEventListener('orientationchange', this.handleRuntimeResize)
    this.resizeFallbackWindow = null
  }

  /**
   * Programmatic API: navigate to a category viewport (called by editor
   * preview, deep-link routes, or programmatic user gestures).
   */
  focusCategory(categoryId: string): void {
    if (!this.manifest || !this.camera || !this.markers) return
    const cat = this.manifest.categories.find((c) => c.id === categoryId)
    if (!cat) return
    const firstItemId = cat.itemIds[0] ?? null
    const firstItem = firstItemId
      ? this.manifest.items.find((entry) => entry.id === firstItemId) ?? null
      : null
    this.camera.animateTo(this.resolveCategoryFocusViewport(cat, firstItem))
    this.markers.activate(firstItemId ? null : categoryId)
    this.activateItemSelection(firstItemId, { scrollIntoView: true })
    this.openDrawerForCategory(categoryId, firstItemId)
    this.emit({ type: 'analytics:expose', target: { kind: 'category', id: categoryId } })
  }

  /**
   * Open an experience route by id (used by editor preview "preview this
   * transition" buttons).
   */
  openRoute(routeId: string): void {
    void this.openRouteInternal(routeId)
  }

  dismissTransientExperience(): void {
    this.transitionController?.cancel()
  }

  private async openRouteInternal(routeId: string): Promise<void> {
    if (!this.manifest || !this.sceneLauncher) return
    const route = this.manifest.routes.find((r) => r.id === routeId)
    if (!route) return
    this.emit({ type: 'routechange', routeId })
    const to = route.to
    if (to.kind === 'scene') {
      const scene = this.manifest.scenes.find((s) => s.sceneId === to.sceneId)
      if (scene) {
        const viewId = to.viewId ?? scene.views[0]?.id
        const transition = this.manifest.routeTransitions?.[route.id]
        if (transition && this.transitionController) {
          const play = this.transitionController.play({
            url: transition.url,
            posterUrl: transition.posterUrl,
            timeoutMs: transition.timeoutMs,
            policy: transition.onFailure,
          })
          if (transition.onFailure === 'abort-navigation') {
            this.sceneLauncher.launch(scene, viewId)
            void play.catch(() => {})
            return
          }
          try {
            await play
          } catch {
            return
          }
        }
        this.sceneLauncher.launch(scene, viewId)
      }
      return
    }
    if (to.kind === 'panorama') {
      if (to.itemId) {
        this.handleDrawerItemClick(to.itemId)
        return
      }
      if (to.categoryId) {
        this.focusCategory(to.categoryId)
        return
      }
      this.clearActiveItem()
      this.drawer?.close()
      this.camera?.animateTo(this.manifest.panorama.initialViewport)
      this.updateFloatingBackButton()
    }
  }

  private applyTransform(): void {
    if (!this.camera || !this.viewportLayer) return
    const t = this.camera.getTransform()
    this.viewportLayer.style.left = `${t.originX}px`
    this.viewportLayer.style.top = `${t.originY}px`
    this.viewportLayer.style.width = `${t.width}px`
    this.viewportLayer.style.height = `${t.height}px`
    this.viewportLayer.style.transform = t.css
    const projection = this.camera.getProjection()
    this.markers?.setProjection(projection)
    this.callouts?.setProjection(projection)
    // Propagate zoom so renderers can hide low/high-zoom-only elements.
    const zoom = this.camera.getViewport().zoom
    this.markers?.setZoom(zoom)
    this.callouts?.setZoom(zoom)
    this.syncAnnotationVisibility(zoom)
  }

  private handleCategoryClick(categoryId: string): void {
    this.emit({ type: 'hotspotclick', categoryId })
    this.emit({ type: 'analytics:click', target: { kind: 'category', id: categoryId } })
    const category = this.manifest?.categories.find((entry) => entry.id === categoryId)
    if (
      category?.experience.kind === 'html-scene' &&
      this.tryOpenSceneRouteForCategory(categoryId, category.experience.sceneId, category.experience.viewId)
    ) {
      return
    }
    this.focusCategory(categoryId)
  }

  private handleItemClick(itemId: string): void {
    this.emit({ type: 'itemclick', itemId })
    this.emit({ type: 'analytics:click', target: { kind: 'item', id: itemId } })
    this.activateItemSelection(itemId, { scrollIntoView: true })
    const item = this.manifest?.items.find((entry) => entry.id === itemId)
    if (item) {
      this.markers?.activate(null)
      this.openDrawerForCategory(item.categoryId, itemId)
    }
  }

  private handleDrawerItemClick(itemId: string): void {
    this.emit({ type: 'itemclick', itemId })
    this.emit({ type: 'analytics:click', target: { kind: 'item', id: itemId } })
    this.activateItemSelection(itemId, { scrollIntoView: false })
    const item = this.manifest?.items.find((entry) => entry.id === itemId)
    if (!item) return
    const viewport = item.viewportOverride ?? this.viewportForItem(item)
    this.camera?.animateTo(viewport)
  }

  private openDrawerForCategory(categoryId: string, activeItemId: string | null): void {
    if (!this.manifest || !this.drawer) return
    const category = this.manifest.categories.find((entry) => entry.id === categoryId)
    if (!category) return
    const itemsById = new Map(this.manifest.items.map((item) => [item.id, item]))
    const orderedItems = category.itemIds
      .map((itemId) => itemsById.get(itemId))
      .filter((item): item is AtlasItemEntry => Boolean(item))
    if (orderedItems.length === 0) {
      this.drawer.close()
      return
    }
    this.drawer.open(category, orderedItems, activeItemId)
    this.updateFloatingBackButton()
  }

  private activateItemSelection(itemId: string | null, options: { scrollIntoView: boolean }): void {
    this.markers?.activateItem(itemId)
    this.callouts?.activate(itemId)
    this.drawer?.activateItem(itemId, { scrollIntoView: options.scrollIntoView })
  }

  private clearActiveItem(): void {
    this.markers?.activate(null)
    this.activateItemSelection(null, { scrollIntoView: false })
    this.updateFloatingBackButton()
  }

  private tryOpenSceneRouteForCategory(
    categoryId: string,
    sceneId: string,
    viewId: string,
  ): boolean {
    if (!this.manifest || !this.sceneLauncher) return false
    const route = this.manifest.routes.find(
      (entry) =>
        entry.from.kind === 'panorama' &&
        entry.from.categoryId === categoryId &&
        entry.to.kind === 'scene' &&
        entry.to.sceneId === sceneId &&
        entry.to.viewId === viewId,
    )
    if (route) {
      this.openRoute(route.id)
      return true
    }
    const scene = this.manifest.scenes.find((entry) => entry.sceneId === sceneId)
    if (!scene) return false
    this.sceneLauncher.launch(scene, viewId)
    return true
  }

  private mountTransitionOverlay(): void {
    if (!this.mountedEl) return
    const overlay = document.createElement('div')
    overlay.dataset.testid = 'atlas-transition-overlay'
    overlay.style.position = 'absolute'
    overlay.style.inset = '0'
    overlay.style.pointerEvents = 'none'
    overlay.style.zIndex = '45'
    overlay.style.display = 'none'
    this.mountedEl.appendChild(overlay)
    this.transitionOverlayEl = overlay
  }

  private mountChrome(): void {
    if (!this.manifest || !this.mountedEl) return
    const bottomGradient = document.createElement('div')
    bottomGradient.dataset.testid = 'atlas-runtime-bottom-gradient'
    bottomGradient.style.position = 'absolute'
    bottomGradient.style.left = '0'
    bottomGradient.style.right = '0'
    bottomGradient.style.bottom = '0'
    bottomGradient.style.height = '86px'
    bottomGradient.style.display = 'none'
    bottomGradient.style.pointerEvents = 'none'
    bottomGradient.style.opacity = '0'
    bottomGradient.style.transition = 'opacity 220ms ease'
    bottomGradient.style.zIndex = '21'
    bottomGradient.style.background = ATLAS_BOTTOM_HINT_GRADIENT
    this.mountedEl.appendChild(bottomGradient)
    this.bottomGradientEl = bottomGradient

    if (this.manifest.config.chrome.showToolbar !== false) {
      this.toolbar = new HostToolbarDomController({
        root: this.mountedEl,
        title: this.manifest.projectTitle,
        textColor: 'rgba(0, 0, 0, 0.84)',
        onBack: () => {
          this.clearActiveItem()
          this.drawer?.close()
          this.camera?.animateTo(this.manifest!.panorama.initialViewport)
          this.updateFloatingBackButton()
        },
        onShare: () => {
          this.emit({ type: 'analytics:share', channel: 'toolbar' })
          const nav = (globalThis as typeof globalThis & { navigator?: Navigator }).navigator
          if (nav?.share) {
            void nav.share({ title: this.manifest?.projectTitle ?? '' }).catch(() => {})
          }
        },
        showGradient: false,
        testIds: {
          toolbar: 'atlas-runtime-toolbar',
          back: 'atlas-runtime-back',
          title: 'atlas-runtime-toolbar-title',
          info: 'atlas-runtime-toolbar-icon',
          share: 'atlas-runtime-share',
          infoBackdrop: 'atlas-runtime-info-backdrop',
          infoSheet: 'atlas-runtime-info-sheet',
        },
        zIndexBase: 30,
      })
      this.toolbar.mount()
    }

    const floatingBack = this.createIconButton(
      'atlas-runtime-floating-back',
      '返回总图',
      HOST_SHEET_BACK_ICON_SVG,
      () => {
        this.clearActiveItem()
        this.drawer?.close()
        this.camera?.animateTo(this.manifest!.panorama.initialViewport)
        this.updateFloatingBackButton()
      },
    )
    floatingBack.style.position = 'absolute'
    floatingBack.style.right = '16px'
    floatingBack.style.bottom = '24px'
    floatingBack.style.width = '32px'
    floatingBack.style.height = '32px'
    floatingBack.style.borderRadius = '6.85714px'
    floatingBack.style.background = 'rgba(255, 255, 255, 0.8)'
    floatingBack.style.color = 'rgba(0, 0, 0, 0.84)'
    floatingBack.style.display = 'none'
    floatingBack.style.alignItems = 'center'
    floatingBack.style.justifyContent = 'center'
    floatingBack.style.opacity = '0'
    floatingBack.style.transition = 'bottom 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease'
    floatingBack.style.zIndex = '29'
    const floatingBackSvg = typeof (floatingBack as HTMLButtonElement & { querySelector?: unknown }).querySelector === 'function'
      ? floatingBack.querySelector('svg')
      : null
    if (floatingBackSvg) {
      floatingBackSvg.style.width = '16px'
      floatingBackSvg.style.height = '13px'
      floatingBackSvg.style.display = 'block'
    }
    this.mountedEl.appendChild(floatingBack)
    this.floatingBackEl = floatingBack

    if (this.manifest.config.chrome.showHints !== false && this.manifest.config.hintText) {
      ensureAtlasDragHintAnimationStyles(this.mountedEl.ownerDocument)
      const hint = document.createElement('div')
      hint.dataset.testid = 'atlas-runtime-hint'
      hint.innerHTML = [
        '<span data-drag-hint-arrow="left-1" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.28)">&lt;</span>',
        '<span data-drag-hint-arrow="left-2" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.48)">&lt;</span>',
        '<span data-drag-hint-arrow="left-3" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.78)">&lt;</span>',
        `<span style="display:inline-block;padding:0 8px;color:#FFFFFF;letter-spacing:0.2px;">${escapeHtml(this.manifest.config.hintText)}</span>`,
        '<span data-drag-hint-arrow="right-1" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.78)">&gt;</span>',
        '<span data-drag-hint-arrow="right-2" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.48)">&gt;</span>',
        '<span data-drag-hint-arrow="right-3" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.28)">&gt;</span>',
      ].join('')
      hint.style.position = 'absolute'
      hint.style.left = '50%'
      hint.style.bottom = '24px'
      hint.style.transform = 'translateX(-50%)'
      hint.style.display = 'none'
      hint.style.fontWeight = '500'
      hint.style.fontSize = '13px'
      hint.style.lineHeight = '18px'
      hint.style.fontFamily = '"MiSans", "PingFang SC", "Microsoft YaHei", sans-serif'
      hint.style.whiteSpace = 'nowrap'
      hint.style.textAlign = 'center'
      hint.style.pointerEvents = 'none'
      hint.style.opacity = '0'
      hint.style.transition = 'opacity 220ms ease'
      hint.style.zIndex = '22'
      const stagger = ['0s', '0.12s', '0.24s', '0.24s', '0.12s', '0s']
      const arrows = typeof (hint as HTMLElement & { querySelectorAll?: unknown }).querySelectorAll === 'function'
        ? Array.from(hint.querySelectorAll('[data-drag-hint-arrow]'))
        : []
      arrows.forEach((arrow, index) => {
        ;(arrow as HTMLElement).style.animation = 'atlas-drag-hint-arrow-glow 1.6s ease-in-out infinite'
        ;(arrow as HTMLElement).style.animationDelay = stagger[index] ?? '0s'
      })
      this.mountedEl.appendChild(hint)
      this.hintEl = hint
      this.syncHintChromeVisibility()
    }
  }

  private createIconButton(testid: string, label: string, svg: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.testid = testid
    button.setAttribute('aria-label', label)
    button.innerHTML = svg
    button.style.border = 'none'
    button.style.borderRadius = '0'
    button.style.padding = '0'
    button.style.background = 'transparent'
    button.style.cursor = 'pointer'
    button.style.pointerEvents = 'auto'
    button.style.display = 'flex'
    button.style.alignItems = 'center'
    button.style.justifyContent = 'center'
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    })
    const svgEl = typeof (button as HTMLElement & { querySelector?: unknown }).querySelector === 'function'
      ? button.querySelector('svg')
      : null
    if (svgEl) {
      ;(svgEl as SVGElement).style.display = 'block'
    }
    return button
  }

  private syncAnnotationVisibility(zoom: number): void {
    if (!this.manifest || !this.markers) return
    const calloutMinZoom = this.manifest.config.theme.calloutMinZoom ?? DEFAULT_CALLOUT_MIN_ZOOM
    const visibleCalloutItems = this.manifest.items.filter((item) =>
      item.callout && zoom >= (item.callout.minZoom ?? calloutMinZoom),
    )
    const suppressedCategoryIds = new Set(visibleCalloutItems.map((item) => item.categoryId))
    const suppressedItemIds = new Set(
      this.manifest.items.filter((item) => item.callout).map((item) => item.id),
    )
    this.markers.suppressCategories(suppressedCategoryIds)
    this.markers.suppressItems(suppressedItemIds)
  }

  private updateFloatingBackButton(): void {
    if (!this.floatingBackEl) return
    const root = this.mountedEl as (HTMLElement & { querySelector?: typeof HTMLElement.prototype.querySelector }) | null
    const drawerHeight = this.drawer?.getState().open
      ? (typeof root?.querySelector === 'function'
        ? root.querySelector<HTMLElement>('[data-testid="atlas-card-drawer"]')?.offsetHeight ?? 0
        : 0)
      : 0
    const shouldShow = true
    this.floatingBackEl.style.display = 'flex'
    this.floatingBackEl.style.opacity = shouldShow ? '1' : '0'
    this.floatingBackEl.style.pointerEvents = shouldShow ? 'auto' : 'none'
    this.floatingBackEl.style.bottom = drawerHeight > 0
      ? `${drawerHeight + 24}px`
      : '24px'
  }

  private syncHintChromeVisibility(): void {
    const shouldShow = this.manifest?.config.chrome.showHints !== false && !!this.manifest?.config.hintText
    if (this.bottomGradientEl) {
      this.bottomGradientEl.style.display = shouldShow ? 'block' : 'none'
      this.bottomGradientEl.style.opacity = shouldShow ? '1' : '0'
    }
    if (this.hintEl) {
      this.hintEl.style.display = shouldShow ? 'block' : 'none'
      this.hintEl.style.opacity = shouldShow ? '1' : '0'
    }
  }

  private viewportForItem(item: AtlasItemEntry): Viewport {
    const base = this.camera?.getViewport() ?? this.manifest?.panorama.initialViewport ?? {
      centerX: item.marker.x,
      centerY: item.marker.y,
      zoom: 2,
    }
    return {
      centerX: item.marker.x,
      centerY: item.marker.y,
      zoom: Math.max(base.zoom, 2),
    }
  }

  private resolveCategoryFocusViewport(
    category: AtlasCategoryEntry,
    item: AtlasItemEntry | null,
  ): Viewport {
    if (!item) return category.viewport
    const itemViewport = item.viewportOverride
    return {
      centerX: itemViewport?.centerX ?? item.marker.x,
      centerY: itemViewport?.centerY ?? item.marker.y,
      zoom: category.activationZoom ?? itemViewport?.zoom ?? category.viewport.zoom,
    }
  }

  private emit(event: AtlasEvent): void {
    for (const l of this.listeners) l(event)
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function ensureAtlasDragHintAnimationStyles(doc: Document): void {
  const styleId = 'atlas-drag-hint-animation-styles'
  if (doc.getElementById(styleId)) return
  const style = doc.createElement('style')
  style.id = styleId
  style.textContent = `
@keyframes atlas-drag-hint-arrow-glow {
  0%, 100% {
    opacity: 0.28;
    text-shadow: 0 0 0 rgba(255,255,255,0);
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    text-shadow: 0 0 10px rgba(255,255,255,0.82);
    transform: translateY(-0.5px);
  }
}
`
  doc.head.appendChild(style)
}
