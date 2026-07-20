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
  ResolvedCatalogCategoryEntry as CatalogCategoryEntry,
  ResolvedCatalogHtmlSceneManifest as CatalogHtmlSceneManifest,
  ResolvedCatalogItemEntry as CatalogItemEntry,
  ResolvedCatalogManifest as CatalogManifest,
} from '../contract/catalog-manifest.js'
import { SceneLauncher } from './scene-launcher.js'
import { CatalogScene, type CatalogSceneSelection } from './catalog-scene.js'

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
  | { type: 'atlaslaunch'; url: string }
  | { type: 'viewportanimationstart' }
  | { type: 'viewportanimationend' }

export type CatalogListener = (event: CatalogEvent) => void

export interface CatalogRuntimeOptions {
  assets: CatalogRuntimeAssetLoader
  listeners?: CatalogListener[]
}

export class CatalogRuntime {
  private manifest: CatalogManifest | null = null
  private mountedEl: HTMLElement | null = null
  private scene: CatalogScene | null = null
  private sceneLauncher: SceneLauncher | null = null
  private readonly listeners: CatalogListener[]
  private readonly opts: CatalogRuntimeOptions

  constructor(opts: CatalogRuntimeOptions) {
    this.listeners = opts.listeners ?? []
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
    this.mountedEl.style.width = '100%'
    this.mountedEl.style.height = '100%'
    this.mountedEl.style.position = 'relative'
    this.mountedEl.style.overflow = 'hidden'

    const imgUrl = this.opts.assets.resolveUrl(this.manifest.panorama.url)
    const image = await this.opts.assets.loadImage(imgUrl)
    this.scene = new CatalogScene({
      root: this.mountedEl,
      manifest: this.manifest,
      panoramaUrl: imgUrl,
      imageSize: {
        width: image.naturalWidth || this.manifest.config.viewport.width,
        height: image.naturalHeight || this.manifest.config.viewport.height,
      },
      onSelectionChange: selection => this.handleSceneSelection(selection),
      onAtlasLaunch: url => this.emit({ type: 'atlaslaunch', url }),
    })
    this.scene.mount()

    this.sceneLauncher = new SceneLauncher(this.opts.assets.openScene, this.listeners)
  }

  destroy(): void {
    if (this.mountedEl) {
      this.mountedEl.innerHTML = ''
      this.mountedEl = null
    }
    this.scene?.destroy()
    this.scene = null
    this.sceneLauncher = null
    this.manifest = null
  }

  /** Programmatic API: select an item by id. */
  selectItem(itemId: string): void {
    if (!this.manifest || !this.scene) return
    const item = this.manifest.items.find(i => i.id === itemId)
    if (!item) return
    this.scene.selectItem(itemId)
  }

  selectCategory(categoryId: string): void {
    if (!this.manifest || !this.scene) return
    const category = this.findCategoryById(categoryId)
    if (!category) return
    this.scene.selectCategory(categoryId)
  }

  selectStage(stageKey: 'upstream' | 'midstream' | 'downstream'): void {
    this.scene?.selectStage(stageKey)
  }

  private handleSceneSelection(selection: CatalogSceneSelection): void {
    if (!this.manifest) return
    const category = selection.categoryId ? this.findCategoryById(selection.categoryId) : null
    if (category) {
      this.emit({ type: 'categoryfocus', categoryId: category.id, viewport: category.viewport })
    }
    if (!selection.itemId) return
    const item = this.manifest.items.find(entry => entry.id === selection.itemId)
    if (!item) return
    this.emit({ type: 'itemselect', itemId: item.id })
    if (category) this.animateViewport(category.viewport)
  }

  /** Programmatic API: open a route by id. */
  openRoute(routeId: string): void {
    if (!this.manifest || !this.sceneLauncher) return
    const route = this.manifest.routes.find(r => r.id === routeId)
    if (!route) return
    this.emit({ type: 'routechange', routeId })
    const to = route.to
    if (to.kind === 'scene') {
      const scene = this.manifest.scenes.find(s => s.sceneId === to.sceneId)
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
        this.selectCategory(category.id)
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
