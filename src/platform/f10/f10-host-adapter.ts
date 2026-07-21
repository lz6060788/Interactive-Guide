export const F10_UTILS_SCRIPT_URL =
  'https://s.thsi.cn/cb?cd/website-thsc-f10-utils/1.6.3/;thsc-f10-utils.js;js/m/common/;basic.js'

export interface F10SharePayload {
  title: string
  text: string
  content: string
  description: string
  url: string
  shareUrl: string
  bmpUrl?: string
  bmpRes?: number
}

export interface F10UtilsApi {
  shareUrlCard?: (payload: F10SharePayload) => void | Promise<void>
  jumpTofullScreenPage?: (url: string) => void | Promise<void>
}

interface KingFisherVendorScripts {
  bridge?: string
  falcon?: string
}

export interface FalconHostMarkers {
  _falcon?: unknown
  FalconJavaInterface?: unknown
}

interface F10HostWindow extends Window, FalconHostMarkers {
  F10Utils?: F10UtilsApi
  _f?: F10UtilsApi
  Bridge?: unknown
  __interactiveGuideKingFisherScripts?: KingFisherVendorScripts
  __interactiveGuideF10UtilsPromise?: Promise<F10UtilsApi | null>
}

export class F10HostAdapter {
  constructor(
    private readonly hostWindow: F10HostWindow = globalThis.window as F10HostWindow,
    private readonly hostDocument: Document | null = typeof document === 'undefined'
      ? null
      : document,
  ) {}

  async shareUrlCard(payload: F10SharePayload): Promise<boolean> {
    if (!isFalconHost(this.hostWindow)) return false
    const utils = await this.ensureLoaded()
    if (typeof utils?.shareUrlCard !== 'function') return false
    await utils.shareUrlCard(payload)
    return true
  }

  async jumpTofullScreenPage(url: string): Promise<boolean> {
    if (!isFalconHost(this.hostWindow)) return false
    const utils = await this.ensureLoaded()
    if (typeof utils?.jumpTofullScreenPage !== 'function') return false
    await utils.jumpTofullScreenPage(url)
    return true
  }

  async ensureLoaded(): Promise<F10UtilsApi | null> {
    const existing = resolveF10Utils(this.hostWindow)
    if (existing) return existing
    if (!this.hostWindow.__interactiveGuideF10UtilsPromise) {
      this.hostWindow.__interactiveGuideF10UtilsPromise = this.loadDependencyChain()
    }
    return this.hostWindow.__interactiveGuideF10UtilsPromise
  }

  private async loadDependencyChain(): Promise<F10UtilsApi | null> {
    if (!this.hostDocument) return null
    const scripts = this.hostWindow.__interactiveGuideKingFisherScripts
    if (scripts?.bridge) {
      await ensureInlineScript(
        this.hostDocument,
        'data-interactive-guide-kingfisher-bridge',
        scripts.bridge,
      )
      const bridgeWindow = this.hostWindow as F10HostWindow & {
        ['kingfisher-bridge']?: unknown
      }
      if (!bridgeWindow.Bridge && bridgeWindow['kingfisher-bridge']) {
        bridgeWindow.Bridge = bridgeWindow['kingfisher-bridge']
      }
    }
    if (scripts?.falcon) {
      await ensureInlineScript(
        this.hostDocument,
        'data-interactive-guide-kingfisher-falcon',
        scripts.falcon,
      )
    }
    await ensureExternalScript(
      this.hostDocument,
      'data-interactive-guide-f10-utils',
      F10_UTILS_SCRIPT_URL,
    )
    return resolveF10Utils(this.hostWindow)
  }
}

export function isFalconHost(hostWindow: FalconHostMarkers): boolean {
  return (
    typeof hostWindow._falcon !== 'undefined' ||
    typeof hostWindow.FalconJavaInterface !== 'undefined'
  )
}

export function createShareUrl(href: string): string {
  const url = new URL(href)
  url.searchParams.set('from', 'share')
  return url.href
}

export async function shareWithBestAvailableHost(
  adapter: F10HostAdapter,
  payload: F10SharePayload,
  browserNavigator: Pick<Navigator, 'share' | 'clipboard'> = globalThis.navigator,
): Promise<void> {
  try {
    if (await adapter.shareUrlCard(payload)) return
    throw new Error('F10Utils.shareUrlCard is unavailable')
  } catch {
    // F10 is optional outside the client host; fall through to Web Share.
  }

  try {
    if (typeof browserNavigator?.share !== 'function') {
      throw new Error('navigator.share is unavailable')
    }
    await browserNavigator.share({
      title: payload.title,
      text: payload.description,
      url: payload.url,
    })
    return
  } catch {
    // User cancellation and unsupported payloads fall through to copy.
  }
  if (browserNavigator?.clipboard?.writeText) {
    await browserNavigator.clipboard.writeText(payload.url).catch(() => undefined)
  }
}

function resolveF10Utils(hostWindow: F10HostWindow): F10UtilsApi | null {
  const utils = hostWindow.F10Utils ?? hostWindow._f ?? null
  if (utils && !hostWindow.F10Utils) hostWindow.F10Utils = utils
  return utils
}

function ensureInlineScript(
  documentRef: Document,
  attribute: string,
  source: string,
): Promise<void> {
  if (documentRef.querySelector(`script[${attribute}="true"]`)) return Promise.resolve()
  const script = documentRef.createElement('script')
  script.type = 'text/javascript'
  script.setAttribute(attribute, 'true')
  script.text = source
  documentRef.head.appendChild(script)
  return Promise.resolve()
}

function ensureExternalScript(
  documentRef: Document,
  attribute: string,
  src: string,
): Promise<void> {
  return new Promise(resolve => {
    const existing = documentRef.querySelector(
      `script[${attribute}="true"]`,
    ) as HTMLScriptElement | null
    if (existing) {
      if (existing.dataset['loaded'] === 'true' || existing.dataset['failed'] === 'true') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => resolve(), { once: true })
      return
    }
    const script = documentRef.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.setAttribute(attribute, 'true')
    script.addEventListener(
      'load',
      () => {
        script.dataset['loaded'] = 'true'
        resolve()
      },
      { once: true },
    )
    script.addEventListener(
      'error',
      () => {
        script.dataset['failed'] = 'true'
        resolve()
      },
      { once: true },
    )
    documentRef.head.appendChild(script)
  })
}
