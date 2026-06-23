import type { PlayerHostWindow, WeblogApi } from './player-host.js'

// ─── Constants ─────────────────────────────────────────────────

export const THSC_WEBLOG_CDN_URL = 'https://s.thsi.cn/cd/weblog/0.0.8/weblog.js'
export const THSC_WEBLOG_SCRIPT_ATTR = 'data-interactive-guide-weblog'
const INDUSTRY_TRACKING_PAGE_TYPE = 'visindustry'
const INDUSTRY_TRACKING_NAME = '商业航天'
const INDUSTRY_TRACKING_DEFAULT_SOURCE = 'industry'
const TRACKING_BACKFLOW_URL_PARAM = 'from'
const TRACKING_BACKFLOW_SHARE_VALUE = 'share'
export const TRACKING_SOURCE_URL_PARAM = 'source'

// ─── Helpers ───────────────────────────────────────────────────

export function resolveIndustryTrackingSource(): string {
  if (typeof window === 'undefined' || !window.location?.search) {
    return INDUSTRY_TRACKING_DEFAULT_SOURCE
  }
  const params = new URLSearchParams(window.location.search)
  const sourceFromUrl = params.get(TRACKING_SOURCE_URL_PARAM)?.trim()
  return sourceFromUrl && sourceFromUrl.length > 0
    ? sourceFromUrl
    : INDUSTRY_TRACKING_DEFAULT_SOURCE
}

export function shouldReportBackflow(): boolean {
  if (typeof window === 'undefined' || !window.location?.search) {
    return false
  }
  return new URLSearchParams(window.location.search).get(TRACKING_BACKFLOW_URL_PARAM) === TRACKING_BACKFLOW_SHARE_VALUE
}

// ─── PageTracker ───────────────────────────────────────────────

export class PageTracker {
  private pageExposureReported = false
  private backflowReported = false
  private pageVisibleStartedAt: number | null = null
  private pageTrackedVisibleSeconds = 0
  private pageStayReportedSeconds = 0
  private pageStayTimerId: number | null = null

  // Injected by PlayerHost
  ensureExternalScriptLoaded: ((attr: string, url: string) => Promise<void>) | null = null

  configureWeblog(weblog: WeblogApi | null | undefined): void {
    const hostWindow = window as PlayerHostWindow
    if (!weblog || typeof weblog.setConfig !== 'function' || hostWindow.__interactiveGuideWeblogConfigured) {
      return
    }
    try {
      weblog.setConfig({ appKey: 'ce19ea099b', debug: false })
      hostWindow.__interactiveGuideWeblogConfigured = true
    } catch {
      // Ignore tracking initialization failures.
    }
  }

  start(): void {
    void this.reportPageExposure()
    void this.reportBackflowIfNeeded()
    this.resumeStayTracking()
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('pagehide', this.handlePageHide)
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('pagehide', this.handlePageHide)
    this.stopStayTracking()
  }

  reportClick(): void {
    void this.sendClickEvent()
  }

