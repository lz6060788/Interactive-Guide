/**
 * CalloutRenderer — renders optional callout lines from item markers
 * to dock positions (top/bottom/left/right of the panorama viewport).
 *
 * Style is driven by `theme.calloutVariant`:
 *   - line: simple straight line + small label
 *   - pill: rounded pill with the item title
 *   - none: no callout drawn
 */
import type { AtlasItemEntry } from '../contract/atlas-manifest.js'

export class CalloutRenderer {
  private readonly host: HTMLElement
  private readonly variant: 'line' | 'pill' | 'none'
  private readonly items: AtlasItemEntry[] = []
  private readonly els = new Map<string, HTMLElement>()

  constructor(host: HTMLElement, variant: 'line' | 'pill' | 'none') {
    this.host = host
    this.variant = variant
  }

  addItem(item: AtlasItemEntry): void {
    if (this.variant === 'none' || !item.callout) return
    this.items.push(item)
    const el = document.createElement('div')
    el.className = `atlas-callout atlas-callout--${this.variant}`
    el.dataset.testid = `atlas-callout-${item.id}`
    el.style.position = 'absolute'
    el.style.pointerEvents = 'none'
    el.dataset.itemId = item.id

    const label = document.createElement('span')
    label.textContent = item.title
    label.style.fontSize = '12px'
    label.style.color = '#1f2937'
    if (this.variant === 'pill') {
      label.style.padding = '2px 8px'
      label.style.background = '#fff'
      label.style.borderRadius = '999px'
      label.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)'
    }
    el.appendChild(label)
    this.els.set(item.id, el)
    this.position(el, item)
    this.host.appendChild(el)
  }

  private position(el: HTMLElement, item: AtlasItemEntry): void {
    if (!item.callout) return
    const dock = item.callout.dock
    const target = item.callout.target
    const mx = item.marker.x * 100
    const my = item.marker.y * 100
    const tx = target.x * 100
    const ty = target.y * 100
    // SVG line from marker to target, label centered along the path.
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    svg.style.position = 'absolute'
    svg.style.inset = '0'
    svg.style.pointerEvents = 'none'
    const line = document.createElementNS(svgNS, 'line')
    line.setAttribute('x1', `${mx}%`)
    line.setAttribute('y1', `${my}%`)
    line.setAttribute('x2', `${tx}%`)
    line.setAttribute('y2', `${ty}%`)
    line.setAttribute('stroke', 'rgba(245,158,11,0.6)')
    line.setAttribute('stroke-width', '1.5')
    svg.appendChild(line)
    el.appendChild(svg)
    // Label near dock edge
    el.style.left = `${tx}%`
    el.style.top = `${ty}%`
    if (dock === 'top') el.style.transform = 'translate(-50%, -100%)'
    else if (dock === 'bottom') el.style.transform = 'translate(-50%, 0)'
    else if (dock === 'left') el.style.transform = 'translate(-100%, -50%)'
    else el.style.transform = 'translate(0, -50%)'
  }
}