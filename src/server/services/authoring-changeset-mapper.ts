import type {
  AuthoringSpatialPatch,
  GuideAuthoringChangeSetV1,
} from '../../automation/contracts/authoring-changeset-v1.js'
import { GuideProjectSchema } from '../../domain/project-schema.js'
import { validateDraftProject, type ValidationIssue } from '../../domain/project-validator.js'
import type {
  AssetDefinition,
  AssetRegistry,
  GuideProject,
  IndustryChain,
} from '../../domain/project-types.js'
import type { AuthoringCalibrationQueueItem } from './authoring-mapper.js'

export type AuthoringChangeSetConflictCode =
  | 'PROJECT_ID_MISMATCH'
  | 'DANGLING_REFERENCE'
  | 'REFERENCE_KIND_MISMATCH'
  | 'REFERENCE_OWNERSHIP_MISMATCH'

export interface AuthoringChangeSetConflict {
  code: AuthoringChangeSetConflictCode
  path: string
  message: string
  targetId?: string
}

export interface AuthoringChangeSetMergeResult {
  ok: boolean
  /**
   * The deterministic merge candidate. Callers must not persist it unless
   * `ok` is true and their revision/idempotency checks still hold.
   */
  project: GuideProject
  conflicts: AuthoringChangeSetConflict[]
  issues: ValidationIssue[]
  calibrationQueue: AuthoringCalibrationQueueItem[]
}

/**
 * Merge a validated GuideAuthoringChangeSet v1 into an existing project.
 *
 * This layer is deliberately pure: it does not read or write files, append
 * asset bytes, advance metadata, or perform optimistic locking. The caller
 * supplies the final asset registry after materializing append-only assets.
 *
 * Partitions are evaluated in dependency order:
 * profile -> localization -> knowledge -> assets -> panorama -> spatial ->
 * scenes -> navigation -> products -> integrations.
 */
export function mergeAuthoringChangeSet(
  currentProject: GuideProject,
  changeSet: GuideAuthoringChangeSetV1,
  assets: AssetRegistry,
): AuthoringChangeSetMergeResult {
  if (currentProject.id !== changeSet.projectId) {
    const project = structuredClone(currentProject)
    return finalizeMerge(project, [
      {
        code: 'PROJECT_ID_MISMATCH',
        path: 'projectId',
        targetId: changeSet.projectId,
        message: `change set targets project "${changeSet.projectId}" but current project is "${currentProject.id}"`,
      },
    ])
  }

  const project = structuredClone(currentProject)
  const { partitions } = changeSet

  // 1. Profile
  if (partitions.profile?.title !== undefined) {
    project.title = structuredClone(partitions.profile.title)
  }
  if (partitions.profile?.version !== undefined) {
    project.version = partitions.profile.version
  }

  // 2. Localization
  if (partitions.localization) {
    project.localization = structuredClone(partitions.localization.replace)
  }

  // 3. Knowledge
  if (partitions.knowledge) {
    project.knowledge = mapKnowledge(partitions.knowledge.replace)
  }

  // 4. Assets. The service owns append/collision checks and supplies the
  // complete post-append registry; this mapper only binds that final value.
  project.assets = structuredClone(assets)

  // 5. Panorama camera/background fields. Spatial maps intentionally remain
  // untouched when the panorama image changes.
  if (partitions.panorama) {
    const patch = partitions.panorama.patch
    if (patch.imageAssetId !== undefined) project.panorama.assetId = patch.imageAssetId
    if (patch.cameraBounds !== undefined) {
      project.panorama.cameraBounds = structuredClone(patch.cameraBounds)
    }
    if (patch.initialViewport !== undefined) {
      project.panorama.initialViewport = structuredClone(patch.initialViewport)
    }
  }

  // 6. Spatial. Removal and upsert are explicit and never cascade to
  // knowledge, scenes, navigation, or product configuration.
  if (partitions.spatial) {
    applyCategorySpatialPatch(project, partitions.spatial.categories)
    applyItemSpatialPatch(project, partitions.spatial.items)
  }

  // 7. Scenes
  if (partitions.scenes) {
    project.scenes = structuredClone(partitions.scenes.replace)
  }

  // 8. Navigation
  if (partitions.navigation) {
    project.navigation = structuredClone(partitions.navigation.replace)
  }

  // 9. Products
  if (partitions.products) {
    project.products = structuredClone(partitions.products.replace)
  }

  // 10. Integrations
  if (partitions.integrations) {
    project.integrations = structuredClone(partitions.integrations.replace)
  }

  // metadata is intentionally inherited byte-for-byte from currentProject.
  return finalizeMerge(project, collectReferenceConflicts(project))
}

