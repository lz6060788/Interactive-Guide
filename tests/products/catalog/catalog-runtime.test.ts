/**
 * CatalogRuntime unit tests — event emission, mount behavior, and
 * route opening for the structured-knowledge product.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CatalogRuntime,
  type CatalogRuntimeAssetLoader,
  type CatalogEvent,
} from '../../../src/products/catalog/runtime/catalog-runtime.js'
import type {
  CatalogCategoryEntry,
  CatalogHtmlSceneManifest,
  CatalogItemEntry,
  CatalogManifest,
  CatalogStageEntry,
} from '../../../src/products/catalog/contract/catalog-manifest.js'

function fakeImage(): HTMLImageElement {
  return {
    style: {},
    addEventListener() {},
    dataset: {},
  } as unknown as HTMLImageElement
}

function makeLoader(opened: { sceneId?: string } = {}): CatalogRuntimeAssetLoader & {
  events: string[]
} {
  const events: string[] = []
  return {
    events,
    resolveUrl: (u: string) => u,
    loadImage: async (_url: string) => fakeImage(),
    openScene: (scene: CatalogHtmlSceneManifest) => {
      events.push('open:' + scene.sceneId)
      opened.sceneId = scene.sceneId
    },
  }
}

function minimalManifest(): CatalogManifest {
  const item: CatalogItemEntry = {
    id: 'item-1',
    categoryId: 'cat-1',
    title: 'Item 1',
    description: 'desc',
    order: 0,
    marker: { x: 0.5, y: 0.5 },
    focusRect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  }
  const cat: CatalogCategoryEntry = {
    id: 'cat-1',
    title: 'Cat',
    order: 0,
    itemIds: ['item-1'],
    experience: { kind: 'panorama' },
    viewport: { centerX: 0.5, centerY: 0.5, zoom: 2 },
  }
  const stage: CatalogStageEntry = {
    key: 'upstream',
    label: '上游',
    order: 1,
    categories: [cat],
  }
  return {
    schemaVersion: '2.0.0',
    product: 'catalog',
    projectId: 'p',
    projectTitle: 'P',
    projectVersion: '0.1.0',
    locale: 'zh-CN',
    generatedAt: '2026-01-01T00:00:00.000Z',
    panorama: { assetId: 'asset-pano', url: './assets/images/pano.jpg' },
    stages: [stage],
    items: [item],
    scenes: [],
    routes: [],
    config: {
      viewport: { width: 1024, height: 768 },
      interaction: {
        listActivation: 'center-nearest',
        markerActivation: true,
        viewportAnimationMs: 350,
      },
      chrome: {},
      theme: { listDensity: 'comfortable', focusVariant: 'rect' },
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
    return { left: 0, top: 0, width: 1024, height: 768 }
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

const fakeDocument: Pick<Document, 'createElement'> = {
  createElement(_tag: string): HTMLElement {
    return new FakeEl() as unknown as HTMLElement
  },
}

;(globalThis as { document?: unknown }).document = fakeDocument
;(globalThis as { performance?: unknown }).performance = { now: () => Date.now() }
;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
  cb: (t: number) => void,
) => {
  setTimeout(() => cb(Date.now()), 0)
  return 0
}
;(globalThis as { HTMLImageElement?: unknown }).HTMLImageElement = class {}

test('CatalogRuntime.loadManifest + mount creates the two-column layout', async () => {
  const loader = makeLoader()
  const rt = new CatalogRuntime({ assets: loader })
  rt.loadManifest(minimalManifest())
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  // grid container + panorama + list children (panorama itself contains img + focus + items)
  assert.ok((container as unknown as FakeEl).children.length >= 2)
  rt.destroy()
})

test('CatalogRuntime.selectItem emits itemselect, analytics:click, and viewport animation events', async () => {
  const loader = makeLoader()
  const events: CatalogEvent[] = []
  const rt = new CatalogRuntime({ assets: loader })
  rt.loadManifest(minimalManifest())
  rt.on((e) => events.push(e))
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  rt.selectItem('item-1')
  const types = events.map((e) => e.type)
  assert.ok(types.includes('itemselect'))
  assert.ok(types.includes('analytics:click'))
  assert.ok(types.includes('viewportanimationstart'))
  rt.destroy()
})

test('CatalogRuntime.openRoute triggers the scene opener for scene targets', async () => {
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
  const rt = new CatalogRuntime({ assets: loader })
  rt.loadManifest(m)
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  rt.openRoute('r1')
  assert.equal(loader.events[0], 'open:s-1')
  rt.destroy()
})

test('CatalogRuntime.destroy emits analytics:stay with non-zero duration', async () => {
  let now = 1000
  const loader = makeLoader()
  const events: CatalogEvent[] = []
  const rt = new CatalogRuntime({ assets: loader, now: () => now })
  rt.loadManifest(minimalManifest())
  rt.on((e) => events.push(e))
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  now = 1500
  rt.destroy()
  const stay = events.find((e) => e.type === 'analytics:stay')
  assert.ok(stay && stay.type === 'analytics:stay' && stay.durationMs === 500)
})

test('CatalogRuntime.mount throws when no manifest is loaded', async () => {
  const loader = makeLoader()
  const rt = new CatalogRuntime({ assets: loader })
  const container = new FakeEl() as unknown as HTMLElement
  await assert.rejects(() => rt.mount(container), /loadManifest/)
})