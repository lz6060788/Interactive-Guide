import type {
  ResolvedAtlasCategoryEntry as AtlasCategoryEntry,
  ResolvedAtlasItemEntry as AtlasItemEntry,
} from '../contract/atlas-manifest.js'
import {
  ATLAS_DRAWER_BACKDROP_BLUR,
  ATLAS_DRAWER_BG,
  ATLAS_DRAWER_CARD_GAP_PX,
  ATLAS_DRAWER_GAP_PX,
  ATLAS_DRAWER_OPACITY_MS,
  ATLAS_DRAWER_PADDING,
  ATLAS_DRAWER_SCROLL_LOCK_MS,
  ATLAS_DRAWER_SCROLL_SETTLE_MS,
  ATLAS_DRAWER_SHADOW,
  ATLAS_DRAWER_TOP_RADIUS_PX,
  ATLAS_DRAWER_TRANSITION_MS,
  ATLAS_CHIP_FONT_FAMILY,
  getAtlasDrawerCardStyle,
} from './atlas-visual-tokens.js'

export interface CardDrawerState {
  open: boolean
  activeCategoryId: string | null
  activeItemId: string | null
  scrollSyncLocked: boolean
}

interface CardDrawerControllerOptions {
  onItemClick?: (itemId: string) => void
  onClose?: () => void
}

export class CardDrawerController {
  private readonly host: HTMLElement
  private readonly onItemClick?: (itemId: string) => void
  private readonly onClose?: () => void
  private root: HTMLElement | null = null
  private titleEl: HTMLElement | null = null
  private breadcrumbEl: HTMLElement | null = null
  private listEl: HTMLElement | null = null
  private closeButtonEl: HTMLButtonElement | null = null
  private category: AtlasCategoryEntry | null = null
  private items: AtlasItemEntry[] = []
  private cardEls = new Map<string, HTMLButtonElement>()
  private scrollSettleTimer: ReturnType<typeof setTimeout> | null = null
  private scrollLockTimer: ReturnType<typeof setTimeout> | null = null
  private state: CardDrawerState = {
    open: false,
    activeCategoryId: null,
    activeItemId: null,
    scrollSyncLocked: false,
  }

  constructor(host: HTMLElement, options: CardDrawerControllerOptions = {}) {
    this.host = host
    this.onItemClick = options.onItemClick
    this.onClose = options.onClose
  }

