import type { AtlasCategoryEntry, AtlasItemEntry } from '../contract/atlas-manifest.js'
import type { PanoramaProjection } from './panorama-projection.js'
import { projectNormalizedPoint } from './panorama-projection.js'
import {
  ATLAS_CALLOUT_GAP_PX,
  ATLAS_HOTSPOT_MIN_WIDTH_PX,
  ATLAS_MARKER_ANIMATION,
  ATLAS_MARKER_SIZE_PX,
  getAtlasChipStyle,
  getAtlasMarkerSvg,
} from './atlas-visual-tokens.js'

interface MarkerRendererOptions {
  onCategoryClick?: (categoryId: string) => void
}

export class MarkerRenderer {
  private readonly host: HTMLElement
  private readonly categories = new Map<string, AtlasCategoryEntry>()
  private readonly items = new Map<string, AtlasItemEntry>()
  private readonly categoryEls = new Map<string, HTMLElement>()
  private readonly itemEls = new Map<string, HTMLElement>()
  private readonly variant: 'default' | 'highlight' | 'minimal'
  private readonly onCategoryClick?: (categoryId: string) => void
  private projection: PanoramaProjection | null = null
  private currentZoom = 1
  private hotspotMinZoom: number | null = null
  private itemMarkerMinZoom: number | null = null
  private activeCategoryId: string | null = null
  private activeItemId: string | null = null
  private suppressedCategoryIds = new Set<string>()
  private suppressedItemIds = new Set<string>()

  constructor(
    host: HTMLElement,
    _bounds: { minZoom: number; maxZoom: number },
    variant: 'default' | 'highlight' | 'minimal',
    options: MarkerRendererOptions = {},
  ) {
    this.host = host
    this.variant = variant
    this.onCategoryClick = options.onCategoryClick
  }

  setProjection(projection: PanoramaProjection): void {
    this.projection = projection
    this.repositionAll()
  }

  setZoomThresholds(opts: { hotspotMinZoom?: number | null; itemMarkerMinZoom?: number | null }): void {
    this.hotspotMinZoom = opts.hotspotMinZoom ?? null
    this.itemMarkerMinZoom = opts.itemMarkerMinZoom ?? null
    this.recomputeVisibility()
  }

  setZoom(zoom: number): void {
    if (zoom === this.currentZoom) return
    this.currentZoom = zoom
    this.recomputeVisibility()
  }

  addCategory(cat: AtlasCategoryEntry): void {
    if (!cat.hotspot) return
    this.categories.set(cat.id, cat)
    const el = this.renderCategory(cat)
    this.categoryEls.set(cat.id, el)
    this.host.appendChild(el)
    this.recomputeVisibility()
    this.repositionCategory(cat.id)
  }

  addItem(item: AtlasItemEntry): void {
    this.items.set(item.id, item)
    const el = this.renderItem(item)
    this.itemEls.set(item.id, el)
    this.host.appendChild(el)
    this.updateItemState(item.id)
    this.recomputeVisibility()
    this.repositionItem(item.id)
  }

  activate(categoryId: string | null): void {
    this.activeCategoryId = categoryId
    for (const [id] of this.categoryEls) this.updateCategoryState(id)
  }

  activateItem(itemId: string | null): void {
    this.activeItemId = itemId
    for (const [id] of this.itemEls) this.updateItemState(id)
  }

  suppressCategories(categoryIds: Iterable<string>): void {
    this.suppressedCategoryIds = new Set(categoryIds)
    this.recomputeVisibility()
  }

  suppressItems(itemIds: Iterable<string>): void {
    this.suppressedItemIds = new Set(itemIds)
    this.recomputeVisibility()
  }

  private recomputeVisibility(): void {
    for (const [id, el] of this.categoryEls) {
      const cat = this.categories.get(id)
      const min = cat?.hotspotMinZoom ?? this.hotspotMinZoom
      const visible = !this.suppressedCategoryIds.has(id) && (min === null || this.currentZoom >= min)
      el.style.display = visible ? 'flex' : 'none'
    }
    for (const [id, el] of this.itemEls) {
      const item = this.items.get(id)
      const min = item?.markerMinZoom ?? this.itemMarkerMinZoom
      const visible = !this.suppressedItemIds.has(id) && (min === null || this.currentZoom >= min)
      el.style.display = visible ? '' : 'none'
    }
  }

  private repositionAll(): void {
    for (const [id] of this.categoryEls) this.repositionCategory(id)
    for (const [id] of this.itemEls) this.repositionItem(id)
  }

  private repositionCategory(categoryId: string): void {
    if (!this.projection) return
    const cat = this.categories.get(categoryId)
    const el = this.categoryEls.get(categoryId)
    if (!cat?.hotspot || !el) return
    const screen = projectNormalizedPoint(cat.hotspot, this.projection)
    el.style.left = `${screen.x}px`
    el.style.top = `${screen.y}px`
  }

