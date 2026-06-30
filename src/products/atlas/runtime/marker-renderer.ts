/**
 * MarkerRenderer — renders category hotspots and item markers as DOM
 * elements, not as inline CSS strings (the legacy hotspot-render path
 * is explicitly forbidden).
 *
 * Style is driven by `theme.hotspotVariant`:
 *   - default: filled circle with white border
 *   - highlight: filled circle with pulsing animation
 *   - minimal: hollow circle
 */
import type { AtlasCategoryEntry, AtlasItemEntry } from '../contract/atlas-manifest.js'
import type { CameraBounds } from './camera.js'

export class MarkerRenderer {
  private readonly host: HTMLElement
  private readonly categories = new Map<string, AtlasCategoryEntry>()
  private readonly items = new Map<string, AtlasItemEntry>()
  private readonly categoryEls = new Map<string, HTMLElement>()
  private readonly itemEls = new Map<string, HTMLElement>()
  private readonly variant: 'default' | 'highlight' | 'minimal'
  private readonly bounds: CameraBounds

  constructor(host: HTMLElement, bounds: CameraBounds, variant: 'default' | 'highlight' | 'minimal') {
    this.host = host
    this.bounds = bounds
    this.variant = variant
  }

  addCategory(cat: AtlasCategoryEntry): void {
    if (!cat.hotspot) return
    this.categories.set(cat.id, cat)
    const el = this.renderCategory(cat)
    this.categoryEls.set(cat.id, el)
    this.host.appendChild(el)
  }

  addItem(item: AtlasItemEntry): void {
    this.items.set(item.id, item)
    const el = this.renderItem(item)
    this.itemEls.set(item.id, el)
    this.host.appendChild(el)
  }

  /** Highlight a category (e.g. after a click or programmatic focus). */
  activate(categoryId: string): void {
    for (const [id, el] of this.categoryEls) {
      if (id === categoryId) el.dataset.active = 'true'
      else delete el.dataset.active
    }
  }

  private renderCategory(cat: AtlasCategoryEntry): HTMLElement {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `atlas-hotspot atlas-hotspot--${this.variant}`
    el.dataset.testid = `atlas-hotspot-${cat.id}`
    el.dataset.categoryId = cat.id
    el.style.position = 'absolute'
    el.style.transform = 'translate(-50%, -50%)'
    el.style.left = `${cat.hotspot!.x * 100}%`
    el.style.top = `${cat.hotspot!.y * 100}%`
    el.style.width = '24px'
    el.style.height = '24px'
    el.style.borderRadius = '50%'
    el.style.border = '2px solid #fff'
    el.style.background =
      this.variant === 'minimal' ? 'transparent' : 'rgba(245, 158, 11, 0.9)'
    el.style.cursor = 'pointer'
    el.setAttribute('aria-label', cat.title)
    if (this.variant === 'highlight') {
      el.style.animation = 'atlas-hotspot-pulse 2s ease-out infinite'
    }
    return el
  }

  private renderItem(item: AtlasItemEntry): HTMLElement {
    const el = document.createElement('div')
    el.className = 'atlas-item-marker'
    el.dataset.testid = `atlas-item-${item.id}`
    el.dataset.itemId = item.id
    el.style.position = 'absolute'
    el.style.transform = 'translate(-50%, -50%)'
    el.style.left = `${item.marker.x * 100}%`
    el.style.top = `${item.marker.y * 100}%`
    el.style.width = '12px'
    el.style.height = '12px'
    el.style.borderRadius = '50%'
    el.style.background = '#3b82f6'
    el.style.opacity = '0.7'
    el.style.pointerEvents = 'none'
    el.setAttribute('aria-hidden', 'true')
    void this.bounds // suppress unused
    return el
  }
}