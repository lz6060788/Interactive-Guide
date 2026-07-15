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
    activationZoom: 3.6,
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
      hintText: '拖动或缩放探索全景图',
      theme: { hotspotVariant: 'default', calloutVariant: 'classic' },
    },
    integrations: {},
  }
}

class FakeEl {
  children: FakeEl[] = []
  parent: FakeEl | null = null
  dataset: Record<string, string | undefined> = {}
  style: Record<string, string | undefined> = {}
  className = ''
  textContent = ''
  innerHTML = ''
  tagName = 'div'
  id = ''
  ownerDocument: Document | null = null
  listeners = new Map<string, Array<(event?: any) => void>>()
  appendChild<T>(child: T): T {
    this.children.push(child as unknown as FakeEl)
    const fakeChild = child as unknown as FakeEl
    fakeChild.ownerDocument = this.ownerDocument
    fakeChild.parent = this
    return child
  }
  setAttribute(k: string, v: string): void {
    if (k === 'data-testid') this.dataset.testid = v
    if (k === 'data-item-id') this.dataset.itemId = v
    if (k === 'data-category-id') this.dataset.categoryId = v
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    const width = Number.parseFloat(this.style.width ?? '') || 260
    const height = Number.parseFloat(this.style.height ?? '') || 808
    return { left: 0, top: 0, width, height }
  }
  addEventListener(type: string, listener: (event?: any) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }
  removeEventListener(type: string, listener: (event?: any) => void): void {
    const list = this.listeners.get(type) ?? []
    this.listeners.set(
      type,
      list.filter(entry => entry !== listener),
    )
  }
  scrollIntoView(): void {}
  remove(): void {
    if (!this.parent) return
    this.parent.children = this.parent.children.filter(child => child !== this)
    this.parent = null
  }
  click(): void {
    for (const listener of this.listeners.get('click') ?? []) {
      listener({
        preventDefault() {},
        stopPropagation() {},
      })
    }
  }
}

// Minimal DOM stand-ins via a Proxy that returns FakeEl / arrays
const fakeHead = new FakeEl()
const fakeDocument: Pick<
  Document,
  'createElement' | 'createElementNS' | 'getElementById' | 'head'
> = {
  head: fakeHead as unknown as HTMLHeadElement,
  createElement(tag: string): HTMLElement {
    const el = new FakeEl()
    el.tagName = tag
    el.ownerDocument = fakeDocument as unknown as Document
    return el as unknown as HTMLElement
  },
  createElementNS(_ns: string, tag: string): Element {
    const el = new FakeEl()
    el.tagName = tag
    el.ownerDocument = fakeDocument as unknown as Document
    return el as unknown as Element
  },
  getElementById(id: string): HTMLElement | null {
    return (collectAll([fakeHead]).find(node => node.id === id) as unknown as HTMLElement) ?? null
  },
}

// Inject the fake document/performance/Image/requestAnimationFrame so the
// runtime can mount without a real DOM. We monkey-patch the globals.
;(globalThis as { document?: unknown }).document = fakeDocument
;(globalThis as { performance?: unknown }).performance = { now: () => Date.now() }
;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
  cb: (t: number) => void,
) => {
  setTimeout(() => cb(Date.now()), 0)
  return 0
}
;(globalThis as { HTMLImageElement?: unknown }).HTMLImageElement = class {}

test('AtlasRuntime.loadManifest + mount sets up children', async () => {
  const loader = makeLoader()
  const rt = new AtlasRuntime({ assets: loader })
  const m = minimalManifest()
  m.items[0].callout = { markerPosition: 'top', markerGapPx: 6 }
  rt.loadManifest(m)
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)
  // Mounted DOM has 3 top-level children: transformed panorama layer,
  // fixed-size overlay layer, and the bottom panel.
  const kids = (container as unknown as FakeEl).children
  assert.ok(kids.length >= 3, `expected at least 3 top-level children, got ${kids.length}`)
  // Verify the testids are present somewhere in the tree (catches a
  // regression where the viewport layer or panel disappears).
  const allNodes = collectAll(kids)
  const testids = new Set(allNodes.map(n => n.dataset?.testid).filter(Boolean))
  assert.ok(testids.has('atlas-viewport-layer'), 'viewport layer missing')
  assert.ok(testids.has('atlas-panorama'), 'panorama image missing')
  assert.ok(testids.has('atlas-card-drawer'), 'drawer missing')
  assert.ok(testids.has('atlas-runtime-toolbar'), 'toolbar missing')
  assert.ok(testids.has('atlas-runtime-hint'), 'hint missing')
  rt.destroy()
})

