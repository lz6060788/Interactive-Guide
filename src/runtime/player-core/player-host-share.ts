import type { PlayerHostWindow } from './player-host.js'

export type BrowserNavigatorWithShare = Navigator & {
  share?: (data: { title?: string, text?: string, url?: string }) => Promise<void>
}

export type F10ShareUtils = {
  shareUrlCard?: (payload?: Record<string, unknown>) => void | Promise<void>
}

const THSC_F10_UTILS_CDN_URL = 'https://s.thsi.cn/cb?cd/website-thsc-f10-utils/1.6.0/thsc-f10-utils.js'
const KINGFISHER_BRIDGE_SCRIPT_ATTR = 'data-interactive-guide-kingfisher-bridge'
const KINGFISHER_FALCON_SCRIPT_ATTR = 'data-interactive-guide-kingfisher-falcon'
const THSC_F10_UTILS_SCRIPT_ATTR = 'data-interactive-guide-f10-utils'

export class ShareManager {
  private primed = false

  // Injected by PlayerHost
  ensureExternalScriptLoaded: ((attr: string, url: string) => Promise<void>) | null = null
  getInlineScriptText: ((name: 'kingfisher-bridge' | 'kingfisher-falcon') => string) | null = null
  getManifestTitle: (() => string) | null = null
  reportShare: (() => void) | null = null

  canShare(): boolean {
    return this.canUseFalconShare() || this.canUseNativeShare()
  }

  prime(): void {
    if (this.primed) return
    this.primed = true
    if (!this.canUseFalconShare()) return
    void this.ensureF10ShareUtilsLoaded()
  }

  async share(): Promise<void> {
    await this.reportShare?.()
    const shareUrl = new URL(window.location.href)
    shareUrl.searchParams.set('from', 'share')
    const shareUrlString = shareUrl.href
    const title = this.getManifestTitle?.() ?? ''
    const sharePayload = {
      title,
      text: title,
      url: shareUrlString,
      shareUrl: shareUrlString,
      content: title,
      description: title,
    }
    if (this.canUseFalconShare()) {
      const sharedByF10 = await this.tryShareWithF10(sharePayload)
      if (sharedByF10) return
    }
    await this.shareWithNavigator(sharePayload)
  }

  private canUseFalconShare(): boolean {
    const hostWindow = window as PlayerHostWindow
    return typeof hostWindow._falcon !== 'undefined'
      || typeof hostWindow.FalconJavaInterface !== 'undefined'
  }

  private canUseNativeShare(): boolean {
    const browserNavigator = globalThis.navigator as BrowserNavigatorWithShare
    return typeof browserNavigator.share === 'function'
  }

  private async shareWithNavigator(payload: {
    title?: string
    text?: string
    url?: string
  }): Promise<void> {
    const browserNavigator = globalThis.navigator as BrowserNavigatorWithShare
    if (typeof browserNavigator.share !== 'function') return
    try {
      await browserNavigator.share(payload)
    } catch {
      // Ignore abort and unsupported platform share failures.
    }
  }

  private async tryShareWithF10(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const f10Utils = await this.ensureF10ShareUtilsLoaded()
      if (typeof f10Utils?.shareUrlCard !== 'function') return false
      await f10Utils.shareUrlCard(payload)
      return true
    } catch {
      return false
    }
  }

  private async ensureF10ShareUtilsLoaded(): Promise<F10ShareUtils | null> {
    const hostWindow = window as PlayerHostWindow
    const resolvedUtils = this.resolveF10ShareUtils(hostWindow)
    if (resolvedUtils) return resolvedUtils
    if (hostWindow.__interactiveGuideF10UtilsPromise) {
      return hostWindow.__interactiveGuideF10UtilsPromise
    }
    hostWindow.__interactiveGuideF10UtilsPromise = this.loadShareDependencyChain()
      .then(() => this.resolveF10ShareUtils(hostWindow))
    return hostWindow.__interactiveGuideF10UtilsPromise
  }

  private async loadShareDependencyChain(): Promise<void> {
    const hostWindow = window as PlayerHostWindow
    await this.ensureInlineScriptLoaded(
      KINGFISHER_BRIDGE_SCRIPT_ATTR,
      this.getInlineScriptText?.('kingfisher-bridge') ?? '',
      () => {
        const bridge = hostWindow.Bridge ?? hostWindow['kingfisher-bridge']
        if (bridge && !hostWindow.Bridge) {
          hostWindow.Bridge = bridge
        }
      },
    )
    await this.ensureInlineScriptLoaded(
      KINGFISHER_FALCON_SCRIPT_ATTR,
      this.getInlineScriptText?.('kingfisher-falcon') ?? '',
    )
    await this.ensureExternalScriptLoaded?.(
      THSC_F10_UTILS_SCRIPT_ATTR,
      THSC_F10_UTILS_CDN_URL,
    )
  }

  private async ensureInlineScriptLoaded(
    scriptAttr: string,
    scriptText: string,
    onReady?: () => void,
  ): Promise<void> {
    const existingScript = document.querySelector(
      `script[${scriptAttr}="true"]`,
    ) as HTMLScriptElement | null
    if (existingScript) {
      onReady?.()
      return
    }
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.setAttribute(scriptAttr, 'true')
    script.text = scriptText
    document.head.appendChild(script)
    onReady?.()
  }

  private resolveF10ShareUtils(hostWindow: PlayerHostWindow): F10ShareUtils | null {
    const utils = hostWindow.F10Utils ?? hostWindow._f ?? null
    if (utils && !hostWindow.F10Utils) {
      hostWindow.F10Utils = utils
    }
    return utils
  }
}
