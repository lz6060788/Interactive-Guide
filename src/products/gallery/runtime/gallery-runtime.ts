import type {
  ResolvedGalleryManifest,
  ResolvedGalleryItemEntry,
} from '../contract/gallery-manifest.js'
import { GalleryScene, type GallerySelection } from './gallery-scene.js'

export type GalleryEvent =
  | { type: 'itemselect'; itemId: string }
  | { type: 'atlaslaunch'; url: string }

export interface GalleryRuntimeOptions {
  resolveAssetUrl: (url: string) => string
  initialFocus?: string
  listeners?: Array<(event: GalleryEvent) => void>
}

export class GalleryRuntime {
  private manifest: ResolvedGalleryManifest | null = null
  private scene: GalleryScene | null = null
  private readonly options: GalleryRuntimeOptions

  constructor(options: GalleryRuntimeOptions) {
    this.options = options
  }

  loadManifest(manifest: ResolvedGalleryManifest): void {
    this.manifest = manifest
  }

  mount(container: HTMLElement): void {
    if (!this.manifest)
      throw new Error('GalleryRuntime: loadManifest must be called before mount()')
    const initialItem = resolveGalleryInitialItem(this.manifest, this.options.initialFocus)
    this.scene = new GalleryScene({
      root: container,
      manifest: this.manifest,
      resolveAssetUrl: this.options.resolveAssetUrl,
      ...(initialItem ? { initialSelection: { itemId: initialItem.id } } : {}),
      onSelectionChange: selection => this.emit({ type: 'itemselect', itemId: selection.itemId }),
      onAtlasLaunch: url => this.emit({ type: 'atlaslaunch', url }),
    })
    this.scene.mount()
  }

  destroy(): void {
    this.scene?.destroy()
    this.scene = null
    this.manifest = null
  }

  selectItem(itemId: string): void {
    this.scene?.selectItem(itemId)
  }

  selectStage(stageKey: GallerySelection['stageKey']): void {
    this.scene?.selectStage(stageKey)
  }

  selectCategory(categoryId: string): void {
    this.scene?.selectCategory(categoryId)
  }

  getSelection(): GallerySelection | null {
    return this.scene?.getSelection() ?? null
  }

  private emit(event: GalleryEvent): void {
    for (const listener of this.options.listeners ?? []) listener(event)
  }
}

export function resolveGalleryInitialItem(
  manifest: ResolvedGalleryManifest,
  focus: string | undefined,
): ResolvedGalleryItemEntry | undefined {
  const normalized = focus?.trim().normalize('NFC')
  if (!normalized) return undefined
  return manifest.items.find(
    item => item.id === normalized || item.title.trim().normalize('NFC') === normalized,
  )
}
