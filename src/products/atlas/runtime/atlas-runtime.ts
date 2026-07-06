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
import { ensureAtlasVisualStyles } from './atlas-visual-tokens.js'

const BACK_ICON_SVG = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M15.25 5.5L8.75 12L15.25 18.5" stroke="#231815" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
const INFO_ICON_SVG = `
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M7.00977 0.00878906C10.5322 0.187363 13.333 3.10017 13.333 6.66699L13.3242 7.00977C13.1456 10.5321 10.2337 13.3328 6.66699 13.333L6.32324 13.3242C2.91459 13.1512 0.181596 10.4185 0.00878906 7.00977L0 6.66699C0 2.98509 2.98509 0 6.66699 0L7.00977 0.00878906ZM6.66699 1C3.53738 1 1 3.53738 1 6.66699C1.00018 9.79646 3.53749 12.333 6.66699 12.333C9.79635 12.3328 12.3328 9.79635 12.333 6.66699C12.333 3.53749 9.79646 1.00018 6.66699 1ZM7.16699 5.33301V10H6.16699V5.33301H7.16699ZM6.66699 3.33301C7.03503 3.33318 7.33301 3.63192 7.33301 4C7.33301 4.36808 7.03503 4.66682 6.66699 4.66699C6.2988 4.66699 6 4.36819 6 4C6 3.63181 6.2988 3.33301 6.66699 3.33301Z" fill="black" fill-opacity="0.4"/>
</svg>
`
const SHARE_ICON_SVG = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M18.332 21.2057H5.39898C3.97063 21.2057 2.81152 20.0466 2.81152 18.6183V5.6844C2.81152 4.25605 4.01466 2.79468 5.44301 2.79468H12.6737V4.11042H5.44301C4.72756 4.11042 4.12726 4.71072 4.12726 5.42616L4.1061 18.6183C4.1061 19.3337 4.68607 19.9112 5.39898 19.9112L18.5928 19.89C19.3057 19.89 19.906 19.2897 19.906 18.5743V11.3436H21.2217V18.5743C21.2226 20.0043 19.7629 21.2057 18.332 21.2057ZM20.5656 8.71213C20.1922 8.71382 19.9068 8.41156 19.9068 8.0551L19.8882 4.91307L9.8813 14.456C9.61883 14.7066 9.19295 14.7066 8.93048 14.456C8.6697 14.2054 8.6697 13.799 8.93048 13.5492L18.8519 4.08925L15.9622 4.11042C15.5888 4.11042 15.3051 3.80815 15.3051 3.4534C15.3051 3.09694 15.5888 2.79637 15.9622 2.79468H20.5512C20.9246 2.79468 21.2226 3.08001 21.2226 3.43646V8.0551C21.2226 8.41156 20.9364 8.71213 20.5656 8.71213Z" fill="#231815"/>
</svg>
`
const SHEET_BACK_ICON_SVG = `
<svg width="16" height="13" viewBox="0 0 16 13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M10.5065 2.13333H7.11988V0L2.50655 3.46339L7.11988 6.33333V4.2H10.4799C12.7999 4.2 13.5 4.35339 13.6665 7.38667C13.6665 9.70667 12.7999 10.5733 10.4799 10.5733H0.826546C0.533213 10.5733 0 10.5733 0 11.3534C0 12.8534 0.5 12.64 0.826546 12.64H10.5065C13.4132 12.64 15.7599 10.8534 15.7599 7.38667C15.7599 3.35339 13.3865 2.13333 10.5065 2.13333Z" fill="black" fill-opacity="0.84"/>
</svg>
`
const DEFAULT_HOTSPOT_MIN_ZOOM = 1
const DEFAULT_CALLOUT_MIN_ZOOM = 2
const DEFAULT_ITEM_MARKER_MIN_ZOOM = 2
const INFO_SHEET_DEFAULT_TITLE = '说明'
const INFO_SHEET_DEFAULT_SECTIONS = [
  {
    heading: '资料来源',
    body: '本产业链图谱基于民生证券、华泰证券、国信证券等公开研报，以及行业公开资料、网络公开信息整理。节点分类、层级关系、说明文案及部分可视化形式由 AI 辅助归纳、生成和编辑，可能存在遗漏、简化或不准确之处。',
  },
  {
    heading: '免责声明',
    body: '相关内容仅用于产业链结构理解和产品功能展示，不构成投资建议、采购建议、技术选型建议或商业决策依据。如需用于正式研究或决策，请以权威机构、企业公告、原始研报及人工核验结果为准。页面中的场景图、设备图和空间关系为 AI 生成示意图，不代表真实基地、设备比例或企业布局。',
  },
]

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
  private toolbarEl: HTMLElement | null = null
  private hintEl: HTMLElement | null = null
  private floatingBackEl: HTMLButtonElement | null = null
  private infoBackdropEl: HTMLElement | null = null
  private infoSheetEl: HTMLElement | null = null
  private infoOpen = false

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
    this.mountedEl.style.width = `${this.manifest.config.viewport.width}px`
    this.mountedEl.style.height = `${this.manifest.config.viewport.height}px`
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

    this.mountedAt = this.now()
  }

  destroy(): void {
    this.destroyed = true
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
    this.drawer?.destroy()
    this.drawer = null
    this.manifest = null
    this.viewportLayer = null
    this.overlayLayer = null
    this.toolbarEl = null
    this.hintEl = null
    this.floatingBackEl = null
    this.infoBackdropEl = null
    this.infoSheetEl = null
    this.infoOpen = false
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
    if (!this.manifest || !this.sceneLauncher) return
    const route = this.manifest.routes.find((r) => r.id === routeId)
    if (!route) return
    this.emit({ type: 'routechange', routeId })
    const to = route.to
    if (to.kind === 'scene') {
      const scene = this.manifest.scenes.find((s) => s.sceneId === to.sceneId)
      if (scene) {
        this.sceneLauncher.launch(scene)
      }
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

  private mountChrome(): void {
    if (!this.manifest || !this.mountedEl) return
    if (this.manifest.config.chrome.showToolbar !== false) {
      const toolbar = document.createElement('div')
      toolbar.dataset.testid = 'atlas-runtime-toolbar'
      toolbar.style.position = 'absolute'
      toolbar.style.left = '0'
      toolbar.style.right = '0'
      toolbar.style.top = '0'
      toolbar.style.bottom = '0'
      toolbar.style.pointerEvents = 'none'
      toolbar.style.zIndex = '30'

      const backButton = this.createIconButton(
        'atlas-runtime-back',
        '返回上一页',
        BACK_ICON_SVG,
        () => {
          this.clearActiveItem()
          this.drawer?.close()
          this.camera?.animateTo(this.manifest!.panorama.initialViewport)
          this.updateFloatingBackButton()
        },
      )
      backButton.style.position = 'absolute'
      backButton.style.left = '16px'
      backButton.style.top = '16px'
      backButton.style.width = '32px'
      backButton.style.height = '32px'

      const title = document.createElement('div')
      title.dataset.testid = 'atlas-runtime-toolbar-title'
      title.textContent = this.manifest.projectTitle
      title.style.minHeight = '24px'
      title.style.maxWidth = '220px'
      title.style.fontSize = '17px'
      title.style.lineHeight = '24px'
      title.style.fontWeight = '700'
      title.style.color = 'rgba(0, 0, 0, 0.84)'
      title.style.whiteSpace = 'nowrap'
      title.style.overflow = 'hidden'
      title.style.textOverflow = 'ellipsis'
      title.style.pointerEvents = 'none'

      const center = document.createElement('div')
      center.style.position = 'absolute'
      center.style.left = '50%'
      center.style.top = '16px'
      center.style.transform = 'translateX(-50%)'
      center.style.display = 'flex'
      center.style.alignItems = 'center'
      center.style.justifyContent = 'center'
      center.style.gap = '4px'
      center.style.maxWidth = 'calc(100% - 120px)'
      center.style.pointerEvents = 'auto'

      const infoButton = this.createIconButton(
        'atlas-runtime-toolbar-icon',
        '提示信息',
        INFO_ICON_SVG,
        () => this.toggleInfoSheet(),
      )
      infoButton.style.width = '24px'
      infoButton.style.height = '24px'

      const shareButton = this.createIconButton(
        'atlas-runtime-share',
        '分享',
        SHARE_ICON_SVG,
        () => {
          this.emit({ type: 'analytics:share', channel: 'toolbar' })
          const nav = (globalThis as typeof globalThis & { navigator?: Navigator }).navigator
          if (nav?.share) {
            void nav.share({ title: this.manifest?.projectTitle ?? '' }).catch(() => {})
          }
        },
      )
      shareButton.style.position = 'absolute'
      shareButton.style.right = '16px'
      shareButton.style.top = '16px'
      shareButton.style.width = '24px'
      shareButton.style.height = '24px'

      center.appendChild(title)
      center.appendChild(infoButton)
      toolbar.appendChild(backButton)
      toolbar.appendChild(center)
      toolbar.appendChild(shareButton)
      this.mountedEl.appendChild(toolbar)
      this.toolbarEl = toolbar
    }

    const floatingBack = this.createIconButton(
      'atlas-runtime-floating-back',
      '返回总图',
      SHEET_BACK_ICON_SVG,
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

    const infoBackdrop = document.createElement('div')
    infoBackdrop.dataset.testid = 'atlas-runtime-info-backdrop'
    infoBackdrop.style.position = 'absolute'
    infoBackdrop.style.inset = '0'
    infoBackdrop.style.display = 'none'
    infoBackdrop.style.background = 'rgba(0, 0, 0, 0.8)'
    infoBackdrop.style.opacity = '0'
    infoBackdrop.style.transition = 'opacity 220ms ease'
    infoBackdrop.style.pointerEvents = 'none'
    infoBackdrop.style.zIndex = '31'
    infoBackdrop.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.closeInfoSheet()
    })
    this.mountedEl.appendChild(infoBackdrop)
    this.infoBackdropEl = infoBackdrop

    const infoSheet = document.createElement('div')
    infoSheet.dataset.testid = 'atlas-runtime-info-sheet'
    infoSheet.style.position = 'absolute'
    infoSheet.style.left = '0'
    infoSheet.style.right = '0'
    infoSheet.style.bottom = '0'
    infoSheet.style.display = 'none'
    infoSheet.style.flexDirection = 'column'
    infoSheet.style.gap = '16px'
    infoSheet.style.padding = '18px 22px 24px'
    infoSheet.style.borderTopLeftRadius = '8px'
    infoSheet.style.borderTopRightRadius = '8px'
    infoSheet.style.background = '#FFFFFF'
    infoSheet.style.boxShadow = '0 -10px 36px rgba(15, 23, 42, 0.12)'
    infoSheet.style.opacity = '0'
    infoSheet.style.transition = 'opacity 220ms ease'
    infoSheet.style.maxHeight = '50vh'
    infoSheet.style.overflow = 'hidden'
    infoSheet.style.boxSizing = 'border-box'
    infoSheet.style.zIndex = '32'

    const infoHeader = document.createElement('div')
    infoHeader.style.position = 'relative'
    infoHeader.style.display = 'flex'
    infoHeader.style.alignItems = 'center'
    infoHeader.style.justifyContent = 'center'
    infoHeader.style.minHeight = '28px'

    const infoTitle = document.createElement('div')
    infoTitle.textContent = INFO_SHEET_DEFAULT_TITLE
    infoTitle.style.fontWeight = '600'
    infoTitle.style.fontSize = '16px'
    infoTitle.style.lineHeight = '22px'
    infoTitle.style.color = 'rgba(0, 0, 0, 0.84)'

    const infoClose = document.createElement('button')
    infoClose.type = 'button'
    infoClose.textContent = '×'
    infoClose.style.position = 'absolute'
    infoClose.style.right = '0'
    infoClose.style.top = '50%'
    infoClose.style.transform = 'translateY(-50%)'
    infoClose.style.width = '28px'
    infoClose.style.height = '28px'
    infoClose.style.border = 'none'
    infoClose.style.borderRadius = '999px'
    infoClose.style.background = 'transparent'
    infoClose.style.color = 'rgba(0, 0, 0, 0.36)'
    infoClose.style.fontSize = '24px'
    infoClose.style.cursor = 'pointer'
    infoClose.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.closeInfoSheet()
    })

    const infoContent = document.createElement('div')
    infoContent.style.display = 'flex'
    infoContent.style.flexDirection = 'column'
    infoContent.style.gap = '18px'
    infoContent.style.overflowY = 'auto'
    infoContent.style.minHeight = '0'
    infoContent.style.paddingRight = '2px'

    for (const section of INFO_SHEET_DEFAULT_SECTIONS) {
      const sectionEl = document.createElement('section')
      const headingEl = document.createElement('div')
      headingEl.textContent = section.heading
      headingEl.style.fontWeight = '700'
      headingEl.style.fontSize = '13px'
      headingEl.style.lineHeight = '18px'
      headingEl.style.color = 'rgba(0, 0, 0, 0.84)'
      headingEl.style.marginBottom = '6px'
      const bodyEl = document.createElement('div')
      bodyEl.textContent = section.body
      bodyEl.style.fontSize = '13px'
      bodyEl.style.lineHeight = '22px'
      bodyEl.style.color = 'rgba(0, 0, 0, 0.72)'
      sectionEl.appendChild(headingEl)
      sectionEl.appendChild(bodyEl)
      infoContent.appendChild(sectionEl)
    }

    infoHeader.appendChild(infoTitle)
    infoHeader.appendChild(infoClose)
    infoSheet.appendChild(infoHeader)
    infoSheet.appendChild(infoContent)
    this.mountedEl.appendChild(infoSheet)
    this.infoSheetEl = infoSheet

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
      hint.style.fontWeight = '500'
      hint.style.fontSize = '13px'
      hint.style.lineHeight = '18px'
      hint.style.fontFamily = '"MiSans", "PingFang SC", "Microsoft YaHei", sans-serif'
      hint.style.whiteSpace = 'nowrap'
      hint.style.textAlign = 'center'
      hint.style.pointerEvents = 'none'
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

  private toggleInfoSheet(): void {
    if (this.infoOpen) {
      this.closeInfoSheet()
      return
    }
    this.infoOpen = true
    if (this.infoBackdropEl) {
      this.infoBackdropEl.style.display = 'block'
      this.infoBackdropEl.style.opacity = '1'
      this.infoBackdropEl.style.pointerEvents = 'auto'
    }
    if (this.infoSheetEl) {
      this.infoSheetEl.style.display = 'flex'
      this.infoSheetEl.style.opacity = '1'
    }
  }

  private closeInfoSheet(): void {
    this.infoOpen = false
    if (this.infoBackdropEl) {
      this.infoBackdropEl.style.opacity = '0'
      this.infoBackdropEl.style.pointerEvents = 'none'
      this.infoBackdropEl.style.display = 'none'
    }
    if (this.infoSheetEl) {
      this.infoSheetEl.style.opacity = '0'
      this.infoSheetEl.style.display = 'none'
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
