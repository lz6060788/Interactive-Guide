import type { AnalyticsConfig } from '../../domain/project-types.js'

export const WEBLOG_SCRIPT_URL = 'https://s.thsi.cn/cd/weblog/0.0.8/weblog.js'

export interface WeBlogPayload {
  id: string
  action: 'show' | 'click'
  logmap: Record<string, string | number>
}

export interface WeBlogClient {
  setConfig?: (config: { appKey: string; debug: boolean }) => void
  report?: (payload: WeBlogPayload) => void
}

interface WeBlogHostWindow extends Window {
  weblog?: WeBlogClient
  __interactiveGuideWeblogPromise?: Promise<WeBlogClient | null>
  __interactiveGuideWeblogConfiguredAppKey?: string
}

export interface AtlasPageTrackerEnvironment {
  now(): number
  href(): string
  isVisible(): boolean
  setInterval(callback: () => void, intervalMs: number): number
  clearInterval(timer: number): void
  onVisibilityChange(callback: () => void): () => void
  onPageHide(callback: () => void): () => void
}

export interface AtlasPageTrackerOptions {
  config: AnalyticsConfig
  loadWeblog?: () => Promise<WeBlogClient | null>
  environment?: AtlasPageTrackerEnvironment
}

export class AtlasPageTracker {
  private readonly config: AnalyticsConfig
  private readonly loadWeblog: () => Promise<WeBlogClient | null>
  private readonly environment: AtlasPageTrackerEnvironment
  private started = false
  private exposureReported = false
  private backflowReported = false
  private visibleStartedAt: number | null = null
  private accumulatedVisibleMs = 0
  private lastReportedStaySeconds = 0
  private timer: number | null = null
  private removeVisibilityListener: (() => void) | null = null
  private removePageHideListener: (() => void) | null = null
  private reportQueue: Promise<void> = Promise.resolve()

  constructor(options: AtlasPageTrackerOptions) {
    this.config = options.config
    this.environment = options.environment ?? createBrowserTrackerEnvironment()
    this.loadWeblog = options.loadWeblog ?? (() => loadAndConfigureWeblog(this.config))
  }

  start(): void {
    if (this.started) return
    this.started = true
    if (this.environment.isVisible()) this.visibleStartedAt = this.environment.now()
    this.removeVisibilityListener = this.environment.onVisibilityChange(() => {
      if (this.environment.isVisible()) {
        this.resumeStayTracking()
      } else {
        this.pauseStayTracking()
      }
    })
    this.removePageHideListener = this.environment.onPageHide(() => this.pauseStayTracking())
    this.timer = this.environment.setInterval(() => this.flushStayMilestones(false), 1000)
    this.reportPageExposure()
    this.reportBackflowIfNeeded()
  }

  reportShareClick(): void {
    this.enqueue({
      id: 'ths_f10_f10detail_module_share',
      action: 'click',
      logmap: {
        stock: '',
        marketId: '',
        pageType: this.config.pageType,
        name: this.config.name,
      },
    })
  }

  destroy(): void {
    if (!this.started) return
    this.started = false
    this.flushStayMilestones(true)
    if (this.timer !== null) this.environment.clearInterval(this.timer)
    this.timer = null
    this.removeVisibilityListener?.()
    this.removeVisibilityListener = null
    this.removePageHideListener?.()
    this.removePageHideListener = null
  }

  /** Resolves when every report queued so far has been handed to WeBlog. */
  whenIdle(): Promise<void> {
    return this.reportQueue
  }

  private reportPageExposure(): void {
    if (this.exposureReported) return
    this.exposureReported = true
    this.enqueue({
      id: 'ths_f10_f10detail',
      action: 'show',
      logmap: {
        stock: '',
        marketId: '',
        pageType: this.config.pageType,
        name: this.config.name,
        source: this.resolveSource(),
        modId: '',
      },
    })
  }

