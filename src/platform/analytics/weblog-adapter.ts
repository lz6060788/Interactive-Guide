/**
 * WeBlogAnalyticsProvider — emits analytics events to a WeBlog-style
 * tracker. The script URL and profileId are injected by the deployment
 * (never hardcoded) and live in `integrations.analytics`.
 */
import type { AnalyticsEvent, AnalyticsProvider } from './analytics-adapter.js'

export interface WeBlogConfig {
  profileId: string
  /** Absolute URL to the tracker script. Injected by deployment. */
  scriptUrl: string
}

declare global {
  interface Window {
    [key: string]: unknown
  }
}

export class WeBlogAnalyticsProvider implements AnalyticsProvider {
  private readonly config: WeBlogConfig

  constructor(config: WeBlogConfig) {
    this.config = config
    this.ensureLoaded()
  }

  track(event: AnalyticsEvent): void {
    const w = globalThis as unknown as {
      weblog?: { track?: (e: AnalyticsEvent) => void }
    }
    if (w.weblog?.track) {
      w.weblog.track(event)
    }
    // Always also surface to console so missing tracker scripts are loud.
    // eslint-disable-next-line no-console
    console.debug('[weblog]', event.type, event)
  }

  private ensureLoaded(): void {
    if (typeof document === 'undefined') return
    const existing = document.querySelector(
      `script[data-weblog-profile="${this.config.profileId}"]`,
    )
    if (existing) return
    const s = document.createElement('script')
    s.src = this.config.scriptUrl
    s.async = true
    s.dataset['weblogProfile'] = this.config.profileId
    document.head.appendChild(s)
  }
}