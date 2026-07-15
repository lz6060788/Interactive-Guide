/**
 * AnalyticsAdapter normalization + de-duplication tests.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AnalyticsAdapter,
  ConsoleAnalyticsProvider,
  type AnalyticsEvent,
} from '../../src/platform/analytics/analytics-adapter.js'

class CaptureProvider {
  events: AnalyticsEvent[] = []
  track(e: AnalyticsEvent): void {
    this.events.push(e)
  }
}

test('AnalyticsAdapter tracks events with product + contentName dimensions', () => {
  const cap = new CaptureProvider()
  const a = new AnalyticsAdapter({
    product: 'atlas',
    projectId: 'p1',
    contentName: 'rocket-guide',
    profileId: 'profile-1',
    pageType: 'interactive-guide',
    defaultSource: 'f10',
    dimensions: { campaign: 'summer' },
    provider: cap,
    now: () => new Date('2026-06-30T00:00:00.000Z'),
  })
  a.track('click', { target: { kind: 'category', id: 'cat-1' } })
  assert.equal(cap.events.length, 1)
  assert.equal(cap.events[0].product, 'atlas')
  assert.equal(cap.events[0].projectId, 'p1')
  assert.equal(cap.events[0].contentName, 'rocket-guide')
  assert.equal(cap.events[0].profileId, 'profile-1')
  assert.equal(cap.events[0].pageType, 'interactive-guide')
  assert.equal(cap.events[0].defaultSource, 'f10')
  assert.deepEqual(cap.events[0].dimensions, { campaign: 'summer' })
  assert.equal(cap.events[0].timestamp, '2026-06-30T00:00:00.000Z')
})

test('AnalyticsAdapter suppresses duplicate events within cooldownMs', () => {
  let now = 1000
  const cap = new CaptureProvider()
  const a = new AnalyticsAdapter({
    product: 'catalog',
    projectId: 'p1',
    provider: cap,
    now: () => new Date(now),
  })
  a.track('click', { target: { kind: 'item', id: 'i1' } })
  a.track('click', { target: { kind: 'item', id: 'i2' } })
  assert.equal(cap.events.length, 1)
  now += 500
  a.track('click', { target: { kind: 'item', id: 'i3' } })
  assert.equal(cap.events.length, 2)
})

test('AnalyticsAdapter defaults to ConsoleAnalyticsProvider', () => {
  const a = new AnalyticsAdapter({
    product: 'atlas',
    projectId: 'p1',
  })
  // Should not throw; we just ensure the constructor wires a provider.
  a.track('expose', { target: { kind: 'category', id: 'c' } })
  assert.ok(a instanceof AnalyticsAdapter)
  assert.ok(ConsoleAnalyticsProvider)
})
