import type { PanoramaHtmlProduct, PanoramaRuntimeState } from '../../shared/panorama-types.js'
import { isPanoramaGroup } from '../../shared/panorama-types.js'

export const STANDALONE_PRODUCT_BASE_URL = 'http://o.thsi.cn/datav.narrative-vision/interactive-guide'
const THSC_F10_UTILS_CDN_URL = 'https://s.thsi.cn/cb?cd/website-thsc-f10-utils/1.6.3/;thsc-f10-utils.js;js/m/common/;basic.js'
const THSC_F10_UTILS_SCRIPT_ATTR = 'data-panorama-player-host-f10-utils'

type F10ShareUtils = {
  jumpTofullScreenPage?: (url: string) => void | Promise<void>
}

type PanoramaPlayerHostWindow = Window & typeof globalThis & {
  F10Utils?: F10ShareUtils
  _f?: F10ShareUtils
  __panoramaPlayerHostF10UtilsPromise?: Promise<F10ShareUtils | null>
}

export interface PanoramaShareManagerEnv {
  readonly product: PanoramaHtmlProduct | null
  readonly state: PanoramaRuntimeState | null
  readonly htmlFrameEl: HTMLIFrameElement
}

export class PanoramaShareManager {
  constructor(private env: PanoramaShareManagerEnv) {}

  async openStandaloneProduct(): Promise<void> {
    const targetUrl = this.buildStandaloneProductUrl()
    if (!targetUrl) return

    const f10Utils = await this.ensureF10ShareUtilsLoaded()
    if (f10Utils?.jumpTofullScreenPage) {
      await f10Utils.jumpTofullScreenPage(targetUrl)
      return
    }

    openInBestAvailableWindow(targetUrl)
  }

  private async ensureF10ShareUtilsLoaded(): Promise<F10ShareUtils | null> {
    const hostWindow = window as PanoramaPlayerHostWindow
    const resolvedUtils = resolveF10ShareUtils(hostWindow)
    if (resolvedUtils) return resolvedUtils
    if (hostWindow.__panoramaPlayerHostF10UtilsPromise) {
      return hostWindow.__panoramaPlayerHostF10UtilsPromise
    }

    hostWindow.__panoramaPlayerHostF10UtilsPromise = ensureExternalScriptLoaded(
      THSC_F10_UTILS_SCRIPT_ATTR,
      THSC_F10_UTILS_CDN_URL,
    ).then(() => resolveF10ShareUtils(hostWindow))

    return hostWindow.__panoramaPlayerHostF10UtilsPromise
  }

  private buildStandaloneProductUrl(): string | null {
    if (!this.env.product?.packageId || !this.env.product.version) return null
    const targetUrl = new URL(
      `${encodeURIComponent(this.env.product.packageId)}/${encodeURIComponent(this.env.product.version)}/index.html`,
      `${STANDALONE_PRODUCT_BASE_URL}/`,
    )
    const focusName = this.resolveStandaloneFocusName()
    if (focusName) {
      targetUrl.searchParams.set('focus', focusName)
    }
    return targetUrl.toString()
  }

  private resolveStandaloneFocusName(): string | null {
    if (!this.env.product || !this.env.state) return null
    const section = this.env.product.sections.find(entry => entry.id === this.env.state?.activeSectionId)
    const group = section?.groups.find(entry => entry.id === this.env.state?.activeGroupId)
    if (!group) return null
    if (isPanoramaGroup(group)) {
      const activeItem = group.items.find(entry => entry.id === this.env.state?.activeItemId)
      return activeItem?.title?.trim() || null
    }
    return this.resolveHtmlStandaloneFocusName()
  }

  private resolveHtmlStandaloneFocusName(): string | null {
    const iframeWindow = this.env.htmlFrameEl.contentWindow as (Window & {
      __interactiveGuideGetCurrentFocusName?: () => unknown
    }) | null
    if (!iframeWindow || typeof iframeWindow.__interactiveGuideGetCurrentFocusName !== 'function') {
      return null
    }
    try {
      const focusName = iframeWindow.__interactiveGuideGetCurrentFocusName()
      return typeof focusName === 'string' && focusName.trim() ? focusName.trim() : null
    } catch {
      return null
    }
  }
}

async function ensureExternalScriptLoaded(
  scriptAttr: string,
  src: string,
): Promise<void> {
  await new Promise<void>(resolve => {
    const complete = () => resolve()
    const existingScript = document.querySelector(
      `script[${scriptAttr}="true"]`,
    ) as HTMLScriptElement | null
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true' || existingScript.dataset.failed === 'true') {
        complete()
        return
      }
      existingScript.addEventListener('load', complete, { once: true })
      existingScript.addEventListener('error', complete, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.setAttribute(scriptAttr, 'true')
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      complete()
    }, { once: true })
    script.addEventListener('error', () => {
      script.dataset.failed = 'true'
      complete()
    }, { once: true })
    document.head.appendChild(script)
  })
}

function resolveF10ShareUtils(hostWindow: PanoramaPlayerHostWindow): F10ShareUtils | null {
  const utils = hostWindow.F10Utils ?? hostWindow._f ?? null
  if (utils && !hostWindow.F10Utils) {
    hostWindow.F10Utils = utils
  }
  return utils
}

function openInBestAvailableWindow(targetUrl: string): void {
  const features = 'noopener,noreferrer'
  try {
    const topWindow = window.top
    if (topWindow && typeof topWindow.open === 'function') {
      const openedByTop = topWindow.open(targetUrl, '_blank', features)
      if (openedByTop) {
        return
      }
    }
  } catch {
    // Fall back to the current browsing context when top-level open is blocked.
  }
  window.open(targetUrl, '_blank', features)
}
