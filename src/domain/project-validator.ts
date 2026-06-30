/**
 * Domain validators — business rules that go beyond Zod's shape checks.
 *
 * These functions operate on already-shape-valid GuideProject objects and
 * verify cross-cutting invariants (uniqueness, ordering, referential
 * integrity, calibrated-vs-required spatial data). The release-stage
 * variants are stricter than the draft-stage ones.
 */
import type {
  GuideProject,
  IndustryCategory,
  IndustryItem,
  IndustryStage,
  ExperienceLocation,
  ExperienceRoute,
} from './project-types.js'

export interface ValidationIssue {
  code: string
  path: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

const STAGE_ORDER: Array<'upstream' | 'midstream' | 'downstream'> = [
  'upstream',
  'midstream',
  'downstream',
]

const STAGE_LABEL_FIXED: Record<'upstream' | 'midstream' | 'downstream', string> = {
  upstream: '上游',
  midstream: '中游',
  downstream: '下游',
}

/** Run all draft-level checks. Allows draft-only state (e.g. missing spatial calibration). */
export function validateDraftProject(project: GuideProject): ValidationResult {
  const issues: ValidationIssue[] = []
  checkStages(project, issues, { allowCustomLabel: true })
  checkUniqueIds(project, issues)
  checkItemCategoryOwnership(project, issues)
  checkOrdering(project, issues)
  checkAssetReferences(project, issues)
  checkSceneReferences(project, issues)
  checkRouteReferences(project, issues)
  checkSpatialRanges(project, issues)
  return { ok: issues.length === 0, issues }
}

/** Run all release-level checks. Stricter: fixed stage labels, no missing coordinates. */
export function validateReleaseProject(project: GuideProject): ValidationResult {
  const issues: ValidationIssue[] = []
  checkStages(project, issues, { allowCustomLabel: false })
  checkUniqueIds(project, issues)
  checkItemCategoryOwnership(project, issues)
  checkOrdering(project, issues)
  checkAssetReferences(project, issues)
  checkSceneReferences(project, issues)
  checkRouteReferences(project, issues)
  checkSpatialRanges(project, issues)
  checkCalibrationCompleteness(project, issues)
  checkAtlasCategoryCoverage(project, issues)
  return { ok: issues.length === 0, issues }
}

function checkCalibrationCompleteness(project: GuideProject, issues: ValidationIssue[]): void {
  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) {
      if (!project.panorama.categories[category.id]) {
        issues.push({
          code: 'CALIBRATION_MISSING',
          path: `panorama.categories.${category.id}`,
          message: `release requires category "${category.id}" to have a spatial layout`,
        })
      }
      for (const itemId of category.itemIds) {
        if (!project.panorama.items[itemId]) {
          issues.push({
            code: 'CALIBRATION_MISSING',
            path: `panorama.items.${itemId}`,
            message: `release requires item "${itemId}" to have a spatial layout`,
          })
        }
      }
    }
  }
}

function checkStages(
  project: GuideProject,
  issues: ValidationIssue[],
  opts: { allowCustomLabel: boolean },
): void {
  project.knowledge.stages.forEach((stage, index) => {
    if (stage.key !== STAGE_ORDER[index]) {
      issues.push({
        code: 'STAGE_KEY_ORDER',
        path: `knowledge.stages[${index}].key`,
        message: `stage[${index}].key must be "${STAGE_ORDER[index]}" but was "${stage.key}"`,
      })
    }
    if (!opts.allowCustomLabel && stage.label !== STAGE_LABEL_FIXED[stage.key]) {
      issues.push({
        code: 'STAGE_LABEL_FIXED',
        path: `knowledge.stages[${index}].label`,
        message: `release stage[${index}].label must be "${STAGE_LABEL_FIXED[stage.key]}"`,
      })
    }
  })
}

