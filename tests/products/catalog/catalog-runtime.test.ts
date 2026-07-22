/**
 * CatalogRuntime unit tests — event emission, mount behavior, and
 * route opening for the structured-knowledge product.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CatalogRuntime,
  resolveCatalogInitialSelection,
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

function makeLoader(
  opened: { sceneId?: string; viewId?: string } = {},
): CatalogRuntimeAssetLoader & {
  events: string[]
} {
  const events: string[] = []
  return {
    events,
    resolveUrl: (u: string) => u,
    loadImage: async (_url: string) => fakeImage(),
    openScene: (scene: CatalogHtmlSceneManifest, viewId?: string) => {
      events.push('open:' + scene.sceneId)
      opened.sceneId = scene.sceneId
      opened.viewId = viewId
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

function manifestWithDram(): CatalogManifest {
  const manifest = minimalManifest()
  manifest.stages.push({
    key: 'midstream',
    label: '中游',
    order: 2,
    categories: [
      {
        id: 'cat-memory-products',
        title: '存储芯片产品',
        order: 0,
        itemIds: ['item-dram'],
        experience: { kind: 'panorama' },
        viewport: { centerX: 0.65, centerY: 0.5, zoom: 3 },
      },
    ],
  })
  manifest.items.push({
    id: 'item-dram',
    categoryId: 'cat-memory-products',
    title: 'DRAM',
    description: 'Dynamic random-access memory',
    order: 0,
    marker: { x: 0.6, y: 0.5 },
    focusRect: { x: 0.55, y: 0.4, width: 0.1, height: 0.2 },
  })
  return manifest
}

class FakeEl {
  children: FakeEl[] = []
  dataset: Record<string, string | undefined> = {}
  style: Record<string, string | undefined> = {}
  listeners = new Map<string, Array<(event: unknown) => void>>()
  className = ''
  textContent = ''
  innerHTML = ''
  tagName = 'div'
  clientWidth = 1024
  clientHeight = 768
  scrollHeight = 1600
  scrollTop = 0
  lastScrollBehavior: ScrollBehavior | undefined
  appendChild<T>(child: T): T {
    this.children.push(child as unknown as FakeEl)
    return child
  }
  setAttribute(_k: string, _v: string): void {}
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 1024, height: 768 }
  }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback =
      typeof listener === 'function' ? listener : event => listener.handleEvent(event as Event)
    const current = this.listeners.get(type) ?? []
    current.push(callback as (event: unknown) => void)
    this.listeners.set(type, current)
  }
  removeEventListener(): void {}
  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
  scrollTo(options: ScrollToOptions): void {
    this.scrollTop = Number(options.top) || 0
    this.lastScrollBehavior = options.behavior
  }
  setPointerCapture(): void {}
  releasePointerCapture(): void {}
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
;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {}
;(globalThis as { HTMLImageElement?: unknown }).HTMLImageElement = class {}

test('CatalogRuntime.loadManifest + mount creates the complete catalog scene', async () => {
  const loader = makeLoader()
  const rt = new CatalogRuntime({ assets: loader })
  rt.loadManifest(minimalManifest())
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  const sceneChildren = (container as unknown as FakeEl).children
  assert.ok(sceneChildren.some(child => child.dataset.testid === 'catalog-scene-original'))
  assert.ok(sceneChildren.some(child => child.dataset.testid === 'catalog-scene-stage-tabs'))
  assert.ok(sceneChildren.some(child => child.dataset.testid === 'catalog-scene-detail-list'))
  assert.ok(
    !sceneChildren.some(child => child.dataset.testid === 'catalog-atlas-launch'),
    'Atlas entry is absent until a complete URL is configured',
  )
  rt.destroy()
})

test('resolveCatalogInitialSelection locates an item and derives its stage and category', () => {
  assert.deepEqual(resolveCatalogInitialSelection(manifestWithDram(), ' DRAM '), {
    stageKey: 'midstream',
    categoryId: 'cat-memory-products',
    itemId: 'item-dram',
  })
  const chinese = minimalManifest()
  chinese.items[0].title = '半导体硅片'
  assert.equal(resolveCatalogInitialSelection(chinese, '半导体硅片')?.itemId, 'item-1')
  const english = minimalManifest()
  english.items[0].title = 'Semiconductor Wafers'
  assert.equal(resolveCatalogInitialSelection(english, 'Semiconductor Wafers')?.itemId, 'item-1')
  assert.equal(resolveCatalogInitialSelection(manifestWithDram(), 'Unknown item'), undefined)
})

test('CatalogRuntime mounts with the URL-selected item highlighted', async () => {
  const rt = new CatalogRuntime({ assets: makeLoader(), initialItemTitle: 'DRAM' })
  rt.loadManifest(manifestWithDram())
  await rt.mount(new FakeEl() as unknown as HTMLElement)
  assert.deepEqual(rt.getSelection(), {
    stageKey: 'midstream',
    categoryId: 'cat-memory-products',
    itemId: 'item-dram',
  })
  rt.destroy()
})

test('CatalogRuntime uses the legacy 520ms focus and camera easing contract', async () => {
  const originalRaf = globalThis.requestAnimationFrame
  const originalCancelRaf = globalThis.cancelAnimationFrame
  const originalPerformance = globalThis.performance
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1
  let now = 1000
  ;(globalThis as { performance: { now: () => number } }).performance = { now: () => now }
  globalThis.requestAnimationFrame = callback => {
    const id = nextFrameId++
    frames.set(id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = id => {
    frames.delete(id)
  }
  const runFrames = (timestamp: number) => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback(timestamp))
  }
  const loader = makeLoader()
  const rt = new CatalogRuntime({ assets: loader })
  try {
    const manifest = minimalManifest()
    manifest.items.push({
      id: 'item-2',
      categoryId: 'cat-1',
      title: 'Item 2',
      description: 'desc 2',
      order: 1,
      marker: { x: 0.7, y: 0.6 },
      focusRect: { x: 0.6, y: 0.5, width: 0.1, height: 0.1 },
      viewportOverride: { centerX: 0.7, centerY: 0.5, zoom: 3 },
    })
    manifest.stages[0].categories[0].itemIds.push('item-2')
    rt.loadManifest(manifest)
    const container = new FakeEl() as unknown as HTMLElement
    await rt.mount(container)
    const children = (container as unknown as FakeEl).children
    const backdrop = children.find(child => child.dataset.testid === 'catalog-scene-original')
    const focus = children.find(child => child.dataset.testid === 'catalog-focus-window')
    const markerLayer = children.find(child => child.dataset.testid === 'catalog-marker-layer')
    const currentMarker = () =>
      [...(markerLayer?.children ?? [])]
        .reverse()
        .find(child => child.dataset.testid === 'catalog-marker-item-2')
    const assertSceneAligned = () => {
      const backdropLeft = Number.parseFloat(backdrop?.style.left ?? '')
      const backdropTop = Number.parseFloat(backdrop?.style.top ?? '')
      const backdropWidth = Number.parseFloat(backdrop?.style.width ?? '')
      const backdropHeight = Number.parseFloat(backdrop?.style.height ?? '')
      const focusLeft = Number.parseFloat(focus?.style.left ?? '')
      const focusTop = Number.parseFloat(focus?.style.top ?? '')
      const [focusBackgroundWidth, focusBackgroundHeight] = (focus?.style.backgroundSize ?? '')
        .split(' ')
        .map(Number.parseFloat)
      const [focusBackgroundX, focusBackgroundY] = (focus?.style.backgroundPosition ?? '')
        .split(' ')
        .map(Number.parseFloat)
      assert.ok(Math.abs(focusBackgroundWidth - backdropWidth) < 0.001)
      assert.ok(Math.abs(focusBackgroundHeight - backdropHeight) < 0.001)
      assert.ok(Math.abs(focusBackgroundX - (backdropLeft - focusLeft)) < 0.001)
      assert.ok(Math.abs(focusBackgroundY - (backdropTop - focusTop)) < 0.001)
      assert.ok(
        Math.abs(
          Number.parseFloat(currentMarker()?.style.left ?? '') -
            (backdropLeft + 0.7 * backdropWidth - 10.5),
        ) < 0.001,
      )
    }
    assert.equal(backdrop?.style.transition, 'none')
    const initialLeft = Number.parseFloat(focus?.style.left ?? '')
    const initialBackdropLeft = Number.parseFloat(backdrop?.style.left ?? '')

    rt.selectItem('item-2')
    assert.ok(
      frames.size >= 2,
      'selection must schedule focus interpolation and list centering frames',
    )
    assert.equal(
      Number.parseFloat(focus?.style.left ?? ''),
      initialLeft,
      'focus must not jump before the first animation frame',
    )
    assert.equal(Number.parseFloat(backdrop?.style.left ?? ''), initialBackdropLeft)

    now = 1260
    runFrames(now)
    const middleLeft = Number.parseFloat(focus?.style.left ?? '')
    const middleBackdropLeft = Number.parseFloat(backdrop?.style.left ?? '')
    assert.ok(
      middleLeft > initialLeft && middleLeft < 204.8,
      'half-time frame must be between the old and target positions',
    )
    assert.ok(middleBackdropLeft < initialBackdropLeft && middleBackdropLeft > -1638.4)
    assertSceneAligned()

    now = 1520
    runFrames(now)
    assert.ok(
      Math.abs(Number.parseFloat(focus?.style.left ?? '') - 204.8) < 0.001,
      '520ms frame must land on the target position',
    )
    assert.ok(Math.abs(Number.parseFloat(backdrop?.style.left ?? '') + 1638.4) < 0.001)
    assertSceneAligned()
    rt.destroy()
  } finally {
    globalThis.requestAnimationFrame = originalRaf
    globalThis.cancelAnimationFrame = originalCancelRaf
    ;(globalThis as { performance: Performance }).performance = originalPerformance
  }
})

test('CatalogRuntime aligns the focus crop with the same panorama coordinates as its backdrop', async () => {
  const loader = makeLoader()
  const rt = new CatalogRuntime({ assets: loader })
  rt.loadManifest(minimalManifest())
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)

  const focus = (container as unknown as FakeEl).children.find(
    child => child.dataset.testid === 'catalog-focus-window',
  )
  const connector = (container as unknown as FakeEl).children.find(
    child => child.dataset.testid === 'catalog-focus-connector',
  )
  const markerLayer = (container as unknown as FakeEl).children.find(
    child => child.dataset.testid === 'catalog-marker-layer',
  )
  const activeMarker = markerLayer?.children.find(
    child => child.dataset.testid === 'catalog-marker-item-1',
  )
  const activeDot = activeMarker?.children[0]
  assert.ok(focus, 'the selected item must render a focus crop')
  assert.equal(activeMarker?.style.padding, '0')
  assert.equal(activeMarker?.style.width, activeMarker?.style.height)
  assert.equal(activeDot?.style.width, activeDot?.style.height)
  assert.equal(activeDot?.style.minWidth, activeDot?.style.minHeight)
  assert.equal(activeDot?.style.flex, '0 0 auto')
  assert.equal(activeDot?.style.aspectRatio, '1 / 1')
  // The source image is 4:3 in this fixture. At zoom 2 the image begins at
  // (-512px, -384px) and the crop begins at (-307.2px, -230.4px). CSS
  // backgrounds are local to the crop, so they shift by the difference, not
  // by the backdrop origin itself.
  assert.equal(focus.style.backgroundPosition, '-204.8px -153.60000000000002px')
  assert.equal(focus.style.borderRadius, '12px')
  const cornerInset = 12 * (1 - Math.SQRT1_2) - 1.5
  const expectedConnectorLeft =
    Number.parseFloat(focus.style.left ?? '') +
    Number.parseFloat(focus.style.width ?? '') -
    cornerInset
  const expectedConnectorTop = Number.parseFloat(focus.style.top ?? '') + cornerInset
  assert.ok(
    Math.abs(Number.parseFloat(connector?.style.left ?? '') - expectedConnectorLeft) < 0.001,
  )
  assert.ok(Math.abs(Number.parseFloat(connector?.style.top ?? '') - expectedConnectorTop) < 0.001)
  rt.destroy()
})

test('CatalogRuntime keeps the pill focus variant fully rounded', async () => {
  const manifest = minimalManifest()
  manifest.config.theme.focusVariant = 'pill'
  const rt = new CatalogRuntime({ assets: makeLoader() })
  rt.loadManifest(manifest)
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)

  const focus = (container as unknown as FakeEl).children.find(
    child => child.dataset.testid === 'catalog-focus-window',
  )
  assert.ok(Math.abs(Number.parseFloat(focus?.style.borderRadius ?? '') - 153.6) < 0.001)
  rt.destroy()
})

test('CatalogRuntime uses the complete host rectangle instead of an inner square', async () => {
  const rt = new CatalogRuntime({ assets: makeLoader() })
  rt.loadManifest(minimalManifest())
  const container = new FakeEl()
  container.clientWidth = 1200
  container.clientHeight = 600
  await rt.mount(container as unknown as HTMLElement)

  const focus = container.children.find(child => child.dataset.testid === 'catalog-focus-window')
  assert.equal(container.style.width, '100%')
  assert.equal(container.style.height, '100%')
  assert.equal(
    focus?.style.backgroundPosition,
    '-240px -180px',
    'focus crop must share the cover geometry of the complete 1200x600 host',
  )
  rt.destroy()
})

test('CatalogRuntime centers the active detail and supports pointer-drag list scrolling', async () => {
  const manifest = minimalManifest()
  manifest.items.push({
    id: 'item-2',
    categoryId: 'cat-1',
    title: 'Item 2',
    description: 'desc 2',
    order: 1,
    marker: { x: 0.7, y: 0.6 },
    focusRect: { x: 0.6, y: 0.5, width: 0.1, height: 0.1 },
  })
  manifest.stages[0].categories[0].itemIds.push('item-2')
  const rt = new CatalogRuntime({ assets: makeLoader() })
  rt.loadManifest(manifest)
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  const list = (container as unknown as FakeEl).children.find(
    child => child.dataset.testid === 'catalog-scene-detail-list',
  )
  assert.ok(list)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(list.lastScrollBehavior, 'smooth')

  list.emit('pointerdown', { pointerType: 'mouse', button: 0, pointerId: 7, clientY: 300 })
  list.emit('pointermove', { pointerId: 7, clientY: 200, cancelable: true, preventDefault() {} })
  assert.equal(list.scrollTop, 100)
  list.emit('pointerup', { pointerId: 7 })
  assert.equal(list.style.cursor, 'grab')
  rt.destroy()
})

test('CatalogRuntime renders and emits the optional Atlas launch entry', async () => {
  const loader = makeLoader()
  const events: CatalogEvent[] = []
  const manifest = minimalManifest()
  manifest.config.atlasLaunchUrl = 'https://example.com/atlas/index.html'
  const rt = new CatalogRuntime({ assets: loader, listeners: [event => events.push(event)] })
  rt.loadManifest(manifest)
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  const launch = (container as unknown as FakeEl).children.find(
    child => child.dataset.testid === 'catalog-atlas-launch',
  )
  assert.ok(launch, 'configured URL must render an isolated launch entry')
  rt.emitEvent({ type: 'atlaslaunch', url: manifest.config.atlasLaunchUrl })
  assert.ok(
    events.some(
      event => event.type === 'atlaslaunch' && event.url === manifest.config.atlasLaunchUrl,
    ),
  )
  rt.destroy()
})

test('CatalogRuntime.selectItem emits itemselect and viewport animation events', async () => {
  const loader = makeLoader()
  const events: CatalogEvent[] = []
  const rt = new CatalogRuntime({ assets: loader })
  rt.loadManifest(minimalManifest())
  rt.on(e => events.push(e))
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  rt.selectItem('item-1')
  const types = events.map(e => e.type)
  assert.ok(types.includes('itemselect'))
  assert.ok(types.includes('viewportanimationstart'))
  rt.destroy()
})

test('CatalogRuntime.openRoute triggers the scene opener for scene targets', async () => {
  const opened: { sceneId?: string; viewId?: string } = {}
  const loader = makeLoader(opened)
  const m = minimalManifest()
  m.routes = [
    {
      id: 'r1',
      from: { kind: 'panorama' },
      to: { kind: 'scene', sceneId: 's-1', viewId: 'v1' },
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
  assert.equal(opened.viewId, 'v1')
  rt.destroy()
})

test('CatalogRuntime.openRoute handles panorama targets by selecting an item', async () => {
  const loader = makeLoader()
  const events: CatalogEvent[] = []
  const m = minimalManifest()
  m.routes = [
    {
      id: 'r-panorama',
      from: { kind: 'scene', sceneId: 's-1', viewId: 'v1' },
      to: { kind: 'panorama', itemId: 'item-1' },
    },
  ]
  const rt = new CatalogRuntime({ assets: loader })
  rt.loadManifest(m)
  rt.on(event => events.push(event))
  const container = new FakeEl() as unknown as HTMLElement
  await rt.mount(container)
  rt.openRoute('r-panorama')
  assert.ok(events.some(event => event.type === 'itemselect' && event.itemId === 'item-1'))
  rt.destroy()
})

test('CatalogRuntime.mount throws when no manifest is loaded', async () => {
  const loader = makeLoader()
  const rt = new CatalogRuntime({ assets: loader })
  const container = new FakeEl() as unknown as HTMLElement
  await assert.rejects(() => rt.mount(container), /loadManifest/)
})
