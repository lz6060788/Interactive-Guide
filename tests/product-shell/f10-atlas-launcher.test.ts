import test from 'node:test'
import assert from 'node:assert/strict'
import { openAtlasWithF10 } from '../../src/product-shell/browser/shared/f10-atlas-launcher.js'

const targetUrl = 'https://example.com/atlas/index.html'

test('openAtlasWithF10 prefers the host fullscreen helper', async () => {
  const calls: string[] = []
  ;(globalThis as unknown as { window: unknown }).window = {
    _falcon: {},
    F10Utils: {
      jumpTofullScreenPage: async (url: string) => {
        calls.push(url)
      },
    },
    open: () => {
      throw new Error('browser fallback must not run')
    },
  }
  await openAtlasWithF10(targetUrl)
  assert.deepEqual(calls, [targetUrl])
})

test('openAtlasWithF10 falls back to window.open when F10 is unavailable', async () => {
  const calls: string[] = []
  ;(globalThis as unknown as { window: unknown }).window = {
    open: (url: string) => {
      calls.push(url)
      return {}
    },
  }
  await openAtlasWithF10(targetUrl)
  assert.deepEqual(calls, [targetUrl])
})

test('openAtlasWithF10 catches F10 errors and opens a browser window', async () => {
  const calls: string[] = []
  ;(globalThis as unknown as { window: unknown }).window = {
    open: (url: string) => {
      calls.push(url)
      return {}
    },
  }
  const throwingF10 = {
    jumpTofullScreenPage: async () => {
      throw new Error('native jump failed')
    },
  }

  await openAtlasWithF10(targetUrl, throwingF10 as never)
  assert.deepEqual(calls, [targetUrl])
})
