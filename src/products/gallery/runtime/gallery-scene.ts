import type {
  ResolvedGalleryCategoryEntry,
  ResolvedGalleryItemEntry,
  ResolvedGalleryManifest,
  ResolvedGalleryStageEntry,
} from '../contract/gallery-manifest.js'
import { createCatalogAtlasLaunchButton } from '../../catalog/runtime/catalog-atlas-launch.js'

export interface GallerySelection {
  stageKey: ResolvedGalleryStageEntry['key']
  categoryId: string
  itemId: string
}

export interface GallerySceneOptions {
  root: HTMLElement
  manifest: ResolvedGalleryManifest
  resolveAssetUrl: (url: string) => string
  initialSelection?: Partial<GallerySelection>
  onSelectionChange?: (selection: GallerySelection) => void
  onAtlasLaunch?: (url: string) => void
}

export class GalleryScene {
  private readonly root: HTMLElement
  private readonly manifest: ResolvedGalleryManifest
  private readonly resolveAssetUrl: (url: string) => string
  private readonly onSelectionChange?: (selection: GallerySelection) => void
  private readonly onAtlasLaunch?: (url: string) => void
  private selection: GallerySelection
  private image: HTMLImageElement | null = null
  private stageTabs: HTMLElement | null = null
  private categoryTabs: HTMLElement | null = null
  private detailList: HTMLElement | null = null
  private contentLayer: HTMLElement | null = null
  private detailById = new Map<string, HTMLElement>()
  private scrollFrame: number | null = null
  private transitionToken = 0
  private imageToken = 0
  private suppressScrollSelection = false

  constructor(options: GallerySceneOptions) {
    this.root = options.root
    this.manifest = options.manifest
    this.resolveAssetUrl = options.resolveAssetUrl
    this.onSelectionChange = options.onSelectionChange
    this.onAtlasLaunch = options.onAtlasLaunch
    this.selection = resolveGallerySelection(options.manifest, options.initialSelection ?? {})
  }

  mount(): void {
    this.root.innerHTML = ''
    Object.assign(this.root.style, {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      color: this.manifest.config.theme.textColor ?? '#fff',
      background:
        this.manifest.config.theme.backgroundColor ??
        'radial-gradient(circle at 38% 44%,#17202a 0,#070a0d 45%,#020304 100%)',
      fontFamily: 'MiSans, PingFang SC, Microsoft YaHei, sans-serif',
    })

    this.contentLayer = document.createElement('div')
    this.contentLayer.dataset.testid = 'gallery-content-layer'
    Object.assign(this.contentLayer.style, {
      position: 'absolute',
      inset: '0',
      opacity: '1',
      transform: 'translateX(0)',
      transition: `opacity ${this.manifest.config.interaction.categoryTransitionMs}ms ease, transform ${this.manifest.config.interaction.categoryTransitionMs}ms cubic-bezier(.22,.8,.24,1)`,
    })

    const imagePanel = document.createElement('section')
    imagePanel.dataset.testid = 'gallery-image-panel'
    Object.assign(imagePanel.style, {
      position: 'absolute',
      left: 'clamp(12px,4%,20px)',
      right: 'clamp(132px,36%,158px)',
      top: 'clamp(92px,24%,112px)',
      bottom: 'clamp(52px,13%,66px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      isolation: 'isolate',
    })
    this.image = document.createElement('img')
    this.image.dataset.testid = 'gallery-active-image'
    this.image.alt = ''
    Object.assign(this.image.style, {
      display: 'block',
      width: '100%',
      height: '70%',
      objectFit: 'contain',
      opacity: '0',
      transform: 'translateZ(0) scale(1)',
      transition: `opacity ${this.manifest.config.interaction.itemTransitionMs}ms ease`,
      filter: 'drop-shadow(0 16px 28px rgba(0,0,0,.34))',
      zIndex: '1',
    })
    imagePanel.appendChild(this.image)
    imagePanel.appendChild(createImageMask('top'))
    imagePanel.appendChild(createImageMask('bottom'))
    this.contentLayer.appendChild(imagePanel)

    this.detailList = document.createElement('aside')
    this.detailList.dataset.testid = 'gallery-detail-list'
    Object.assign(this.detailList.style, {
      position: 'absolute',
      right: 'clamp(8px,3%,14px)',
      top: 'clamp(88px,24%,108px)',
      bottom: 'clamp(42px,12%,56px)',
      width: 'clamp(112px,30%,138px)',
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingRight: '4px',
      scrollbarWidth: 'none',
      scrollSnapType: 'y proximity',
      color: 'rgba(255,255,255,.7)',
      touchAction: 'pan-y',
    })
    this.detailList.addEventListener('scroll', this.handleScroll, { passive: true })
    this.contentLayer.appendChild(this.detailList)

    this.stageTabs = document.createElement('nav')
    this.stageTabs.dataset.testid = 'gallery-stage-tabs'
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
    this.categoryTabs.dataset.testid = 'gallery-category-tabs'
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

    const hint = document.createElement('div')
    hint.dataset.testid = 'gallery-hint'
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

    this.root.appendChild(this.contentLayer)
    this.root.appendChild(this.stageTabs)
    this.root.appendChild(this.categoryTabs)
    this.root.appendChild(hint)
    const atlasUrl = this.manifest.config.atlasLaunchUrl?.trim()
    if (atlasUrl) {
      const button = createCatalogAtlasLaunchButton({
        url: atlasUrl,
        onLaunch: url => this.onAtlasLaunch?.(url),
      })
      button.dataset.testid = 'gallery-atlas-launch'
      button.setAttribute('aria-label', '打开 Atlas 全景产物')
      this.root.appendChild(button)
    }
    this.render(false)
  }

