import test from 'node:test'
import assert from 'node:assert/strict'
import {
  F10HostAdapter,
  isFalconHost,
  type F10SharePayload,
} from '../../src/platform/f10/f10-host-adapter.js'

const sharePayload: F10SharePayload = {
  title: '产业链',
  text: '产业链',
  content: '分享描述',
  description: '分享描述',
  url: 'https://example.com/atlas?from=share',
  shareUrl: 'https://example.com/atlas?from=share',
}

test('F10HostAdapter rejects ordinary browsers before dependency loading', async () => {
  const dependencyDocument = {
    querySelector: () => {
      throw new Error('dependency loading must not start')
    },
  } as unknown as Document
  const adapter = new F10HostAdapter({} as Window, dependencyDocument)

  assert.equal(isFalconHost({}), false)
  assert.equal(await adapter.shareUrlCard(sharePayload), false)
  assert.equal(await adapter.jumpTofullScreenPage('https://example.com/atlas'), false)
})

test('F10HostAdapter recognizes iOS Falcon and invokes its share helper', async () => {
  const calls: F10SharePayload[] = []
  const host = {
    _falcon: {},
    F10Utils: {
      shareUrlCard: (payload: F10SharePayload) => calls.push(payload),
    },
  }
  const adapter = new F10HostAdapter(host as unknown as Window, null)

  assert.equal(isFalconHost(host), true)
  assert.equal(await adapter.shareUrlCard(sharePayload), true)
  assert.deepEqual(calls, [sharePayload])
})

test('F10HostAdapter recognizes Android Falcon and invokes its jump helper', async () => {
  const calls: string[] = []
  const host = {
    FalconJavaInterface: {},
    F10Utils: {
      jumpTofullScreenPage: (url: string) => calls.push(url),
    },
  }
  const adapter = new F10HostAdapter(host as unknown as Window, null)

  assert.equal(isFalconHost(host), true)
  assert.equal(await adapter.jumpTofullScreenPage('https://example.com/atlas'), true)
  assert.deepEqual(calls, ['https://example.com/atlas'])
})