test('AtlasRuntime.focusCategory activates the default marker and drawer card', async () => {
  const loader = makeLoader()
  const rt = new AtlasRuntime({ assets: loader })
  const manifest = minimalManifest()
  manifest.items[0].callout = { markerPosition: 'top', markerGapPx: 6 }
  rt.loadManifest(manifest)
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)
  rt.focusCategory('cat-1')
  const drawer = findByTestId(containerEl, 'atlas-card-drawer')
  const card = findByTestId(containerEl, 'atlas-card-item-1')
  const hotspot = findByTestId(containerEl, 'atlas-hotspot-cat-1')
  const callout = findByTestId(containerEl, 'atlas-callout-item-1')
  assert.equal(drawer?.style.opacity, '1')
  assert.equal(card?.dataset.active, 'true')
  assert.equal(hotspot?.dataset.active, 'false')
  assert.equal(callout?.dataset.active, 'true')
  rt.destroy()
})

test('AtlasRuntime.focusCategory focuses the default highlighted item with category activationZoom', async () => {
  const loader = makeLoader()
  const rt = new AtlasRuntime({ assets: loader })
  const manifest = minimalManifest()
  manifest.items[0].callout = { markerPosition: 'top', markerGapPx: 6 }
  manifest.items[0].viewportOverride = { centerX: 0.3, centerY: 0.4, zoom: 2.2 }
  rt.loadManifest(manifest)
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)

  const animateCalls: Array<{ centerX: number; centerY: number; zoom: number }> = []
  ;(
    rt as unknown as {
      camera: { animateTo: (viewport: { centerX: number; centerY: number; zoom: number }) => void }
    }
  ).camera.animateTo = viewport => {
    animateCalls.push(viewport)
  }

  rt.focusCategory('cat-1')

  assert.deepEqual(animateCalls[0], {
    centerX: 0.3,
    centerY: 0.4,
    zoom: 3.6,
  })

  rt.destroy()
})

test('AtlasRuntime keeps hotspot roots as flex containers when visible', async () => {
  const loader = makeLoader()
  const rt = new AtlasRuntime({ assets: loader })
  const manifest = minimalManifest()
  rt.loadManifest(manifest)
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)

  const hotspot = findByTestId(containerEl, 'atlas-hotspot-cat-1')
  assert.equal(hotspot?.style.display, 'flex')
  assert.equal(hotspot?.style.flexDirection, 'column')

  rt.destroy()
})

test('AtlasRuntime keeps the floating back button visible even before the drawer opens', async () => {
  const loader = makeLoader()
  const rt = new AtlasRuntime({ assets: loader })
  const manifest = minimalManifest()
  rt.loadManifest(manifest)
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)

  const floatingBack = findByTestId(containerEl, 'atlas-runtime-floating-back')
  assert.equal(floatingBack?.style.display, 'flex')
  assert.equal(floatingBack?.style.opacity, '1')
  assert.equal(floatingBack?.style.bottom, '24px')

  rt.destroy()
})

test('AtlasRuntime hotspot click opens the drawer and item click keeps card state in sync', async () => {
  const loader = makeLoader()
  const events: AtlasEvent[] = []
  const rt = new AtlasRuntime({ assets: loader })
  const manifest = minimalManifest()
  manifest.items[0].viewportOverride = { centerX: 0.3, centerY: 0.4, zoom: 3 }
  manifest.items[0].callout = { markerPosition: 'top', markerGapPx: 6 }
  rt.loadManifest(manifest)
  rt.on(event => events.push(event))
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)

  const hotspot = findByTestId(containerEl, 'atlas-hotspot-cat-1')
  hotspot?.children[1]?.click()
  const drawer = findByTestId(containerEl, 'atlas-card-drawer')
  const card = findByTestId(containerEl, 'atlas-card-item-1')
  assert.equal(drawer?.style.opacity, '1')
  assert.equal(card?.dataset.active, 'true')
  assert.ok(events.some(event => event.type === 'hotspotclick' && event.categoryId === 'cat-1'))

  card?.click()
  assert.ok(events.some(event => event.type === 'itemclick' && event.itemId === 'item-1'))
  assert.equal(card?.dataset.active, 'true')

  const closeButton = findByTestId(containerEl, 'atlas-card-drawer-close')
  closeButton?.click()
  assert.equal(drawer?.style.opacity, '0')
  rt.destroy()
})

test('AtlasRuntime preserves bottom-marker callout order from the legacy runtime', async () => {
  const loader = makeLoader()
  const manifest = minimalManifest()
  manifest.items[0].callout = { markerPosition: 'bottom', markerGapPx: 6 }
  const rt = new AtlasRuntime({ assets: loader })
  rt.loadManifest(manifest)
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)

  const callout = findByTestId(containerEl, 'atlas-callout-item-1')
  assert.ok(callout, 'callout missing')
  assert.equal(callout?.children[0]?.tagName, 'button')
  assert.equal(callout?.children[1]?.tagName, 'span')
  assert.equal(callout?.style.flexDirection, 'column')

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
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)
  rt.openRoute('r1')
  assert.equal(loader.events[0], 'open:s-1')
  rt.destroy()
})