function mapKnowledge(
  knowledge: NonNullable<GuideAuthoringChangeSetV1['partitions']['knowledge']>['replace'],
): IndustryChain {
  const items: IndustryChain['items'] = {}
  const stages = knowledge.stages.map((stage, stageIndex) => ({
    key: stage.key,
    label: structuredClone(stage.label),
    order: (stageIndex + 1) as 1 | 2 | 3,
    categories: stage.categories.map((category, categoryIndex) => {
      const itemIds = category.items.map((item, itemIndex) => {
        items[item.id] = {
          id: item.id,
          categoryId: category.id,
          title: structuredClone(item.title),
          description: structuredClone(item.description),
          order: itemIndex,
        }
        return item.id
      })

      return {
        id: category.id,
        title: structuredClone(category.title),
        order: categoryIndex,
        ...(category.description === undefined
          ? {}
          : { description: structuredClone(category.description) }),
        itemIds,
        experience: structuredClone(category.experience),
      }
    }),
  }))

  return { stages: stages as IndustryChain['stages'], items }
}

function applyCategorySpatialPatch(
  project: GuideProject,
  patch: AuthoringSpatialPatch['categories'],
): void {
  if (!patch) return
  for (const categoryId of patch.remove ?? []) delete project.panorama.categories[categoryId]
  for (const entry of patch.upsert ?? []) {
    project.panorama.categories[entry.categoryId] = structuredClone(entry.layout)
  }
}

function applyItemSpatialPatch(project: GuideProject, patch: AuthoringSpatialPatch['items']): void {
  if (!patch) return
  for (const itemId of patch.remove ?? []) delete project.panorama.items[itemId]
  for (const entry of patch.upsert ?? []) {
    project.panorama.items[entry.itemId] = structuredClone(entry.layout)
  }
}

function finalizeMerge(
  candidate: GuideProject,
  initialConflicts: AuthoringChangeSetConflict[],
): AuthoringChangeSetMergeResult {
  const shape = GuideProjectSchema.safeParse(candidate)
  const issues: ValidationIssue[] = shape.success
    ? validateDraftProject(shape.data).issues.filter(issue => !isCalibrationOnlyIssue(issue))
    : shape.error.issues.map(issue => ({
        code: 'PROJECT_SHAPE_INVALID',
        path: formatPath(issue.path),
        message: issue.message,
      }))
  const project = shape.success ? shape.data : candidate
  const conflicts = deduplicateConflicts(initialConflicts)
  const calibrationQueue = buildCalibrationQueue(project)

  return {
    ok: conflicts.length === 0 && issues.length === 0,
    project,
    conflicts,
    issues,
    calibrationQueue,
  }
}

