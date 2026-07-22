import type { Viewport } from '../../../domain/project-types.js'
import type {
  ResolvedCatalogCategoryEntry as CatalogCategoryEntry,
  ResolvedCatalogItemEntry as CatalogItemEntry,
  ResolvedCatalogManifest as CatalogManifest,
  ResolvedCatalogStageEntry as CatalogStageEntry,
} from '../contract/catalog-manifest.js'
import { createCatalogAtlasLaunchButton } from './catalog-atlas-launch.js'

export interface CatalogSceneSelection {
  stageKey: CatalogStageEntry['key']
  categoryId: string | null
  itemId: string | null
}

export interface CatalogSceneOptions {
  root: HTMLElement
  manifest: CatalogManifest
  panoramaUrl: string
  imageSize?: { width: number; height: number }
  initialSelection?: Partial<CatalogSceneSelection>
  onSelectionChange?: (selection: CatalogSceneSelection) => void
  onAtlasLaunch?: (url: string) => void
  editor?: {
    onMarkerChange: (itemId: string, marker: CatalogItemEntry['marker']) => void
    onFocusRectChange: (itemId: string, focusRect: CatalogItemEntry['focusRect']) => void
    onViewportChange: (
      target: { kind: 'category'; categoryId: string } | { kind: 'item'; itemId: string },
      viewport: Viewport,
    ) => void
  }
}

interface SceneGeometry {
  left: number
  top: number
  width: number
  height: number
  canvasWidth: number
  canvasHeight: number
}
interface ProjectedFocusRect {
  left: number
  top: number
  width: number
  height: number
  radius: number
  maskOpacity: number
}

const CATALOG_FOCUS_RADIUS_PX = 12

/** Shared Catalog scene. Every visual layer consumes the same camera geometry. */
export class CatalogScene {
  private readonly root: HTMLElement
  private readonly manifest: CatalogManifest
  private readonly panoramaUrl: string
  private readonly imageAspect: number
  private readonly onSelectionChange?: CatalogSceneOptions['onSelectionChange']
  private readonly onAtlasLaunch?: CatalogSceneOptions['onAtlasLaunch']
  private readonly editor?: CatalogSceneOptions['editor']
  private selection: CatalogSceneSelection
  private original: HTMLElement | null = null
  private dimmed: HTMLElement | null = null
  private shade: HTMLElement | null = null
  private focusWindow: HTMLElement | null = null
  private markerLayer: HTMLElement | null = null
  private stageTabs: HTMLElement | null = null
  private categoryTabs: HTMLElement | null = null
  private detailList: HTMLElement | null = null
  private connector: HTMLElement | null = null
  private cameraCenter: HTMLElement | null = null
  private detailById = new Map<string, HTMLElement>()
  private markerById = new Map<string, { element: HTMLElement; item: CatalogItemEntry }>()
  private detailTopSpacer: HTMLElement | null = null
  private detailBottomSpacer: HTMLElement | null = null
  private listDragState: {
    pointerId: number
    startY: number
    startScrollTop: number
    moved: boolean
  } | null = null
  private ignoreListClick = false
  private previewItemId: string | null = null
  private listCenterFrame: number | null = null
  private focusAnimationFrame: number | null = null
  private displayedFocusRect: ProjectedFocusRect | null = null
  private displayedGeometry: SceneGeometry | null = null
  private resizeObserver: ResizeObserver | null = null
  private resizeFallbackWindow: Window | null = null

  constructor(options: CatalogSceneOptions) {
    this.root = options.root
    this.manifest = options.manifest
    this.panoramaUrl = options.panoramaUrl
    this.imageAspect = Math.max(
      (options.imageSize?.width ?? 1) / Math.max(options.imageSize?.height ?? 1, 1),
      0.01,
    )
    this.onSelectionChange = options.onSelectionChange
    this.onAtlasLaunch = options.onAtlasLaunch
    this.editor = options.editor
    this.selection = resolveSelection(options.manifest, options.initialSelection)
  }

