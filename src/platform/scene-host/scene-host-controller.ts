import {
  buildSceneBridgeEnvelope,
  isSceneBridgeEnvelope,
  resolveSceneBridgeTargetOrigin,
  type SceneBridgeFocusItemPayload,
} from '../scene-bridge/scene-bridge.js'

export interface SceneHostViewDescriptor {
  id: string
  title: string
  chrome?: { textColor?: string }
}

export interface SceneHostSceneDescriptor {
  sceneId: string
  title: string
  entryUrl: string
  views: SceneHostViewDescriptor[]
}

export interface SceneHostActiveScene {
  src: string
  sceneId: string
  sceneTitle: string
  viewId: string
  viewTitle: string
  activationId: string
  chromeTextColor: string
}

export interface SceneHostControllerOptions {
  product: 'atlas' | 'catalog'
  projectId: string
  sessionId: string
  locale: string
  supportedLocales: string[]
  baseHref: string
  getIframeWindow: () => Window | null
  onRequestBack: () => void
  onRequestRoute: (routeId: string) => void
}

export class SceneHostController {
  private activeScene: SceneHostActiveScene | null = null

  constructor(private readonly options: SceneHostControllerOptions) {}

  getActiveScene(): SceneHostActiveScene | null {
    return this.activeScene
  }

  openScene(scene: SceneHostSceneDescriptor, viewId?: string): SceneHostActiveScene {
    if (this.activeScene) {
      this.postHostExit(this.activeScene)
    }
    const resolvedViewId = viewId ?? scene.views[0]?.id ?? ''
    const resolvedView = scene.views.find(entry => entry.id === resolvedViewId) ?? scene.views[0]
    const nextScene: SceneHostActiveScene = {
      src: scene.entryUrl,
      sceneId: scene.sceneId,
      sceneTitle: scene.title,
      viewId: resolvedViewId,
      viewTitle: resolvedView?.title || scene.title,
      activationId: createSceneHostActivationId(
        this.options.projectId,
        scene.sceneId,
        resolvedViewId,
      ),
      chromeTextColor: resolvedView?.chrome?.textColor?.trim() || '#FFFFFF',
    }
    this.activeScene = nextScene
    return nextScene
  }

  closeScene(): void {
    if (!this.activeScene) return
    this.postHostExit(this.activeScene)
    this.activeScene = null
  }

  handleSceneLoad(): void {
    const activeScene = this.activeScene
    const sceneWindow = this.options.getIframeWindow()
    if (!activeScene || !sceneWindow) return
    const targetOrigin = resolveSceneBridgeTargetOrigin(activeScene.src, this.options.baseHref)
    if (!targetOrigin) return
    sceneWindow.postMessage(
      buildSceneBridgeEnvelope('event', 'interactive-guide-host', 'host:init', {
        activationId: activeScene.activationId,
        sessionId: this.options.sessionId,
        product: this.options.product,
        locale: this.options.locale,
        supportedLocales: this.options.supportedLocales,
        scene: {
          id: activeScene.sceneId,
          title: activeScene.sceneTitle,
          entryUrl: activeScene.src,
        },
        runtime: {
          product: this.options.product,
          projectId: this.options.projectId,
          sceneId: activeScene.sceneId,
          viewId: activeScene.viewId,
        },
      }),
      targetOrigin,
    )
  }

  focusItem(payload: SceneBridgeFocusItemPayload): void {
    const activeScene = this.activeScene
    const sceneWindow = this.options.getIframeWindow()
    if (!activeScene || !sceneWindow) return
    const targetOrigin = resolveSceneBridgeTargetOrigin(activeScene.src, this.options.baseHref)
    if (!targetOrigin) return
    sceneWindow.postMessage(
      buildSceneBridgeEnvelope('event', 'interactive-guide-host', 'host:focus-item', payload),
      targetOrigin,
    )
  }

  bindMessages(hostWindow: Window): () => void {
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== this.options.getIframeWindow() ||
        !isSceneBridgeEnvelope(event.data) ||
        event.data.source !== 'interactive-guide-scene' ||
        event.data.kind !== 'request'
      ) {
        return
      }
      if (event.data.type === 'scene:request-back') {
        this.options.onRequestBack()
        return
      }
      if (event.data.type === 'scene:request-route') {
        const routeId = String(
          (event.data.payload as { routeId?: string } | undefined)?.routeId ?? '',
        )
        if (routeId) this.options.onRequestRoute(routeId)
      }
    }
    hostWindow.addEventListener('message', onMessage)
    return () => hostWindow.removeEventListener('message', onMessage)
  }

  private postHostExit(scene: SceneHostActiveScene): void {
    const sceneWindow = this.options.getIframeWindow()
    if (!sceneWindow) return
    const targetOrigin = resolveSceneBridgeTargetOrigin(scene.src, this.options.baseHref)
    if (!targetOrigin) return
    sceneWindow.postMessage(
      buildSceneBridgeEnvelope('event', 'interactive-guide-host', 'host:exit', {
        activationId: scene.activationId,
      }),
      targetOrigin,
    )
  }
}

export function createSceneHostActivationId(
  projectId: string,
  sceneId: string,
  viewId: string,
): string {
  return `${projectId}:${sceneId}:${viewId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
}
