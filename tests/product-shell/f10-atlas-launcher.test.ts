import test from 'node:test'
import assert from 'node:assert/strict'
import { openAtlasWithF10 } from '../../src/product-shell/browser/shared/f10-atlas-launcher.js'

const targetUrl = 'https://example.com/atlas/index.html'

test('openAtlasWithF10 prefers the host fullscreen helper', async () => {
  const calls: string[] = []
  ;(globalThis as unknown as { window: unknown }).window = {
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

test('openAtlasWithF10 falls back to the best available browser window', async () => {
  const calls: string[] = []
  const fakeWindow = {
    open: (url: string) => {
      calls.push(url)
      return {}
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    top: fakeWindow,
    open: () => {
      throw new Error('top window should be preferred')
    },
  }
  await openAtlasWithF10(targetUrl)
  assert.deepEqual(calls, [targetUrl])
})
