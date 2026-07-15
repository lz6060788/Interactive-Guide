import { HOST_INFO_SHEET_DEFAULT_SECTIONS, HOST_INFO_SHEET_TITLE } from './host-info-sheet.js'
import {
  HOST_BACK_ICON_SVG,
  HOST_INFO_ICON_SVG,
  HOST_SHARE_ICON_SVG,
} from './host-toolbar-icons.js'
import {
  HOST_TOOLBAR_SIDE_OFFSET_PX,
  HOST_TOOLBAR_TITLE_MAX_WIDTH_PX,
  HOST_TOOLBAR_TOP_GRADIENT,
  HOST_TOOLBAR_TOP_OFFSET_PX,
} from './host-toolbar-tokens.js'

export interface HostToolbarDomTestIds {
  toolbar?: string
  back?: string
  title?: string
  info?: string
  share?: string
  infoBackdrop?: string
  infoSheet?: string
}

export interface HostToolbarDomOptions {
  root: HTMLElement
  title: string
  textColor: string
  onBack: () => void
  onShare: () => void
  showShare?: boolean
  showGradient?: boolean
  testIds?: HostToolbarDomTestIds
  zIndexBase?: number
}

export class HostToolbarDomController {
  private readonly options: HostToolbarDomOptions
  private gradientEl: HTMLElement | null = null
  private toolbarEl: HTMLElement | null = null
  private backdropEl: HTMLElement | null = null
  private sheetEl: HTMLElement | null = null
  private infoOpen = false

  constructor(options: HostToolbarDomOptions) {
    this.options = options
  }

  mount(): void {
    if (this.toolbarEl) return
    const zIndexBase = this.options.zIndexBase ?? 20
    const gradient = document.createElement('div')
    gradient.style.position = 'absolute'
    gradient.style.left = '0'
    gradient.style.right = '0'
    gradient.style.top = '0'
    gradient.style.height = '96px'
    gradient.style.pointerEvents = 'none'
    gradient.style.zIndex = String(zIndexBase - 1)
    gradient.style.background = HOST_TOOLBAR_TOP_GRADIENT
    gradient.style.display = this.options.showGradient === false ? 'none' : 'block'

    const toolbar = document.createElement('div')
    if (this.options.testIds?.toolbar) toolbar.dataset.testid = this.options.testIds.toolbar
    toolbar.style.position = 'absolute'
    toolbar.style.inset = '0'
    toolbar.style.pointerEvents = 'none'
    toolbar.style.zIndex = String(zIndexBase)

    const backButton = createIconButton(
      '返回',
      HOST_BACK_ICON_SVG,
      this.options.textColor,
      this.options.onBack,
    )
    if (this.options.testIds?.back) backButton.dataset.testid = this.options.testIds.back
    backButton.style.position = 'absolute'
    backButton.style.left = `${HOST_TOOLBAR_SIDE_OFFSET_PX}px`
    backButton.style.top = `${HOST_TOOLBAR_TOP_OFFSET_PX}px`
    backButton.style.width = '32px'
    backButton.style.height = '32px'

    const center = document.createElement('div')
    center.style.position = 'absolute'
    center.style.left = '50%'
    center.style.top = `${HOST_TOOLBAR_TOP_OFFSET_PX}px`
    center.style.transform = 'translateX(-50%)'
    center.style.display = 'flex'
    center.style.alignItems = 'center'
    center.style.gap = '4px'
    center.style.maxWidth = 'calc(100% - 120px)'
    center.style.pointerEvents = 'auto'

    const title = document.createElement('div')
    if (this.options.testIds?.title) title.dataset.testid = this.options.testIds.title
    title.textContent = this.options.title
    title.style.minHeight = '24px'
    title.style.maxWidth = `${HOST_TOOLBAR_TITLE_MAX_WIDTH_PX}px`
    title.style.fontSize = '17px'
    title.style.lineHeight = '24px'
    title.style.fontWeight = '700'
    title.style.whiteSpace = 'nowrap'
    title.style.overflow = 'hidden'
    title.style.textOverflow = 'ellipsis'
    title.style.color = this.options.textColor
    title.style.pointerEvents = 'none'

    const infoButton = createIconButton(
      '提示信息',
      HOST_INFO_ICON_SVG,
      this.options.textColor,
      () => this.toggleInfo(),
    )
    if (this.options.testIds?.info) infoButton.dataset.testid = this.options.testIds.info
    infoButton.style.width = '24px'
    infoButton.style.height = '24px'

    const shareButton = createIconButton(
      '分享',
      HOST_SHARE_ICON_SVG,
      this.options.textColor,
      this.options.onShare,
    )
    if (this.options.testIds?.share) shareButton.dataset.testid = this.options.testIds.share
    shareButton.style.position = 'absolute'
    shareButton.style.right = `${HOST_TOOLBAR_SIDE_OFFSET_PX}px`
    shareButton.style.top = `${HOST_TOOLBAR_TOP_OFFSET_PX}px`
    shareButton.style.width = '24px'
    shareButton.style.height = '24px'
    shareButton.style.display = this.options.showShare === false ? 'none' : 'flex'

    center.appendChild(title)
    center.appendChild(infoButton)
    toolbar.appendChild(backButton)
    toolbar.appendChild(center)
    toolbar.appendChild(shareButton)

    const { backdrop, sheet } = createInfoSheet(
      () => this.closeInfo(),
      this.options.testIds,
      zIndexBase,
    )

    this.options.root.appendChild(gradient)
    this.options.root.appendChild(toolbar)
    this.options.root.appendChild(backdrop)
    this.options.root.appendChild(sheet)

    this.gradientEl = gradient
    this.toolbarEl = toolbar
    this.backdropEl = backdrop
    this.sheetEl = sheet
  }

