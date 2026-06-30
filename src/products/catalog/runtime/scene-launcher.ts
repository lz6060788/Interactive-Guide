/**
 * SceneLauncher — emits sceneenter / routechange analytics when an HTML
 * scene bundle is opened. Catalog does not own the scene window; the
 * host (admin or runtime shell) provides openScene().
 */
import type {
  CatalogEvent,
  CatalogListener,
} from './catalog-runtime.js'
import type { CatalogHtmlSceneManifest } from '../contract/catalog-manifest.js'

export class SceneLauncher {
  private readonly openScene: (scene: CatalogHtmlSceneManifest, viewId?: string) => void
  private readonly listeners: CatalogListener[]

  constructor(
    openScene: (scene: CatalogHtmlSceneManifest, viewId?: string) => void,
    listeners: CatalogListener[],
  ) {
    this.openScene = openScene
    this.listeners = listeners
  }

  launch(scene: CatalogHtmlSceneManifest, viewId?: string): void {
    const firstView = viewId ?? scene.views[0]?.id
    this.emit({ type: 'sceneenter', sceneId: scene.sceneId, viewId: firstView ?? 'default' })
    this.openScene(scene, firstView)
  }

  private emit(event: CatalogEvent): void {
    for (const l of this.listeners) l(event)
  }
}