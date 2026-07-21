import test from 'node:test'
import assert from 'node:assert/strict'
import type { AnalyticsConfig } from '../../src/domain/project-types.js'
import {
  AtlasPageTracker,
  loadAndConfigureWeblog,
  type AtlasPageTrackerEnvironment,
  type WeBlogPayload,
} from '../../src/platform/analytics/atlas-page-tracker.js'

const config: AnalyticsConfig = {
  enabled: true,
  provider: 'weblog',
  appKey: 'ce19ea099b',
  pageType: 'visindustry',
  name: '存储芯片产业链',
  defaultSource: 'industry',
}

class FakeEnvironment implements AtlasPageTrackerEnvironment {
  currentTime = 0
  currentHref = 'https://example.com/atlas/index.html'
  visible = true
  intervalCallback: (() => void) | null = null
  visibilityCallback: (() => void) | null = null
  pageHideCallback: (() => void) | null = null

  now(): number {
    return this.currentTime
  }
  href(): string {
    return this.currentHref
  }
  isVisible(): boolean {
    return this.visible
  }
  setInterval(callback: () => void): number {
    this.intervalCallback = callback
    return 1
  }
  clearInterval(): void {
    this.intervalCallback = null
  }
  onVisibilityChange(callback: () => void): () => void {
    this.visibilityCallback = callback
    return () => {
      this.visibilityCallback = null
    }
  }
  onPageHide(callback: () => void): () => void {
    this.pageHideCallback = callback
    return () => {
      this.pageHideCallback = null
    }
  }
  advance(ms: number): void {
    this.currentTime += ms
    this.intervalCallback?.()
  }
  setVisible(visible: boolean): void {
    this.visible = visible
    this.visibilityCallback?.()
  }
}

test('AtlasPageTracker reports only exposure and marked backflow on start', async () => {
  const environment = new FakeEnvironment()
  environment.currentHref = 'https://example.com/atlas/index.html?source=campaign&from=share#/home'
  const payloads: WeBlogPayload[] = []
  const tracker = new AtlasPageTracker({
    config,
    environment,
    loadWeblog: async () => ({ report: payload => payloads.push(payload) }),
  })

  tracker.start()
  await tracker.whenIdle()

  assert.deepEqual(payloads, [
    {
      id: 'ths_f10_f10detail',
      action: 'show',
      logmap: {
        stock: '',
        marketId: '',
        pageType: 'visindustry',
        name: '存储芯片产业链',
        source: 'campaign',
        modId: '',
      },
    },
    {
      id: 'ths_f10_f10detail_module_backflow',
      action: 'click',
      logmap: {
        stock: '',
        marketId: '',
        pageType: 'visindustry',
        name: '存储芯片产业链',
      },
    },
  ])
  tracker.destroy()
})

test('AtlasPageTracker reports share click with the fixed payload', async () => {
  const environment = new FakeEnvironment()
  const payloads: WeBlogPayload[] = []
  const tracker = new AtlasPageTracker({
    config,
    environment,
    loadWeblog: async () => ({ report: payload => payloads.push(payload) }),
  })
  tracker.start()
  await tracker.whenIdle()
  payloads.length = 0

  tracker.reportShareClick()
  await tracker.whenIdle()

  assert.deepEqual(payloads, [
    {
      id: 'ths_f10_f10detail_module_share',
      action: 'click',
      logmap: {
        stock: '',
        marketId: '',
        pageType: 'visindustry',
        name: '存储芯片产业链',
      },
    },
  ])
  tracker.destroy()
})

test('AtlasPageTracker reports numeric 5-second interval ordinals', async () => {
  const environment = new FakeEnvironment()
  const payloads: WeBlogPayload[] = []
  const tracker = new AtlasPageTracker({
    config,
    environment,
    loadWeblog: async () => ({ report: payload => payloads.push(payload) }),
  })
  tracker.start()
  await tracker.whenIdle()
  payloads.length = 0

  environment.advance(4000)
  await tracker.whenIdle()
  assert.equal(payloads.length, 0)

  environment.advance(1000)
  await tracker.whenIdle()
  environment.advance(6000)
  await tracker.whenIdle()

  assert.deepEqual(
    payloads.map(payload => payload.logmap.value),
    [1, 2],
  )
  assert.ok(
    payloads.every(
      payload => payload.id === 'ths_f10_f10detail_page_stayTime' && payload.action === 'show',
    ),
  )
  tracker.destroy()
})

test('AtlasPageTracker reports 4/8/11-second exits as none, 1, and 1+2', async () => {
  const cases = [
    { durationMs: 4000, expected: [] },
    { durationMs: 8000, expected: [1] },
    { durationMs: 11000, expected: [1, 2] },
  ]

  for (const testCase of cases) {
    const environment = new FakeEnvironment()
    const payloads: WeBlogPayload[] = []
    const tracker = new AtlasPageTracker({
      config,
      environment,
      loadWeblog: async () => ({ report: payload => payloads.push(payload) }),
    })
    tracker.start()
    await tracker.whenIdle()
    payloads.length = 0

    environment.currentTime = testCase.durationMs
    tracker.destroy()
    await tracker.whenIdle()

    assert.deepEqual(
      payloads.map(payload => payload.logmap.value),
      testCase.expected,
      `${testCase.durationMs}ms visible stay`,
    )
  }
})

test('AtlasPageTracker excludes hidden time from stay milestones', async () => {
  const environment = new FakeEnvironment()
  const payloads: WeBlogPayload[] = []
  const tracker = new AtlasPageTracker({
    config,
    environment,
    loadWeblog: async () => ({ report: payload => payloads.push(payload) }),
  })
  tracker.start()
  await tracker.whenIdle()
  payloads.length = 0

  environment.currentTime = 3000
  environment.setVisible(false)
  environment.advance(10000)
  environment.setVisible(true)
  environment.advance(2000)
  await tracker.whenIdle()

  assert.deepEqual(
    payloads.map(payload => payload.logmap.value),
    [1],
  )
  tracker.destroy()
})

test('loadAndConfigureWeblog configures an injected SDK with appKey', async () => {
  const configurations: Array<{ appKey: string; debug: boolean }> = []
  const fakeWindow = {
    weblog: {
      setConfig: (value: { appKey: string; debug: boolean }) => configurations.push(value),
      report: () => undefined,
    },
  }
  const weblog = await loadAndConfigureWeblog(
    config,
    fakeWindow as unknown as Window & { weblog: unknown },
    {} as Document,
  )
  assert.ok(weblog)
  assert.deepEqual(configurations, [{ appKey: 'ce19ea099b', debug: false }])
})
