import { CatalogRuntime } from '../../products/catalog/runtime/catalog-runtime.js'
import type { CatalogManifest } from '../../products/catalog/contract/catalog-manifest.js'
import { AssetLoader } from '../../platform/asset-loader/asset-loader.js'
import { createShellFrame } from './shared/shell-frame.js'
import { loadManifest } from './shared/browser-runtime-entry.js'
import { SceneOverlayHost } from './shared/scene-overlay-host.js'
import { ProductToolbar } from './shared/product-toolbar.js'
import { openAtlasWithF10 } from './shared/f10-atlas-launcher.js'
import { F10HostAdapter } from '../../platform/f10/f10-host-adapter.js'
import { ProductShareController } from './shared/product-sharing.js'

export async function bootstrapCatalogProduct(
  app: HTMLElement,
  manifestUrl: string,
): Promise<void> {
  const manifest = await loadManifest<CatalogManifest>(manifestUrl)
  const { shell, runtimeMount } = createShellFrame(app)
  const assetLoader = new AssetLoader()
  const f10 = new F10HostAdapter()
  const sharing = new ProductShareController({
    projectTitle: manifest.projectTitle,
    config: manifest.integrations.share,
    resolveAssetUrl: url => assetLoader.resolveUrl(url),
    f10,
  })
  let runtime: CatalogRuntime | null = null

  // The Catalog reference scene owns its own stage/category navigation. Unlike
  // Atlas, it must not receive the generic product title bar by default.
  if (manifest.config.chrome.showToolbar === true) {
    const toolbar = new ProductToolbar({
      root: shell,
      projectTitle: manifest.projectTitle,
      textColor: manifest.config.theme.textColor ?? '#FFFFFF',
      onShare: () => void sharing.share(),
      shareEnabled: sharing.enabled,
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
    onShare: () => sharing.share(),
    shareEnabled: sharing.enabled,
  })

  runtime = new CatalogRuntime({
    assets: {
      resolveUrl: url => assetLoader.resolveUrl(url),
      loadImage: url => assetLoader.loadImage(url),
      openScene: (scene, viewId) => sceneHost.openScene(scene, viewId),
    },
    listeners: [
      event => {
        if (event.type === 'atlaslaunch') void openAtlasWithF10(event.url, f10)
      },
    ],
  })

  runtime.loadManifest(manifest)
  await runtime.mount(runtimeMount)
}

function createSessionId(projectId: string, product: string): string {
  return `${projectId}:${product}:${Date.now().toString(36)}`
}