  destroy(): void {
    this.gradientEl?.remove()
    this.toolbarEl?.remove()
    this.backdropEl?.remove()
    this.sheetEl?.remove()
    this.gradientEl = null
    this.toolbarEl = null
    this.backdropEl = null
    this.sheetEl = null
    this.infoOpen = false
  }

  private toggleInfo(): void {
    if (this.infoOpen) {
      this.closeInfo()
      return
    }
    this.infoOpen = true
    if (this.backdropEl) {
      this.backdropEl.style.display = 'block'
      this.backdropEl.style.opacity = '1'
      this.backdropEl.style.pointerEvents = 'auto'
    }
    if (this.sheetEl) {
      this.sheetEl.style.display = 'flex'
      this.sheetEl.style.opacity = '1'
    }
  }

  private closeInfo(): void {
    this.infoOpen = false
    if (this.backdropEl) {
      this.backdropEl.style.opacity = '0'
      this.backdropEl.style.pointerEvents = 'none'
      this.backdropEl.style.display = 'none'
    }
    if (this.sheetEl) {
      this.sheetEl.style.opacity = '0'
      this.sheetEl.style.display = 'none'
    }
  }
}

function createIconButton(
  label: string,
  svg: string,
  color: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.innerHTML = svg
  button.style.border = 'none'
  button.style.borderRadius = '0'
  button.style.padding = '0'
  button.style.background = 'transparent'
  button.style.cursor = 'pointer'
  button.style.pointerEvents = 'auto'
  button.style.display = 'flex'
  button.style.alignItems = 'center'
  button.style.justifyContent = 'center'
  button.style.color = color
  button.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  const svgEl =
    typeof (button as HTMLButtonElement & { querySelector?: unknown }).querySelector === 'function'
      ? button.querySelector('svg')
      : null
  if (svgEl) svgEl.style.display = 'block'
  return button
}