function checkUniqueIds(project: GuideProject, issues: ValidationIssue[]): void {
  // Phase 1: collect declared item ids from category.itemIds so we don't
  // double-count them when iterating the items registry. An item id
  // appearing in BOTH a category's itemIds AND the items registry is the
  // expected, normal case.
  const declaredInCategory = new Set<string>()
  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) {
      for (const itemId of category.itemIds) {
        declaredInCategory.add(itemId)
      }
    }
  }

  // Detect duplicate ids WITHIN the same collection (e.g. a category that
  // declares the same itemId twice, or two items with the same id in
  // knowledge.items). We also need to detect ids that collide across
  // collections (e.g. a category id and a scene id).
  function duplicateWithin(path: string, ids: string[]): void {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) {
        issues.push({
          code: 'DUPLICATE_ID',
          path,
          message: `duplicate id "${id}" appears more than once in ${path}`,
        })
      }
      seen.add(id)
    }
  }

  const allCategoryIds: string[] = []
  const allItemIdsFromCategories: string[] = []
  project.knowledge.stages.forEach((stage: IndustryStage) => {
    stage.categories.forEach((category: IndustryCategory) => {
      allCategoryIds.push(category.id)
      allItemIdsFromCategories.push(...category.itemIds)
    })
  })
  duplicateWithin('category.id', allCategoryIds)
  duplicateWithin('category.itemIds', allItemIdsFromCategories)

  const itemsRegistryIds = Object.keys(project.knowledge.items)
  duplicateWithin('knowledge.items', itemsRegistryIds)

  // Cross-collection collision: a category id must not equal a scene id,
  // and a category id must not equal an item id, etc.
  const allIds = new Map<string, string>()
  function checkCrossCollection(id: string, path: string): void {
    if (allIds.has(id)) {
      issues.push({
        code: 'DUPLICATE_ID',
        path,
        message: `id "${id}" collides with ${allIds.get(id)}`,
      })
    } else {
      allIds.set(id, path)
    }
  }
  for (const id of allCategoryIds) checkCrossCollection(id, 'category.id')
  for (const id of itemsRegistryIds) {
    if (declaredInCategory.has(id)) continue // already counted via category.itemIds
    checkCrossCollection(id, 'knowledge.items')
  }
  for (const sceneId of project.scenes.map((s) => s.id)) {
    checkCrossCollection(sceneId, 'scenes')
  }
  for (const routeId of project.navigation.routes.map((r) => r.id)) {
    checkCrossCollection(routeId, 'navigation.routes')
  }
}

function checkItemCategoryOwnership(project: GuideProject, issues: ValidationIssue[]): void {
  const declared = new Set<string>()
  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) {
      for (const itemId of category.itemIds) {
        if (declared.has(itemId)) {
          issues.push({
            code: 'ITEM_IN_MULTIPLE_CATEGORIES',
            path: `category.${category.id}`,
            message: `item "${itemId}" is declared in multiple categories`,
          })
        }
        declared.add(itemId)
        const item = project.knowledge.items[itemId]
        if (!item) {
          issues.push({
            code: 'ITEM_NOT_IN_REGISTRY',
            path: `category.${category.id}.itemIds`,
            message: `category declares item "${itemId}" but it is not in knowledge.items`,
          })
          continue
        }
        if (item.categoryId !== category.id) {
          issues.push({
            code: 'ITEM_CATEGORY_MISMATCH',
            path: `items.${itemId}.categoryId`,
            message: `item "${itemId}" has categoryId="${item.categoryId}" but is declared in category "${category.id}"`,
          })
        }
      }
    }
  }
  for (const itemId of Object.keys(project.knowledge.items)) {
    if (!declared.has(itemId)) {
      issues.push({
        code: 'ITEM_ORPHANED',
        path: `items.${itemId}`,
        message: `item "${itemId}" exists in knowledge.items but no category references it`,
      })
    }
  }
}

function checkOrdering(project: GuideProject, issues: ValidationIssue[]): void {
  project.knowledge.stages.forEach((stage) => {
    stage.categories.forEach((category, index) => {
      if (category.order !== index) {
        issues.push({
          code: 'CATEGORY_ORDER',
          path: `stage.${stage.key}.categories.${category.id}.order`,
          message: `category order must be contiguous from 0, got ${category.order} at index ${index}`,
        })
      }
    })
  })
  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) {
      const items = category.itemIds
        .map((id) => project.knowledge.items[id])
        .filter((x): x is IndustryItem => Boolean(x))
      items.forEach((item, index) => {
        if (item.order !== index) {
          issues.push({
            code: 'ITEM_ORDER',
            path: `category.${category.id}.item.${item.id}.order`,
            message: `item order must be contiguous from 0, got ${item.order} at index ${index}`,
          })
        }
      })
    }
  }
}

