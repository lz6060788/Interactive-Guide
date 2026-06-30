/**
 * List — vertical three-stage renderer for CatalogRuntime.
 *
 * Renders stages (upstream/midstream/downstream) as collapsible groups,
 * with categories inside each stage and items inside each category.
 * Click on an item triggers the registered handler.
 */
import type { CatalogItemEntry, CatalogStageEntry } from '../contract/catalog-manifest.js'

export class List {
  private readonly container: HTMLElement
  private readonly density: 'compact' | 'comfortable'
  private readonly itemHandlers: Array<(itemId: string) => void> = []
  private readonly stageEls = new Map<string, HTMLElement>()
  private readonly categoryEls = new Map<string, HTMLElement>()
  private readonly itemEls = new Map<string, HTMLElement>()
  private readonly itemsById = new Map<string, CatalogItemEntry>()

  constructor(container: HTMLElement, density: 'compact' | 'comfortable') {
    this.container = container
    this.density = density
    this.container.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    this.container.style.color = '#111'
  }

  addStage(stage: CatalogStageEntry): void {
    const stageEl = document.createElement('section')
    stageEl.className = 'catalog-stage'
    stageEl.dataset.testid = `catalog-stage-${stage.key}`
    stageEl.style.borderBottom = '1px solid #e5e7eb'
    stageEl.style.padding = '12px 0'

    const header = document.createElement('h3')
    header.style.margin = '0 0 8px 0'
    header.style.fontSize = '14px'
    header.style.fontWeight = '600'
    header.style.color = '#374151'
    header.style.padding = '0 16px'
    header.textContent = `${stage.order}. ${stage.label}`
    stageEl.appendChild(header)

    const body = document.createElement('div')
    body.style.display = 'flex'
    body.style.flexDirection = 'column'
    stageEl.appendChild(body)

    for (const cat of [...stage.categories].sort((a, b) => a.order - b.order)) {
      const catEl = document.createElement('div')
      catEl.className = 'catalog-category'
      catEl.dataset.testid = `catalog-category-${cat.id}`
      catEl.style.padding = this.density === 'compact' ? '6px 16px' : '10px 16px'

      const catHeader = document.createElement('div')
      catHeader.style.fontSize = '13px'
      catHeader.style.fontWeight = '500'
      catHeader.style.color = '#1f2937'
      catHeader.style.marginBottom = '4px'
      catHeader.textContent = cat.title
      catEl.appendChild(catHeader)

      if (cat.description) {
        const desc = document.createElement('div')
        desc.style.fontSize = '12px'
        desc.style.color = '#6b7280'
        desc.style.marginBottom = '6px'
        desc.textContent = cat.description
        catEl.appendChild(desc)
      }

      const itemList = document.createElement('div')
      itemList.style.display = 'flex'
      itemList.style.flexDirection = 'column'
      itemList.style.gap = '2px'
      catEl.appendChild(itemList)

      for (const itemId of cat.itemIds) {
        const item = this.itemsById.get(itemId)
        if (!item) continue
        const itemEl = this.renderItem(item)
        itemList.appendChild(itemEl)
        this.itemEls.set(item.id, itemEl)
      }

      this.categoryEls.set(cat.id, catEl)
      body.appendChild(catEl)
    }

    this.stageEls.set(stage.key, stageEl)
    this.container.appendChild(stageEl)
  }

  activate(itemId: string): void {
    for (const [id, el] of this.itemEls) {
      if (id === itemId) {
        el.style.background = '#eff6ff'
        el.style.borderLeft = '3px solid #2563eb'
        el.style.paddingLeft = '13px'
      } else {
        el.style.background = ''
        el.style.borderLeft = ''
        el.style.paddingLeft = '16px'
      }
    }
  }

  onItemClick(handler: (itemId: string) => void): void {
    this.itemHandlers.push(handler)
  }

  registerItem(item: CatalogItemEntry): void {
    this.itemsById.set(item.id, item)
  }

  private renderItem(item: CatalogItemEntry): HTMLElement {
    const itemEl = document.createElement('div')
    itemEl.className = 'catalog-item'
    itemEl.dataset.testid = `catalog-item-${item.id}`
    itemEl.style.cursor = 'pointer'
    itemEl.style.padding = '8px 16px'
    itemEl.style.fontSize = '13px'
    itemEl.style.transition = 'background 0.15s ease'
    itemEl.addEventListener('click', () => {
      for (const h of this.itemHandlers) h(item.id)
    })
    itemEl.addEventListener('mouseenter', () => {
      if (itemEl.style.background !== 'rgb(239, 246, 255)') {
        itemEl.style.background = '#f9fafb'
      }
    })
    itemEl.addEventListener('mouseleave', () => {
      if (itemEl.style.background !== 'rgb(239, 246, 255)') {
        itemEl.style.background = ''
      }
    })

    const title = document.createElement('div')
    title.textContent = item.title
    title.style.fontWeight = '400'
    title.style.color = '#111'
    itemEl.appendChild(title)

    return itemEl
  }
}