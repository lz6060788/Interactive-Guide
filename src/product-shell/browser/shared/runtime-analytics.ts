import type { ProjectIntegrations } from '../../../domain/project-types.js'
import {
  AnalyticsAdapter,
  type AnalyticsEventType,
} from '../../../platform/analytics/analytics-adapter.js'
import { WeBlogAnalyticsProvider } from '../../../platform/analytics/weblog-adapter.js'

type RuntimeEvent =
  | { type: 'analytics:expose'; target: { kind: 'category' | 'item'; id: string } }
  | { type: 'analytics:click'; target: { kind: 'category' | 'item'; id: string } }
  | { type: 'analytics:stay'; durationMs: number }
  | { type: 'analytics:share'; channel: string }
  | { type: 'sceneenter'; sceneId: string; viewId: string }
  | { type: 'routechange'; routeId: string }
  | { type: 'atlaslaunch'; url: string }

export interface RuntimeAnalytics {
  track(type: AnalyticsEventType, payload: Parameters<AnalyticsAdapter['track']>[1]): void
  trackRuntimeEvent(event: RuntimeEvent): void
}

export function createRuntimeAnalytics(
  integrations: ProjectIntegrations,
  product: 'atlas' | 'catalog',
  projectId: string,
): RuntimeAnalytics {
  const config = integrations.analytics
  if (!config?.enabled) return { track: () => undefined, trackRuntimeEvent: () => undefined }

  const adapter = new AnalyticsAdapter({
    product,
    projectId,
    contentName: config.contentName,
    profileId: config.profileId,
    pageType: config.pageType,
    defaultSource: config.defaultSource,
    dimensions: config.dimensions,
    provider: new WeBlogAnalyticsProvider({ profileId: config.profileId }),
  })
  return {
    track: (type, payload) => adapter.track(type, payload),
    trackRuntimeEvent: event => {
      switch (event.type) {
        case 'analytics:expose':
          adapter.track('expose', event)
          return
        case 'analytics:click':
          adapter.track('click', event)
          return
        case 'analytics:stay':
          adapter.track('stay', event)
          return
        case 'analytics:share':
          adapter.track('share', event)
          return
        case 'sceneenter':
          adapter.track('click', {
            target: { kind: 'scene', id: `${event.sceneId}:${event.viewId}` },
          })
          return
        case 'routechange':
          adapter.track('click', { target: { kind: 'route', id: event.routeId } })
          return
        case 'atlaslaunch':
          adapter.track('click', { target: { kind: 'route', id: event.url } })
      }
    },
  }
}
