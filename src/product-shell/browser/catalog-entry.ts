import { CatalogRuntime } from '../../products/catalog/runtime/catalog-runtime.js'
import type { CatalogManifest } from '../../products/catalog/contract/catalog-manifest.js'
import { AssetLoader } from '../../platform/asset-loader/asset-loader.js'
import { createShellFrame } from './shared/shell-frame.js'
import { loadManifest } from './shared/browser-runtime-entry.js'
import { SceneOverlayHost } from './shared/scene-overlay-host.js'
import { ProductToolbar } from './shared/product-toolbar.js'

export async function bootstrapCatalogProduct(app: HTMLElement, manifestUrl: string): Promise<void> {
  const manifest = await loadManifest<CatalogManifest>(manifestUrl)
  const { shell, runtimeMount } = createShellFrame(app, manifest.config.viewport)
  const assetLoader = new AssetLoader()
  let runtime: CatalogRuntime | null = null

  if (manifest.config.chrome.showToolbar !== false) {
    const toolbar = new ProductToolbar({
      root: shell,
      projectTitle: manifest.projectTitle,
      textColor: manifest.config.theme.textColor ?? '#FFFFFF',
    })
    toolbar.mount()
  }

  const sceneHost = new SceneOverlayHost({
    root: shell,
    product: 'catalog',
    projectId: manifest.projectId,
    projectTitle: manifest.projectTitle,
    sessionId: createSessionId(manifest.projectId, manifest.product),
    onRouteRequest: (routeId) => runtime?.openRoute(routeId),
  })

  runtime = new CatalogRuntime({
    assets: {
      resolveUrl: (url) => assetLoader.resolveUrl(url),
      loadImage: (url) => assetLoader.loadImage(url),
      openScene: (scene, viewId) => sceneHost.openScene(scene, viewId),
    },
  })

  runtime.loadManifest(manifest)
  await runtime.mount(runtimeMount)
}

function createSessionId(projectId: string, product: string): string {
  return `${projectId}:${product}:${Date.now().toString(36)}`
}

