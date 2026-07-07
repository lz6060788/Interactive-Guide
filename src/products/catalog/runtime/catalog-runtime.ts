/**
 * CatalogRuntime — browser-side runtime for the structured-knowledge
 * product. Shows a three-stage vertical list (upstream / midstream /
 * downstream) with categories and items. When an item is selected, the
 * focus overlay animates to its category viewport and shows the
 * focusRect on top of the panorama image.
 *
 * Like AtlasRuntime, this has zero dependency on legacy concepts.
 */
import type { Viewport } from '../../../domain/project-types.js'
import type {
  CatalogCategoryEntry,
  CatalogHtmlSceneManifest,
  CatalogItemEntry,
  CatalogManifest,
} from '../contract/catalog-manifest.js'
import { List } from './list.js'
import { FocusOverlay } from './focus-overlay.js'
import { SceneLauncher } from './scene-launcher.js'

export interface CatalogRuntimeAssetLoader {
  resolveUrl(url: string): string
  loadImage(url: string): Promise<HTMLImageElement>
  openScene(scene: CatalogHtmlSceneManifest, viewId?: string): void
}

export type CatalogEvent =
  | { type: 'itemselect'; itemId: string }
  | { type: 'categoryfocus'; categoryId: string; viewport: Viewport }
  | { type: 'sceneenter'; sceneId: string; viewId: string }
  | { type: 'routechange'; routeId: string }
  | { type: 'analytics:expose'; target: { kind: 'category' | 'item'; id: string } }
  | { type: 'analytics:click'; target: { kind: 'category' | 'item'; id: string } }
  | { type: 'analytics:stay'; durationMs: number }
  | { type: 'analytics:share'; channel: string }
  | { type: 'viewportanimationstart' }
  | { type: 'viewportanimationend' }

export type CatalogListener = (event: CatalogEvent) => void

export interface CatalogRuntimeOptions {
  assets: CatalogRuntimeAssetLoader
  listeners?: CatalogListener[]
  now?: () => number
}

export class CatalogRuntime {
  private manifest: CatalogManifest | null = null
  private mountedEl: HTMLElement | null = null
  private list: List | null = null
  private focus: FocusOverlay | null = null
  private sceneLauncher: SceneLauncher | null = null
  private readonly listeners: CatalogListener[]
  private readonly now: () => number
  private readonly opts: CatalogRuntimeOptions
  private mountedAt: number = 0

  constructor(opts: CatalogRuntimeOptions) {
    this.listeners = opts.listeners ?? []
    this.now = opts.now ?? (() => Date.now())
    this.opts = opts
  }

  loadManifest(manifest: CatalogManifest): void {
    this.manifest = manifest
  }

  on(listener: CatalogListener): void {
    this.listeners.push(listener)
  }

  off(listener: CatalogListener): void {
    const i = this.listeners.indexOf(listener)
    if (i >= 0) this.listeners.splice(i, 1)
  }

  async mount(container: HTMLElement): Promise<void> {
    if (!this.manifest) {
      throw new Error('CatalogRuntime: loadManifest must be called before mount()')
    }
    this.mountedEl = container
    this.mountedEl.innerHTML = ''
    this.mountedEl.style.display = 'grid'
    this.mountedEl.style.gridTemplateColumns = '1fr 1fr'
    this.mountedEl.style.width = `${this.manifest.config.viewport.width}px`
    this.mountedEl.style.height = `${this.manifest.config.viewport.height}px`

    // Left: panorama + focus overlay
    const left = document.createElement('div')
    left.className = 'catalog-panorama'
    left.dataset.testid = 'catalog-panorama'
    left.style.position = 'relative'
    left.style.overflow = 'hidden'
    const imgUrl = this.opts.assets.resolveUrl(this.manifest.panorama.url)
    const img = await this.opts.assets.loadImage(imgUrl)
    img.style.position = 'absolute'
    img.style.inset = '0'
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.objectFit = 'cover'
    left.appendChild(img)

    this.focus = new FocusOverlay(left, this.manifest.config.theme.focusVariant)
    for (const item of this.manifest.items) this.focus.addItem(item)

    // Right: vertical list of stages / categories / items
    const right = document.createElement('div')
    right.className = 'catalog-list'
    right.dataset.testid = 'catalog-list'
    right.style.overflow = 'auto'
    right.style.background = '#fff'

    this.list = new List(right, this.manifest.config.theme.listDensity)
    for (const item of this.manifest.items) this.list.registerItem(item)
    for (const stage of this.manifest.stages) {
      this.list.addStage(stage)
    }
    this.list.onItemClick((itemId) => this.selectItem(itemId))

    this.mountedEl.appendChild(left)
    this.mountedEl.appendChild(right)

    this.sceneLauncher = new SceneLauncher(this.opts.assets.openScene, this.listeners)

    this.mountedAt = this.now()
  }