  private repositionItem(itemId: string): void {
    if (!this.projection) return
    const item = this.items.get(itemId)
    const el = this.itemEls.get(itemId)
    if (!item || !el) return
    const screen = projectNormalizedPoint(item.marker, this.projection)
    el.style.left = `${screen.x}px`
    el.style.top = `${screen.y}px`
  }

  private renderCategory(cat: AtlasCategoryEntry): HTMLElement {
    const root = document.createElement('div')
    root.className = 'atlas-hotspot-root'
    root.dataset.testid = `atlas-hotspot-${cat.id}`
    root.dataset.categoryId = cat.id
    root.style.position = 'absolute'
    root.style.transform = 'translate(-50%, -50%)'
    root.style.display = 'flex'
    root.style.flexDirection = 'column'
    root.style.alignItems = 'center'
    root.style.gap = `${ATLAS_CALLOUT_GAP_PX}px`
    root.style.zIndex = '12'
    root.style.pointerEvents = 'none'

    const markerBtn = document.createElement('button')
    markerBtn.type = 'button'
    markerBtn.dataset.atlasInteractive = 'true'
    markerBtn.dataset.role = 'marker'
    markerBtn.setAttribute('aria-label', cat.title)
    markerBtn.style.width = `${ATLAS_MARKER_SIZE_PX}px`
    markerBtn.style.height = `${ATLAS_MARKER_SIZE_PX}px`
    markerBtn.style.padding = '0'
    markerBtn.style.border = 'none'
    markerBtn.style.background = 'transparent'
    markerBtn.style.cursor = 'pointer'
    markerBtn.style.pointerEvents = 'auto'
    markerBtn.style.animation = this.variant === 'minimal' ? '' : ATLAS_MARKER_ANIMATION
    markerBtn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.onCategoryClick?.(cat.id)
    })

    const chipBtn = document.createElement('button')
    chipBtn.type = 'button'
    chipBtn.dataset.atlasInteractive = 'true'
    chipBtn.dataset.role = 'chip'
    chipBtn.textContent = cat.title
    chipBtn.style.display = 'inline-flex'
    chipBtn.style.alignItems = 'center'
    chipBtn.style.justifyContent = 'center'
    chipBtn.style.whiteSpace = 'nowrap'
    chipBtn.style.pointerEvents = 'auto'
    chipBtn.style.cursor = 'pointer'
    chipBtn.style.outline = 'none'
    chipBtn.style.border = 'none'
    chipBtn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.onCategoryClick?.(cat.id)
    })

    root.appendChild(markerBtn)
    root.appendChild(chipBtn)
    this.applyCategoryState(root, cat.id)
    return root
  }

  private renderItem(item: AtlasItemEntry): HTMLElement {
    const root = document.createElement('div')
    root.className = 'atlas-item-marker'
    root.dataset.testid = `atlas-item-${item.id}`
    root.dataset.itemId = item.id
    root.style.position = 'absolute'
    root.style.transform = 'translate(-50%, -50%)'
    root.style.pointerEvents = 'none'
    root.style.zIndex = '8'

    const marker = document.createElement('span')
    marker.setAttribute('aria-hidden', 'true')
    marker.style.display = 'inline-flex'
    marker.style.width = `${ATLAS_MARKER_SIZE_PX}px`
    marker.style.height = `${ATLAS_MARKER_SIZE_PX}px`
    marker.style.animation = this.variant === 'minimal' ? '' : ATLAS_MARKER_ANIMATION
    root.appendChild(marker)
    return root
  }

  private updateCategoryState(categoryId: string): void {
    const root = this.categoryEls.get(categoryId)
    if (!root) return
    this.applyCategoryState(root, categoryId)
  }

  private applyCategoryState(root: HTMLElement, categoryId: string): void {
    const marker = root.children[0] as HTMLButtonElement | undefined
    const chip = root.children[1] as HTMLButtonElement | undefined
    const active = categoryId === this.activeCategoryId
    root.dataset.active = active ? 'true' : 'false'
    if (marker) marker.innerHTML = getAtlasMarkerSvg(active)
    if (!chip) return
    Object.assign(chip.style, getAtlasChipStyle(active, ATLAS_HOTSPOT_MIN_WIDTH_PX))
    chip.style.maxWidth = 'none'
    chip.style.overflow = 'visible'
    chip.style.textOverflow = 'clip'
  }

  private updateItemState(itemId: string): void {
    const root = this.itemEls.get(itemId)
    if (!root) return
    const marker = root.children[0] as HTMLElement | undefined
    if (!marker) return
    const active = itemId === this.activeItemId
    root.dataset.active = active ? 'true' : 'false'
    marker.innerHTML = getAtlasMarkerSvg(active)
  }
}
