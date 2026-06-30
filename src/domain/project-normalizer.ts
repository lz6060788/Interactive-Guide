/**
 * Project normalizer — applies PROJECT_DEFAULTS to a shape-valid
 * GuideProject and yields a NormalizedProject that the compilers and
 * runtimes can rely on.
 *
 * Normalization steps (only when a field is missing):
 *   1. Fill panorama.cameraBounds and initialViewport from defaults.
 *   2. Fill per-category focusRect (size, radius, maskOpacity) from defaults.
 *   3. Fill per-item focusRect from defaults.
 *   4. Fill products.atlas.hintText and products.catalog.hintText from defaults.
 *   5. Fill products.catalog.interaction.viewportAnimationMs from defaults.
 *   6. Fill products.{atlas,catalog}.viewport from defaults.
 *   7. Set metadata.schemaVersion = '2.0.0' if missing.
 *
 * Normalization never overwrites explicitly provided values. If a required
 * field is missing (e.g. panorama.assetId) the call throws.
 */
import { PROJECT_DEFAULTS } from '../config/project-defaults.js'
import type {
  AtlasProductConfig,
  CatalogProductConfig,
  GuideProject,
  IndustryCategory,
  IndustryItem,
  ItemSpatialLayout,
  CategorySpatialLayout,
  ProductViewportConfig,
} from './project-types.js'

export type NormalizedProject = GuideProject

export interface NormalizeOptions {
  /** When true, auto-generate a panorama.assetId from the first image asset. */
  autoPickPanoramaAsset?: boolean
  now?: () => string
}

export function normalizeProject(
  project: GuideProject,
  options: NormalizeOptions = {},
): NormalizedProject {
  const now = (options.now ?? (() => new Date().toISOString()))()
  const next: GuideProject = JSON.parse(JSON.stringify(project))

  // metadata defaults
  next.metadata = {
    ...next.metadata,
    schemaVersion: '2.0.0',
    updatedAt: now,
  }
  if (!next.metadata.createdAt) {
    next.metadata.createdAt = now
  }

  // panorama defaults
  if (options.autoPickPanoramaAsset && !next.panorama.assetId) {
    const firstImage = Object.values(next.assets.byId).find((a) => a.kind === 'image')
    if (firstImage) next.panorama.assetId = firstImage.id
  }
  if (!next.panorama.assetId) {
    throw new Error('normalizeProject: panorama.assetId is required')
  }
  next.panorama.coordinateSpace = 'normalized'
  next.panorama.cameraBounds = {
    minZoom: next.panorama.cameraBounds?.minZoom ?? PROJECT_DEFAULTS.panorama.minZoom,
    maxZoom: next.panorama.cameraBounds?.maxZoom ?? PROJECT_DEFAULTS.panorama.maxZoom,
  }
  if (!next.panorama.initialViewport) {
    next.panorama.initialViewport = {
      centerX: 0.5,
      centerY: 0.5,
      zoom: PROJECT_DEFAULTS.panorama.minZoom,
    }
  }

  // category focus defaults
  for (const stage of next.knowledge.stages) {
    for (const category of stage.categories) {
      const existing: CategorySpatialLayout | undefined = next.panorama.categories[category.id]
      const layout: CategorySpatialLayout = existing ?? {
        viewport: {
          centerX: 0.5,
          centerY: 0.5,
          zoom: PROJECT_DEFAULTS.panorama.categoryZoom,
        },
      }
      if (!layout.activationZoom) {
        layout.activationZoom = PROJECT_DEFAULTS.panorama.categoryZoom
      }
      next.panorama.categories[category.id] = layout
    }
  }

  // item focus defaults
  for (const stage of next.knowledge.stages) {
    for (const category of stage.categories) {
      for (const itemId of category.itemIds) {
        const item: IndustryItem | undefined = next.knowledge.items[itemId]
        if (!item) continue
        const existing: ItemSpatialLayout | undefined = next.panorama.items[itemId]
        const layout: ItemSpatialLayout = existing ?? {
          marker: layoutCentroid(next.panorama.categories[category.id]),
          focusRect: {
            x: 0.5 - PROJECT_DEFAULTS.panorama.focusRect.width / 2,
            y: 0.5 - PROJECT_DEFAULTS.panorama.focusRect.height / 2,
            width: PROJECT_DEFAULTS.panorama.focusRect.width,
            height: PROJECT_DEFAULTS.panorama.focusRect.height,
            radius: PROJECT_DEFAULTS.panorama.focusRect.radius,
            maskOpacity: PROJECT_DEFAULTS.panorama.focusRect.maskOpacity,
          },
        }
        if (layout.focusRect.radius === undefined) {
          ;(layout.focusRect as { radius?: number }).radius = PROJECT_DEFAULTS.panorama.focusRect.radius
        }
        if (layout.focusRect.maskOpacity === undefined) {
          ;(layout.focusRect as { maskOpacity?: number }).maskOpacity = PROJECT_DEFAULTS.panorama.focusRect.maskOpacity
        }
        next.panorama.items[itemId] = layout
        item.categoryId = category.id
      }
    }
  }

  // product defaults
  next.products.atlas = normalizeAtlas(next.products.atlas)
  next.products.catalog = normalizeCatalog(next.products.catalog)

  return next
}