function checkAssetReferences(project: GuideProject, issues: ValidationIssue[]): void {
  if (!project.assets.byId[project.panorama.assetId]) {
    issues.push({
      code: 'ASSET_MISSING',
      path: 'panorama.assetId',
      message: `panorama.assetId "${project.panorama.assetId}" is not registered in assets.byId`,
    })
  }
  for (const scene of project.scenes) {
    const asset = project.assets.byId[scene.assetId]
    if (!asset) {
      issues.push({
        code: 'ASSET_MISSING',
        path: `scenes.${scene.id}.assetId`,
        message: `scene assetId "${scene.assetId}" is not registered`,
      })
      continue
    }
    if (asset.kind !== 'html-bundle') {
      issues.push({
        code: 'ASSET_KIND_MISMATCH',
        path: `scenes.${scene.id}.assetId`,
        message: `scene "${scene.id}" must reference an html-bundle asset, got "${asset.kind}"`,
      })
    }
  }
  for (const route of project.navigation.routes) {
    if (!route.transition) continue
    const asset = project.assets.byId[route.transition.assetId]
    if (!asset) {
      issues.push({
        code: 'ASSET_MISSING',
        path: `navigation.routes.${route.id}.transition.assetId`,
        message: `route transition assetId "${route.transition.assetId}" is not registered`,
      })
      continue
    }
    if (asset.kind !== 'video') {
      issues.push({
        code: 'ASSET_KIND_MISMATCH',
        path: `navigation.routes.${route.id}.transition.assetId`,
        message: `route "${route.id}" transition must be a video asset, got "${asset.kind}"`,
      })
    }
  }
}

function checkSceneReferences(project: GuideProject, issues: ValidationIssue[]): void {
  const sceneIds = new Set(project.scenes.map((s) => s.id))
  const viewIds = new Map<string, Set<string>>()
  for (const scene of project.scenes) {
    const set = new Set<string>()
    for (const view of scene.views) set.add(view.id)
    viewIds.set(scene.id, set)
  }

  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) {
      if (category.experience.kind !== 'html-scene') continue
      const { sceneId, viewId } = category.experience
      if (!sceneIds.has(sceneId)) {
        issues.push({
          code: 'SCENE_MISSING',
          path: `category.${category.id}.experience.sceneId`,
          message: `category "${category.id}" references missing scene "${sceneId}"`,
        })
        continue
      }
      const views = viewIds.get(sceneId)!
      if (!views.has(viewId)) {
        issues.push({
          code: 'SCENE_VIEW_MISSING',
          path: `category.${category.id}.experience.viewId`,
          message: `category "${category.id}" references missing view "${viewId}" in scene "${sceneId}"`,
        })
      }
    }
  }
}

function checkRouteReferences(project: GuideProject, issues: ValidationIssue[]): void {
  for (const route of project.navigation.routes) {
    checkRouteLocation(project, route, 'from', route.from, issues)
    checkRouteLocation(project, route, 'to', route.to, issues)
  }
}

function _typecheckUnused(): void {
  // Anchor import for type-only references. No runtime effect.
  const _r: ExperienceRoute | undefined = undefined
  void _r
}

function checkRouteLocation(
  project: GuideProject,
  route: ExperienceRoute,
  side: 'from' | 'to',
  location: ExperienceLocation,
  issues: ValidationIssue[],
): void {
  if (location.kind === 'panorama') {
    if (location.categoryId && !project.panorama.categories[location.categoryId]) {
      issues.push({
        code: 'ROUTE_PANORAMA_CATEGORY_MISSING',
        path: `navigation.routes.${route.id}.${side}.categoryId`,
        message: `route "${route.id}" references missing panorama category "${location.categoryId}"`,
      })
    }
    if (location.itemId && !project.panorama.items[location.itemId]) {
      issues.push({
        code: 'ROUTE_PANORAMA_ITEM_MISSING',
        path: `navigation.routes.${route.id}.${side}.itemId`,
        message: `route "${route.id}" references missing panorama item "${location.itemId}"`,
      })
    }
  }
  if (location.kind === 'scene') {
    const scene = project.scenes.find((s) => s.id === location.sceneId)
    if (!scene) {
      issues.push({
        code: 'ROUTE_SCENE_MISSING',
        path: `navigation.routes.${route.id}.${side}.sceneId`,
        message: `route "${route.id}" references missing scene "${location.sceneId}"`,
      })
      return
    }
    if (location.viewId) {
      const view = scene.views.find((v) => v.id === location.viewId)
      if (!view) {
        issues.push({
          code: 'ROUTE_SCENE_VIEW_MISSING',
          path: `navigation.routes.${route.id}.${side}.viewId`,
          message: `route "${route.id}" references missing view "${location.viewId}" in scene "${location.sceneId}"`,
        })
      }
    }
  }
}

