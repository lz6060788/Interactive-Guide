/**
 * AnalyticsAdapter — normalizes runtime analytics events (expose /
 * click / stay / share) into a uniform payload for the configured
 * provider. Every event carries the product dimension so downstream
 * analytics can split Atlas vs Catalog funnels.
 */
export type AnalyticsProduct = 'atlas' | 'catalog'

export type AnalyticsEventType =
  | 'expose'
  | 'click'
  | 'stay'
  | 'share'
  | 'return'

export interface AnalyticsExposePayload {
  target: { kind: 'category' | 'item'; id: string }
}

export interface AnalyticsClickPayload {
  target: { kind: 'category' | 'item' | 'scene' | 'route'; id: string }
}

export interface AnalyticsStayPayload {
  durationMs: number
}

export interface AnalyticsSharePayload {
  channel: string
}

export interface AnalyticsReturnPayload {
  fromSceneId?: string
}

export interface AnalyticsEvent {
  type: AnalyticsEventType
  product: AnalyticsProduct
  projectId: string
  timestamp: string
  contentName?: string
  payload: AnalyticsExposePayload | AnalyticsClickPayload | AnalyticsStayPayload | AnalyticsSharePayload | AnalyticsReturnPayload
}

export interface AnalyticsAdapterOptions {
  product: AnalyticsProduct
  projectId: string
  contentName?: string
  /** Provider implementation. Defaults to `ConsoleProvider` in browser. */
  provider?: AnalyticsProvider
  now?: () => Date
}

export interface AnalyticsProvider {
  track(event: AnalyticsEvent): void
}

export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  track(event: AnalyticsEvent): void {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event.type, event)
  }
}

/**
 * Adapter that delegates runtime analytics events to a provider. It
 * guarantees each event is fired exactly once with the right product
 * dimension — runtime code never decides contentName itself.
 */
export class AnalyticsAdapter {
  private readonly opts: Required<Omit<AnalyticsAdapterOptions, 'contentName' | 'now'>> &
    Pick<AnalyticsAdapterOptions, 'contentName'> & { now: () => Date }
  private lastByType = new Map<AnalyticsEventType, number>()

  constructor(opts: AnalyticsAdapterOptions) {
    this.opts = {
      product: opts.product,
      projectId: opts.projectId,
      contentName: opts.contentName,
      provider: opts.provider ?? new ConsoleAnalyticsProvider(),
      now: opts.now ?? (() => new Date()),
    }
  }

  /** Suppresses duplicate events fired within `cooldownMs`. */
  private shouldEmit(type: AnalyticsEventType, cooldownMs = 250): boolean {
    const last = this.lastByType.get(type) ?? 0
    const now = this.opts.now().getTime()
    if (now - last < cooldownMs) return false
    this.lastByType.set(type, now)
    return true
  }

  track(
    type: AnalyticsEventType,
    payload: AnalyticsEvent['payload'],
  ): void {
    if (!this.shouldEmit(type)) return
    const event: AnalyticsEvent = {
      type,
      product: this.opts.product,
      projectId: this.opts.projectId,
      timestamp: this.opts.now().toISOString(),
      ...(this.opts.contentName ? { contentName: this.opts.contentName } : {}),
      payload,
    }
    this.opts.provider.track(event)
  }
}