function createInfoSheet(
  onClose: () => void,
  testIds: HostToolbarDomTestIds | undefined,
  zIndexBase: number,
): { backdrop: HTMLElement; sheet: HTMLElement } {
  const backdrop = document.createElement('div')
  if (testIds?.infoBackdrop) backdrop.dataset.testid = testIds.infoBackdrop
  backdrop.style.position = 'absolute'
  backdrop.style.inset = '0'
  backdrop.style.display = 'none'
  backdrop.style.background = 'rgba(0, 0, 0, 0.8)'
  backdrop.style.opacity = '0'
  backdrop.style.transition = 'opacity 220ms ease'
  backdrop.style.pointerEvents = 'none'
  backdrop.style.zIndex = String(zIndexBase + 9)
  backdrop.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    onClose()
  })

  const sheet = document.createElement('div')
  if (testIds?.infoSheet) sheet.dataset.testid = testIds.infoSheet
  sheet.style.position = 'absolute'
  sheet.style.left = '0'
  sheet.style.right = '0'
  sheet.style.bottom = '0'
  sheet.style.display = 'none'
  sheet.style.flexDirection = 'column'
  sheet.style.gap = '16px'
  sheet.style.padding = '18px 22px 24px'
  sheet.style.borderTopLeftRadius = '8px'
  sheet.style.borderTopRightRadius = '8px'
  sheet.style.background = '#FFFFFF'
  sheet.style.boxShadow = '0 -10px 36px rgba(15, 23, 42, 0.12)'
  sheet.style.opacity = '0'
  sheet.style.transition = 'opacity 220ms ease'
  sheet.style.maxHeight = '50vh'
  sheet.style.overflow = 'hidden'
  sheet.style.boxSizing = 'border-box'
  sheet.style.zIndex = String(zIndexBase + 10)

  const header = document.createElement('div')
  header.style.position = 'relative'
  header.style.display = 'flex'
  header.style.alignItems = 'center'
  header.style.justifyContent = 'center'
  header.style.minHeight = '28px'

  const title = document.createElement('div')
  title.textContent = HOST_INFO_SHEET_TITLE
  title.style.fontWeight = '600'
  title.style.fontSize = '16px'
  title.style.lineHeight = '22px'
  title.style.color = 'rgba(0, 0, 0, 0.84)'

  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = '×'
  close.style.position = 'absolute'
  close.style.right = '0'
  close.style.top = '50%'
  close.style.transform = 'translateY(-50%)'
  close.style.width = '28px'
  close.style.height = '28px'
  close.style.border = 'none'
  close.style.borderRadius = '999px'
  close.style.background = 'transparent'
  close.style.color = 'rgba(0, 0, 0, 0.36)'
  close.style.fontSize = '24px'
  close.style.cursor = 'pointer'
  close.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    onClose()
  })

  const content = document.createElement('div')
  content.style.display = 'flex'
  content.style.flexDirection = 'column'
  content.style.gap = '18px'
  content.style.overflowY = 'auto'
  content.style.minHeight = '0'
  content.style.paddingRight = '2px'

  for (const section of HOST_INFO_SHEET_DEFAULT_SECTIONS) {
    const sectionEl = document.createElement('section')
    const headingEl = document.createElement('div')
    headingEl.textContent = section.heading
    headingEl.style.fontWeight = '700'
    headingEl.style.fontSize = '13px'
    headingEl.style.lineHeight = '18px'
    headingEl.style.color = 'rgba(0, 0, 0, 0.84)'
    headingEl.style.marginBottom = '6px'

    const bodyEl = document.createElement('div')
    bodyEl.textContent = section.body
    bodyEl.style.fontSize = '13px'
    bodyEl.style.lineHeight = '22px'
    bodyEl.style.color = 'rgba(0, 0, 0, 0.72)'

    sectionEl.appendChild(headingEl)
    sectionEl.appendChild(bodyEl)
    content.appendChild(sectionEl)
  }

  header.appendChild(title)
  header.appendChild(close)
  sheet.appendChild(header)
  sheet.appendChild(content)
  return { backdrop, sheet }
}