  destroy(): void {
    if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame)
    this.transitionToken += 1
    this.imageToken += 1
    this.detailList?.removeEventListener('scroll', this.handleScroll)
    this.root.innerHTML = ''
    this.detailById.clear()
    this.image = this.stageTabs = this.categoryTabs = this.detailList = this.contentLayer = null
  }

  getSelection(): GallerySelection {
    return { ...this.selection }
  }

  selectStage(stageKey: GallerySelection['stageKey']): void {
    const next = resolveGallerySelection(this.manifest, { stageKey })
    this.transitionTo(
      next,
      stageIndex(this.manifest, stageKey) >= stageIndex(this.manifest, this.selection.stageKey),
    )
  }

  selectCategory(categoryId: string): void {
    const stage = this.manifest.stages.find(candidate =>
      candidate.categories.some(category => category.id === categoryId),
    )
    if (!stage) return
    const categories = stage.categories.slice().sort((a, b) => a.order - b.order)
    const oldIndex = categories.findIndex(category => category.id === this.selection.categoryId)
    const newIndex = categories.findIndex(category => category.id === categoryId)
    this.transitionTo(
      resolveGallerySelection(this.manifest, { stageKey: stage.key, categoryId }),
      newIndex >= oldIndex,
    )
  }

  selectItem(itemId: string, center = true): void {
    const item = this.itemById(itemId)
    if (!item) return
    const stage = this.manifest.stages.find(candidate =>
      candidate.categories.some(category => category.id === item.categoryId),
    )
    if (!stage) return
    this.selection = { stageKey: stage.key, categoryId: item.categoryId, itemId }
    this.syncActiveStyles()
    this.showImage(item)
    if (center) this.centerItem(itemId)
    this.onSelectionChange?.(this.getSelection())
  }

  private transitionTo(next: GallerySelection, forward: boolean): void {
    if (
      next.stageKey === this.selection.stageKey &&
      next.categoryId === this.selection.categoryId &&
      next.itemId === this.selection.itemId
    )
      return
    const layer = this.contentLayer
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    if (!layer || reduced) {
      this.selection = next
      this.render(true)
      this.onSelectionChange?.(this.getSelection())
      return
    }
    const token = ++this.transitionToken
    const ms = this.manifest.config.interaction.categoryTransitionMs
    layer.style.opacity = '0'
    layer.style.transform = `translateX(${forward ? '-18px' : '18px'})`
    window.setTimeout(
      () => {
        if (token !== this.transitionToken || !this.contentLayer) return
        this.selection = next
        this.render(true)
        this.contentLayer.style.transition = 'none'
        this.contentLayer.style.transform = `translateX(${forward ? '18px' : '-18px'})`
        void this.contentLayer.offsetWidth
        this.contentLayer.style.transition = `opacity ${ms}ms ease, transform ${ms}ms cubic-bezier(.22,.8,.24,1)`
        this.contentLayer.style.opacity = '1'
        this.contentLayer.style.transform = 'translateX(0)'
        this.onSelectionChange?.(this.getSelection())
      },
      Math.max(40, Math.round(ms * 0.45)),
    )
  }

  private render(center: boolean): void {
    this.renderStageTabs()
    this.renderCategoryTabs()
    this.renderDetailList()
    const item = this.itemById(this.selection.itemId)
    if (item) this.showImage(item, true)
    if (center) this.centerItem(this.selection.itemId)
  }

  private renderStageTabs(): void {
    if (!this.stageTabs) return
    this.stageTabs.innerHTML = ''
    for (const stage of this.manifest.stages) {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.testid = `gallery-stage-tab-${stage.key}`
      button.textContent = stage.label
      styleStageButton(button, stage.key === this.selection.stageKey)
      button.addEventListener('click', () => this.selectStage(stage.key))
      this.stageTabs.appendChild(button)
    }
  }

  private renderCategoryTabs(): void {
    if (!this.categoryTabs) return
    this.categoryTabs.innerHTML = ''
    const stage = this.currentStage()
    const categories = stage?.categories.slice().sort((a, b) => a.order - b.order) ?? []
    categories.forEach((category, index) => {
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
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.testid = `gallery-category-tab-${category.id}`
      button.textContent = category.title
      styleCategoryButton(button, category.id === this.selection.categoryId)
      button.addEventListener('click', () => this.selectCategory(category.id))
      this.categoryTabs!.appendChild(button)
    })
  }

  private renderDetailList(): void {
    if (!this.detailList) return
    this.detailList.innerHTML = ''
    this.detailById.clear()
    const items = this.currentItems()
    const top = document.createElement('div')
    const bottom = document.createElement('div')
    top.style.height = '42%'
    bottom.style.height = '42%'
    top.setAttribute('aria-hidden', 'true')
    bottom.setAttribute('aria-hidden', 'true')
    this.detailList.appendChild(top)
    for (const item of items) {
      const entry = document.createElement('button')
      entry.type = 'button'
      entry.dataset.itemId = item.id
      entry.dataset.testid = `gallery-item-${item.id}`
      entry.style.scrollSnapAlign = 'center'
      Object.assign(entry.style, {
        display: 'block',
        width: '100%',
        minHeight: this.manifest.config.theme.listDensity === 'compact' ? '76px' : '98px',
        padding: '14px 0 18px',
        border: '0',
        borderTop: '1px solid rgba(255,255,255,.4)',
        background: 'transparent',
        textAlign: 'left',
        color: 'inherit',
        cursor: 'pointer',
      })
      const title = document.createElement('strong')
      title.textContent = item.title
      Object.assign(title.style, { display: 'block', fontSize: '14px', lineHeight: '20px' })
      const description = document.createElement('span')
      description.textContent = item.description
      Object.assign(description.style, {
        display: 'block',
        marginTop: '6px',
        fontSize: '11px',
        lineHeight: '16px',
      })
      entry.appendChild(title)
      entry.appendChild(description)
      entry.addEventListener('click', () => this.selectItem(item.id))
      this.detailById.set(item.id, entry)
      this.detailList.appendChild(entry)
    }
    this.detailList.appendChild(bottom)
    this.syncActiveStyles()
  }

  private syncActiveStyles(): void {
    for (const [itemId, entry] of this.detailById) {
      const active = itemId === this.selection.itemId
      entry.dataset.active = active ? 'true' : 'false'
      entry.style.borderTopColor = active ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.35)'
      const title = entry.children[0] as HTMLElement | undefined
      const body = entry.children[1] as HTMLElement | undefined
      if (title) {
        title.style.color = active ? '#fff' : 'rgba(255,255,255,.6)'
        title.style.fontWeight = active ? '600' : '500'
      }
      if (body) body.style.color = active ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.48)'
    }
  }

  private showImage(item: ResolvedGalleryItemEntry, immediate = false): void {
    if (!this.image) return
    const image = this.image
    const token = ++this.imageToken
    const url = this.resolveAssetUrl(item.image.url)
    const swap = () => {
      if (token !== this.imageToken || !this.image) return
      image.alt = item.title
      image.onload = () => {
        if (token === this.imageToken) image.style.opacity = '1'
      }
      image.onerror = () => {
        if (token === this.imageToken) image.style.opacity = '0'
      }
      image.src = url
      if (image.complete && image.naturalWidth > 0) image.style.opacity = '1'
    }
    if (immediate || !image.src) {
      image.style.opacity = '0'
      swap()
      return
    }
    image.style.opacity = '0'
    window.setTimeout(swap, Math.max(30, this.manifest.config.interaction.itemTransitionMs))
  }

  private centerItem(itemId: string): void {
    if (!this.detailList) return
    const entry = this.detailById.get(itemId)
    if (!entry) return
    this.suppressScrollSelection = true
    const listRect = this.detailList.getBoundingClientRect()
    const entryRect = entry.getBoundingClientRect()
    this.detailList.scrollTo({
      top:
        this.detailList.scrollTop +
        entryRect.top +
        entryRect.height / 2 -
        (listRect.top + listRect.height / 2),
      behavior: 'smooth',
    })
    window.setTimeout(() => {
      this.suppressScrollSelection = false
    }, 260)
  }

  private readonly handleScroll = (): void => {
    if (this.suppressScrollSelection || this.scrollFrame !== null) return
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null
      const nearest = this.nearestItemId()
      if (nearest && nearest !== this.selection.itemId) this.selectItem(nearest, false)
    })
  }

  private nearestItemId(): string | null {
    if (!this.detailList) return null
    const bounds = this.detailList.getBoundingClientRect()
    const center = bounds.top + bounds.height / 2
    let id: string | null = null
    let distance = Number.POSITIVE_INFINITY
    for (const [itemId, element] of this.detailById) {
      const rect = element.getBoundingClientRect()
      const next = Math.abs(rect.top + rect.height / 2 - center)
      if (next < distance) {
        id = itemId
        distance = next
      }
    }
    return id
  }

  private currentStage(): ResolvedGalleryStageEntry | undefined {
    return this.manifest.stages.find(stage => stage.key === this.selection.stageKey)
  }

  private currentCategory(): ResolvedGalleryCategoryEntry | undefined {
    return this.currentStage()?.categories.find(
      category => category.id === this.selection.categoryId,
    )
  }

  private currentItems(): ResolvedGalleryItemEntry[] {
    const category = this.currentCategory()
    if (!category) return []
    return category.itemIds
      .map(itemId => this.itemById(itemId))
      .filter((item): item is ResolvedGalleryItemEntry => Boolean(item))
  }

  private itemById(itemId: string): ResolvedGalleryItemEntry | undefined {
    return this.manifest.items.find(item => item.id === itemId)
  }
}

