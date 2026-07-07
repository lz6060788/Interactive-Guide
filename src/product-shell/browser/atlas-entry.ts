import { AtlasRuntime, type AtlasEvent } from '../../products/atlas/runtime/atlas-runtime.js'
import type { AtlasManifest } from '../../products/atlas/contract/atlas-manifest.js'
import { AssetLoader } from '../../platform/asset-loader/asset-loader.js'
import { createShellFrame } from './shared/shell-frame.js'
import { loadManifest } from './shared/browser-runtime-entry.js'
import { SceneOverlayHost } from './shared/scene-overlay-host.js'

export async function bootstrapAtlasProduct(app: HTMLElement, manifestUrl: string): Promise<void> {
  const manifest = await loadManifest<AtlasManifest>(manifestUrl)
  const { shell, runtimeMount } = createShellFrame(app, manifest.config.viewport)
  const assetLoader = new AssetLoader()
  let runtime: AtlasRuntime | null = null

  const sceneHost = new SceneOverlayHost({
    root: shell,
    product: 'atlas',
    projectId: manifest.projectId,
    projectTitle: manifest.projectTitle,
    sessionId: createSessionId(manifest.projectId, manifest.product),
    onRouteRequest: (routeId) => runtime?.openRoute(routeId),
  })

  runtime = new AtlasRuntime({
    assets: {
      resolveUrl: (url) => assetLoader.resolveUrl(url),
      loadImage: (url) => assetLoader.loadImage(url),
      openScene: (scene, viewId) => sceneHost.openScene(scene, viewId),
    },
    listeners: [
      (event) => {
        if (event.type === 'routechange') return
        handleAtlasEvent(event)
      },
    ],
  })

  runtime.loadManifest(manifest)
  await runtime.mount(runtimeMount)
}

function createSessionId(projectId: string, product: string): string {
  return `${projectId}:${product}:${Date.now().toString(36)}`
}

function handleAtlasEvent(_event: AtlasEvent): void {
  // Placeholder hook: runtime events already encapsulate analytics/share
  // semantics. Product-shell host keeps this seam so release-only host
  // behaviors can be attached without changing AtlasRuntime again.
}