  private reportBackflowIfNeeded(): void {
    if (this.backflowReported || this.resolveQueryParam('from') !== 'share') return
    this.backflowReported = true
    this.enqueue({
      id: 'ths_f10_f10detail_module_backflow',
      action: 'click',
      logmap: {
        stock: '',
        marketId: '',
        pageType: this.config.pageType,
        name: this.config.name,
      },
    })
  }

  private resumeStayTracking(): void {
    if (this.visibleStartedAt === null) this.visibleStartedAt = this.environment.now()
  }

  private pauseStayTracking(): void {
    this.flushStayMilestones(true)
  }

  private flushStayMilestones(pause: boolean): void {
    const now = this.environment.now()
    let visibleMs = this.accumulatedVisibleMs
    if (this.visibleStartedAt !== null) visibleMs += Math.max(0, now - this.visibleStartedAt)
    if (pause && this.visibleStartedAt !== null) {
      this.accumulatedVisibleMs = visibleMs
      this.visibleStartedAt = null
    }

    const completedSeconds = Math.floor(visibleMs / 5000) * 5
    while (this.lastReportedStaySeconds + 5 <= completedSeconds) {
      this.lastReportedStaySeconds += 5
      this.enqueue({
        id: 'ths_f10_f10detail_page_stayTime',
        action: 'show',
        logmap: {
          pageType: this.config.pageType,
          name: this.config.name,
          source: this.resolveSource(),
          value: this.lastReportedStaySeconds / 5,
        },
      })
    }
  }

  private resolveSource(): string {
    return this.resolveQueryParam('source') || this.config.defaultSource
  }

  private resolveQueryParam(name: string): string {
    try {
      return (
        new URL(this.environment.href(), 'https://interactive-guide.invalid/').searchParams
          .get(name)
          ?.trim() ?? ''
      )
    } catch {
      return ''
    }
  }

  private enqueue(payload: WeBlogPayload): void {
    this.reportQueue = this.reportQueue.then(async () => {
      try {
        const weblog = await this.loadWeblog()
        weblog?.report?.(payload)
      } catch {
        // Analytics must never block or break the product runtime.
      }
    })
  }
}

export async function loadAndConfigureWeblog(
  config: AnalyticsConfig,
  hostWindow: WeBlogHostWindow = window as WeBlogHostWindow,
  hostDocument: Document = document,
): Promise<WeBlogClient | null> {
  if (hostWindow.weblog) {
    configureWeblog(hostWindow, hostWindow.weblog, config.appKey)
    return hostWindow.weblog
  }
  if (!hostWindow.__interactiveGuideWeblogPromise) {
    hostWindow.__interactiveGuideWeblogPromise = loadExternalScript(
      hostDocument,
      'data-interactive-guide-weblog',
      WEBLOG_SCRIPT_URL,
    ).then(() => hostWindow.weblog ?? null)
  }
  const weblog = await hostWindow.__interactiveGuideWeblogPromise
  if (weblog) configureWeblog(hostWindow, weblog, config.appKey)
  return weblog
}

function configureWeblog(hostWindow: WeBlogHostWindow, weblog: WeBlogClient, appKey: string): void {
  if (hostWindow.__interactiveGuideWeblogConfiguredAppKey === appKey) return
  if (typeof weblog.setConfig !== 'function') return
  weblog.setConfig({ appKey, debug: false })
  hostWindow.__interactiveGuideWeblogConfiguredAppKey = appKey
}

function createBrowserTrackerEnvironment(): AtlasPageTrackerEnvironment {
  return {
    now: () => Date.now(),
    href: () => window.location.href,
    isVisible: () => document.visibilityState !== 'hidden',
    setInterval: (callback, intervalMs) => window.setInterval(callback, intervalMs),
    clearInterval: timer => window.clearInterval(timer),
    onVisibilityChange: callback => {
      document.addEventListener('visibilitychange', callback)
      return () => document.removeEventListener('visibilitychange', callback)
    },
    onPageHide: callback => {
      window.addEventListener('pagehide', callback)
      return () => window.removeEventListener('pagehide', callback)
    },
  }
}

function loadExternalScript(documentRef: Document, attribute: string, src: string): Promise<void> {
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
