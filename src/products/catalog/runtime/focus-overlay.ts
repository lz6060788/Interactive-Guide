/**
 * FocusOverlay — renders a focusRect on top of the panorama image when
 * an item is selected. The overlay is normalized to [0,1] coordinates
 * so it works on any rendered size of the panorama.
 */
import type { CatalogItemEntry } from '../contract/catalog-manifest.js'

interface RectInternal {
  el: HTMLElement
  rect: CatalogItemEntry['focusRect']
}

export class FocusOverlay {
  private readonly container: HTMLElement
  private readonly variant: 'rect' | 'pill'
  private readonly items = new Map<string, RectInternal>()

  constructor(container: HTMLElement, variant: 'rect' | 'pill') {
    this.container = container
    this.variant = variant
  }

  addItem(item: CatalogItemEntry): void {
    if (this.items.has(item.id)) return
    const el = document.createElement('div')
    el.className = 'catalog-focus'
    el.dataset.testid = `catalog-focus-${item.id}`
    el.style.position = 'absolute'
    el.style.border = '2px solid rgba(37, 99, 235, 0.0)'
    el.style.transition = 'opacity 0.35s ease, border-color 0.35s ease'
    el.style.pointerEvents = 'none'
    el.style.opacity = '0'

    const r = item.focusRect
    el.style.left = `${r.x * 100}%`
    el.style.top = `${r.y * 100}%`
    el.style.width = `${r.width * 100}%`
    el.style.height = `${r.height * 100}%`
    if (this.variant === 'pill' && r.radius !== undefined) {
      el.style.borderRadius = `${r.radius * 100}%`
    } else {
      el.style.borderRadius = '6px'
    }

    this.container.appendChild(el)
    this.items.set(item.id, { el, rect: r })
  }

  flash(itemId: string): void {
    for (const [id, { el }] of this.items) {
      if (id === itemId) {
        const opacity = el.dataset['opacity'] ?? '0.45'
        el.style.borderColor = `rgba(37, 99, 235, ${opacity})`
        el.style.boxShadow = `0 0 0 ${Number(el.dataset['mask'] ?? '0.0') * 100}% rgba(37, 99, 235, 0.1)`
        el.style.opacity = '1'
      } else {
        el.style.opacity = '0'
        el.style.borderColor = 'rgba(37, 99, 235, 0)'
      }
    }
  }

  clear(): void {
    for (const { el } of this.items.values()) {
      el.style.opacity = '0'
      el.style.borderColor = 'rgba(37, 99, 235, 0)'
    }
  }
}