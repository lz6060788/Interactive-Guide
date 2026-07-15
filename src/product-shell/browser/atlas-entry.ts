import { AtlasRuntime } from '../../products/atlas/runtime/atlas-runtime.js'
import type { AtlasManifest } from '../../products/atlas/contract/atlas-manifest.js'
import { AssetLoader } from '../../platform/asset-loader/asset-loader.js'
import { createShellFrame } from './shared/shell-frame.js'
import { loadManifest } from './shared/browser-runtime-entry.js'
import { SceneOverlayHost } from './shared/scene-overlay-host.js'
import { createRuntimeAnalytics } from './shared/runtime-analytics.js'

export async function bootstrapAtlasProduct(app: HTMLElement, manifestUrl: string): Promise<void> {
  const manifest = await loadManifest<AtlasManifest>(manifestUrl)
  const { shell, runtimeMount } = createShellFrame(app)
  const assetLoader = new AssetLoader()
  const analytics = createRuntimeAnalytics(manifest.integrations, 'atlas', manifest.projectId)
  let runtime: AtlasRuntime | null = null

  const sceneHost = new SceneOverlayHost({
    root: shell,
    product: 'atlas',
    projectId: manifest.projectId,
    projectTitle: manifest.projectTitle,
    sessionId: createSessionId(manifest.projectId, manifest.product),
    onRouteRequest: routeId => runtime?.openRoute(routeId),
    onShare: () => analytics.track('share', { channel: 'html-scene-toolbar' }),
  })

  runtime = new AtlasRuntime({
    assets: {
      resolveUrl: url => assetLoader.resolveUrl(url),
      loadImage: url => assetLoader.loadImage(url),
      openScene: (scene, viewId) => sceneHost.openScene(scene, viewId),
    },
    listeners: [
      event => {
        switch (event.type) {
          case 'analytics:expose':
          case 'analytics:click':
          case 'analytics:stay':
          case 'analytics:share':
          case 'sceneenter':
          case 'routechange':
            analytics.trackRuntimeEvent(event)
            return
        }
      },
    ],
  })

  runtime.loadManifest(manifest)
  await runtime.mount(runtimeMount)
  analytics.track('expose', { target: { kind: 'route', id: 'initial' } })
}

function createSessionId(projectId: string, product: string): string {
  return `${projectId}:${product}:${Date.now().toString(36)}`
}