  mount(): void {
    if (this.root) return
    const root = document.createElement('section')
    root.dataset.testid = 'atlas-card-drawer'
    root.style.position = 'absolute'
    root.style.left = '0'
    root.style.right = '0'
    root.style.bottom = '0'
    root.style.width = '100%'
    root.style.maxWidth = '100%'
    root.style.boxSizing = 'border-box'
    root.style.padding = ATLAS_DRAWER_PADDING
    root.style.display = 'flex'
    root.style.flexDirection = 'column'
    root.style.gap = `${ATLAS_DRAWER_GAP_PX}px`
    root.style.borderTopLeftRadius = `${ATLAS_DRAWER_TOP_RADIUS_PX}px`
    root.style.borderTopRightRadius = `${ATLAS_DRAWER_TOP_RADIUS_PX}px`
    root.style.background = ATLAS_DRAWER_BG
    root.style.backdropFilter = ATLAS_DRAWER_BACKDROP_BLUR
    root.style.boxShadow = ATLAS_DRAWER_SHADOW
    root.style.transform = 'translateY(calc(100% + 20px))'
    root.style.opacity = '0'
    root.style.pointerEvents = 'none'
    root.style.transition = `transform ${ATLAS_DRAWER_TRANSITION_MS}ms cubic-bezier(0.22,1,0.36,1), opacity ${ATLAS_DRAWER_OPACITY_MS}ms ease`
    root.style.zIndex = '24'

    const header = document.createElement('div')
    header.style.display = 'flex'
    header.style.alignItems = 'center'
    header.style.justifyContent = 'space-between'
    header.style.gap = '12px'

    const title = document.createElement('div')
    title.dataset.testid = 'atlas-card-drawer-title'
    title.style.fontFamily = ATLAS_CHIP_FONT_FAMILY
    title.style.fontSize = '14px'
    title.style.fontWeight = '600'
    title.style.color = 'rgba(15, 23, 42, 0.84)'
    title.textContent = '相关内容'

    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.dataset.testid = 'atlas-card-drawer-close'
    closeButton.textContent = '×'
    closeButton.style.border = 'none'
    closeButton.style.borderRadius = '999px'
    closeButton.style.width = '28px'
    closeButton.style.height = '28px'
    closeButton.style.padding = '0'
    closeButton.style.background = 'transparent'
    closeButton.style.color = 'rgba(0, 0, 0, 0.72)'
    closeButton.style.fontSize = '26px'
    closeButton.style.lineHeight = '1'
    closeButton.style.cursor = 'pointer'
    closeButton.style.fontFamily = ATLAS_CHIP_FONT_FAMILY
    closeButton.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.close()
      this.onClose?.()
    })

    const breadcrumb = document.createElement('div')
    breadcrumb.dataset.testid = 'atlas-card-drawer-breadcrumb'
    breadcrumb.style.display = 'flex'
    breadcrumb.style.alignItems = 'center'
    breadcrumb.style.gap = '4px'
    breadcrumb.style.flex = '1'
    breadcrumb.style.minWidth = '0'
    breadcrumb.style.fontFamily = ATLAS_CHIP_FONT_FAMILY
    breadcrumb.style.fontSize = '14px'
    breadcrumb.style.lineHeight = '18px'
    breadcrumb.style.fontWeight = '400'
    breadcrumb.style.color = 'rgba(0, 0, 0, 0.6)'
    breadcrumb.style.whiteSpace = 'nowrap'
    breadcrumb.style.overflow = 'hidden'
    breadcrumb.style.textOverflow = 'ellipsis'

    const list = document.createElement('div')
    list.dataset.testid = 'atlas-card-drawer-list'
    list.style.display = 'flex'
    list.style.gap = `${ATLAS_DRAWER_GAP_PX}px`
    list.style.overflowX = 'auto'
    list.style.overflowY = 'hidden'
    ;(list.style as CSSStyleDeclaration & { msOverflowStyle?: string }).msOverflowStyle = 'none'
    ;(list.style as CSSStyleDeclaration & { scrollbarWidth?: string }).scrollbarWidth = 'none'
    list.style.scrollSnapType = 'x proximity'
    list.style.paddingBottom = '2px'
    list.style.pointerEvents = 'auto'
    list.addEventListener('scroll', () => this.handleScroll())

    header.appendChild(breadcrumb)
    header.appendChild(closeButton)
    root.appendChild(header)
    root.appendChild(list)
    this.host.appendChild(root)

    this.root = root
    this.titleEl = title
    this.breadcrumbEl = breadcrumb
    this.listEl = list
    this.closeButtonEl = closeButton
  }

  open(category: AtlasCategoryEntry, items: AtlasItemEntry[], activeItemId: string | null): void {
    if (!this.root || !this.listEl || !this.titleEl || !this.breadcrumbEl) return
    this.category = category
    this.items = items
    this.state.activeCategoryId = category.id
    this.state.activeItemId = activeItemId
    this.state.open = items.length > 0
    this.titleEl.textContent = category.title
    this.renderBreadcrumb(category)
    this.renderCards()
    this.root.style.transform = this.state.open ? 'translateY(0)' : 'translateY(calc(100% + 20px))'
    this.root.style.opacity = this.state.open ? '1' : '0'
    this.root.style.pointerEvents = this.state.open ? 'auto' : 'none'
    if (activeItemId) this.scrollCardIntoView(activeItemId)
  }

  activateItem(itemId: string | null, options: { scrollIntoView?: boolean } = {}): void {
    this.state.activeItemId = itemId
    for (const [id, card] of this.cardEls) {
      Object.assign(card.style, getAtlasDrawerCardStyle(id === itemId))
      card.dataset.active = id === itemId ? 'true' : 'false'
    }
    if (itemId && options.scrollIntoView !== false) {
      this.scrollCardIntoView(itemId)
    }
  }

  close(): void {
    if (!this.root) return
    this.state.open = false
    this.state.activeItemId = null
    this.state.activeCategoryId = null
    this.root.style.transform = 'translateY(calc(100% + 20px))'
    this.root.style.opacity = '0'
    this.root.style.pointerEvents = 'none'
    this.cardEls.clear()
    if (this.listEl) this.listEl.innerHTML = ''
  }

  destroy(): void {
    if (this.scrollSettleTimer) clearTimeout(this.scrollSettleTimer)
    if (this.scrollLockTimer) clearTimeout(this.scrollLockTimer)
    this.root?.remove()
    this.root = null
    this.titleEl = null
    this.breadcrumbEl = null
    this.listEl = null
    this.closeButtonEl = null
    this.cardEls.clear()
  }

  getState(): CardDrawerState {
    return { ...this.state }
  }

  private renderCards(): void {
    if (!this.listEl) return
    this.listEl.innerHTML = ''
    this.cardEls.clear()
    for (const item of this.items) {
      const card = document.createElement('button')
      card.type = 'button'
      card.dataset.testid = `atlas-card-${item.id}`
      card.dataset.itemId = item.id
      card.dataset.active = item.id === this.state.activeItemId ? 'true' : 'false'
      card.style.display = 'flex'
      card.style.flexDirection = 'column'
      card.style.alignItems = 'flex-start'
      card.style.justifyContent = 'space-between'
      card.style.gap = `${ATLAS_DRAWER_CARD_GAP_PX}px`
      card.style.flex = '0 0 auto'
      card.style.scrollSnapAlign = 'center'
      card.style.cursor = 'pointer'
      card.style.textAlign = 'left'
      card.style.fontFamily = ATLAS_CHIP_FONT_FAMILY
      card.style.color = 'rgba(15, 23, 42, 0.84)'
      Object.assign(card.style, getAtlasDrawerCardStyle(item.id === this.state.activeItemId))

      const title = document.createElement('div')
      title.style.fontSize = '16px'
      title.style.lineHeight = '22px'
      title.style.fontWeight = '700'
      title.textContent = item.title

      const desc = document.createElement('div')
      desc.style.fontSize = '14px'
      desc.style.lineHeight = '22px'
      desc.style.color = 'rgba(15, 23, 42, 0.7)'
      desc.textContent = item.description

      card.appendChild(title)
      card.appendChild(desc)
      card.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        this.activateItem(item.id)
        this.onItemClick?.(item.id)
      })

      this.cardEls.set(item.id, card)
      this.listEl.appendChild(card)
    }
  }

  private renderBreadcrumb(category: AtlasCategoryEntry): void {
    if (!this.breadcrumbEl) return
    if (
      typeof (this.breadcrumbEl as HTMLElement & { replaceChildren?: unknown }).replaceChildren ===
      'function'
    ) {
      this.breadcrumbEl.replaceChildren()
    } else {
      this.breadcrumbEl.innerHTML = ''
    }
    if (category.stageLabel?.trim()) {
      const stageEl = document.createElement('span')
      stageEl.textContent = category.stageLabel
      stageEl.style.fontWeight = '600'
      stageEl.style.color = 'rgba(0, 0, 0, 0.84)'

      const separatorEl = document.createElement('span')
      separatorEl.textContent = '>'
      separatorEl.style.fontWeight = '600'
      separatorEl.style.color = 'rgba(0, 0, 0, 0.84)'

      this.breadcrumbEl.appendChild(stageEl)
      this.breadcrumbEl.appendChild(separatorEl)
    }

    const titleEl = document.createElement('span')
    titleEl.textContent = category.title
    titleEl.style.minWidth = '0'
    titleEl.style.whiteSpace = 'nowrap'
    titleEl.style.overflow = 'hidden'
    titleEl.style.textOverflow = 'ellipsis'
    this.breadcrumbEl.appendChild(titleEl)
  }

  private scrollCardIntoView(itemId: string): void {
    const card = this.cardEls.get(itemId)
    const list = this.listEl
    if (!card || !list) return
    if (this.cardEls.size <= 1) return
    this.state.scrollSyncLocked = true
    const cardOffsetLeft = card.offsetLeft ?? 0
    const cardWidth = card.offsetWidth ?? 0
    const listWidth = list.clientWidth ?? 0
    const maxScrollLeft = Math.max(0, (list.scrollWidth ?? 0) - listWidth)
    if (maxScrollLeft <= 0) return
    const targetLeft = Math.max(0, cardOffsetLeft - Math.max((listWidth - cardWidth) / 2, 0))
    const clampedTargetLeft = Math.min(targetLeft, maxScrollLeft)
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ left: clampedTargetLeft, behavior: 'smooth' })
    } else {
      list.scrollLeft = clampedTargetLeft
    }
    if (this.scrollLockTimer) clearTimeout(this.scrollLockTimer)
    this.scrollLockTimer = setTimeout(() => {
      this.state.scrollSyncLocked = false
    }, ATLAS_DRAWER_SCROLL_LOCK_MS)
  }

  private handleScroll(): void {
    if (this.state.scrollSyncLocked) return
    if (this.scrollSettleTimer) clearTimeout(this.scrollSettleTimer)
    this.scrollSettleTimer = setTimeout(() => {
      if (!this.listEl || this.cardEls.size === 0) return
      const containerRect = this.listEl.getBoundingClientRect()
      const centerX = containerRect.left + containerRect.width / 2
      let nearestId: string | null = null
      let nearestDistance = Number.POSITIVE_INFINITY
      for (const [id, card] of this.cardEls) {
        const rect = card.getBoundingClientRect()
        const cardCenter = rect.left + rect.width / 2
        const distance = Math.abs(cardCenter - centerX)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestId = id
        }
      }
      if (nearestId && nearestId !== this.state.activeItemId) {
        this.activateItem(nearestId, { scrollIntoView: false })
      }
    }, ATLAS_DRAWER_SCROLL_SETTLE_MS)
  }
}
