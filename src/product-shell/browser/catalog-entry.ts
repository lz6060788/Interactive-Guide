import { CatalogRuntime } from '../../products/catalog/runtime/catalog-runtime.js'
import type { CatalogManifest } from '../../products/catalog/contract/catalog-manifest.js'
import { AssetLoader } from '../../platform/asset-loader/asset-loader.js'
import { createShellFrame } from './shared/shell-frame.js'
import { loadManifest } from './shared/browser-runtime-entry.js'
import { SceneOverlayHost } from './shared/scene-overlay-host.js'
import { ProductToolbar, shareCurrentPage } from './shared/product-toolbar.js'
import { openAtlasWithF10 } from './shared/f10-atlas-launcher.js'
import { createRuntimeAnalytics } from './shared/runtime-analytics.js'

export async function bootstrapCatalogProduct(
  app: HTMLElement,
  manifestUrl: string,
): Promise<void> {
  const manifest = await loadManifest<CatalogManifest>(manifestUrl)
  const { shell, runtimeMount } = createShellFrame(app, manifest.config.viewport)
  const assetLoader = new AssetLoader()
  const analytics = createRuntimeAnalytics(manifest.integrations, 'catalog', manifest.projectId)
  let runtime: CatalogRuntime | null = null

  // The Catalog reference scene owns its own stage/category navigation. Unlike
  // Atlas, it must not receive the generic product title bar by default.
  if (manifest.config.chrome.showToolbar === true) {
    const toolbar = new ProductToolbar({
      root: shell,
      projectTitle: manifest.projectTitle,
      textColor: manifest.config.theme.textColor ?? '#FFFFFF',
      onShare: () => {
        analytics.track('share', { channel: 'toolbar' })
        void shareCurrentPage(manifest.projectTitle)
      },
    })
    toolbar.mount()
  }

  const sceneHost = new SceneOverlayHost({
    root: shell,
    product: 'catalog',
    projectId: manifest.projectId,
    projectTitle: manifest.projectTitle,
    sessionId: createSessionId(manifest.projectId, manifest.product),
    onRouteRequest: routeId => runtime?.openRoute(routeId),
    onShare: () => analytics.track('share', { channel: 'html-scene-toolbar' }),
  })

  runtime = new CatalogRuntime({
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
          case 'atlaslaunch':
            analytics.trackRuntimeEvent(event)
            break
        }
        if (event.type === 'atlaslaunch') openAtlasWithF10(event.url)
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