function collectReferenceConflicts(project: GuideProject): AuthoringChangeSetConflict[] {
  const conflicts: AuthoringChangeSetConflict[] = []
  const categories = new Map<string, { stageIndex: number; categoryIndex: number }>()
  const referencedItems = new Map<string, string>()

  project.knowledge.stages.forEach((stage, stageIndex) => {
    stage.categories.forEach((category, categoryIndex) => {
      categories.set(category.id, { stageIndex, categoryIndex })
      category.itemIds.forEach((itemId, itemIndex) => {
        const path = `knowledge.stages.${stageIndex}.categories.${categoryIndex}.itemIds.${itemIndex}`
        const item = project.knowledge.items[itemId]
        if (!item) {
          conflicts.push(missingReference(path, itemId, 'knowledge item'))
          return
        }
        referencedItems.set(itemId, path)
        if (item.categoryId !== category.id) {
          conflicts.push({
            code: 'REFERENCE_OWNERSHIP_MISMATCH',
            path,
            targetId: itemId,
            message: `item "${itemId}" belongs to category "${item.categoryId}", not "${category.id}"`,
          })
        }
      })
    })
  })

  for (const [itemId, item] of Object.entries(project.knowledge.items)) {
    const path = `knowledge.items.${itemId}`
    if (!categories.has(item.categoryId)) {
      conflicts.push(missingReference(`${path}.categoryId`, item.categoryId, 'knowledge category'))
    }
    if (!referencedItems.has(itemId)) {
      conflicts.push({
        code: 'DANGLING_REFERENCE',
        path,
        targetId: itemId,
        message: `knowledge item "${itemId}" is not referenced by any category`,
      })
    }
  }

  checkAssetReference(
    conflicts,
    project.assets,
    project.panorama.assetId,
    'image',
    'panorama.assetId',
  )

  for (const categoryId of Object.keys(project.panorama.categories)) {
    if (!categories.has(categoryId)) {
      conflicts.push(
        missingReference(`panorama.categories.${categoryId}`, categoryId, 'knowledge category'),
      )
    }
  }
  for (const itemId of Object.keys(project.panorama.items)) {
    if (!project.knowledge.items[itemId]) {
      conflicts.push(missingReference(`panorama.items.${itemId}`, itemId, 'knowledge item'))
    }
  }

  const scenes = new Map(project.scenes.map(scene => [scene.id, scene]))
  project.scenes.forEach((scene, sceneIndex) => {
    checkAssetReference(
      conflicts,
      project.assets,
      scene.assetId,
      'html-bundle',
      `scenes.${sceneIndex}.assetId`,
    )
    scene.views.forEach((view, viewIndex) => {
      view.categoryIds.forEach((categoryId, categoryIndex) => {
        if (!categories.has(categoryId)) {
          conflicts.push(
            missingReference(
              `scenes.${sceneIndex}.views.${viewIndex}.categoryIds.${categoryIndex}`,
              categoryId,
              'knowledge category',
            ),
          )
        }
      })
      for (const itemId of Object.keys(view.itemFocusMap ?? {})) {
        if (!project.knowledge.items[itemId]) {
          conflicts.push(
            missingReference(
              `scenes.${sceneIndex}.views.${viewIndex}.itemFocusMap.${itemId}`,
              itemId,
              'knowledge item',
            ),
          )
        }
      }
    })
  })

  project.knowledge.stages.forEach((stage, stageIndex) => {
    stage.categories.forEach((category, categoryIndex) => {
      if (category.experience.kind !== 'html-scene') return
      const path = `knowledge.stages.${stageIndex}.categories.${categoryIndex}.experience`
      const { sceneId, viewId } = category.experience
      const scene = scenes.get(sceneId)
      if (!scene) {
        conflicts.push(missingReference(`${path}.sceneId`, sceneId, 'HTML scene'))
      } else if (!scene.views.some(view => view.id === viewId)) {
        conflicts.push(missingReference(`${path}.viewId`, viewId, `view in scene "${scene.id}"`))
      }
    })
  })

  project.navigation.routes.forEach((route, routeIndex) => {
    checkLocationReferences(
      project,
      scenes,
      categories,
      route.from,
      `navigation.routes.${routeIndex}.from`,
      conflicts,
    )
    checkLocationReferences(
      project,
      scenes,
      categories,
      route.to,
      `navigation.routes.${routeIndex}.to`,
      conflicts,
    )
    if (!route.transition) return
    checkAssetReference(
      conflicts,
      project.assets,
      route.transition.assetId,
      'video',
      `navigation.routes.${routeIndex}.transition.assetId`,
    )
    if (route.transition.posterAssetId) {
      checkAssetReference(
        conflicts,
        project.assets,
        route.transition.posterAssetId,
        'image',
        `navigation.routes.${routeIndex}.transition.posterAssetId`,
      )
    }
  })

  project.products.atlas.categoryIds.forEach((categoryId, index) => {
    if (!categories.has(categoryId)) {
      conflicts.push(
        missingReference(`products.atlas.categoryIds.${index}`, categoryId, 'knowledge category'),
      )
    }
  })

  const shareAssetId = project.integrations.share?.imageAssetId
  if (shareAssetId) {
    checkAssetReference(
      conflicts,
      project.assets,
      shareAssetId,
      'image',
      'integrations.share.imageAssetId',
    )
  }

  return conflicts
}