  mount(): void {
    this.root.innerHTML = ''
    Object.assign(this.root.style, {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: '#161616',
      color: 'rgba(255,255,255,.9)',
      fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
    })
    this.original = imageLayer(this.panoramaUrl, 'catalog-scene-original')
    this.dimmed = imageLayer(this.panoramaUrl, 'catalog-scene-blur')
    Object.assign(this.dimmed.style, {
      filter: 'blur(2px)',
      opacity: '.96',
      zIndex: '1',
      pointerEvents: 'none',
    })
    this.shade = document.createElement('div')
    Object.assign(this.shade.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '2',
      pointerEvents: 'none',
    })
    this.focusWindow = document.createElement('div')
    this.focusWindow.dataset.testid = 'catalog-focus-window'
    Object.assign(this.focusWindow.style, {
      position: 'absolute',
      zIndex: '3',
      overflow: 'hidden',
      pointerEvents: this.editor ? 'auto' : 'none',
    })
    this.markerLayer = document.createElement('div')
    this.markerLayer.dataset.testid = 'catalog-marker-layer'
    Object.assign(this.markerLayer.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '5',
      pointerEvents: 'none',
    })
    this.connector = document.createElement('div')
    this.connector.dataset.testid = 'catalog-focus-connector'
    Object.assign(this.connector.style, {
      position: 'absolute',
      zIndex: '6',
      height: '0',
      borderTop: '2px dashed rgba(255,255,255,.9)',
      transformOrigin: '0 50%',
      pointerEvents: 'none',
    })
    this.stageTabs = document.createElement('nav')
    this.stageTabs.dataset.testid = 'catalog-scene-stage-tabs'
    Object.assign(this.stageTabs.style, {
      position: 'absolute',
      left: 'clamp(10px,3.6%,16px)',
      right: 'clamp(10px,3.6%,16px)',
      top: 'clamp(10px,3.2%,14px)',
      zIndex: '8',
      display: 'grid',
      gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
      gap: '8px',
    })
    this.categoryTabs = document.createElement('nav')
    this.categoryTabs.dataset.testid = 'catalog-scene-category-tabs'
    Object.assign(this.categoryTabs.style, {
      position: 'absolute',
      left: 'clamp(10px,3.6%,16px)',
      right: 'clamp(10px,3.6%,16px)',
      top: 'clamp(46px,13%,58px)',
      zIndex: '8',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      overflowX: 'auto',
      overflowY: 'hidden',
      padding: '0 4px',
      scrollbarWidth: 'none',
      whiteSpace: 'nowrap',
    })
    this.detailList = document.createElement('aside')
    this.detailList.dataset.testid = 'catalog-scene-detail-list'
    Object.assign(this.detailList.style, {
      position: 'absolute',
      right: 'clamp(8px,3%,14px)',
      top: 'clamp(88px,24%,108px)',
      bottom: 'clamp(42px,12%,56px)',
      zIndex: '7',
      width: 'clamp(112px,30%,138px)',
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingRight: '4px',
      scrollbarWidth: 'none',
      color: 'rgba(255,255,255,.7)',
      cursor: 'grab',
      userSelect: 'none',
      touchAction: 'none',
    })
    this.detailList.addEventListener('scroll', () => this.handleDetailScroll(), { passive: true })
    this.detailList.addEventListener('pointerdown', event => this.handleDetailPointerDown(event))
    this.detailList.addEventListener('pointermove', event => this.handleDetailPointerMove(event))
    this.detailList.addEventListener('pointerup', event => this.handleDetailPointerUp(event))
    this.detailList.addEventListener('pointercancel', event => this.handleDetailPointerUp(event))
    const hint = document.createElement('div')
    hint.dataset.testid = 'catalog-scene-hint'
    hint.textContent = this.manifest.config.hintText ?? ''
    Object.assign(hint.style, {
      position: 'absolute',
      left: '24px',
      right: '64px',
      bottom: '18px',
      zIndex: '8',
      textAlign: 'center',
      fontSize: '14px',
      color: 'rgba(255,255,255,.68)',
      textShadow: '0 1px 8px rgba(0,0,0,.46)',
      pointerEvents: 'none',
    })
    if (this.editor) this.mountEditorControls()
    this.root.appendChild(this.original)
    this.root.appendChild(this.dimmed)
    this.root.appendChild(this.shade)
    this.root.appendChild(this.focusWindow)
    this.root.appendChild(this.markerLayer)
    this.root.appendChild(this.connector)
    this.root.appendChild(this.stageTabs)
    this.root.appendChild(this.categoryTabs)
    this.root.appendChild(this.detailList)
    this.root.appendChild(hint)
    const atlasLaunchUrl = this.manifest.config.atlasLaunchUrl?.trim()
    if (atlasLaunchUrl) {
      this.root.appendChild(
        createCatalogAtlasLaunchButton({
          url: atlasLaunchUrl,
          onLaunch: url => this.onAtlasLaunch?.(url),
        }),
      )
    }
    this.render()
    this.observeRuntimeSize()
  }

  destroy(): void {
    this.stopObservingRuntimeSize()
    if (this.focusAnimationFrame !== null) cancelAnimationFrame(this.focusAnimationFrame)
    if (this.listCenterFrame !== null) cancelAnimationFrame(this.listCenterFrame)
    this.focusAnimationFrame = null
    this.listCenterFrame = null
    this.displayedFocusRect = null
    this.displayedGeometry = null
    this.listDragState = null
    this.previewItemId = null
    this.root.innerHTML = ''
    this.detailById.clear()
    this.markerById.clear()
    this.detailTopSpacer = this.detailBottomSpacer = null
    this.original =
      this.dimmed =
      this.shade =
      this.focusWindow =
      this.markerLayer =
      this.stageTabs =
      this.categoryTabs =
      this.detailList =
      this.connector =
      this.cameraCenter =
        null
  }
  getSelection(): CatalogSceneSelection {
    return { ...this.selection }
  }
  selectStage(stageKey: CatalogStageEntry['key']): void {
    this.selection = resolveSelection(this.manifest, { stageKey })
    this.render()
    this.onSelectionChange?.(this.getSelection())
  }
  selectCategory(categoryId: string): void {
    const stage = this.findStageByCategory(categoryId)
    if (!stage) return
    this.selection = resolveSelection(this.manifest, { stageKey: stage.key, categoryId })
    this.render()
    this.onSelectionChange?.(this.getSelection())
  }
  selectItem(itemId: string): void {
    const item = this.itemById(itemId)
    const stage = item && this.findStageByCategory(item.categoryId)
    if (!item || !stage) return
    this.selection = { stageKey: stage.key, categoryId: item.categoryId, itemId }
    this.render()
    this.onSelectionChange?.(this.getSelection())
  }

  private render(): void {
    const stage = this.getStage()
    const category = stage?.categories.find(c => c.id === this.selection.categoryId) ?? null
    const items = category ? orderedItems(this.manifest, category) : []
    const active = items.find(i => i.id === this.selection.itemId) ?? null
    const viewport = active?.viewportOverride ??
      category?.viewport ?? { centerX: 0.5, centerY: 0.5, zoom: 1 }
    const geometry = this.geometry(viewport)
    this.renderStageTabs()
    this.renderCategoryTabs(stage)
    this.renderFocus(active, geometry)
    this.renderMarkers(items, active?.id ?? null, this.displayedGeometry ?? geometry)
    this.renderDetailList(items, active?.id ?? null)
    this.renderConnector(active, geometry)
  }

  private geometry(viewport: Viewport): SceneGeometry {
    const bounds = this.root.getBoundingClientRect()
    const canvasWidth = Number((this.root as HTMLElement).clientWidth) || bounds.width || 1
    const canvasHeight = Number((this.root as HTMLElement).clientHeight) || bounds.height || 1
    let baseWidth = canvasWidth
    let baseHeight = baseWidth / this.imageAspect
    if (baseHeight < canvasHeight) {
      baseHeight = canvasHeight
      baseWidth = baseHeight * this.imageAspect
    }
    const zoom = clamp(viewport.zoom, 1, 16)
    const width = baseWidth * zoom
    const height = baseHeight * zoom
    return {
      canvasWidth,
      canvasHeight,
      width,
      height,
      left: clamp(canvasWidth / 2 - viewport.centerX * width, canvasWidth - width, 0),
      top: clamp(canvasHeight / 2 - viewport.centerY * height, canvasHeight - height, 0),
    }
  }

  private readonly handleRuntimeResize = (): void => {
    this.render()
  }

  private observeRuntimeSize(): void {
    this.stopObservingRuntimeSize()
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this.handleRuntimeResize)
      this.resizeObserver.observe(this.root)
      return
    }
    const runtimeWindow = this.root.ownerDocument?.defaultView
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

  private applyBackdropFrame(g: SceneGeometry): void {
    for (const layer of [this.original, this.dimmed])
      if (layer)
        Object.assign(layer.style, {
          left: `${g.left}px`,
          top: `${g.top}px`,
          width: `${g.width}px`,
          height: `${g.height}px`,
          transition: 'none',
        })
  }
  private renderStageTabs(): void {
    if (!this.stageTabs) return
    this.stageTabs.innerHTML = ''
    for (const stage of this.manifest.stages) {
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.testid = `catalog-stage-tab-${stage.key}`
      b.textContent = stage.label
      const active = stage.key === this.selection.stageKey
      Object.assign(b.style, {
        minWidth: '0',
        height: '30px',
        padding: '5px 8px',
        borderRadius: '4px',
        border: active ? '1px solid rgba(255,255,255,.78)' : '1px solid rgba(255,255,255,.1)',
        background: active
          ? 'linear-gradient(0deg,rgba(146,146,146,.1),rgba(146,146,146,.1)),#fff'
          : 'linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.03))',
        color: active ? 'rgba(0,0,0,.84)' : 'rgba(255,255,255,.78)',
        fontSize: '14px',
        lineHeight: '20px',
        fontWeight: active ? '500' : '400',
        cursor: 'pointer',
        textAlign: 'center',
        boxShadow: active
          ? 'inset 0 1px 0 rgba(255,255,255,.4),0 10px 24px rgba(0,0,0,.14)'
          : 'inset 0 1px 0 rgba(255,255,255,.08)',
        backdropFilter: 'blur(8px) saturate(125%)',
      })
      b.addEventListener('click', () => this.selectStage(stage.key))
      this.stageTabs.appendChild(b)
    }
  }
  private renderCategoryTabs(stage: CatalogStageEntry | null): void {
    if (!this.categoryTabs) return
    this.categoryTabs.innerHTML = ''
    const categories = [...(stage?.categories ?? [])].sort((a, b) => a.order - b.order)
    categories.forEach((c, index) => {
      if (index > 0) {
        const divider = document.createElement('span')
        Object.assign(divider.style, {
          width: '1px',
          height: '12px',
          background: 'rgba(255,255,255,.2)',
          flex: '0 0 auto',
        })
        this.categoryTabs!.appendChild(divider)
      }
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.testid = `catalog-category-tab-${c.id}`
      b.textContent = c.title
      const active = c.id === this.selection.categoryId
      Object.assign(b.style, {
        padding: '0',
        border: '0',
        background: 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,.6)',
        fontSize: '14px',
        lineHeight: '18px',
        fontWeight: active ? '500' : '400',
        cursor: 'pointer',
        textShadow: '0 1px 2px rgba(0,0,0,.4)',
      })
      b.addEventListener('click', () => this.selectCategory(c.id))
      this.categoryTabs!.appendChild(b)
    })
  }
  private renderFocus(item: CatalogItemEntry | null, g: SceneGeometry): void {
    if (!this.focusWindow) return
    if (!item) {
      this.focusWindow.style.display = 'none'
      this.resetFocusAnimation()
      this.applyBackdropFrame(g)
      return
    }
    const projected = projectRect(item.focusRect, g)
    const target: ProjectedFocusRect = {
      ...projected,
      radius:
        this.manifest.config.theme.focusVariant === 'pill'
          ? Math.min(projected.width, projected.height) / 2
          : CATALOG_FOCUS_RADIUS_PX,
      maskOpacity: item.focusRect.maskOpacity ?? this.manifest.config.theme.maskOpacity ?? 0.42,
    }
    if (!this.displayedFocusRect || !this.displayedGeometry) {
      this.displayedFocusRect = target
      this.displayedGeometry = g
      this.applySceneFrame(target, g)
      return
    }
    if (
      projectedFocusEqual(this.displayedFocusRect, target) &&
      geometryEqual(this.displayedGeometry, g)
    ) {
      this.displayedFocusRect = target
      this.displayedGeometry = g
      this.applySceneFrame(target, g)
      return
    }
    if (this.focusAnimationFrame !== null) cancelAnimationFrame(this.focusAnimationFrame)
    const fromRect = { ...this.displayedFocusRect }
    const fromGeometry = { ...this.displayedGeometry }
    const startTime = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / 520, 1)
      const eased = easeOutCubic(progress)
      const currentRect = interpolateFocusRect(fromRect, target, eased)
      const currentGeometry = interpolateGeometry(fromGeometry, g, eased)
      this.displayedFocusRect = currentRect
      this.displayedGeometry = currentGeometry
      this.applySceneFrame(currentRect, currentGeometry)
      this.renderConnectorFromRect(item, currentRect)
      if (progress < 1) this.focusAnimationFrame = requestAnimationFrame(tick)
      else {
        this.focusAnimationFrame = null
        this.displayedFocusRect = target
        this.displayedGeometry = g
        this.applySceneFrame(target, g)
        this.renderConnectorFromRect(item, target)
      }
    }
    this.focusAnimationFrame = requestAnimationFrame(tick)
  }

  private applyFocusFrame(rect: ProjectedFocusRect, g: SceneGeometry): void {
    if (!this.focusWindow) return
    Object.assign(this.focusWindow.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: `${rect.radius}px`,
      backgroundImage: `url("${this.panoramaUrl}")`,
      backgroundSize: `${g.width}px ${g.height}px`,
      backgroundPosition: `${g.left - rect.left}px ${g.top - rect.top}px`,
      backgroundRepeat: 'no-repeat',
    })
    if (this.shade) this.shade.style.background = `rgba(0,0,0,${rect.maskOpacity})`
  }

  private applySceneFrame(rect: ProjectedFocusRect, g: SceneGeometry): void {
    this.applyBackdropFrame(g)
    this.applyFocusFrame(rect, g)
    this.applyMarkerFrame(g)
  }

  private applyMarkerFrame(g: SceneGeometry): void {
    for (const { element, item } of this.markerById.values()) {
      element.style.left = `${g.left + item.marker.x * g.width - 10.5}px`
      element.style.top = `${g.top + item.marker.y * g.height - 10.5}px`
    }
  }

  private resetFocusAnimation(): void {
    if (this.focusAnimationFrame !== null) cancelAnimationFrame(this.focusAnimationFrame)
    this.focusAnimationFrame = null
    this.displayedFocusRect = null
    this.displayedGeometry = null
  }
  private renderMarkers(
    items: CatalogItemEntry[],
    activeId: string | null,
    g: SceneGeometry,
  ): void {
    if (!this.markerLayer) return
    this.markerLayer.innerHTML = ''
    this.markerById.clear()
    for (const item of items) {
      const active = item.id === activeId
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.testid = `catalog-marker-${item.id}`
      b.dataset.active = active ? 'true' : 'false'
      const x = g.left + item.marker.x * g.width
      const y = g.top + item.marker.y * g.height
      Object.assign(b.style, {
        appearance: 'none',
        position: 'absolute',
        left: `${x - 10.5}px`,
        top: `${y - 10.5}px`,
        width: '21px',
        height: '21px',
        minWidth: '21px',
        minHeight: '21px',
        padding: '0',
        boxSizing: 'border-box',
        borderRadius: '999px',
        border: active ? '0.5px solid #ff2436' : '0.5px solid rgba(255,255,255,.96)',
        background: active ? 'rgba(255,36,54,.1)' : 'rgba(255,255,255,.1)',
        boxShadow: 'none',
        cursor: 'pointer',
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 220ms ease,border-color 220ms ease,transform 220ms ease',
        transform: active ? 'scale(1.04)' : 'scale(1)',
      })
      const dot = document.createElement('span')
      Object.assign(dot.style, {
        display: 'block',
        width: active ? '11px' : '9px',
        height: active ? '11px' : '9px',
        minWidth: active ? '11px' : '9px',
        minHeight: active ? '11px' : '9px',
        flex: '0 0 auto',
        aspectRatio: '1 / 1',
        boxSizing: 'border-box',
        margin: 'auto',
        borderRadius: '999px',
        background: active ? '#ff2436' : '#fff',
        border: active ? '1px solid #fff' : '0',
        transition: 'width 220ms ease,height 220ms ease,background 220ms ease,border 220ms ease',
      })
      b.appendChild(dot)
      b.addEventListener('click', () => this.selectItem(item.id))
      if (this.editor) this.bindMarkerDrag(b, item)
      this.markerLayer.appendChild(b)
      this.markerById.set(item.id, { element: b, item })
    }
  }
  private renderDetailList(items: CatalogItemEntry[], activeId: string | null): void {
    if (!this.detailList) return
    this.detailList.innerHTML = ''
    this.detailById.clear()
    this.previewItemId = null
    this.detailTopSpacer = document.createElement('div')
    this.detailBottomSpacer = document.createElement('div')
    this.detailTopSpacer.setAttribute('aria-hidden', 'true')
    this.detailBottomSpacer.setAttribute('aria-hidden', 'true')
    Object.assign(this.detailTopSpacer.style, { width: '100%', pointerEvents: 'none' })
    Object.assign(this.detailBottomSpacer.style, { width: '100%', pointerEvents: 'none' })
    this.detailList.appendChild(this.detailTopSpacer)
    for (const item of items) {
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.testid = `catalog-detail-${item.id}`
      b.dataset.itemId = item.id
      Object.assign(b.style, {
        display: 'block',
        width: '100%',
        padding: '0 0 10px',
        marginBottom: '10px',
        border: '0',
        borderTop: '1px solid rgba(255,255,255,.4)',
        background: 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
      })
      const title = document.createElement('div')
      title.dataset.role = 'title'
      title.textContent = item.title
      Object.assign(title.style, {
        marginTop: '10px',
        fontSize: '14px',
        lineHeight: '20px',
        textShadow: '0 1px 4px rgba(0,0,0,.4)',
      })
      const body = document.createElement('div')
      body.dataset.role = 'body'
      body.textContent = item.description
      Object.assign(body.style, {
        marginTop: '10px',
        fontSize: '12px',
        lineHeight: '18px',
        textShadow: '0 1px 4px rgba(0,0,0,.32)',
      })
      b.appendChild(title)
      b.appendChild(body)
      b.addEventListener('click', () => {
        if (this.ignoreListClick) {
          this.ignoreListClick = false
          return
        }
        this.selectItem(item.id)
      })
      this.detailList.appendChild(b)
      this.detailById.set(item.id, b)
    }
    this.detailList.appendChild(this.detailBottomSpacer)
    this.syncDetailSelection(activeId)
    this.updateDetailEdgeSpacers()
    if (activeId) this.centerDetailItem(activeId, 'smooth')
  }
  private renderConnector(item: CatalogItemEntry | null, g: SceneGeometry): void {
    if (!item) {
      if (this.connector) this.connector.style.display = 'none'
      return
    }
    const target = projectRect(item.focusRect, g)
    const r = this.displayedFocusRect ?? { ...target, radius: 0, maskOpacity: 0 }
    this.renderConnectorFromRect(item, r)
  }
  private renderConnectorFromRect(item: CatalogItemEntry, r: ProjectedFocusRect): void {
    if (!this.connector) return
    const detail = this.detailById.get(item.id)
    if (!detail) {
      this.connector.style.display = 'none'
      return
    }
    const rootBounds = this.root.getBoundingClientRect()
    const detailBounds = detail.getBoundingClientRect()
    if (!rootBounds.width || !detailBounds.width) {
      this.connector.style.display = 'none'
      return
    }
    const canvasWidth = Number(this.root.clientWidth) || rootBounds.width
    const canvasHeight = Number(this.root.clientHeight) || rootBounds.height
    const sx = canvasWidth / rootBounds.width
    const sy = canvasHeight / rootBounds.height
    const radius = Math.max(Math.min(r.radius, r.width / 2, r.height / 2), 0)
    const connectorPadding = 1.5
    const cornerRatio = Math.SQRT1_2
    const cornerBaseX =
      radius > 0 ? r.left + r.width - radius + radius * cornerRatio : r.left + r.width
    const cornerBaseY = radius > 0 ? r.top + radius - radius * cornerRatio : r.top
    const x1 = cornerBaseX + connectorPadding
    const y1 = cornerBaseY - connectorPadding
    const x2 = (detailBounds.left - rootBounds.left) * sx
    const y2 = (detailBounds.top - rootBounds.top) * sy
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy)
    if (length < 2) {
      this.connector.style.display = 'none'
      return
    }
    Object.assign(this.connector.style, {
      display: 'block',
      left: `${x1}px`,
      top: `${y1}px`,
      width: `${length}px`,
      transform: `rotate(${Math.atan2(dy, dx)}rad)`,
    })
  }
  private handleDetailScroll(): void {
    const active = this.activeItem()
    if (active && this.displayedFocusRect)
      this.renderConnectorFromRect(active, this.displayedFocusRect)
    if (!this.listDragState?.moved) return
    const nearest = this.resolveNearestDetailItem()
    this.previewItemId = nearest
    this.syncDetailSelection(active?.id ?? null)
  }
  private handleDetailPointerDown(event: PointerEvent): void {
    if (!this.detailList || (event.pointerType === 'mouse' && event.button !== 0)) return
    this.listDragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: this.detailList.scrollTop,
      moved: false,
    }
    this.detailList.style.cursor = 'grabbing'
    this.detailList.setPointerCapture?.(event.pointerId)
  }
  private handleDetailPointerMove(event: PointerEvent): void {
    if (!this.detailList || !this.listDragState || this.listDragState.pointerId !== event.pointerId)
      return
    const deltaY = event.clientY - this.listDragState.startY
    if (Math.abs(deltaY) > 3) {
      this.listDragState.moved = true
      this.ignoreListClick = true
    }
    this.detailList.scrollTop = this.listDragState.startScrollTop - deltaY
    if (event.cancelable) event.preventDefault()
  }
  private handleDetailPointerUp(event: PointerEvent): void {
    if (!this.detailList || !this.listDragState || this.listDragState.pointerId !== event.pointerId)
      return
    const moved = this.listDragState.moved
    this.listDragState = null
    this.detailList.style.cursor = 'grab'
    try {
      this.detailList.releasePointerCapture?.(event.pointerId)
    } catch {
      /* capture may already be released */
    }
    if (!moved) {
      this.previewItemId = null
      this.syncDetailSelection(this.activeItem()?.id ?? null)
      return
    }
    const nearest = this.resolveNearestDetailItem()
    if (nearest) this.selectItem(nearest)
    setTimeout(() => {
      this.ignoreListClick = false
    }, 0)
  }
  private syncDetailSelection(activeId: string | null): void {
    for (const [itemId, element] of this.detailById) {
      const active = itemId === activeId
      const preview = itemId === this.previewItemId && !active
      element.dataset.active = active ? 'true' : 'false'
      element.dataset.preview = preview ? 'true' : 'false'
      const title = element.children[0] as HTMLElement | undefined
      const body = element.children[1] as HTMLElement | undefined
      if (title)
        Object.assign(title.style, {
          color: active ? '#fff' : preview ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.6)',
          fontWeight: active || preview ? '600' : '500',
        })
      if (body)
        Object.assign(body.style, {
          color: active
            ? 'rgba(255,255,255,.92)'
            : preview
              ? 'rgba(255,255,255,.72)'
              : 'rgba(255,255,255,.5)',
          fontWeight: active ? '500' : '400',
        })
      element.style.borderTopColor = active
        ? 'rgba(255,255,255,.84)'
        : preview
          ? 'rgba(255,255,255,.72)'
          : 'rgba(255,255,255,.4)'
    }
  }
  private updateDetailEdgeSpacers(): void {
    if (
      !this.detailList ||
      !this.detailTopSpacer ||
      !this.detailBottomSpacer ||
      this.detailById.size === 0
    )
      return
    const entries = [...this.detailById.values()]
    const viewportHeight =
      Number(this.detailList.clientHeight) || this.detailList.getBoundingClientRect().height
    const firstHeight = entries[0].getBoundingClientRect().height
    const lastHeight = entries[entries.length - 1].getBoundingClientRect().height
    this.detailTopSpacer.style.height = `${Math.max((viewportHeight - firstHeight) / 2, 0)}px`
    this.detailBottomSpacer.style.height = `${Math.max((viewportHeight - lastHeight) / 2, 0)}px`
  }
  private centerDetailItem(itemId: string, behavior: ScrollBehavior): void {
    if (!this.detailList || !this.detailById.has(itemId)) return
    if (this.listCenterFrame !== null) cancelAnimationFrame(this.listCenterFrame)
    this.listCenterFrame = requestAnimationFrame(() => {
      this.listCenterFrame = null
      if (!this.detailList) return
      this.updateDetailEdgeSpacers()
      const item = this.detailById.get(itemId)
      if (!item) return
      const listRect = this.detailList.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()
      const next =
        this.detailList.scrollTop +
        itemRect.top +
        itemRect.height / 2 -
        (listRect.top + listRect.height / 2)
      const max = Math.max(
        (Number(this.detailList.scrollHeight) || 0) -
          (Number(this.detailList.clientHeight) || listRect.height),
        0,
      )
      const top = clamp(next, 0, max)
      if (typeof this.detailList.scrollTo === 'function')
        this.detailList.scrollTo({ top, behavior })
      else this.detailList.scrollTop = top
    })
  }
  private resolveNearestDetailItem(): string | null {
    if (!this.detailList) return null
    const listRect = this.detailList.getBoundingClientRect()
    const center = listRect.top + listRect.height / 2
    let nearest: string | null = null
    let distance = Number.POSITIVE_INFINITY
    for (const [itemId, element] of this.detailById) {
      const rect = element.getBoundingClientRect()
      const current = Math.abs(rect.top + rect.height / 2 - center)
      if (current < distance) {
        distance = current
        nearest = itemId
      }
    }
    return nearest
  }
  private mountEditorControls(): void {
    if (!this.focusWindow || !this.original) return
    this.focusWindow.style.outline = '1px dashed rgba(255,255,255,.9)'
    this.focusWindow.style.outlineOffset = '2px'
    this.focusWindow.style.cursor = 'move'
    this.focusWindow.addEventListener('pointerdown', e => {
      if (!(e.target instanceof HTMLElement) || e.target.dataset.catalogResize) return
      const item = this.activeItem()
      if (!item) return
      e.preventDefault()
      this.dragFocus(item, e, 'move')
    })
    for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
      const h = document.createElement('span')
      h.dataset.catalogResize = corner
      Object.assign(h.style, resizeHandleStyle(corner))
      h.addEventListener('pointerdown', e => {
        const item = this.activeItem()
        if (!item) return
        e.preventDefault()
        e.stopPropagation()
        this.dragFocus(item, e, corner)
      })
      this.focusWindow.appendChild(h)
    }
    this.cameraCenter = document.createElement('div')
    this.cameraCenter.dataset.testid = 'catalog-camera-center'
    Object.assign(this.cameraCenter.style, {
      position: 'absolute',
      zIndex: '4',
      left: 'calc(50% - 10px)',
      top: 'calc(50% - 10px)',
      width: '20px',
      height: '20px',
      borderRadius: '999px',
      border: '1px solid #60a5fa',
      boxShadow: '0 0 0 4px rgba(37,99,235,.22)',
      pointerEvents: 'none',
    })
    this.root.appendChild(this.cameraCenter)
    this.original.addEventListener('pointerdown', e => {
      if (e.button !== 0) return
      e.preventDefault()
      this.dragViewport(e)
    })
  }
  private dragViewport(event: PointerEvent): void {
    const target = this.viewportTarget()
    if (!target || !this.editor) return
    const start = this.pointer(event)
    const initial = { ...target.viewport }
    const g = this.geometry(initial)
    this.bindDocumentDrag(move => {
      const p = this.pointer(move)
      this.editor?.onViewportChange(
        target.kind === 'item'
          ? { kind: 'item', itemId: target.itemId }
          : { kind: 'category', categoryId: target.categoryId },
        {
          ...initial,
          centerX: clamp01(initial.centerX - (p.x - start.x) / g.width),
          centerY: clamp01(initial.centerY - (p.y - start.y) / g.height),
        },
      )
    })
  }
  private bindMarkerDrag(marker: HTMLElement, item: CatalogItemEntry): void {
    marker.addEventListener('pointerdown', e => {
      if (!this.editor) return
      e.preventDefault()
      e.stopPropagation()
      const g = this.currentGeometry()
      this.bindDocumentDrag(move => {
        const p = this.pointer(move)
        this.editor?.onMarkerChange(item.id, {
          x: clamp01((p.x - g.left) / g.width),
          y: clamp01((p.y - g.top) / g.height),
        })
      })
    })
  }
  private dragFocus(
    item: CatalogItemEntry,
    event: PointerEvent,
    mode: 'move' | 'nw' | 'ne' | 'se' | 'sw',
  ): void {
    const g = this.currentGeometry()
    const start = this.sourcePoint(event, g)
    const initial = { ...item.focusRect }
    this.bindDocumentDrag(move => {
      const p = this.sourcePoint(move, g)
      this.editor?.onFocusRectChange(
        item.id,
        resizeRect(initial, p.x - start.x, p.y - start.y, mode),
      )
    })
  }
  private bindDocumentDrag(onMove: (event: PointerEvent) => void): void {
    const target = document
    const finish = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', finish)
      target.removeEventListener('pointercancel', finish)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', finish)
    target.addEventListener('pointercancel', finish)
  }
  private pointer(event: PointerEvent): { x: number; y: number } {
    const b = this.root.getBoundingClientRect()
    const w = Number((this.root as HTMLElement).clientWidth) || b.width || 1
    const h = Number((this.root as HTMLElement).clientHeight) || b.height || 1
    return {
      x: ((event.clientX - b.left) / Math.max(b.width, 1)) * w,
      y: ((event.clientY - b.top) / Math.max(b.height, 1)) * h,
    }
  }
  private sourcePoint(event: PointerEvent, g: SceneGeometry): { x: number; y: number } {
    const p = this.pointer(event)
    return { x: clamp01((p.x - g.left) / g.width), y: clamp01((p.y - g.top) / g.height) }
  }
  private currentGeometry(): SceneGeometry {
    const c = this.currentCategory()
    const i = this.activeItem()
    return this.geometry(
      i?.viewportOverride ?? c?.viewport ?? { centerX: 0.5, centerY: 0.5, zoom: 1 },
    )
  }
  private viewportTarget():
    | { kind: 'category'; categoryId: string; viewport: Viewport }
    | { kind: 'item'; itemId: string; viewport: Viewport }
    | null {
    const category = this.currentCategory()
    const item = this.activeItem()
    if (item?.viewportOverride)
      return { kind: 'item', itemId: item.id, viewport: item.viewportOverride }
    if (category) return { kind: 'category', categoryId: category.id, viewport: category.viewport }
    return null
  }
  private getStage(): CatalogStageEntry | null {
    return this.manifest.stages.find(s => s.key === this.selection.stageKey) ?? null
  }
  private currentCategory(): CatalogCategoryEntry | null {
    return this.getStage()?.categories.find(c => c.id === this.selection.categoryId) ?? null
  }
  private findStageByCategory(categoryId: string): CatalogStageEntry | null {
    return this.manifest.stages.find(s => s.categories.some(c => c.id === categoryId)) ?? null
  }
  private itemById(itemId: string): CatalogItemEntry | null {
    return this.manifest.items.find(i => i.id === itemId) ?? null
  }
  private activeItem(): CatalogItemEntry | null {
    return this.selection.itemId ? this.itemById(this.selection.itemId) : null
  }
}

