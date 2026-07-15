import test from 'node:test'
import assert from 'node:assert/strict'
import type { AnalyticsEvent } from '../../src/platform/analytics/analytics-adapter.js'
import { createRuntimeAnalytics } from '../../src/product-shell/browser/shared/runtime-analytics.js'

test('runtime analytics maps Catalog Atlas launches with configured dimensions', () => {
  const events: AnalyticsEvent[] = []
  ;(globalThis as unknown as { weblog: { track: (event: AnalyticsEvent) => void } }).weblog = {
    track: event => events.push(event),
  }
  const analytics = createRuntimeAnalytics(
    {
      analytics: {
        enabled: true,
        provider: 'weblog',
        profileId: 'profile-1',
        pageType: 'industry-chain',
        contentName: 'rocket',
        defaultSource: 'f10',
        dimensions: { campaign: 'summer' },
      },
    },
    'catalog',
    'project-1',
  )

  analytics.trackRuntimeEvent({ type: 'atlaslaunch', url: 'https://example.com/atlas/index.html' })

  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'click')
  assert.equal(events[0].product, 'catalog')
  assert.equal(events[0].profileId, 'profile-1')
  assert.equal(events[0].pageType, 'industry-chain')
  assert.deepEqual(events[0].dimensions, { campaign: 'summer' })
  assert.deepEqual(events[0].payload, {
    target: { kind: 'route', id: 'https://example.com/atlas/index.html' },
  })
})
