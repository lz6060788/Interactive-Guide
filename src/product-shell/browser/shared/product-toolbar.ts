import { HostToolbarDomController } from '../../../platform/chrome/host-toolbar-dom.js'

export interface ProductToolbarOptions {
  root: HTMLElement
  projectTitle: string
  textColor?: string
  onBack?: () => void
  onShare?: () => void
  shareEnabled?: boolean
  locale?: string
}

export class ProductToolbar {
  private readonly options: ProductToolbarOptions
  private controller: HostToolbarDomController | null = null

  constructor(options: ProductToolbarOptions) {
    this.options = options
  }

  mount(): void {
    this.controller?.destroy()
    this.controller = new HostToolbarDomController({
      root: this.options.root,
      title: this.options.projectTitle,
      textColor: this.options.textColor ?? '#FFFFFF',
      onBack: () => {
        if (this.options.onBack) {
          this.options.onBack()
          return
        }
        if (window.history.length > 1) window.history.back()
      },
      onShare: () => {
        if (this.options.onShare) {
          this.options.onShare()
          return
        }
        void shareCurrentPage(this.options.projectTitle)
      },
      showShare: this.options.shareEnabled !== false,
      locale: this.options.locale,
      testIds: {
        toolbar: 'product-shell-toolbar',
      },
    })
    this.controller.mount()
  }

  destroy(): void {
    this.controller?.destroy()
    this.controller = null
  }
}

export async function shareCurrentPage(title: string): Promise<void> {
  const url = window.location.href
  if (navigator.share) {
    await navigator.share({ title, url }).catch(() => undefined)
    return
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url).catch(() => undefined)
  }
}