export function resolveGallerySelection(
  manifest: ResolvedGalleryManifest,
  requested: Partial<GallerySelection>,
): GallerySelection {
  const requestedItem = requested.itemId
    ? manifest.items.find(candidate => candidate.id === requested.itemId)
    : undefined
  const inferredCategoryId = requested.categoryId ?? requestedItem?.categoryId
  const stage =
    manifest.stages.find(candidate => candidate.key === requested.stageKey) ??
    manifest.stages.find(candidate =>
      candidate.categories.some(category => category.id === inferredCategoryId),
    ) ??
    manifest.stages.find(candidate =>
      candidate.categories.some(category => category.itemIds.length),
    ) ??
    manifest.stages[0]
  const category =
    stage?.categories.find(candidate => candidate.id === inferredCategoryId) ??
    stage?.categories.slice().sort((a, b) => a.order - b.order)[0]
  const item =
    manifest.items.find(
      candidate => candidate.id === requestedItem?.id && candidate.categoryId === category?.id,
    ) ??
    category?.itemIds.map(id => manifest.items.find(candidate => candidate.id === id)).find(Boolean)
  if (!stage || !category || !item) throw new Error('Gallery manifest has no selectable item')
  return { stageKey: stage.key, categoryId: category.id, itemId: item.id }
}

function createImageMask(position: 'top' | 'bottom'): HTMLDivElement {
  const mask = document.createElement('div')
  mask.dataset.testid = `gallery-image-mask-${position}`
  Object.assign(mask.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    [position]: '0',
    height: '24%',
    zIndex: '2',
    pointerEvents: 'none',
    background:
      position === 'top'
        ? 'linear-gradient(to bottom,rgba(2,3,4,.92),rgba(2,3,4,0))'
        : 'linear-gradient(to top,rgba(2,3,4,.92),rgba(2,3,4,0))',
  })
  return mask
}

function styleStageButton(button: HTMLButtonElement, active: boolean): void {
  Object.assign(button.style, {
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
    backdropFilter: 'blur(8px) saturate(125%)',
  })
}

function styleCategoryButton(button: HTMLButtonElement, active: boolean): void {
  Object.assign(button.style, {
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
}

function stageIndex(manifest: ResolvedGalleryManifest, key: GallerySelection['stageKey']): number {
  return manifest.stages.findIndex(stage => stage.key === key)
}