function checkLocationReferences(
  project: GuideProject,
  scenes: Map<string, GuideProject['scenes'][number]>,
  categories: Map<string, unknown>,
  location: GuideProject['navigation']['routes'][number]['from'],
  path: string,
  conflicts: AuthoringChangeSetConflict[],
): void {
  if (location.kind === 'scene') {
    const scene = scenes.get(location.sceneId)
    if (!scene) {
      conflicts.push(missingReference(`${path}.sceneId`, location.sceneId, 'HTML scene'))
    } else if (location.viewId && !scene.views.some(view => view.id === location.viewId)) {
      conflicts.push(
        missingReference(`${path}.viewId`, location.viewId, `view in scene "${scene.id}"`),
      )
    }
    return
  }

  if (location.categoryId) {
    if (!categories.has(location.categoryId)) {
      conflicts.push(
        missingReference(`${path}.categoryId`, location.categoryId, 'knowledge category'),
      )
    }
  }
  if (location.itemId) {
    const item = project.knowledge.items[location.itemId]
    if (!item) {
      conflicts.push(missingReference(`${path}.itemId`, location.itemId, 'knowledge item'))
    } else {
      if (location.categoryId && item.categoryId !== location.categoryId) {
        conflicts.push({
          code: 'REFERENCE_OWNERSHIP_MISMATCH',
          path: `${path}.itemId`,
          targetId: location.itemId,
          message: `item "${location.itemId}" does not belong to category "${location.categoryId}"`,
        })
      }
    }
  }
}

/**
 * The domain draft validator historically models panorama-route targets as
 * spatial-map references. For authoring, a route may target a real knowledge
 * entity before its layout is calibrated. Referential existence/ownership is
 * checked above; these two layout-only findings belong in calibrationQueue
 * (and later release validation), not in blocking draft issues.
 */
function isCalibrationOnlyIssue(issue: ValidationIssue): boolean {
  return (
    issue.code === 'ROUTE_PANORAMA_CATEGORY_MISSING' || issue.code === 'ROUTE_PANORAMA_ITEM_MISSING'
  )
}

function checkAssetReference(
  conflicts: AuthoringChangeSetConflict[],
  assets: AssetRegistry,
  assetId: string,
  expectedKind: AssetDefinition['kind'],
  path: string,
): void {
  const asset = assets.byId[assetId]
  if (!asset) {
    conflicts.push(missingReference(path, assetId, `${expectedKind} asset`))
  } else if (asset.kind !== expectedKind) {
    conflicts.push({
      code: 'REFERENCE_KIND_MISMATCH',
      path,
      targetId: assetId,
      message: `asset "${assetId}" must have kind "${expectedKind}", got "${asset.kind}"`,
    })
  }
}

function missingReference(
  path: string,
  targetId: string,
  expectedTarget: string,
): AuthoringChangeSetConflict {
  return {
    code: 'DANGLING_REFERENCE',
    path,
    targetId,
    message: `"${targetId}" does not reference an existing ${expectedTarget}`,
  }
}

function buildCalibrationQueue(project: GuideProject): AuthoringCalibrationQueueItem[] {
  const queue: AuthoringCalibrationQueueItem[] = []
  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) {
      if (!project.panorama.categories[category.id]) {
        queue.push({
          code: 'CATEGORY_LAYOUT_MISSING',
          path: `panorama.categories.${category.id}`,
          targetKind: 'category',
          targetId: category.id,
          categoryId: category.id,
          message: `Category "${category.id}" requires spatial calibration`,
        })
      }
      for (const itemId of category.itemIds) {
        const layout = project.panorama.items[itemId]
        if (!layout?.marker) {
          queue.push({
            code: 'ITEM_MARKER_MISSING',
            path: `panorama.items.${itemId}.marker`,
            targetKind: 'item',
            targetId: itemId,
            categoryId: category.id,
            itemId,
            message: `Item "${itemId}" requires a marker position`,
          })
        }
        if (!layout?.focusRect) {
          queue.push({
            code: 'ITEM_FOCUS_RECT_MISSING',
            path: `panorama.items.${itemId}.focusRect`,
            targetKind: 'item',
            targetId: itemId,
            categoryId: category.id,
            itemId,
            message: `Item "${itemId}" requires a Catalog focus rectangle`,
          })
        }
      }
    }
  }
  return queue
}

function deduplicateConflicts(
  conflicts: AuthoringChangeSetConflict[],
): AuthoringChangeSetConflict[] {
  const seen = new Set<string>()
  return conflicts.filter(conflict => {
    const key = `${conflict.code}\0${conflict.path}\0${conflict.targetId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function formatPath(path: PropertyKey[]): string {
  return path.map(segment => String(segment)).join('.')
}
