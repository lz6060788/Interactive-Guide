import type { PanoramaGroup, PanoramaItem, PanoramaHtmlProduct, PanoramaRuntimeState } from '../../shared/panorama-types.js'
import { isPanoramaGroup } from '../../shared/panorama-types.js'
import { buildPanoramaRenderModel } from '../panorama-renderer.js'
import { clamp } from './panorama-player-host-utils.js'
import type { ProjectedFocusRect } from './panorama-player-host-utils.js'

type InteractionMode = PanoramaRuntimeState['interactionMode']

export interface PanoramaListItemRefs {
  cardEl: HTMLDivElement
  dividerEl: HTMLDivElement
  titleEl: HTMLDivElement
}

export interface PanoramaListDragState {
  pointerId: number
  startY: number
  startScrollTop: number
  moved: boolean
}

export interface ListControllerEnv {
  readonly listEl: HTMLDivElement
  readonly itemElements: Map<string, PanoramaListItemRefs>
  // Mutable state (getter + setter pairs)
  get currentListGroupId(): string | null
  set currentListGroupId(v: string | null)
  get previewItemId(): string | null
  set previewItemId(v: string | null)
  get activeItemId(): string | null
  get scrollSyncLocked(): boolean
  set scrollSyncLocked(v: boolean)
  get scrollSyncTimer(): number | null
  set scrollSyncTimer(v: number | null)
  get scrollSettleTimer(): number | null
  set scrollSettleTimer(v: number | null)
  get listDragState(): PanoramaListDragState | null
  set listDragState(v: PanoramaListDragState | null)
  get listPressTarget(): EventTarget | null
  set listPressTarget(v: EventTarget | null)
  get ignoreListClick(): boolean
  set ignoreListClick(v: boolean)
  // Readonly state
  readonly product: PanoramaHtmlProduct | null
  readonly state: PanoramaRuntimeState | null
  readonly displayedFocusRect: ProjectedFocusRect | null
  // Callbacks
  selectItem: (group: PanoramaGroup, item: PanoramaItem, mode?: InteractionMode) => void
  drawFocusOverlay: (rect: ProjectedFocusRect) => void
}

export class ListController {
  static readonly LIST_SCROLL_SMOOTH_LOCK_MS = 720

  private readonly detachListEvents: Array<() => void> = []

  constructor(private env: ListControllerEnv) {}

  bindEvents(): void {
    this.env.listEl.addEventListener('scroll', this.handleListScroll, { passive: true })
    this.env.listEl.addEventListener('click', this.handleListClick)
    this.env.listEl.addEventListener('pointerdown', this.handleListPointerDown)
    this.env.listEl.addEventListener('pointermove', this.handleListPointerMove)
    this.env.listEl.addEventListener('pointerup', this.handleListPointerUp)
    this.env.listEl.addEventListener('pointercancel', this.handleListPointerUp)

    this.detachListEvents.push(
      () => this.env.listEl.removeEventListener('scroll', this.handleListScroll),
      () => this.env.listEl.removeEventListener('click', this.handleListClick),
      () => this.env.listEl.removeEventListener('pointerdown', this.handleListPointerDown),
      () => this.env.listEl.removeEventListener('pointermove', this.handleListPointerMove),
      () => this.env.listEl.removeEventListener('pointerup', this.handleListPointerUp),
      () => this.env.listEl.removeEventListener('pointercancel', this.handleListPointerUp),
    )
  }

  unbindEvents(): void {
    this.detachListEvents.forEach(dispose => dispose())
    this.detachListEvents.length = 0
  }

  renderList(group: Extract<PanoramaGroup, { renderMode?: 'panorama' }>, activeItem: PanoramaItem): void {
    if (this.env.currentListGroupId !== group.id) {
      this.env.itemElements.clear()

      const itemCards = group.items.map(entry => {
        const cardEl = document.createElement('div')
        cardEl.className = `panorama-list-item ${entry.id === activeItem.id ? 'is-active' : ''}`
        cardEl.dataset.itemId = entry.id

        const dividerEl = document.createElement('div')
        dividerEl.className = 'panorama-list-divider'
        cardEl.appendChild(dividerEl)

        const titleEl = document.createElement('div')
        titleEl.className = 'panorama-list-title'
        titleEl.textContent = entry.title

        cardEl.appendChild(titleEl)

        const bodyEl = document.createElement('div')
        bodyEl.className = 'panorama-list-body'
        bodyEl.textContent = entry.description || '暂无说明'
        cardEl.appendChild(bodyEl)

        this.env.itemElements.set(entry.id, {
          cardEl,
          dividerEl,
          titleEl,
        })
        return cardEl
      })

      const topSpacerEl = document.createElement('div')
      topSpacerEl.className = 'panorama-list-edge-spacer panorama-list-edge-spacer-top'
      topSpacerEl.setAttribute('aria-hidden', 'true')

      const bottomSpacerEl = document.createElement('div')
      bottomSpacerEl.className = 'panorama-list-edge-spacer panorama-list-edge-spacer-bottom'
      bottomSpacerEl.setAttribute('aria-hidden', 'true')

      this.env.listEl.replaceChildren(topSpacerEl, ...itemCards, bottomSpacerEl)
      this.env.currentListGroupId = group.id
    }
    this.updateListEdgeSpacers()
    this.syncListSelectionClasses(activeItem.id)
  }

