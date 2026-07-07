import type { AtlasHtmlSceneManifest } from '../../../products/atlas/contract/atlas-manifest.js'
import type { CatalogHtmlSceneManifest } from '../../../products/catalog/contract/catalog-manifest.js'
import { SceneHostController } from '../../../platform/scene-host/scene-host-controller.js'
import { ProductToolbar, shareCurrentPage } from './product-toolbar.js'

type SceneManifest = AtlasHtmlSceneManifest | CatalogHtmlSceneManifest

export interface SceneOverlayHostOptions {
  root: HTMLElement
  product: 'atlas' | 'catalog'
  projectId: string
  projectTitle: string
  sessionId: string
  onRouteRequest: (routeId: string) => void
}

export class SceneOverlayHost {
  private readonly options: SceneOverlayHostOptions
  private readonly overlayEl: HTMLElement
  private readonly iframeEl: HTMLIFrameElement
  private readonly controller: SceneHostController
  private readonly unbindMessages: () => void
  private toolbar: ProductToolbar | null = null

  constructor(options: SceneOverlayHostOptions) {
    this.options = options
    this.overlayEl = document.createElement('div')
    this.overlayEl.dataset.testid = 'runtime-scene-overlay'
    this.overlayEl.style.position = 'absolute'
    this.overlayEl.style.inset = '0'
    this.overlayEl.style.display = 'none'
    this.overlayEl.style.background = '#020617'
    this.overlayEl.style.overflow = 'hidden'
    this.overlayEl.style.zIndex = '60'

    this.iframeEl = document.createElement('iframe')
    this.iframeEl.setAttribute('allow', 'fullscreen')
    this.iframeEl.style.position = 'absolute'
    this.iframeEl.style.inset = '0'
    this.iframeEl.style.width = '100%'
    this.iframeEl.style.height = '100%'
    this.iframeEl.style.border = 'none'
    this.iframeEl.style.background = '#020617'
    this.iframeEl.addEventListener('load', () => this.controller.handleSceneLoad())

    this.overlayEl.appendChild(this.iframeEl)
    this.options.root.appendChild(this.overlayEl)

    this.controller = new SceneHostController({
      product: options.product,
      projectId: options.projectId,
      sessionId: options.sessionId,
      baseHref: window.location.href,
      getIframeWindow: () => this.iframeEl.contentWindow,
      onRequestBack: () => this.closeScene(),
      onRequestRoute: (routeId) => {
        this.closeScene({ preserveSrc: true })
        this.options.onRouteRequest(routeId)
      },
    })
    this.unbindMessages = this.controller.bindMessages(window)
  }

  openScene(scene: SceneManifest, viewId?: string): void {
    const active = this.controller.openScene(scene, viewId)
    this.overlayEl.style.display = 'block'
    this.overlayEl.style.pointerEvents = 'auto'
    this.overlayEl.innerHTML = ''
    this.iframeEl.src = active.src
    this.iframeEl.style.position = 'absolute'
    this.iframeEl.style.inset = '0'
    this.iframeEl.style.width = '100%'
    this.iframeEl.style.height = '100%'
    this.iframeEl.style.border = 'none'
    this.iframeEl.style.background = '#020617'
    this.overlayEl.appendChild(this.iframeEl)
    this.toolbar = new ProductToolbar({
      root: this.overlayEl,
      projectTitle: this.options.projectTitle,
      textColor: active.chromeTextColor,
      onBack: () => this.closeScene(),
      onShare: () => {
        void shareCurrentPage(this.options.projectTitle)
      },
    })
    this.toolbar.mount()
  }

  closeScene(options: { preserveSrc?: boolean } = {}): void {
    this.controller.closeScene()
    this.overlayEl.style.display = 'none'
    this.overlayEl.style.pointerEvents = 'none'
    if (!options.preserveSrc) {
      this.iframeEl.src = 'about:blank'
    }
  }

  destroy(): void {
    this.closeScene()
    this.unbindMessages()
    this.overlayEl.remove()
  }
}