function normalizeAtlas(config: AtlasProductConfig): AtlasProductConfig {
  return {
    ...config,
    viewport: withViewportDefaults(config.viewport),
    hintText: config.hintText ?? PROJECT_DEFAULTS.products.atlas.hintText,
  }
}

function normalizeCatalog(config: CatalogProductConfig): CatalogProductConfig {
  return {
    ...config,
    viewport: withViewportDefaults(config.viewport),
    interaction: {
      ...config.interaction,
      viewportAnimationMs:
        config.interaction.viewportAnimationMs ?? PROJECT_DEFAULTS.products.catalog.viewportAnimationMs,
    },
    hintText: config.hintText ?? PROJECT_DEFAULTS.products.catalog.hintText,
  }
}

function withViewportDefaults(config: ProductViewportConfig): ProductViewportConfig {
  return {
    width: config.width ?? PROJECT_DEFAULTS.viewport.width,
    height: config.height ?? PROJECT_DEFAULTS.viewport.height,
    backgroundColor: config.backgroundColor,
  }
}

function layoutCentroid(layout: CategorySpatialLayout | undefined) {
  if (!layout?.hotspot) {
    return { x: layout?.viewport.centerX ?? 0.5, y: layout?.viewport.centerY ?? 0.5 }
  }
  return layout.hotspot
}

/**
 * Build a minimal-but-shape-valid DraftProject from a title. Used by
 * `createProject()` and the bootstrap Skill to produce a starting draft.
 */
export function createDraftProject(input: { id: string; title: string; locale?: string }): GuideProject {
  const now = new Date().toISOString()
  return {
    schemaVersion: '2.0.0',
    id: input.id,
    title: input.title,
    version: '0.1.0',
    locale: input.locale ?? 'zh-CN',
    knowledge: {
      stages: [
        { key: 'upstream', label: '上游', order: 1, categories: [] },
        { key: 'midstream', label: '中游', order: 2, categories: [] },
        { key: 'downstream', label: '下游', order: 3, categories: [] },
      ],
      items: {},
    },
    assets: { byId: {} },
    panorama: {
      assetId: '',
      coordinateSpace: 'normalized',
      cameraBounds: { minZoom: 1, maxZoom: 4 },
      initialViewport: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      categories: {},
      items: {},
    },
    scenes: [],
    navigation: { routes: [] },
    products: {
      atlas: {
        enabled: true,
        viewport: { width: 375, height: 808 },
        theme: { hotspotVariant: 'default', calloutVariant: 'line' },
        chrome: {},
        interaction: { wheelZoom: true, dragPan: true, pinchZoom: true, resetCameraEnabled: true },
        categoryIds: [],
        hintText: PROJECT_DEFAULTS.products.atlas.hintText,
      },
      catalog: {
        enabled: true,
        viewport: { width: 375, height: 808 },
        theme: { listDensity: 'comfortable', focusVariant: 'rect' },
        chrome: {},
        interaction: { listActivation: 'center-nearest', markerActivation: true, viewportAnimationMs: 360 },
        stageOrder: ['upstream', 'midstream', 'downstream'],
        hintText: PROJECT_DEFAULTS.products.catalog.hintText,
      },
    },
    integrations: {},
    metadata: {
      createdAt: now,
      updatedAt: now,
      revision: 1,
      schemaVersion: '2.0.0',
    },
  }
}

export function ensureCategoryBindingFor(
  project: GuideProject,
  category: IndustryCategory,
  binding: IndustryCategory['experience'],
): void {
  category.experience = binding
}