  scrollItemIntoView(itemId: string): void {
    this.centerItemInList(itemId, 'smooth')
  }

  lockScrollSync(duration = 320): void {
    this.env.scrollSyncLocked = true
    if (this.env.scrollSyncTimer !== null) {
      window.clearTimeout(this.env.scrollSyncTimer)
    }
    this.env.scrollSyncTimer = window.setTimeout(() => {
      this.env.scrollSyncLocked = false
      this.env.scrollSyncTimer = null
    }, duration)
  }

  private readonly handleListScroll = () => {
    if (this.env.displayedFocusRect) {
      this.env.drawFocusOverlay(this.env.displayedFocusRect)
    }
    if (this.env.scrollSyncLocked || !this.env.product || !this.env.state) return
    const model = buildPanoramaRenderModel(this.env.product, this.env.state)
    if (!model.item || !isPanoramaGroup(model.group)) return
    const nextItem = this.resolveNearestListItem(model.group)
    if (!nextItem) return

    this.setPreviewItem(nextItem.id)
    if (!this.env.listDragState?.moved) {
      this.scheduleListSettleCommit(nextItem.id)
    }
  }

  private readonly handleListPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    this.clearScrollSettleTimer()
    this.env.listPressTarget = event.target
    this.env.listDragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: this.env.listEl.scrollTop,
      moved: false,
    }
    this.env.listEl.classList.add('is-dragging')
    this.env.listEl.setPointerCapture(event.pointerId)
  }

  private readonly handleListPointerMove = (event: PointerEvent) => {
    if (!this.env.listDragState || this.env.listDragState.pointerId !== event.pointerId) return
    const deltaY = event.clientY - this.env.listDragState.startY
    if (Math.abs(deltaY) > 3) {
      this.env.listDragState.moved = true
      this.env.ignoreListClick = true
    }
    this.env.listEl.scrollTop = this.env.listDragState.startScrollTop - deltaY
    if (event.cancelable) {
      event.preventDefault()
    }
  }

  private readonly handleListPointerUp = (event: PointerEvent) => {
    if (!this.env.listDragState || this.env.listDragState.pointerId !== event.pointerId) return
    this.env.listEl.classList.remove('is-dragging')
    try {
      this.env.listEl.releasePointerCapture(event.pointerId)
    } catch {}

    if (this.env.listDragState.moved) {
      this.env.listDragState = null
      const model = this.env.product && this.env.state ? buildPanoramaRenderModel(this.env.product, this.env.state) : null
      const nextItem = model?.item && isPanoramaGroup(model.group)
        ? this.resolveNearestListItem(model.group)
        : null
      if (nextItem) {
        this.commitListSelection(nextItem.id)
      } else if (this.env.activeItemId) {
        this.commitListSelection(this.env.activeItemId)
      } else {
        this.setPreviewItem(null)
      }
      window.setTimeout(() => {
        this.env.ignoreListClick = false
        this.env.listPressTarget = null
      }, 0)
    } else {
      this.setPreviewItem(null)
      this.env.ignoreListClick = false
      this.env.listDragState = null
    }
  }

  private readonly handleListClick = (event: MouseEvent) => {
    if (this.env.ignoreListClick) {
      this.env.ignoreListClick = false
      this.env.listPressTarget = null
      return
    }
    if (!this.env.product || !this.env.state) {
      this.env.listPressTarget = null
      return
    }
    const fallbackTarget = event.target
    const target = this.env.listPressTarget instanceof Element
      ? this.env.listPressTarget
      : fallbackTarget instanceof Element
        ? fallbackTarget
        : fallbackTarget instanceof Node
          ? fallbackTarget.parentElement
          : null
    this.env.listPressTarget = null
    if (!(target instanceof Element)) return
    const cardEl = target.closest<HTMLDivElement>('.panorama-list-item')
    const itemId = cardEl?.dataset.itemId
    if (!itemId) return
    const model = buildPanoramaRenderModel(this.env.product, this.env.state)
    if (!model.item || !isPanoramaGroup(model.group)) return
    const nextItem = model.group.items.find(entry => entry.id === itemId)
    if (!nextItem) return
    this.env.selectItem(model.group, nextItem)
  }

  private clearScrollSettleTimer(): void {
    if (this.env.scrollSettleTimer !== null) {
      window.clearTimeout(this.env.scrollSettleTimer)
      this.env.scrollSettleTimer = null
    }
  }

  private scheduleListSettleCommit(itemId: string): void {
    this.clearScrollSettleTimer()
    this.env.scrollSettleTimer = window.setTimeout(() => {
      this.env.scrollSettleTimer = null
      if (this.env.listDragState?.moved) return
      this.commitListSelection(itemId)
    }, 140)
  }

  private commitListSelection(itemId: string): void {
    if (!this.env.product || !this.env.state) return
    const model = buildPanoramaRenderModel(this.env.product, this.env.state)
    if (!model.item || !isPanoramaGroup(model.group)) return
    const nextItem = model.group.items.find(entry => entry.id === itemId)
    if (!nextItem) return

    this.setPreviewItem(null)
    this.lockScrollSync()
    if (nextItem.id !== model.item.id) {
      this.env.selectItem(model.group, nextItem, 'scroll-sync')
      this.centerItemInList(nextItem.id, 'smooth')
    }
  }

  private setPreviewItem(itemId: string | null): void {
    this.env.previewItemId = itemId
    this.syncListSelectionClasses(this.env.activeItemId)
  }

  private syncListSelectionClasses(activeItemId: string | null): void {
    for (const [itemId, refs] of this.env.itemElements.entries()) {
      refs.cardEl.classList.toggle('is-active', itemId === activeItemId)
      refs.cardEl.classList.toggle('is-preview', itemId === this.env.previewItemId && itemId !== activeItemId)
    }
  }

  private updateListEdgeSpacers(): void {
    const topSpacerEl = this.env.listEl.querySelector<HTMLDivElement>('.panorama-list-edge-spacer-top')
    const bottomSpacerEl = this.env.listEl.querySelector<HTMLDivElement>('.panorama-list-edge-spacer-bottom')
    const itemCards = Array.from(this.env.itemElements.values())
    if (!topSpacerEl || !bottomSpacerEl || itemCards.length === 0) return

    const viewportHeight = this.env.listEl.clientHeight
    const firstHeight = itemCards[0].cardEl.getBoundingClientRect().height
    const lastHeight = itemCards[itemCards.length - 1].cardEl.getBoundingClientRect().height
    const topSpacerHeight = Math.max((viewportHeight - firstHeight) / 2, 0)
    const bottomSpacerHeight = Math.max((viewportHeight - lastHeight) / 2, 0)
    topSpacerEl.style.height = `${topSpacerHeight}px`
    bottomSpacerEl.style.height = `${bottomSpacerHeight}px`
  }

  private getItemCenterScrollTop(itemId: string): number {
    const refs = this.env.itemElements.get(itemId)
    if (!refs) return this.env.listEl.scrollTop

    const listRect = this.env.listEl.getBoundingClientRect()
    const itemRect = refs.cardEl.getBoundingClientRect()
    const deltaToCenter = itemRect.top + itemRect.height / 2 - (listRect.top + listRect.height / 2)
    const nextScrollTop = this.env.listEl.scrollTop + deltaToCenter
    const maxScrollTop = Math.max(this.env.listEl.scrollHeight - this.env.listEl.clientHeight, 0)
    const clampedScrollTop = clamp(nextScrollTop, 0, maxScrollTop)

    return clampedScrollTop
  }

  private centerItemInList(itemId: string, behavior: ScrollBehavior = 'smooth'): void {
    if (behavior === 'smooth') {
      this.lockScrollSync(ListController.LIST_SCROLL_SMOOTH_LOCK_MS)
    }
    window.requestAnimationFrame(() => {
      const nextScrollTop = this.getItemCenterScrollTop(itemId)
      this.env.listEl.scrollTo({ top: nextScrollTop, behavior })
    })
  }

  private resolveNearestListItem(group: Extract<PanoramaGroup, { renderMode?: 'panorama' }>): PanoramaItem | null {
    const containerRect = this.env.listEl.getBoundingClientRect()
    const containerCenter = containerRect.top + containerRect.height / 2

    let nextItem: PanoramaItem | null = null
    let closestDistance = Number.POSITIVE_INFINITY

    for (const entry of group.items) {
      const element = this.env.itemElements.get(entry.id)
      if (!element) continue
      const rect = element.cardEl.getBoundingClientRect()
      const center = rect.top + rect.height / 2
      const distance = Math.abs(center - containerCenter)
      if (distance < closestDistance) {
        closestDistance = distance
        nextItem = entry
      }
    }

    return nextItem
  }
}
