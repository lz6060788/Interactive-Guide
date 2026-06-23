import type { PublishManifest, PublishNode, InfoOverlayConfig, SurfaceFocusLayer } from '../../shared/types.js'
import { INFO_SHEET_DEFAULT_TITLE, INFO_SHEET_FALLBACK_CONFIG, SHARE_ICON_SVG, SHARE_ICON_WHITE_SVG, BACK_ICON_SVG, SHEET_BACK_ICON_SVG, INFO_ICON_SVG } from './player-host-chrome-constants.js'
import type { PlayerHostState } from './player-host.js'
import type { ChromeElements } from './player-host-styles.js'

export interface ChromeRendererEnv {
  // DOM elements
  chromeRoot: HTMLElement
  headerBackdropEl: HTMLElement
  headerCenterEl: HTMLElement
  packageTitleEl: HTMLElement
  infoButtonEl: HTMLElement
  shareButtonEl: HTMLElement
  bottomSheetEl: HTMLElement
  bottomSheetBreadcrumbEl: HTMLElement
  bottomSheetCardsEl: HTMLElement
  bottomSheetResetButtonEl: HTMLElement
  infoSheetBackdropEl: HTMLElement
  infoSheetEl: HTMLElement
  infoSheetTitleEl: HTMLElement
  infoSheetContentEl: HTMLElement
  dragHintBackdropEl: HTMLElement
  dragHintEl: HTMLElement
  // State (mutable - modified by ChromeRenderer methods)
  infoSheetOpen: boolean
  surfaceSheetOpen: boolean
  activeSurfaceCardId: string | null
  renderedBottomSheetNodeId: string | null
  renderedBottomSheetLayerId: string | null
  renderedBottomSheetCardId: string | null
  bottomSheetCardsDragState: { pointerId: number; startX: number; startScrollLeft: number; moved: boolean } | null
  ignoreBottomSheetCardClick: boolean
  surfaceCardScrollSyncLocked: boolean
  // Methods
  getNodeKind: (node: PublishNode | null | undefined) => 'surface' | 'image' | 'html'
  getActiveSurfaceLayer: (node: PublishNode | null | undefined) => SurfaceFocusLayer | null
  canShare: () => boolean
  focusSurfaceCard: (cardId: string, moveCamera: boolean) => void
  scrollActiveSheetCardIntoView: () => void
  scheduleSurfaceCardScrollCommit: () => void
  clearSurfaceCardScrollSettleTimer: () => void
  getManifest: () => PublishManifest | null
  onChromeStateChanged: () => void
}

export class ChromeRenderer {
  static readonly FLOATING_BACK_BUTTON_OFFSET_PX = 24

  constructor(private env: ChromeRendererEnv) {}

  render(state: PlayerHostState): void {
    const currentNode = state.currentNode
    const manifestTitle = state.manifest?.title ?? ''
    const nodeKind = this.env.getNodeKind(currentNode)
    const isHtmlNode = nodeKind === 'html'
    const showHorizontalDragHint = nodeKind === 'surface'
      ? true
      : currentNode?.imageFitMode === 'fitHeight'
    const chromeVisible = !!currentNode && !state.transitioning && !state.preloading
    const canShare = chromeVisible && this.env.canShare()
    const canShowInfo = chromeVisible && !isHtmlNode && !!this.getInfoOverlayConfig(state.manifest)

    this.env.headerBackdropEl.style.display = 'none'
    this.env.headerBackdropEl.style.opacity = '0'
    this.env.headerCenterEl.style.display = chromeVisible && !isHtmlNode ? 'flex' : 'none'
    this.env.headerCenterEl.style.opacity = chromeVisible && !isHtmlNode ? '1' : '0'
    this.env.infoButtonEl.style.display = canShowInfo ? 'flex' : 'none'
    this.env.infoButtonEl.style.pointerEvents = canShowInfo ? 'auto' : 'none'
    this.env.shareButtonEl.style.display = canShare ? 'flex' : 'none'
    this.env.shareButtonEl.style.opacity = canShare ? '1' : '0'
    this.env.shareButtonEl.style.pointerEvents = canShare ? 'auto' : 'none'
    this.env.packageTitleEl.textContent = manifestTitle
    this.applyShareButtonTheme(isHtmlNode)
    this.renderBottomSheet(currentNode, chromeVisible)
    this.renderFloatingBackButton(currentNode, chromeVisible)
    this.renderInfoSheet(state.manifest, chromeVisible)

    this.env.dragHintBackdropEl.style.display = showHorizontalDragHint ? 'block' : 'none'
    this.env.dragHintBackdropEl.style.opacity = showHorizontalDragHint && chromeVisible ? '1' : '0'
    this.env.dragHintEl.style.display = showHorizontalDragHint ? 'block' : 'none'
    this.env.dragHintEl.style.opacity = showHorizontalDragHint && chromeVisible ? '1' : '0'
  }

