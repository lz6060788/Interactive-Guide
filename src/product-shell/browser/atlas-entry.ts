import { AtlasRuntime } from '../../products/atlas/runtime/atlas-runtime.js'
import type { AtlasManifest } from '../../products/atlas/contract/atlas-manifest.js'
import { AssetLoader } from '../../platform/asset-loader/asset-loader.js'
import { createShellFrame } from './shared/shell-frame.js'
import { loadManifest } from './shared/browser-runtime-entry.js'
import { SceneOverlayHost } from './shared/scene-overlay-host.js'
import { AtlasPageTracker } from '../../platform/analytics/atlas-page-tracker.js'
import { F10HostAdapter } from '../../platform/f10/f10-host-adapter.js'
import { ProductShareController } from './shared/product-sharing.js'
import { resolveRuntimeLocale } from '../../domain/localization.js'
import { resolveAtlasManifest } from '../../products/contracts/manifest-localization.js'

export async function bootstrapAtlasProduct(app: HTMLElement, manifestUrl: string): Promise<void> {
  const sourceManifest = await loadManifest<AtlasManifest>(manifestUrl)
  const locale = resolveRuntimeLocale(sourceManifest.localization, {
    search: window.location.search,
    navigatorLanguages: navigator.languages,
  })
  const manifest = resolveAtlasManifest(sourceManifest, locale)
  document.documentElement.lang = locale
  document.title = manifest.projectTitle
  const { shell, runtimeMount } = createShellFrame(app)
  const assetLoader = new AssetLoader()
  const tracker = manifest.integrations.analytics?.enabled
    ? new AtlasPageTracker({ config: manifest.integrations.analytics })
    : undefined
  const f10 = new F10HostAdapter()
  const sharing = new ProductShareController({
    projectTitle: manifest.projectTitle,
    config: manifest.integrations.share,
    tracker,
    resolveAssetUrl: url => assetLoader.resolveUrl(url),
    f10,
  })
  let runtime: AtlasRuntime | null = null

  const sceneHost = new SceneOverlayHost({
    root: shell,
    product: 'atlas',
    projectId: manifest.projectId,
    projectTitle: manifest.projectTitle,
    sessionId: createSessionId(manifest.projectId, manifest.product),
    locale,
    supportedLocales: manifest.localization.supportedLocales,
    onRouteRequest: routeId => runtime?.openRoute(routeId),
    onShare: () => sharing.share(),
    shareEnabled: sharing.enabled,
  })

  runtime = new AtlasRuntime({
    assets: {
      resolveUrl: url => assetLoader.resolveUrl(url),
      loadImage: url => assetLoader.loadImage(url),
      openScene: (scene, viewId) => sceneHost.openScene(scene, viewId),
    },
    onShare: () => sharing.share(),
    shareEnabled: sharing.enabled,
  })

  runtime.loadManifest(manifest)
  await runtime.mount(runtimeMount)
  tracker?.start()
  window.addEventListener('pagehide', () => tracker?.destroy(), { once: true })
}

function createSessionId(projectId: string, product: string): string {
  return `${projectId}:${product}:${Date.now().toString(36)}`
}
