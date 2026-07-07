import test from 'node:test'
import assert from 'node:assert/strict'
import { SceneHostController } from '../../src/platform/scene-host/scene-host-controller.js'

class FakeWindow {
  public readonly sent: Array<{ message: unknown; targetOrigin: string }> = []
  private readonly listeners = new Set<(event: MessageEvent) => void>()

  postMessage(message: unknown, targetOrigin: string): void {
    this.sent.push({ message, targetOrigin })
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'message') return
    if (typeof listener === 'function') {
      this.listeners.add(listener as (event: MessageEvent) => void)
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'message') return
    if (typeof listener === 'function') {
      this.listeners.delete(listener as (event: MessageEvent) => void)
    }
  }

  emitMessage(event: MessageEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

function createController(overrides: Partial<ConstructorParameters<typeof SceneHostController>[0]> = {}) {
  const iframeWindow = new FakeWindow()
  const hostWindow = new FakeWindow()
  const routeIds: string[] = []
  let backRequests = 0
  const controller = new SceneHostController({
    product: 'atlas',
    projectId: 'rocket',
    sessionId: 'session-1',
    baseHref: 'https://example.com/admin',
    getIframeWindow: () => iframeWindow as unknown as Window,
    onRequestBack: () => {
      backRequests += 1
    },
    onRequestRoute: (routeId) => {
      routeIds.push(routeId)
    },
    ...overrides,
  })
  return { controller, iframeWindow, hostWindow, routeIds, getBackRequests: () => backRequests }
}

test('SceneHostController posts host:init / focus-item / exit for the active scene', () => {
  const { controller, iframeWindow } = createController()
  const activeScene = controller.openScene({
    sceneId: 'scene-1',
    title: '火箭场景',
    entryUrl: 'https://example.com/scenes/rocket/index.html',
    views: [
      { id: 'overview', title: '总览', chrome: { textColor: '#FFEEAA' } },
    ],
  })

  assert.equal(activeScene.viewTitle, '总览')
  assert.equal(activeScene.chromeTextColor, '#FFEEAA')

  controller.handleSceneLoad()
  controller.focusItem({ itemId: 'item-1', categoryId: 'cat-1' })
  controller.closeScene()

  assert.equal(iframeWindow.sent.length, 3)
  const [initMessage, focusMessage, exitMessage] = iframeWindow.sent
  assert.equal(initMessage?.targetOrigin, 'https://example.com')
  assert.equal((initMessage?.message as { type?: string }).type, 'host:init')
  assert.equal((focusMessage?.message as { type?: string }).type, 'host:focus-item')
  assert.equal((exitMessage?.message as { type?: string }).type, 'host:exit')
  assert.equal(controller.getActiveScene(), null)
})

test('SceneHostController listens only to the active iframe scene requests', () => {
  const { controller, iframeWindow, hostWindow, routeIds, getBackRequests } = createController()
  controller.openScene({
    sceneId: 'scene-1',
    title: '火箭场景',
    entryUrl: 'https://example.com/scenes/rocket/index.html',
    views: [{ id: 'overview', title: '总览' }],
  })

  const dispose = controller.bindMessages(hostWindow as unknown as Window)
  hostWindow.emitMessage({
    source: iframeWindow as unknown as MessageEventSource,
    data: {
      channel: 'interactive-guide:scene-bridge',
      version: '1.0.0',
      source: 'interactive-guide-scene',
      kind: 'request',
      type: 'scene:request-route',
      payload: { routeId: 'route-1' },
    },
  } as MessageEvent)
  hostWindow.emitMessage({
    source: iframeWindow as unknown as MessageEventSource,
    data: {
      channel: 'interactive-guide:scene-bridge',
      version: '1.0.0',
      source: 'interactive-guide-scene',
      kind: 'request',
      type: 'scene:request-back',
      payload: {},
    },
  } as MessageEvent)
  hostWindow.emitMessage({
    source: {} as MessageEventSource,
    data: {
      channel: 'interactive-guide:scene-bridge',
      version: '1.0.0',
      source: 'interactive-guide-scene',
      kind: 'request',
      type: 'scene:request-route',
      payload: { routeId: 'route-ignored' },
    },
  } as MessageEvent)
  dispose()

  assert.deepEqual(routeIds, ['route-1'])
  assert.equal(getBackRequests(), 1)
})
