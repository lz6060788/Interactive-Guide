import type { GuideAuthoringBundleV1 } from '../../automation/contracts/authoring-bundle-v1.js'
import { createDraftProject } from '../../domain/project-normalizer.js'
import { GuideProjectSchema } from '../../domain/project-schema.js'
import { validateDraftProject, type ValidationIssue } from '../../domain/project-validator.js'
import type {
  AssetRegistry,
  CategorySpatialLayout,
  GuideProject,
  IndustryChain,
  ItemSpatialLayout,
} from '../../domain/project-types.js'

export type AuthoringCalibrationCode =
  | 'CATEGORY_LAYOUT_MISSING'
  | 'ITEM_MARKER_MISSING'
  | 'ITEM_FOCUS_RECT_MISSING'

export interface AuthoringCalibrationQueueItem {
  code: AuthoringCalibrationCode
  path: string
  targetKind: 'category' | 'item'
  targetId: string
  categoryId: string
  itemId?: string
  message: string
}

export interface AuthoringMappingOptions {
  /** ISO timestamp used for deterministic creation metadata. */
  now?: string
}

export interface AuthoringMappingResult {
  project: GuideProject
  draftIssues: ValidationIssue[]
  calibrationQueue: AuthoringCalibrationQueueItem[]
}

/**
 * Map a validated authoring bundle to the Workbench-owned GuideProject shape.
 *
 * This function deliberately does not normalize the project: absent spatial
 * input must remain absent so the Workbench can present an honest calibration
 * queue instead of inventing coordinates. Runtime assets have already been
 * materialized by the caller and are supplied as a registry, keeping this
 * mapping free of filesystem access.
 */
export function mapAuthoringBundleToDraft(
  bundle: GuideAuthoringBundleV1,
  assets: AssetRegistry,
  options: AuthoringMappingOptions = {},
): AuthoringMappingResult {
  const defaultLocale = bundle.project.localization.defaultLocale
  const defaultTitle = bundle.project.title[defaultLocale]
  if (!defaultTitle?.trim()) {
    throw new Error(`Authoring bundle project title is required for "${defaultLocale}"`)
  }
  const draft = createDraftProject({
    id: bundle.project.id,
    title: defaultTitle,
    locale: defaultLocale,
  })
  const knowledge = mapKnowledge(bundle)
  const allCategoryIds = knowledge.stages.flatMap(stage =>
    stage.categories.map(category => category.id),
  )
  const timestamp = options.now ?? draft.metadata.createdAt

  const candidate: GuideProject = {
    ...draft,
    id: bundle.project.id,
    title: bundle.project.title,
    version: bundle.project.version,
    localization: bundle.project.localization,
    knowledge,
    assets,
    panorama: {
      assetId: bundle.panorama.imageAssetId,
      coordinateSpace: 'normalized',
      cameraBounds: bundle.panorama.cameraBounds ?? draft.panorama.cameraBounds,
      initialViewport: bundle.panorama.initialViewport ?? draft.panorama.initialViewport,
      categories: mapCategorySpatialLayouts(bundle),
      items: mapItemSpatialLayouts(bundle),
    },
    scenes: bundle.scenes ?? draft.scenes,
    navigation: bundle.navigation ?? draft.navigation,
    products:
      bundle.products ??
      ({
        atlas: {
          ...draft.products.atlas,
          categoryIds: allCategoryIds,
        },
        catalog: draft.products.catalog,
      } satisfies GuideProject['products']),
    integrations: bundle.integrations ?? draft.integrations,
    metadata: {
      ...draft.metadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  }

  const project = GuideProjectSchema.parse(candidate)
  const draftValidation = validateDraftProject(project)

  return {
    project,
    draftIssues: draftValidation.issues,
    calibrationQueue: buildCalibrationQueue(project),
  }
}

function mapKnowledge(bundle: GuideAuthoringBundleV1): IndustryChain {
  const items: IndustryChain['items'] = {}
  const stages = bundle.knowledge.stages.map((stage, stageIndex) => ({
    key: stage.key,
    label: stage.label,
    order: (stageIndex + 1) as 1 | 2 | 3,
    categories: stage.categories.map((category, categoryIndex) => {
      const itemIds = category.items.map((item, itemIndex) => {
        items[item.id] = {
          id: item.id,
          categoryId: category.id,
          title: item.title,
          description: item.description,
          order: itemIndex,
        }
        return item.id
      })

      return {
        id: category.id,
        title: category.title,
        order: categoryIndex,
        description: category.description,
        itemIds,
        experience: category.experience,
      }
    }),
  }))

  return {
    stages: stages as IndustryChain['stages'],
    items,
  }
}

function mapCategorySpatialLayouts(
  bundle: GuideAuthoringBundleV1,
): Record<string, CategorySpatialLayout> {
  const layouts: Record<string, CategorySpatialLayout> = {}
  for (const entry of bundle.spatial?.categories ?? []) {
    layouts[entry.categoryId] = entry.layout
  }
  return layouts
}

function mapItemSpatialLayouts(bundle: GuideAuthoringBundleV1): Record<string, ItemSpatialLayout> {
  const layouts: Record<string, ItemSpatialLayout> = {}
  for (const entry of bundle.spatial?.items ?? []) {
    layouts[entry.itemId] = entry.layout
  }
  return layouts
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
