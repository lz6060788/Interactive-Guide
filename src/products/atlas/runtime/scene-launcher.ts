/**
 * SceneLauncher — opens HTML scene bundles via the asset loader's
 * `openScene` callback. The actual iframe/window handling lives in the
 * shared platform layer (Phase 5); this class is just a thin event
 * emitter that bridges AtlasRuntime to that loader.
 */
import type { AtlasHtmlSceneManifest, AtlasEvent, AtlasListener } from './atlas-runtime.js'

export type SceneOpener = (scene: AtlasHtmlSceneManifest, viewId?: string) => void

export class SceneLauncher {
  constructor(
    private readonly open: SceneOpener,
    private readonly listeners: AtlasListener[],
  ) {}

  launch(scene: AtlasHtmlSceneManifest, viewId?: string): void {
    this.emit({ type: 'sceneenter', sceneId: scene.sceneId, viewId: viewId ?? scene.views[0]?.id ?? '' })
    this.open(scene, viewId)
  }

  private emit(event: AtlasEvent): void {
    for (const l of this.listeners) l(event)
  }
}