function imageLayer(url: string, testid: string): HTMLElement {
  const el = document.createElement('div')
  el.dataset.testid = testid
  Object.assign(el.style, {
    position: 'absolute',
    zIndex: '0',
    backgroundImage: `url("${url}")`,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0 0',
  })
  return el
}
function projectRect(
  r: CatalogItemEntry['focusRect'],
  g: SceneGeometry,
): { left: number; top: number; width: number; height: number } {
  return {
    left: g.left + r.x * g.width,
    top: g.top + r.y * g.height,
    width: r.width * g.width,
    height: r.height * g.height,
  }
}
function orderedItems(
  manifest: CatalogManifest,
  category: CatalogCategoryEntry,
): CatalogItemEntry[] {
  const map = new Map(manifest.items.map(i => [i.id, i]))
  return category.itemIds
    .map(id => map.get(id))
    .filter((item): item is CatalogItemEntry => Boolean(item))
}
function resolveSelection(
  manifest: CatalogManifest,
  requested: Partial<CatalogSceneSelection> = {},
): CatalogSceneSelection {
  const stage =
    manifest.stages.find(s => s.key === requested.stageKey) ??
    manifest.stages.find(s => s.categories.length > 0) ??
    manifest.stages[0]
  const category =
    stage?.categories.find(c => c.id === requested.categoryId) ??
    [...(stage?.categories ?? [])].sort((a, b) => a.order - b.order)[0] ??
    null
  const items = category ? orderedItems(manifest, category) : []
  const item = items.find(i => i.id === requested.itemId) ?? items[0] ?? null
  return {
    stageKey: stage?.key ?? 'upstream',
    categoryId: category?.id ?? null,
    itemId: item?.id ?? null,
  }
}
function resizeHandleStyle(corner: 'nw' | 'ne' | 'se' | 'sw'): Record<string, string> {
  return {
    position: 'absolute',
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    background: '#fff',
    border: '2px solid #2563eb',
    cursor: `${corner}-resize`,
    ...(corner.includes('n') ? { top: '-5px' } : { bottom: '-5px' }),
    ...(corner.includes('w') ? { left: '-5px' } : { right: '-5px' }),
  }
}
function resizeRect(
  rect: CatalogItemEntry['focusRect'],
  dx: number,
  dy: number,
  mode: 'move' | 'nw' | 'ne' | 'se' | 'sw',
): CatalogItemEntry['focusRect'] {
  const min = 0.03
  let { x, y, width, height } = rect
  if (mode === 'move') {
    x += dx
    y += dy
  } else {
    if (mode.includes('w')) {
      x += dx
      width -= dx
    }
    if (mode.includes('e')) width += dx
    if (mode.includes('n')) {
      y += dy
      height -= dy
    }
    if (mode.includes('s')) height += dy
  }
  width = Math.max(min, Math.min(width, 1))
  height = Math.max(min, Math.min(height, 1))
  x = Math.min(Math.max(x, 0), 1 - width)
  y = Math.min(Math.max(y, 0), 1 - height)
  return { ...rect, x, y, width, height }
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3)
}
function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}
function interpolateFocusRect(
  from: ProjectedFocusRect,
  to: ProjectedFocusRect,
  progress: number,
): ProjectedFocusRect {
  return {
    left: lerp(from.left, to.left, progress),
    top: lerp(from.top, to.top, progress),
    width: lerp(from.width, to.width, progress),
    height: lerp(from.height, to.height, progress),
    radius: lerp(from.radius, to.radius, progress),
    maskOpacity: lerp(from.maskOpacity, to.maskOpacity, progress),
  }
}
function interpolateGeometry(
  from: SceneGeometry,
  to: SceneGeometry,
  progress: number,
): SceneGeometry {
  return {
    left: lerp(from.left, to.left, progress),
    top: lerp(from.top, to.top, progress),
    width: lerp(from.width, to.width, progress),
    height: lerp(from.height, to.height, progress),
    canvasWidth: to.canvasWidth,
    canvasHeight: to.canvasHeight,
  }
}
function projectedFocusEqual(left: ProjectedFocusRect, right: ProjectedFocusRect): boolean {
  return (
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5 &&
    Math.abs(left.radius - right.radius) < 0.25 &&
    Math.abs(left.maskOpacity - right.maskOpacity) < 0.01
  )
}
function geometryEqual(left: SceneGeometry, right: SceneGeometry): boolean {
  return (
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  )
}
