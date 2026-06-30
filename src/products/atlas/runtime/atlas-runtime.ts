/**
 * AtlasRuntime — browser-side runtime that consumes an AtlasManifest.
 *
 * The runtime has zero knowledge of GuideProject / PublishManifest. It
 * is mounted into a DOM container, given an asset loader, and emits
 * analytics-friendly events.
 *
 * Public API:
 *   - `mount(container)`: render the manifest into the container
 *   - `destroy()`: tear down listeners and child nodes
 *   - events: viewportchange, hotspotclick, sceneenter, routechange,
 *     analytics:expose, analytics:click, analytics:stay, analytics:share
 */
import type {
  AtlasCategoryEntry,
  AtlasHtmlSceneManifest,
  AtlasItemEntry,
  AtlasManifest,
} from '../contract/atlas-manifest.js'
import type { Viewport } from '../../../domain/project-types.js'
import { Camera } from './camera.js'
import { MarkerRenderer } from './marker-renderer.js'
import { CalloutRenderer } from './callout-renderer.js'
import { SceneLauncher } from './scene-launcher.js'

export interface AtlasRuntimeAssetLoader {
  resolveUrl(url: string): string
  loadImage(url: string): Promise<HTMLImageElement>
  openScene(scene: AtlasHtmlSceneManifest, viewId?: string): void
}

export type { AtlasHtmlSceneManifest, AtlasCategoryEntry, AtlasItemEntry }

export type AtlasEvent =
  | { type: 'viewportchange'; viewport: Viewport }
  | { type: 'hotspotclick'; categoryId: string }
  | { type: 'itemclick'; itemId: string }
  | { type: 'sceneenter'; sceneId: string; viewId: string }
  | { type: 'routechange'; routeId: string }
  | { type: 'analytics:expose'; target: { kind: 'category' | 'item'; id: string } }
  | { type: 'analytics:click'; target: { kind: 'category' | 'item'; id: string } }
  | { type: 'analytics:stay'; durationMs: number }
  | { type: 'analytics:share'; channel: string }

export type AtlasListener = (event: AtlasEvent) => void

export interface AtlasRuntimeOptions {
  assets: AtlasRuntimeAssetLoader
  listeners?: AtlasListener[]
  /** Test seam: when provided, Date.now() is replaced with this function. */
  now?: () => number
}

export class AtlasRuntime {
  private manifest: AtlasManifest | null = null
  private mountedEl: HTMLElement | null = null
  private camera: Camera | null = null
  private markers: MarkerRenderer | null = null
  private callouts: CalloutRenderer | null = null
  private sceneLauncher: SceneLauncher | null = null
  private readonly listeners: AtlasListener[]
  private readonly now: () => number
  private mountedAt: number = 0
  private readonly opts: AtlasRuntimeOptions

  constructor(opts: AtlasRuntimeOptions) {
    this.listeners = opts.listeners ?? []
    this.now = opts.now ?? (() => Date.now())
    this.opts = opts
  }

  loadManifest(manifest: AtlasManifest): void {
    this.manifest = manifest
  }

  on(listener: AtlasListener): void {
    this.listeners.push(listener)
  }

  off(listener: AtlasListener): void {
    const i = this.listeners.indexOf(listener)
    if (i >= 0) this.listeners.splice(i, 1)
  }

  async mount(container: HTMLElement): Promise<void> {
    if (!this.manifest) {
      throw new Error('AtlasRuntime: loadManifest must be called before mount()')
    }
    this.mountedEl = container
    this.mountedEl.innerHTML = ''
    this.mountedEl.style.position = 'relative'
    this.mountedEl.style.width = `${this.manifest.config.viewport.width}px`
    this.mountedEl.style.height = `${this.manifest.config.viewport.height}px`
    this.mountedEl.style.overflow = 'hidden'

    // Panorama image
    const imgUrl = this.opts.assets.resolveUrl(this.manifest.panorama.url)
    const img = await this.opts.assets.loadImage(imgUrl)
    img.style.position = 'absolute'
    img.style.inset = '0'
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'cover'
    img.dataset.testid = 'atlas-panorama'
    this.mountedEl.appendChild(img)

    // Camera
    this.camera = new Camera(this.mountedEl, this.manifest.panorama.initialViewport, this.manifest.panorama.cameraBounds, this.manifest.config.interaction)
    this.camera.onChange((viewport) => this.emit({ type: 'viewportchange', viewport }))
    img.addEventListener('click', (ev) => this.handleImageClick(ev))

    // Markers
    this.markers = new MarkerRenderer(this.mountedEl, this.manifest.panorama.cameraBounds, this.manifest.config.theme.hotspotVariant)
    for (const cat of this.manifest.categories) this.markers.addCategory(cat)
    for (const item of this.manifest.items) this.markers.addItem(item)

    // Callouts
    this.callouts = new CalloutRenderer(this.mountedEl, this.manifest.config.theme.calloutVariant)
    for (const item of this.manifest.items) this.callouts.addItem(item)

    // Scene launcher
    this.sceneLauncher = new SceneLauncher(this.opts.assets.openScene, this.listeners)

    this.mountedAt = this.now()
  }

  destroy(): void {
    if (this.mountedEl) {
      const stayDuration = this.now() - this.mountedAt
      this.emit({ type: 'analytics:stay', durationMs: stayDuration })
      this.mountedEl.innerHTML = ''
      this.mountedEl = null
    }
    this.camera = null
    this.markers = null
    this.callouts = null
    this.sceneLauncher = null
    this.manifest = null
  }

  /**
   * Programmatic API: navigate to a category viewport (called by editor
   * preview, deep-link routes, or programmatic user gestures).
   */
  focusCategory(categoryId: string): void {
    if (!this.manifest || !this.camera || !this.markers) return
    const cat = this.manifest.categories.find((c) => c.id === categoryId)
    if (!cat) return
    this.camera.animateTo(cat.viewport)
    this.markers.activate(categoryId)
    this.emit({ type: 'analytics:expose', target: { kind: 'category', id: categoryId } })
  }

  /**
   * Open an experience route by id (used by editor preview "preview this
   * transition" buttons).
   */
  openRoute(routeId: string): void {
    if (!this.manifest || !this.sceneLauncher) return
    const route = this.manifest.routes.find((r) => r.id === routeId)
    if (!route) return
    this.emit({ type: 'routechange', routeId })
    const to = route.to
    if (to.kind === 'scene') {
      const scene = this.manifest.scenes.find((s) => s.sceneId === to.sceneId)
      if (scene) {
        this.sceneLauncher.launch(scene)
      }
    }
  }

  private handleImageClick(ev: MouseEvent): void {
    if (!this.manifest || !this.markers) return
    const rect = this.mountedEl!.getBoundingClientRect()
    const nx = (ev.clientX - rect.left) / rect.width
    const ny = (ev.clientY - rect.top) / rect.height
    // Find the closest category hotspot within a small threshold
    const tolerance = 0.05
    let nearest: AtlasCategoryEntry | null = null
    let nearestDist = Infinity
    for (const cat of this.manifest.categories) {
      if (!cat.hotspot) continue
      const d = Math.hypot(cat.hotspot.x - nx, cat.hotspot.y - ny)
      if (d < tolerance && d < nearestDist) {
        nearestDist = d
        nearest = cat
      }
    }
    if (nearest) {
      this.emit({ type: 'hotspotclick', categoryId: nearest.id })
      this.emit({ type: 'analytics:click', target: { kind: 'category', id: nearest.id } })
      this.focusCategory(nearest.id)
    }
  }

  private emit(event: AtlasEvent): void {
    for (const l of this.listeners) l(event)
  }
}