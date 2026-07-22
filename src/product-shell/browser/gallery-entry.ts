import { AssetLoader } from '../../platform/asset-loader/asset-loader.js'
import { F10HostAdapter } from '../../platform/f10/f10-host-adapter.js'
import type { GalleryManifest } from '../../products/gallery/contract/gallery-manifest.js'
import { GalleryRuntime } from '../../products/gallery/runtime/gallery-runtime.js'
import { resolveRuntimeLocale, withLocaleInUrl } from '../../domain/localization.js'
import { resolveGalleryManifest } from '../../products/contracts/manifest-localization.js'
import { createShellFrame } from './shared/shell-frame.js'
import { loadManifest } from './shared/browser-runtime-entry.js'
import { openAtlasWithF10 } from './shared/f10-atlas-launcher.js'
import { resolveGalleryFocusItemId } from '../../products/gallery/runtime/gallery-focus.js'
import { mountRuntimeLocaleSwitcher } from './shared/runtime-locale-switcher.js'

export async function bootstrapGalleryProduct(
  app: HTMLElement,
  manifestUrl: string,
): Promise<void> {
  const sourceManifest = await loadManifest<GalleryManifest>(manifestUrl)
  const locale = resolveRuntimeLocale(sourceManifest.localization, {
    search: window.location.search,
    navigatorLanguages: navigator.languages,
  })
  const focus = new URLSearchParams(window.location.search).get('focus') ?? undefined
  const focusItemId = resolveGalleryFocusItemId(sourceManifest.items, focus)
  const manifest = resolveGalleryManifest(sourceManifest, locale)
  document.documentElement.lang = locale
  document.title = manifest.projectTitle
  const { shell, runtimeMount } = createShellFrame(app)
  const assets = new AssetLoader()
  const f10 = new F10HostAdapter()
  const runtime = new GalleryRuntime({
    initialFocus: focusItemId,
    resolveAssetUrl: url => assets.resolveUrl(url),
    listeners: [
      event => {
        if (event.type === 'atlaslaunch') {
          void openAtlasWithF10(withLocaleInUrl(event.url, locale, window.location.href), f10)
        }
        if (event.type === 'itemselect') {
          const url = new URL(window.location.href)
          url.searchParams.set('focus', event.itemId)
          history.replaceState(null, '', url)
        }
      },
    ],
  })
  runtime.loadManifest(manifest)
  runtime.mount(runtimeMount)
  mountRuntimeLocaleSwitcher({
    root: shell,
    locale,
    supportedLocales: sourceManifest.localization.supportedLocales,
    onChange: nextLocale => {
      const url = new URL(window.location.href)
      url.searchParams.set('lang', nextLocale)
      window.location.assign(url.toString())
    },
  })
}
