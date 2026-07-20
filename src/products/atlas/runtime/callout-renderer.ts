import type { ResolvedAtlasItemEntry as AtlasItemEntry } from '../contract/atlas-manifest.js'
import type { PanoramaProjection } from './panorama-projection.js'
import { projectNormalizedPoint } from './panorama-projection.js'
import {
  ATLAS_CALLOUT_GAP_PX,
  ATLAS_ITEM_CHIP_MAX_WIDTH_PX,
  ATLAS_ITEM_CHIP_MIN_WIDTH_PX,
  ATLAS_MARKER_ANIMATION,
  ATLAS_MARKER_SIZE_PX,
  getAtlasChipStyle,
  getAtlasMarkerSvg,
} from './atlas-visual-tokens.js'

interface CalloutRendererOptions {
  onItemClick?: (itemId: string) => void
}

export class CalloutRenderer {
  private readonly host: HTMLElement
  private readonly variant: 'classic' | 'connector' | 'none'
  private readonly items = new Map<string, AtlasItemEntry>()
  private readonly els = new Map<string, HTMLElement>()
  private readonly onItemClick?: (itemId: string) => void
  private currentZoom = 1
  private calloutMinZoom: number | null = null
  private activeItemId: string | null = null
  private projection: PanoramaProjection | null = null

  constructor(
    host: HTMLElement,
    variant: 'classic' | 'connector' | 'none',
    options: CalloutRendererOptions = {},
  ) {
    this.host = host
    this.variant = variant
    this.onItemClick = options.onItemClick
  }

  setProjection(projection: PanoramaProjection): void {
    this.projection = projection
    this.repositionAll()
  }

  setZoomThresholds(opts: { calloutMinZoom?: number | null }): void {
    this.calloutMinZoom = opts.calloutMinZoom ?? null
    this.recomputeVisibility()
  }

  setZoom(zoom: number): void {
    if (zoom === this.currentZoom) return
    this.currentZoom = zoom
    this.recomputeVisibility()
  }

  activate(itemId: string | null): void {
    this.activeItemId = itemId
    for (const [id] of this.els) this.updateState(id)
  }

  addItem(item: AtlasItemEntry): void {
    if (this.variant === 'none' || !item.callout) return
    this.items.set(item.id, item)
    const root = document.createElement('div')
    root.className = `atlas-item-callout-root atlas-item-callout-root--${this.variant}`
    root.dataset.testid = `atlas-callout-${item.id}`
    root.dataset.itemId = item.id
    root.style.position = 'absolute'
    root.style.transform = 'translate(-50%, -50%)'
    root.style.display = 'flex'
    root.style.flexDirection = 'column'
    root.style.alignItems = 'center'
    root.style.gap = `${item.callout.markerGapPx ?? ATLAS_CALLOUT_GAP_PX}px`
    root.style.pointerEvents = 'none'
    root.style.zIndex = '14'

    const marker = document.createElement('span')
    marker.setAttribute('aria-hidden', 'true')
    marker.style.display = 'inline-flex'
    marker.style.width = `${ATLAS_MARKER_SIZE_PX}px`
    marker.style.height = `${ATLAS_MARKER_SIZE_PX}px`
    marker.style.animation = ATLAS_MARKER_ANIMATION

    const chip = document.createElement('button')
    chip.type = 'button'
    chip.textContent = item.title
    chip.dataset.atlasInteractive = 'true'
    chip.style.display = 'inline-flex'
    chip.style.alignItems = 'center'
    chip.style.justifyContent = 'center'
    chip.style.pointerEvents = 'auto'
    chip.style.cursor = 'pointer'
    chip.style.border = 'none'
    chip.style.outline = 'none'
    chip.style.whiteSpace = 'nowrap'
    chip.style.overflow = 'hidden'
    chip.style.textOverflow = 'ellipsis'
    chip.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.onItemClick?.(item.id)
    })

    if (item.callout.markerPosition === 'bottom') {
      root.appendChild(chip)
      root.appendChild(marker)
    } else {
      root.appendChild(marker)
      root.appendChild(chip)
    }

    this.els.set(item.id, root)
    this.host.appendChild(root)
    this.updateState(item.id)
    this.recomputeVisibility()
    this.repositionItem(item.id)
  }

  private recomputeVisibility(): void {
    for (const [id, el] of this.els) {
      const item = this.items.get(id)
      if (!item) continue
      const min = item.callout?.minZoom ?? this.calloutMinZoom
      const visible = min === null || this.currentZoom >= min
      el.style.display = visible ? 'flex' : 'none'
    }
  }

  private repositionAll(): void {
    for (const [id] of this.els) this.repositionItem(id)
  }

  private repositionItem(itemId: string): void {
    if (!this.projection) return
    const item = this.items.get(itemId)
    const el = this.els.get(itemId)
    if (!item || !el) return
    const screen = projectNormalizedPoint(item.marker, this.projection)
    el.style.left = `${screen.x}px`
    el.style.top = `${screen.y}px`
  }

  private updateState(itemId: string): void {
    const root = this.els.get(itemId)
    const item = this.items.get(itemId)
    if (!root || !item) return
    const children = Array.from(root.children) as HTMLElement[]
    const marker = children.find(child => child.tagName.toLowerCase() === 'span')
    const chip = children.find(child => child.tagName.toLowerCase() === 'button')
    const active = itemId === this.activeItemId
    root.dataset.active = active ? 'true' : 'false'
    if (marker) marker.innerHTML = getAtlasMarkerSvg(active)
    if (chip) {
      Object.assign(
        chip.style,
        getAtlasChipStyle(active, ATLAS_ITEM_CHIP_MIN_WIDTH_PX, ATLAS_ITEM_CHIP_MAX_WIDTH_PX),
      )
    }
  }
}