  reportShare(): void {
    void this.sendShareEvent()
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.resumeStayTracking()
      return
    }
    this.pauseStayTracking()
  }

  private handlePageHide = (): void => {
    this.pauseStayTracking()
  }

  private resumeStayTracking(): void {
    if (document.visibilityState === 'hidden') return
    if (this.pageVisibleStartedAt === null) {
      this.pageVisibleStartedAt = Date.now()
    }
    if (this.pageStayTimerId !== null) return
    this.pageStayTimerId = window.setInterval(() => {
      void this.flushStayTracking(false)
    }, 1000)
  }

  private pauseStayTracking(): void {
    if (this.pageStayTimerId !== null) {
      window.clearInterval(this.pageStayTimerId)
      this.pageStayTimerId = null
    }
    void this.flushStayTracking(true)
  }

  private stopStayTracking(): void {
    if (this.pageStayTimerId !== null) {
      window.clearInterval(this.pageStayTimerId)
      this.pageStayTimerId = null
    }
    this.pageVisibleStartedAt = null
  }

  private async reportPageExposure(): Promise<void> {
    if (this.pageExposureReported) return
    this.pageExposureReported = true
    await this.sendPayload({
      id: 'ths_f10_f10detail',
      action: 'show',
      logmap: {
        stock: '',
        marketId: '',
        pageType: INDUSTRY_TRACKING_PAGE_TYPE,
        name: INDUSTRY_TRACKING_NAME,
        source: resolveIndustryTrackingSource(),
        modId: '',
      },
    })
  }

  private async sendClickEvent(): Promise<void> {
    await this.sendPayload({
      id: 'ths_f10_f10detail',
      action: 'click',
      logmap: {
        stock: '',
        marketId: '',
        pageType: INDUSTRY_TRACKING_PAGE_TYPE,
        name: INDUSTRY_TRACKING_NAME,
        source: resolveIndustryTrackingSource(),
        modId: '',
      },
    })
  }

  private async flushStayTracking(resetVisibleStart: boolean): Promise<void> {
    if (this.pageVisibleStartedAt !== null) {
      this.pageTrackedVisibleSeconds += Math.round((Date.now() - this.pageVisibleStartedAt) / 1000)
    }
    if (resetVisibleStart) {
      this.pageVisibleStartedAt = null
    }
    const reportTargetSeconds = Math.floor(this.pageTrackedVisibleSeconds / 5) * 5
    if (reportTargetSeconds <= 0 || reportTargetSeconds <= this.pageStayReportedSeconds) return
    this.pageStayReportedSeconds = reportTargetSeconds
    await this.sendPayload({
      id: 'ths_f10_f10detail',
      action: 'stay',
      logmap: {
        pageType: INDUSTRY_TRACKING_PAGE_TYPE,
        name: INDUSTRY_TRACKING_NAME,
        source: resolveIndustryTrackingSource(),
        value: String(reportTargetSeconds / 5),
      },
    })
  }

  private async sendShareEvent(): Promise<void> {
    await this.sendPayload({
      id: 'ths_f10_f10detail_module_share',
      action: 'click',
      logmap: {
        stock: '',
        marketId: '',
        pageType: INDUSTRY_TRACKING_PAGE_TYPE,
        name: INDUSTRY_TRACKING_NAME,
      },
    })
  }

  private async reportBackflowIfNeeded(): Promise<void> {
    if (!shouldReportBackflow()) return
    if (this.backflowReported) return
    this.backflowReported = true
    await this.sendPayload({
      id: 'ths_f10_f10detail_module_backflow',
      action: 'click',
      logmap: {
        stock: '',
        marketId: '',
        pageType: INDUSTRY_TRACKING_PAGE_TYPE,
        name: INDUSTRY_TRACKING_NAME,
      },
    })
  }

  private async sendPayload(payload: Record<string, unknown>): Promise<void> {
    try {
      const weblog = await this.ensureWeblogLoaded()
      if (typeof weblog?.report !== 'function') return
      weblog.report(payload)
    } catch {
      // Ignore tracking failures and keep the runtime interactive.
    }
  }

  private async ensureWeblogLoaded(): Promise<WeblogApi | null> {
    const hostWindow = window as PlayerHostWindow
    if (hostWindow.weblog) {
      this.configureWeblog(hostWindow.weblog)
      return hostWindow.weblog
    }
    if (hostWindow.__interactiveGuideWeblogPromise) {
      return hostWindow.__interactiveGuideWeblogPromise
    }
    if (!this.ensureExternalScriptLoaded) return null
    hostWindow.__interactiveGuideWeblogPromise = this.ensureExternalScriptLoaded(
      THSC_WEBLOG_SCRIPT_ATTR,
      THSC_WEBLOG_CDN_URL,
    ).then(() => {
      const weblog = hostWindow.weblog ?? null
      this.configureWeblog(weblog)
      return weblog
    })
    return hostWindow.__interactiveGuideWeblogPromise
  }
}