test('AtlasRuntime hotspot click opens html-scene categories through their panorama route', async () => {
  const loader = makeLoader()
  const manifest = minimalManifest()
  manifest.categories[0].experience = { kind: 'html-scene', sceneId: 's-1', viewId: 'view-1' }
  manifest.routes = [
    {
      id: 'route-panorama-category-cat-1-to-scene',
      from: { kind: 'panorama', categoryId: 'cat-1' },
      to: { kind: 'scene', sceneId: 's-1', viewId: 'view-1' },
    },
  ]
  manifest.scenes = [
    {
      sceneId: 's-1',
      title: 'Scene 1',
      entryUrl: './scenes/s-1/index.html',
      views: [{ id: 'view-1', title: 'V', activationMessage: { type: 'init' } }],
      protocol: { channel: 'interactive-guide:scene-bridge', version: '1.0.0' },
    },
  ]
  const rt = new AtlasRuntime({ assets: loader })
  rt.loadManifest(manifest)
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)

  const hotspot = findByTestId(containerEl, 'atlas-hotspot-cat-1')
  hotspot?.children[1]?.click()
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(loader.events.at(-1), 'open:s-1')
  rt.destroy()
})

test('AtlasRuntime.openRoute handles panorama targets by focusing the requested item', async () => {
  const loader = makeLoader()
  const events: AtlasEvent[] = []
  const manifest = minimalManifest()
  manifest.routes = [
    {
      id: 'route-scene-back-to-item',
      from: { kind: 'scene', sceneId: 's-1', viewId: 'view-1' },
      to: { kind: 'panorama', itemId: 'item-1' },
    },
  ]
  const rt = new AtlasRuntime({ assets: loader })
  rt.loadManifest(manifest)
  rt.on(event => events.push(event))
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await rt.mount(container)

  rt.openRoute('route-scene-back-to-item')

  assert.ok(events.some(event => event.type === 'itemclick' && event.itemId === 'item-1'))
  rt.destroy()
})

test('AtlasRuntime.mount survives destroy() called during awaited image load', async () => {
  // Reproduces the race that crashed the editor preview: useEffect cleanup
  // calls destroy() (sets mountedEl=null) before mount's awaited loadImage
  // resolves. The fix: mount() checks the destroyed flag after the await
  // and bails out instead of calling appendChild on null.
  let resolveLoad!: (img: HTMLImageElement) => void
  const loader: AtlasRuntimeAssetLoader = {
    resolveUrl: u => u,
    loadImage: () =>
      new Promise<HTMLImageElement>(res => {
        resolveLoad = res
      }),
    openScene: () => {},
  }
  const rt = new AtlasRuntime({ assets: loader })
  rt.loadManifest(minimalManifest())
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  const mountPromise = rt.mount(container)

  // Simulate cleanup firing before the awaited image resolves.
  rt.destroy()
  // Now the deferred image resolves; the awaited body must NOT crash.
  resolveLoad(fakeImage())
  await mountPromise

  // No assertion needed beyond "did not throw". If we get here, the
  // race-condition fix holds. The viewport layer may have been appended
  // before the destroy (that's OK — the panic we care about was an
  // appendChild on null after the await).
  const kids = (container as unknown as FakeEl).children
  const hasImage = collectAll(kids).some(n => n.dataset?.testid === 'atlas-panorama')
  assert.equal(hasImage, false, 'destroyed runtime must not append the panorama image')
})

test('AtlasRuntime.mount throws when no manifest is loaded', async () => {
  const loader = makeLoader()
  const rt = new AtlasRuntime({ assets: loader })
  const containerEl = new FakeEl()
  containerEl.ownerDocument = fakeDocument as unknown as Document
  const container = containerEl as unknown as HTMLElement
  await assert.rejects(() => rt.mount(container), /loadManifest/)
})

// Walk the FakeEl tree depth-first; used to assert on nested testids.
function collectAll(roots: FakeEl[]): FakeEl[] {
  const out: FakeEl[] = []
  const stack = [...roots]
  while (stack.length > 0) {
    const n = stack.pop()!
    out.push(n)
    if (!Array.isArray(n.children)) continue
    for (const c of n.children) stack.push(c)
  }
  return out
}

function findByTestId(root: FakeEl, testId: string): FakeEl | undefined {
  return collectAll([root]).find(node => node.dataset.testid === testId)
}
