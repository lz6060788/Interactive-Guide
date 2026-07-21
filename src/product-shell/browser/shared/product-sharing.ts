import type { RuntimeShareConfig } from '../../../products/contracts/runtime-integrations.js'
import type { AtlasPageTracker } from '../../../platform/analytics/atlas-page-tracker.js'
import {
  createShareUrl,
  F10HostAdapter,
  shareWithBestAvailableHost,
  type F10SharePayload,
} from '../../../platform/f10/f10-host-adapter.js'

export interface ProductShareControllerOptions {
  projectTitle: string
  config?: RuntimeShareConfig<string>
  tracker?: AtlasPageTracker
  currentHref?: () => string
  resolveAssetUrl?: (url: string) => string
  f10?: F10HostAdapter
}

export class ProductShareController {
  readonly enabled: boolean
  private readonly options: ProductShareControllerOptions

  constructor(options: ProductShareControllerOptions) {
    this.options = options
    this.enabled = options.config?.enabled === true
  }

  async share(): Promise<void> {
    if (!this.enabled) return
    this.options.tracker?.reportShareClick()
    const href = this.options.currentHref?.() ?? window.location.href
    const shareUrl = createShareUrl(href)
    const title = this.options.config?.title?.trim() || this.options.projectTitle
    const description = this.options.config?.description?.trim() || title
    const resolvedImageUrl = this.options.config?.imageUrl
      ? (this.options.resolveAssetUrl?.(this.options.config.imageUrl) ??
        this.options.config.imageUrl)
      : undefined
    const imageUrl = resolvedImageUrl ? new URL(resolvedImageUrl, href).href : undefined
    const payload: F10SharePayload = {
      title,
      text: title,
      content: description,
      description,
      url: shareUrl,
      shareUrl,
      ...(imageUrl ? { bmpUrl: imageUrl, bmpRes: 1 } : {}),
    }
    await shareWithBestAvailableHost(this.options.f10 ?? new F10HostAdapter(), payload)
  }
}