  destroy(): void {
    if (this.mountedEl) {
      const dur = this.now() - this.mountedAt
      this.emit({ type: 'analytics:stay', durationMs: dur })
      this.mountedEl.innerHTML = ''
      this.mountedEl = null
    }
    this.list = null
    this.focus = null
    this.sceneLauncher = null
    this.manifest = null
  }

  /** Programmatic API: select an item by id. */
  selectItem(itemId: string): void {
    if (!this.manifest || !this.list || !this.focus) return
    const item = this.manifest.items.find((i) => i.id === itemId)
    if (!item) return
    const cat = this.findCategoryByItemId(itemId)
    if (!cat) return
    this.list.activate(itemId)
    this.focus.flash(itemId)
    this.emit({ type: 'itemselect', itemId })
    this.emit({ type: 'analytics:click', target: { kind: 'item', id: itemId } })
    this.animateViewport(cat.viewport)
  }

  /** Programmatic API: open a route by id. */
  openRoute(routeId: string): void {
    if (!this.manifest || !this.sceneLauncher) return
    const route = this.manifest.routes.find((r) => r.id === routeId)
    if (!route) return
    this.emit({ type: 'routechange', routeId })
    const to = route.to
    if (to.kind === 'scene') {
      const scene = this.manifest.scenes.find((s) => s.sceneId === to.sceneId)
      if (scene) this.sceneLauncher.launch(scene, to.viewId)
      return
    }
    if (to.kind === 'panorama') {
      if (to.itemId) {
        this.selectItem(to.itemId)
        return
      }
      if (to.categoryId) {
        const category = this.findCategoryById(to.categoryId)
        if (!category) return
        this.emit({ type: 'categoryfocus', categoryId: category.id, viewport: category.viewport })
        this.emit({ type: 'analytics:expose', target: { kind: 'category', id: category.id } })
        this.animateViewport(category.viewport)
      }
    }
  }

  /** Test escape hatch: emit a custom event without taking a runtime action. */
  emitEvent(event: CatalogEvent): void {
    this.emit(event)
  }

  private animateViewport(target: Viewport): void {
    const ms = this.manifest?.config.interaction.viewportAnimationMs ?? 350
    this.emit({ type: 'viewportanimationstart' })
    setTimeout(() => this.emit({ type: 'viewportanimationend' }), ms)
    // The actual image translation is handled by the focus overlay; we
    // emit the analytics events here so listeners can react.
    void target
  }

  private findCategoryByItemId(itemId: string): CatalogCategoryEntry | null {
    if (!this.manifest) return null
    for (const stage of this.manifest.stages) {
      for (const cat of stage.categories) {
        if (cat.itemIds.includes(itemId)) return cat
      }
    }
    return null
  }

  private findCategoryById(categoryId: string): CatalogCategoryEntry | null {
    if (!this.manifest) return null
    for (const stage of this.manifest.stages) {
      for (const cat of stage.categories) {
        if (cat.id === categoryId) return cat
      }
    }
    return null
  }

  private emit(event: CatalogEvent): void {
    for (const l of this.listeners) l(event)
  }
}

export { CatalogItemEntry, CatalogCategoryEntry }