function checkSpatialRanges(project: GuideProject, issues: ValidationIssue[]): void {
  for (const [categoryId, layout] of Object.entries(project.panorama.categories)) {
    if (layout.hotspot) {
      ensureNormalizedPoint(layout.hotspot, `panorama.categories.${categoryId}.hotspot`, issues)
    }
    ensureViewport(layout.viewport, `panorama.categories.${categoryId}.viewport`, issues)
  }
  for (const [itemId, layout] of Object.entries(project.panorama.items)) {
    ensureNormalizedPoint(layout.marker, `panorama.items.${itemId}.marker`, issues)
    ensureNormalizedRect(layout.focusRect, `panorama.items.${itemId}.focusRect`, issues)
    if (layout.viewportOverride) {
      ensureViewport(layout.viewportOverride, `panorama.items.${itemId}.viewportOverride`, issues)
    }
    if (layout.callout) {
      ensureNormalizedPoint(layout.callout.target, `panorama.items.${itemId}.callout.target`, issues)
    }
  }
}

function checkAtlasCategoryCoverage(project: GuideProject, issues: ValidationIssue[]): void {
  const covered = new Set<string>()
  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) covered.add(category.id)
  }
  for (const categoryId of project.products.atlas.categoryIds) {
    if (!covered.has(categoryId)) {
      issues.push({
        code: 'ATLAS_CATEGORY_NOT_FOUND',
        path: 'products.atlas.categoryIds',
        message: `atlas categoryIds references unknown category "${categoryId}"`,
      })
    }
  }
}

function ensureNormalizedPoint(
  point: { x: number; y: number },
  path: string,
  issues: ValidationIssue[],
): void {
  if (point.x < 0 || point.x > 1) {
    issues.push({ code: 'COORD_OUT_OF_RANGE', path, message: `${path}.x must be in [0,1]` })
  }
  if (point.y < 0 || point.y > 1) {
    issues.push({ code: 'COORD_OUT_OF_RANGE', path, message: `${path}.y must be in [0,1]` })
  }
}

function ensureNormalizedRect(
  rect: { x: number; y: number; width: number; height: number },
  path: string,
  issues: ValidationIssue[],
): void {
  ensureNormalizedPoint(rect, path, issues)
  if (rect.width <= 0 || rect.width > 1) {
    issues.push({ code: 'COORD_OUT_OF_RANGE', path, message: `${path}.width must be in (0,1]` })
  }
  if (rect.height <= 0 || rect.height > 1) {
    issues.push({ code: 'COORD_OUT_OF_RANGE', path, message: `${path}.height must be in (0,1]` })
  }
  if (rect.x + rect.width > 1 + 1e-9) {
    issues.push({
      code: 'COORD_OUT_OF_RANGE',
      path,
      message: `${path} extends past right edge (x+width > 1)`,
    })
  }
  if (rect.y + rect.height > 1 + 1e-9) {
    issues.push({
      code: 'COORD_OUT_OF_RANGE',
      path,
      message: `${path} extends past bottom edge (y+height > 1)`,
    })
  }
}

function ensureViewport(
  viewport: { centerX: number; centerY: number; zoom: number },
  path: string,
  issues: ValidationIssue[],
): void {
  if (viewport.centerX < 0 || viewport.centerX > 1) {
    issues.push({ code: 'COORD_OUT_OF_RANGE', path, message: `${path}.centerX must be in [0,1]` })
  }
  if (viewport.centerY < 0 || viewport.centerY > 1) {
    issues.push({ code: 'COORD_OUT_OF_RANGE', path, message: `${path}.centerY must be in [0,1]` })
  }
  if (viewport.zoom <= 0) {
    issues.push({ code: 'COORD_OUT_OF_RANGE', path, message: `${path}.zoom must be > 0` })
  }
}