  applyShareButtonTheme(useLightTheme: boolean): void {
    const nextMarkup = useLightTheme ? SHARE_ICON_WHITE_SVG : SHARE_ICON_SVG
    if (this.env.shareButtonEl.innerHTML !== nextMarkup) {
      this.env.shareButtonEl.innerHTML = nextMarkup
    }
    const svg = this.env.shareButtonEl.querySelector('svg')
    if (svg) {
      ;(svg as SVGElement).style.width = '24px'
      ;(svg as SVGElement).style.height = '24px'
      ;(svg as SVGElement).style.display = 'block'
    }
  }

  renderBottomSheet(currentNode: PublishNode | null, chromeVisible: boolean): void {
    const layer = this.env.getActiveSurfaceLayer(currentNode)
    const shouldMount = !!layer && chromeVisible && !this.env.infoSheetOpen
    const shouldShow = shouldMount && this.env.surfaceSheetOpen
    this.env.bottomSheetEl.style.display = shouldMount ? 'flex' : 'none'
    this.env.bottomSheetEl.style.opacity = shouldMount ? '1' : '0'
    this.env.bottomSheetEl.style.transform = shouldShow ? 'translateY(0)' : 'translateY(calc(100% + 20px))'
    this.env.bottomSheetEl.style.pointerEvents = shouldShow ? 'auto' : 'none'
    if (!shouldMount || !layer) {
      this.env.renderedBottomSheetNodeId = null
      this.env.renderedBottomSheetLayerId = null
      this.env.renderedBottomSheetCardId = null
      this.env.bottomSheetBreadcrumbEl.replaceChildren()
      this.env.bottomSheetCardsEl.replaceChildren()
      return
    }

    const currentNodeId = currentNode?.id ?? null
    const shouldRebuild = this.env.renderedBottomSheetNodeId !== currentNodeId
      || this.env.renderedBottomSheetLayerId !== layer.id
      || this.env.bottomSheetCardsEl.childElementCount !== layer.cards.length
    if (shouldRebuild) {
      this.env.bottomSheetBreadcrumbEl.replaceChildren()
      if (layer.primaryCategory?.trim()) {
        const primaryEl = document.createElement('span')
        primaryEl.textContent = layer.primaryCategory
        Object.assign(primaryEl.style, {
          fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
          fontStyle: 'normal',
          fontWeight: '600',
          fontSize: '14px',
          lineHeight: '18px',
          color: 'rgba(0, 0, 0, 0.84)',
          flexShrink: '0',
        })
        const separatorEl = document.createElement('span')
        separatorEl.textContent = '>'
        Object.assign(separatorEl.style, {
          fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
          fontStyle: 'normal',
          fontWeight: '600',
          fontSize: '14px',
          lineHeight: '18px',
          color: 'rgba(0, 0, 0, 0.84)',
          flexShrink: '0',
        })
        this.env.bottomSheetBreadcrumbEl.appendChild(primaryEl)
        this.env.bottomSheetBreadcrumbEl.appendChild(separatorEl)
      }
      const titleEl = document.createElement('span')
      titleEl.textContent = layer.title
      Object.assign(titleEl.style, {
        minWidth: '0',
        fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        fontStyle: 'normal',
        fontWeight: '400',
        fontSize: '14px',
        lineHeight: '18px',
        color: 'rgba(0, 0, 0, 0.6)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      })
      this.env.bottomSheetBreadcrumbEl.appendChild(titleEl)
      this.env.bottomSheetCardsEl.replaceChildren()

      for (const card of layer.cards) {
        const cardEl = document.createElement('button')
        const titleEl = document.createElement('div')
        const descEl = document.createElement('div')
        cardEl.type = 'button'
        cardEl.dataset.surfaceSheetCardId = card.id
        Object.assign(cardEl.style, {
          flex: '0 0 260px',
          minHeight: '108px',
          padding: '14px 16px',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          gap: '8px',
          textAlign: 'left',
          cursor: 'pointer',
          scrollSnapAlign: 'start',
        })
        Object.assign(titleEl.style, {
          fontSize: '16px',
          lineHeight: '22px',
          fontWeight: '700',
          color: 'rgba(0, 0, 0, 0.88)',
        })
        titleEl.textContent = card.title
        Object.assign(descEl.style, {
          fontSize: '14px',
          lineHeight: '22px',
          color: 'rgba(0, 0, 0, 0.72)',
        })
        descEl.textContent = card.description ?? ''
        cardEl.appendChild(titleEl)
        cardEl.appendChild(descEl)
        cardEl.addEventListener('click', event => {
          if (this.env.ignoreBottomSheetCardClick) {
            event.preventDefault()
            event.stopPropagation()
            this.env.ignoreBottomSheetCardClick = false
            return
          }
          event.preventDefault()
          event.stopPropagation()
          this.env.focusSurfaceCard(card.id, true)
        })
        this.env.bottomSheetCardsEl.appendChild(cardEl)
      }
      this.env.renderedBottomSheetNodeId = currentNodeId
      this.env.renderedBottomSheetLayerId = layer.id
    }
    this.syncBottomSheetCardSelection()
    if (this.env.renderedBottomSheetCardId !== this.env.activeSurfaceCardId) {
      this.env.renderedBottomSheetCardId = this.env.activeSurfaceCardId
      this.env.scrollActiveSheetCardIntoView()
    }
  }

  syncBottomSheetCardSelection(): void {
    const cards = Array.from(this.env.bottomSheetCardsEl.querySelectorAll<HTMLElement>('[data-surface-sheet-card-id]'))
    for (const cardEl of cards) {
      const selected = cardEl.dataset.surfaceSheetCardId === this.env.activeSurfaceCardId
      cardEl.style.border = selected ? '2px solid #3366FF' : '1px solid rgba(15, 23, 42, 0.08)'
      cardEl.style.background = selected ? 'rgba(51, 102, 255, 0.10)' : '#FFFFFF'
    }
  }

  renderFloatingBackButton(
    currentNode: PublishNode | null,
    chromeVisible: boolean,
  ): void {
    const nodeKind = this.env.getNodeKind(currentNode)
    const layer = this.env.getActiveSurfaceLayer(currentNode)
    const showForSurface = !!layer && chromeVisible && !this.env.infoSheetOpen
    const showForHtml = nodeKind === 'html' && chromeVisible && !this.env.infoSheetOpen
    const shouldShow = showForSurface || showForHtml
    this.env.bottomSheetResetButtonEl.style.display = shouldShow ? 'flex' : 'none'
    this.env.bottomSheetResetButtonEl.style.opacity = shouldShow ? '1' : '0'
    this.env.bottomSheetResetButtonEl.style.pointerEvents = shouldShow ? 'auto' : 'none'
    this.env.bottomSheetResetButtonEl.style.bottom = showForSurface && this.env.surfaceSheetOpen
      ? `${this.env.bottomSheetEl.offsetHeight + ChromeRenderer.FLOATING_BACK_BUTTON_OFFSET_PX}px`
      : `${ChromeRenderer.FLOATING_BACK_BUTTON_OFFSET_PX}px`
  }

  renderInfoSheet(manifest: PublishManifest | null, chromeVisible: boolean): void {
    const infoOverlay = this.getInfoOverlayConfig(manifest)
    const shouldShow = !!infoOverlay && chromeVisible && this.env.infoSheetOpen
    this.env.infoSheetBackdropEl.style.display = shouldShow ? 'block' : 'none'
    this.env.infoSheetBackdropEl.style.opacity = shouldShow ? '1' : '0'
    this.env.infoSheetBackdropEl.style.pointerEvents = shouldShow ? 'auto' : 'none'
    this.env.infoSheetEl.style.display = shouldShow ? 'flex' : 'none'
    this.env.infoSheetEl.style.opacity = shouldShow ? '1' : '0'
    this.env.infoSheetEl.style.pointerEvents = shouldShow ? 'auto' : 'none'
    if (!shouldShow || !infoOverlay) {
      this.env.infoSheetContentEl.replaceChildren()
      return
    }

    this.env.infoSheetTitleEl.textContent = infoOverlay.title?.trim() || INFO_SHEET_DEFAULT_TITLE
    this.env.infoSheetContentEl.replaceChildren()

    for (const section of infoOverlay.sections) {
      const sectionEl = document.createElement('section')
      const headingEl = document.createElement('div')
      const bodyEl = document.createElement('div')
      headingEl.textContent = section.heading
      bodyEl.textContent = section.body
      Object.assign(sectionEl.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      })
      Object.assign(headingEl.style, {
        fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        fontStyle: 'normal',
        fontWeight: '600',
        fontSize: '16px',
        lineHeight: '22px',
        color: 'rgba(0, 0, 0, 0.84)',
      })
      Object.assign(bodyEl.style, {
        fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
        fontStyle: 'normal',
        fontWeight: '400',
        fontSize: '14px',
        lineHeight: '20px',
        color: 'rgba(0, 0, 0, 0.6)',
        whiteSpace: 'pre-wrap',
      })
      sectionEl.appendChild(headingEl)
      sectionEl.appendChild(bodyEl)
      this.env.infoSheetContentEl.appendChild(sectionEl)
    }
  }

  getInfoOverlayConfig(manifest: PublishManifest | null | undefined): InfoOverlayConfig | null {
    const title = manifest?.infoOverlay?.title
    const sections = manifest?.infoOverlay?.sections?.filter(section => {
      return typeof section?.heading === 'string' && section.heading.trim()
        && typeof section?.body === 'string' && section.body.trim()
    }) ?? []
    if (sections.length === 0) {
      return INFO_SHEET_FALLBACK_CONFIG
    }
    return {
      title: typeof title === 'string' ? title : undefined,
      sections,
    }
  }

  toggleInfoSheet(): void {
    if (this.env.infoSheetOpen) {
      this.closeInfoSheet()
      return
    }
    const manifest = this.env.getManifest()
    if (!this.getInfoOverlayConfig(manifest)) return
    this.env.surfaceSheetOpen = false
    this.env.activeSurfaceCardId = null
    this.env.infoSheetOpen = true
    this.env.onChromeStateChanged()
  }

  closeInfoSheet(): void {
    if (!this.env.infoSheetOpen) return
    this.env.infoSheetOpen = false
    this.env.onChromeStateChanged()
  }
}

export interface BuildChromeCallbacks {
  onBack: () => void
  onToggleInfo: () => void
  onShare: () => void
  onCloseSheet: () => void
  onCloseInfo: () => void
}

export function buildChromeStructure(els: ChromeElements, cb: BuildChromeCallbacks): void {
  els.chromeRoot.dataset.playerHostChrome = 'true'
  els.chromeRoot.setAttribute('aria-hidden', 'false')

  const b = (el: HTMLElement) => el as HTMLButtonElement
  b(els.backButtonEl).type = 'button'
  els.backButtonEl.setAttribute('aria-label', '返回上一页')
  els.backButtonEl.innerHTML = BACK_ICON_SVG
  els.backButtonEl.addEventListener('click', () => cb.onBack())

  b(els.infoButtonEl).type = 'button'
  els.infoButtonEl.setAttribute('aria-label', '提示信息')
  els.infoButtonEl.innerHTML = INFO_ICON_SVG
  els.infoButtonEl.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    cb.onToggleInfo()
  })

  b(els.shareButtonEl).type = 'button'
  els.shareButtonEl.setAttribute('aria-label', '分享')
  els.shareButtonEl.innerHTML = SHARE_ICON_SVG
  els.shareButtonEl.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    cb.onShare()
  })

  b(els.bottomSheetResetButtonEl).type = 'button'
  els.bottomSheetResetButtonEl.setAttribute('aria-label', '返回总图')
  els.bottomSheetResetButtonEl.innerHTML = SHEET_BACK_ICON_SVG
  els.bottomSheetResetButtonEl.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    cb.onBack()
  })

  b(els.bottomSheetCloseButtonEl).type = 'button'
  els.bottomSheetCloseButtonEl.setAttribute('aria-label', '关闭底部浮层')
  els.bottomSheetCloseButtonEl.textContent = '×'
  els.bottomSheetCloseButtonEl.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    cb.onCloseSheet()
  })

  b(els.infoSheetCloseButtonEl).type = 'button'
  els.infoSheetCloseButtonEl.setAttribute('aria-label', '关闭说明弹窗')
  els.infoSheetCloseButtonEl.textContent = '×'
  els.infoSheetCloseButtonEl.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    cb.onCloseInfo()
  })

  els.infoSheetBackdropEl.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    cb.onCloseInfo()
  })

  els.headerCenterEl.appendChild(els.packageTitleEl)
  els.headerCenterEl.appendChild(els.infoButtonEl)
  els.bottomSheetActionsEl.appendChild(els.bottomSheetCloseButtonEl)
  els.bottomSheetHeaderEl.appendChild(els.bottomSheetBreadcrumbEl)
  els.bottomSheetHeaderEl.appendChild(els.bottomSheetActionsEl)
  els.bottomSheetEl.appendChild(els.bottomSheetHeaderEl)
  els.bottomSheetEl.appendChild(els.bottomSheetCardsEl)
  els.infoSheetHeaderEl.appendChild(els.infoSheetTitleEl)
  els.infoSheetHeaderEl.appendChild(els.infoSheetCloseButtonEl)
  els.infoSheetEl.appendChild(els.infoSheetHeaderEl)
  els.infoSheetEl.appendChild(els.infoSheetContentEl)
  els.chromeRoot.appendChild(els.headerBackdropEl)
  els.chromeRoot.appendChild(els.headerCenterEl)
  els.chromeRoot.appendChild(els.shareButtonEl)
  els.chromeRoot.appendChild(els.bottomSheetResetButtonEl)
  els.chromeRoot.appendChild(els.bottomSheetEl)
  els.chromeRoot.appendChild(els.infoSheetBackdropEl)
  els.chromeRoot.appendChild(els.infoSheetEl)
  els.chromeRoot.appendChild(els.dragHintBackdropEl)
  els.chromeRoot.appendChild(els.dragHintEl)
}
