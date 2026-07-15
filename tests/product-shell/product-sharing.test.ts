import test from 'node:test'
import assert from 'node:assert/strict'
import {
  F10HostAdapter,
  shareWithBestAvailableHost,
  type F10SharePayload,
} from '../../src/platform/f10/f10-host-adapter.js'
import { ProductShareController } from '../../src/product-shell/browser/shared/product-sharing.js'

test('ProductShareController reports the click and shares a marked URL through F10', async () => {
  const payloads: F10SharePayload[] = []
  let shareReports = 0
  const fakeWindow = {
    F10Utils: {
      shareUrlCard: (payload: F10SharePayload) => payloads.push(payload),
    },
  }
  const controller = new ProductShareController({
    projectTitle: '存储芯片产业链',
    config: {
      enabled: true,
      title: '存储芯片产业链分享',
      description: '分享描述',
      imageAssetId: 'asset-panorama',
      imageUrl: './assets/images/root.jpg',
    },
    tracker: {
      reportShareClick: () => {
        shareReports += 1
      },
    } as never,
    currentHref: () => 'https://example.com/atlas/index.html?source=industry#/home',
    resolveAssetUrl: url => new URL(url, 'https://example.com/atlas/index.html').href,
    f10: new F10HostAdapter(fakeWindow as unknown as Window, null),
  })

  await controller.share()

  assert.equal(shareReports, 1)
  assert.equal(payloads.length, 1)
  assert.equal(payloads[0].title, '存储芯片产业链分享')
  assert.equal(payloads[0].description, '分享描述')
  assert.equal(
    payloads[0].url,
    'https://example.com/atlas/index.html?source=industry&from=share#/home',
  )
  assert.equal(payloads[0].shareUrl, payloads[0].url)
  assert.equal(payloads[0].bmpUrl, 'https://example.com/atlas/assets/images/root.jpg')
  assert.equal(payloads[0].bmpRes, 1)
})

test('ProductShareController does nothing when project sharing is disabled', async () => {
  let calls = 0
  const controller = new ProductShareController({
    projectTitle: 'Project',
    config: { enabled: false },
    tracker: {
      reportShareClick: () => {
        calls += 1
      },
    } as never,
  })
  await controller.share()
  assert.equal(controller.enabled, false)
  assert.equal(calls, 0)
})

test('shareWithBestAvailableHost catches F10 errors and falls back to navigator.share', async () => {
  const browserPayloads: ShareData[] = []
  const payload: F10SharePayload = {
    title: '产业链',
    text: '产业链',
    content: '分享描述',
    description: '分享描述',
    url: 'https://example.com/atlas?from=share',
    shareUrl: 'https://example.com/atlas?from=share',
  }
  const throwingF10 = {
    shareUrlCard: async () => {
      throw new Error('native share failed')
    },
  } as F10HostAdapter

  await shareWithBestAvailableHost(throwingF10, payload, {
    share: async browserPayload => {
      browserPayloads.push(browserPayload)
    },
    clipboard: {} as Clipboard,
  })

  assert.deepEqual(browserPayloads, [
    {
      title: '产业链',
      text: '分享描述',
      url: 'https://example.com/atlas?from=share',
    },
  ])
})
