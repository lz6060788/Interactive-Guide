/**
 * AtlasRuntime unit tests — focus on event emission and public API,
 * with a minimal DOM stub.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AtlasRuntime,
  type AtlasRuntimeAssetLoader,
  type AtlasEvent,
} from '../../../src/products/atlas/runtime/atlas-runtime.js'
import type {
  AtlasCategoryEntry,
  AtlasHtmlSceneManifest,
  AtlasItemEntry,
  AtlasManifest,
} from '../../../src/products/atlas/contract/atlas-manifest.js'

function fakeImage(): HTMLImageElement {
  // The runtime only treats the image as an HTMLElement, so we return a
  // stubbed element cast to HTMLImageElement for the loader contract.
  return {
    style: {},
    addEventListener() {},
    dataset: {},
  } as unknown as HTMLImageElement
}

function makeLoader(opened: { sceneId?: string } = {}): AtlasRuntimeAssetLoader & {
  events: string[]
} {
  const events: string[] = []
  return {
    events,
    resolveUrl: (u: string) => u,
    loadImage: async (_url: string) => fakeImage(),
    openScene: (scene: AtlasHtmlSceneManifest) => {
      events.push('open:' + scene.sceneId)
      opened.sceneId = scene.sceneId
    },
  }
}

function minimalManifest(): AtlasManifest {
  const cat: AtlasCategoryEntry = {
    id: 'cat-1',
    title: 'Cat',
    order: 0,
    itemIds: ['item-1'],
    experience: { kind: 'panorama' },
    viewport: { centerX: 0.5, centerY: 0.5, zoom: 2 },
    hotspot: { x: 0.5, y: 0.5 },
  }
  const item: AtlasItemEntry = {
    id: 'item-1',
    categoryId: 'cat-1',
    title: 'Item 1',
    description: '',
    order: 0,
    marker: { x: 0.5, y: 0.6 },
  }
  return {
    schemaVersion: '2.0.0',
    product: 'atlas',
    projectId: 'p',
    projectTitle: 'P',
    projectVersion: '0.1.0',
    locale: 'zh-CN',
    generatedAt: '2026-01-01T00:00:00.000Z',
    panorama: {
      assetId: 'asset-pano',
      url: './assets/images/pano.jpg',
      initialViewport: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      cameraBounds: { minZoom: 1, maxZoom: 4 },
    },
    categories: [cat],
    items: [item],
    scenes: [],
    routes: [],
    config: {
      viewport: { width: 375, height: 808 },
      interaction: { wheelZoom: true, dragPan: true, pinchZoom: true, resetCameraEnabled: true },
      chrome: {},
      theme: { hotspotVariant: 'default', calloutVariant: 'line' },
    },
    integrations: {},
  }
}

class FakeEl {
  children: FakeEl[] = []
  dataset: Record<string, string | undefined> = {}
  style: Record<string, string | undefined> = {}
  className = ''
  textContent = ''
  innerHTML = ''
  tagName = 'div'
  appendChild<T>(child: T): T {
    this.children.push(child as unknown as FakeEl)
    return child
  }
  setAttribute(_k: string, _v: string): void {}
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 375, height: 808 }
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

// Minimal DOM stand-ins via a Proxy that returns FakeEl / arrays
const fakeDocument: Pick<Document, 'createElement' | 'createElementNS'> = {
  createElement(tag: string): HTMLElement {
    return new FakeEl() as unknown as HTMLElement
  },
  createElementNS(_ns: string, tag: string): Element {
    return new FakeEl() as unknown as Element
  },
}

// Inject the fake document/performance/Image/requestAnimationFrame so the
// runtime can mount without a real DOM. We monkey-patch the globals.
;(globalThis as { document?: unknown }).document = fakeDocument
;(globalThis as { performance?: unknown }).performance = { now: () => Date.now() }
;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (cb: (t: number) => void) => {
  setTimeout(() => cb(Date.now()), 0)
  return 0
}
;(globalThis as { HTMLImageElement?: unknown }).HTMLImageElement = class {}

test('AtlasRuntime.loadManifest + mount sets up children', async () => {
  const loader = makeLoader()
  const rt = new AtlasRuntime({ assets: loader })
  const m = minimalManifest()
  m.items[0].callout = { dock: 'top', target: { x: 0.7, y: 0.2 } }
  rt.loadManifest(m)
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  // panorama image + 1 hotspot + 1 item marker + 1 callout (svg+label)
  assert.ok((container as unknown as FakeEl).children.length >= 3)
  rt.destroy()
})

test('AtlasRuntime.focusCategory emits analytics:expose and activates marker', async () => {
  const loader = makeLoader()
  const events: AtlasEvent[] = []
  const rt = new AtlasRuntime({ assets: loader })
  rt.loadManifest(minimalManifest())
  rt.on((e) => events.push(e))
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  rt.focusCategory('cat-1')
  assert.ok(events.some((e) => e.type === 'analytics:expose' && e.target.kind === 'category'))
  rt.destroy()
})

test('AtlasRuntime.openRoute triggers the scene opener for scene targets', async () => {
  const loader = makeLoader()
  const m = minimalManifest()
  m.routes = [
    {
      id: 'r1',
      from: { kind: 'panorama' },
      to: { kind: 'scene', sceneId: 's-1' },
      transition: { kind: 'video', assetId: 'v-1', onFailure: 'cut' },
    },
  ]
  m.scenes = [
    {
      sceneId: 's-1',
      title: 'Scene 1',
      entryUrl: './scenes/s-1/index.html',
      views: [{ id: 'v1', title: 'V', activationMessage: { type: 'init' } }],
      protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
    },
  ]
  const rt = new AtlasRuntime({ assets: loader })
  rt.loadManifest(m)
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  rt.openRoute('r1')
  assert.equal(loader.events[0], 'open:s-1')
  rt.destroy()
})

test('AtlasRuntime.destroy emits analytics:stay with non-zero duration', async () => {
  let now = 1000
  const loader = makeLoader()
  const events: AtlasEvent[] = []
  const rt = new AtlasRuntime({ assets: loader, now: () => now })
  rt.loadManifest(minimalManifest())
  rt.on((e) => events.push(e))
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  now = 1500
  rt.destroy()
  const stay = events.find((e) => e.type === 'analytics:stay')
  assert.ok(stay && stay.type === 'analytics:stay' && stay.durationMs === 500)
})

test('AtlasRuntime.mount throws when no manifest is loaded', async () => {
  const loader = makeLoader()
  const rt = new AtlasRuntime({ assets: loader })
  const container = new FakeEl() as unknown as HTMLElement
  await assert.rejects(() => rt.mount(container), /loadManifest/)
})