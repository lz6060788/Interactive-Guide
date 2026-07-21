import { z } from 'zod'
import { ExperienceRouteSchema } from '../../domain/experience-navigation.js'
import {
  AssetIdSchema,
  CameraBoundsSchema,
  CategorySpatialLayoutSchema,
  HtmlScenePackageSchema,
  ItemSpatialLayoutSchema,
  LocalizedTextSchema,
  LocalizationConfigSchema,
  ProjectIdSchema,
  ProjectIntegrationsSchema,
  ProjectVersionSchema,
  ViewportSchema,
} from '../../domain/project-schema.js'
import {
  AuthoringFileSchema,
  AuthoringKnowledgeSchema,
  AuthoringProductsSchema,
  type AuthoringFile,
} from './authoring-bundle-v1.js'

export const GUIDE_AUTHORING_CHANGESET_CONTRACT = 'guide-authoring-changeset' as const
export const GUIDE_AUTHORING_CHANGESET_VERSION = '1.0.0' as const

const ProfilePartitionSchema = z
  .object({
    title: LocalizedTextSchema.optional(),
    version: ProjectVersionSchema.optional(),
  })
  .strict()
  .refine(profile => profile.title !== undefined || profile.version !== undefined, {
    message: 'profile must change title, version, or both',
  })

const LocalizationPartitionSchema = z
  .object({ replace: LocalizationConfigSchema.strict() })
  .strict()

const KnowledgePartitionSchema = z.object({ replace: AuthoringKnowledgeSchema }).strict()

const AssetsPartitionSchema = z
  .object({
    append: z.array(AuthoringFileSchema).min(1),
  })
  .strict()

const AuthoringPanoramaPatchValueSchema = z
  .object({
    imageAssetId: AssetIdSchema.optional(),
    cameraBounds: CameraBoundsSchema.strict().optional(),
    initialViewport: ViewportSchema.strict().optional(),
  })
  .strict()
  .refine(
    patch =>
      patch.imageAssetId !== undefined ||
      patch.cameraBounds !== undefined ||
      patch.initialViewport !== undefined,
    { message: 'panorama.patch must contain at least one field' },
  )

export const AuthoringPanoramaPatchSchema = z
  .object({ patch: AuthoringPanoramaPatchValueSchema })
  .strict()

export const AuthoringCategorySpatialEntrySchema = z
  .object({
    categoryId: AssetIdSchema,
    layout: CategorySpatialLayoutSchema.strict(),
  })
  .strict()

export const AuthoringItemSpatialEntrySchema = z
  .object({
    itemId: AssetIdSchema,
    layout: ItemSpatialLayoutSchema.strict(),
  })
  .strict()

const CategorySpatialCollectionPatchSchema = z
  .object({
    upsert: z.array(AuthoringCategorySpatialEntrySchema).min(1).optional(),
    remove: z.array(AssetIdSchema).min(1).optional(),
  })
  .strict()
  .superRefine((patch, ctx) => {
    checkSpatialCollectionPatch(
      ctx,
      patch.upsert?.map(entry => entry.categoryId),
      patch.remove,
      'categoryId',
    )
  })

const ItemSpatialCollectionPatchSchema = z
  .object({
    upsert: z.array(AuthoringItemSpatialEntrySchema).min(1).optional(),
    remove: z.array(AssetIdSchema).min(1).optional(),
  })
  .strict()
  .superRefine((patch, ctx) => {
    checkSpatialCollectionPatch(
      ctx,
      patch.upsert?.map(entry => entry.itemId),
      patch.remove,
      'itemId',
    )
  })

export const AuthoringSpatialPatchSchema = z
  .object({
    categories: CategorySpatialCollectionPatchSchema.optional(),
    items: ItemSpatialCollectionPatchSchema.optional(),
  })
  .strict()
  .refine(spatial => spatial.categories !== undefined || spatial.items !== undefined, {
    message: 'spatial must contain categories, items, or both',
  })

const ScenesPartitionSchema = z
  .object({ replace: z.array(HtmlScenePackageSchema.strict()) })
  .strict()

const NavigationValueSchema = z.object({ routes: z.array(ExperienceRouteSchema.strict()) }).strict()

const NavigationPartitionSchema = z.object({ replace: NavigationValueSchema }).strict()

const ProductsPartitionSchema = z.object({ replace: AuthoringProductsSchema }).strict()

const IntegrationsPartitionSchema = z
  .object({ replace: ProjectIntegrationsSchema.strict() })
  .strict()

export const GuideAuthoringChangeSetPartitionsV1Schema = z
  .object({
    profile: ProfilePartitionSchema.optional(),
    localization: LocalizationPartitionSchema.optional(),
    knowledge: KnowledgePartitionSchema.optional(),
    assets: AssetsPartitionSchema.optional(),
    panorama: AuthoringPanoramaPatchSchema.optional(),
    spatial: AuthoringSpatialPatchSchema.optional(),
    scenes: ScenesPartitionSchema.optional(),
    navigation: NavigationPartitionSchema.optional(),
    products: ProductsPartitionSchema.optional(),
    integrations: IntegrationsPartitionSchema.optional(),
  })
  .strict()
  .refine(partitions => Object.values(partitions).some(value => value !== undefined), {
    message: 'partitions must contain at least one change',
  })

/**
 * Declarative update contract for an existing project.
 *
 * Asset mutation is intentionally append-only in v1. Removing or replacing
 * asset bytes is not representable. Knowledge and other aggregate partitions
 * use explicit replacement, while panorama and spatial calibration use
 * targeted patches so a focused repair does not require a read-modify-write of
 * unrelated coordinates.
 *
 * Refinements below only enforce facts that are knowable from this payload.
 * The authoring service must still resolve references against the current
 * revision and reject existing asset ID collisions or dangling references.
 */
export const GuideAuthoringChangeSetV1Schema = z
  .object({
    contract: z.literal(GUIDE_AUTHORING_CHANGESET_CONTRACT),
    contractVersion: z.literal(GUIDE_AUTHORING_CHANGESET_VERSION),
    projectId: ProjectIdSchema,
    expectedRevision: z.number().int().min(1),
    idempotencyKey: z.string().uuid(),
    partitions: GuideAuthoringChangeSetPartitionsV1Schema,
  })
  .strict()
  .superRefine((changeSet, ctx) => {
    const { partitions } = changeSet
    const supportedLocales = partitions.localization?.replace.supportedLocales

    if (partitions.localization) {
      checkLocalization(ctx, partitions.localization.replace)
    }
    if (partitions.profile?.title) {
      checkLocalizedText(
        ctx,
        partitions.profile.title,
        ['partitions', 'profile', 'title'],
        supportedLocales,
      )
    }

    const knowledge = collectKnowledge(ctx, partitions.knowledge?.replace, supportedLocales)
    const appendedAssets = collectAppendedAssets(ctx, partitions.assets?.append)
    const scenes = collectScenes(
      ctx,
      partitions.scenes?.replace,
      knowledge,
      appendedAssets,
      supportedLocales,
      partitions.knowledge !== undefined,
    )

    if (partitions.knowledge && partitions.scenes) {
      checkCategoryExperiences(ctx, knowledge, scenes)
    }

    checkSpatialPatch(ctx, partitions.spatial, knowledge, partitions.knowledge !== undefined)
    checkPanoramaPatch(ctx, partitions.panorama, appendedAssets)
    checkNavigation(
      ctx,
      partitions.navigation?.replace.routes,
      knowledge,
      scenes,
      appendedAssets,
      partitions.knowledge !== undefined,
      partitions.scenes !== undefined,
    )
    checkProducts(
      ctx,
      partitions.products?.replace,
      knowledge,
      supportedLocales,
      partitions.knowledge !== undefined,
    )
    checkIntegrations(ctx, partitions.integrations?.replace, appendedAssets, supportedLocales)
  })

export type GuideAuthoringChangeSetV1 = z.infer<typeof GuideAuthoringChangeSetV1Schema>
export type GuideAuthoringChangeSetPartitionsV1 = z.infer<
  typeof GuideAuthoringChangeSetPartitionsV1Schema
>
export type AuthoringPanoramaPatch = z.infer<typeof AuthoringPanoramaPatchSchema>
export type AuthoringSpatialPatch = z.infer<typeof AuthoringSpatialPatchSchema>

function addIssue(ctx: z.RefinementCtx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message })
}

function checkSpatialCollectionPatch(
  ctx: z.RefinementCtx,
  upsertIds: string[] | undefined,
  removeIds: string[] | undefined,
  idField: 'categoryId' | 'itemId',
): void {
  if (!upsertIds && !removeIds) {
    addIssue(ctx, [], 'spatial collection patch must contain upsert, remove, or both')
    return
  }

  const upsertSet = new Set<string>()
  upsertIds?.forEach((id, index) => {
    if (upsertSet.has(id)) {
      addIssue(ctx, ['upsert', index, idField], `duplicate ${idField} "${id}" in upsert`)
    }
    upsertSet.add(id)
  })

  const removeSet = new Set<string>()
  removeIds?.forEach((id, index) => {
    if (removeSet.has(id)) {
      addIssue(ctx, ['remove', index], `duplicate ${idField} "${id}" in remove`)
    }
    if (upsertSet.has(id)) {
      addIssue(ctx, ['remove', index], `${idField} "${id}" cannot be upserted and removed together`)
    }
    removeSet.add(id)
  })
}

function checkLocalization(
  ctx: z.RefinementCtx,
  localization: z.infer<typeof LocalizationConfigSchema>,
): void {
  const { defaultLocale, supportedLocales } = localization
  if (!supportedLocales.includes(defaultLocale)) {
    addIssue(
      ctx,
      ['partitions', 'localization', 'replace', 'defaultLocale'],
      'defaultLocale must be included in supportedLocales',
    )
  }
  if (new Set(supportedLocales).size !== supportedLocales.length) {
    addIssue(
      ctx,
      ['partitions', 'localization', 'replace', 'supportedLocales'],
      'supportedLocales must not contain duplicates',
    )
  }
}

function checkLocalizedText(
  ctx: z.RefinementCtx,
  text: Record<string, string>,
  path: Array<string | number>,
  supportedLocales?: string[],
): void {
  const entries = Object.entries(text)
  if (entries.length === 0) {
    addIssue(ctx, path, 'localized text must contain at least one translation')
  }
  for (const [locale, value] of entries) {
    if (!value.trim()) {
      addIssue(ctx, [...path, locale], `translation for "${locale}" must not be blank`)
    }
  }
  if (!supportedLocales) return

  const supported = new Set(supportedLocales)
  for (const locale of supportedLocales) {
    if (!text[locale]?.trim()) {
      addIssue(ctx, [...path, locale], `translation for "${locale}" is required`)
    }
  }
  for (const locale of Object.keys(text)) {
    if (!supported.has(locale)) {
      addIssue(ctx, [...path, locale], `locale "${locale}" is not declared in supportedLocales`)
    }
  }
}

interface KnowledgeIndex {
  categoryIds: Set<string>
  itemIds: Set<string>
  itemCategoryById: Map<string, string>
  categoryExperiences: Array<{
    path: Array<string | number>
    sceneId: string
    viewId: string
  }>
}

function collectKnowledge(
  ctx: z.RefinementCtx,
  knowledge: z.infer<typeof AuthoringKnowledgeSchema> | undefined,
  supportedLocales: string[] | undefined,
): KnowledgeIndex {
  const result: KnowledgeIndex = {
    categoryIds: new Set(),
    itemIds: new Set(),
    itemCategoryById: new Map(),
    categoryExperiences: [],
  }
  if (!knowledge) return result

  const categoryPaths = new Map<string, Array<string | number>>()
  const itemPaths = new Map<string, Array<string | number>>()
  knowledge.stages.forEach((stage, stageIndex) => {
    const stagePath: Array<string | number> = [
      'partitions',
      'knowledge',
      'replace',
      'stages',
      stageIndex,
    ]
    checkLocalizedText(ctx, stage.label, [...stagePath, 'label'], supportedLocales)
    stage.categories.forEach((category, categoryIndex) => {
      const categoryPath = [...stagePath, 'categories', categoryIndex]
      if (result.categoryIds.has(category.id)) {
        addIssue(ctx, [...categoryPath, 'id'], `duplicate category id "${category.id}"`)
      } else {
        categoryPaths.set(category.id, categoryPath)
      }
      result.categoryIds.add(category.id)
      checkLocalizedText(ctx, category.title, [...categoryPath, 'title'], supportedLocales)
      if (category.description) {
        checkLocalizedText(
          ctx,
          category.description,
          [...categoryPath, 'description'],
          supportedLocales,
        )
      }
      if (category.experience.kind === 'html-scene') {
        result.categoryExperiences.push({
          path: [...categoryPath, 'experience'],
          sceneId: category.experience.sceneId,
          viewId: category.experience.viewId,
        })
      }

      category.items.forEach((item, itemIndex) => {
        const itemPath = [...categoryPath, 'items', itemIndex]
        if (result.itemIds.has(item.id)) {
          addIssue(ctx, [...itemPath, 'id'], `duplicate item id "${item.id}"`)
        } else {
          itemPaths.set(item.id, itemPath)
        }
        result.itemIds.add(item.id)
        result.itemCategoryById.set(item.id, category.id)
        checkLocalizedText(ctx, item.title, [...itemPath, 'title'], supportedLocales)
        checkLocalizedText(ctx, item.description, [...itemPath, 'description'], supportedLocales)
      })
    })
  })

  for (const id of result.categoryIds) {
    if (result.itemIds.has(id)) {
      addIssue(
        ctx,
        [...(itemPaths.get(id) ?? categoryPaths.get(id) ?? []), 'id'],
        `id "${id}" cannot be used by both a category and an item`,
      )
    }
  }
  return result
}

type RuntimeAuthoringFile = Extract<AuthoringFile, { usage: 'runtime' }>

function collectAppendedAssets(
  ctx: z.RefinementCtx,
  files: AuthoringFile[] | undefined,
): Map<string, RuntimeAuthoringFile> {
  const runtimeAssets = new Map<string, RuntimeAuthoringFile>()
  const sourceRefs = new Set<string>()
  files?.forEach((file, index) => {
    const path = ['partitions', 'assets', 'append', index]
    if (file.usage === 'runtime') {
      if (runtimeAssets.has(file.assetId)) {
        addIssue(ctx, [...path, 'assetId'], `duplicate appended runtime asset id "${file.assetId}"`)
      }
      runtimeAssets.set(file.assetId, file)
      const expectedKind = expectedKindForRole(file.semanticRole)
      if (file.kind !== expectedKind) {
        addIssue(
          ctx,
          [...path, 'kind'],
          `semanticRole "${file.semanticRole}" requires kind "${expectedKind}"`,
        )
      }
    } else {
      if (sourceRefs.has(file.fileRef)) {
        addIssue(
          ctx,
          [...path, 'fileRef'],
          `duplicate appended authoring source fileRef "${file.fileRef}"`,
        )
      }
      sourceRefs.add(file.fileRef)
    }
  })
  return runtimeAssets
}

function expectedKindForRole(
  role: RuntimeAuthoringFile['semanticRole'],
): RuntimeAuthoringFile['kind'] {
  switch (role) {
    case 'panorama-image':
    case 'transition-poster':
    case 'share-image':
      return 'image'
    case 'transition-video':
      return 'video'
    case 'html-scene-bundle':
      return 'html-bundle'
  }
}

interface SceneIndex {
  byId: Map<string, z.infer<typeof HtmlScenePackageSchema>>
}

function collectScenes(
  ctx: z.RefinementCtx,
  scenes: Array<z.infer<typeof HtmlScenePackageSchema>> | undefined,
  knowledge: KnowledgeIndex,
  appendedAssets: Map<string, RuntimeAuthoringFile>,
  supportedLocales: string[] | undefined,
  hasKnowledgeReplacement: boolean,
): SceneIndex {
  const byId = new Map<string, z.infer<typeof HtmlScenePackageSchema>>()
  scenes?.forEach((scene, sceneIndex) => {
    const scenePath: Array<string | number> = ['partitions', 'scenes', 'replace', sceneIndex]
    if (byId.has(scene.id)) {
      addIssue(ctx, [...scenePath, 'id'], `duplicate scene id "${scene.id}"`)
    }
    if (knowledge.categoryIds.has(scene.id) || knowledge.itemIds.has(scene.id)) {
      addIssue(ctx, [...scenePath, 'id'], `scene id "${scene.id}" conflicts with knowledge id`)
    }
    byId.set(scene.id, scene)
    checkAssetId(ctx, scene.id, [...scenePath, 'id'], 'scene id')
    checkAssetId(ctx, scene.assetId, [...scenePath, 'assetId'], 'scene assetId')
    checkAppendedAsset(ctx, appendedAssets, scene.assetId, 'html-bundle', [...scenePath, 'assetId'])
    checkLocalizedText(ctx, scene.title, [...scenePath, 'title'], supportedLocales)

    const viewIds = new Set<string>()
    scene.views.forEach((view, viewIndex) => {
      const viewPath = [...scenePath, 'views', viewIndex]
      if (viewIds.has(view.id)) {
        addIssue(ctx, [...viewPath, 'id'], `duplicate view id "${view.id}" in scene "${scene.id}"`)
      }
      viewIds.add(view.id)
      checkAssetId(ctx, view.id, [...viewPath, 'id'], 'view id')
      if (!view.activationMessage.type.trim()) {
        addIssue(
          ctx,
          [...viewPath, 'activationMessage', 'type'],
          'activation message type is required',
        )
      }
      checkLocalizedText(ctx, view.title, [...viewPath, 'title'], supportedLocales)

      const categoryRefs = new Set<string>()
      view.categoryIds.forEach((categoryId, categoryIndex) => {
        if (categoryRefs.has(categoryId)) {
          addIssue(
            ctx,
            [...viewPath, 'categoryIds', categoryIndex],
            `duplicate category id "${categoryId}" in scene view`,
          )
        }
        categoryRefs.add(categoryId)
        if (hasKnowledgeReplacement && !knowledge.categoryIds.has(categoryId)) {
          addIssue(
            ctx,
            [...viewPath, 'categoryIds', categoryIndex],
            `unknown category id "${categoryId}" in replacement knowledge`,
          )
        }
      })
      if (hasKnowledgeReplacement) {
        for (const itemId of Object.keys(view.itemFocusMap ?? {})) {
          if (!knowledge.itemIds.has(itemId)) {
            addIssue(
              ctx,
              [...viewPath, 'itemFocusMap', itemId],
              `unknown item id "${itemId}" in replacement knowledge`,
            )
          }
        }
      }
    })
  })
  return { byId }
}

function checkCategoryExperiences(
  ctx: z.RefinementCtx,
  knowledge: KnowledgeIndex,
  scenes: SceneIndex,
): void {
  for (const experience of knowledge.categoryExperiences) {
    const scene = scenes.byId.get(experience.sceneId)
    if (!scene) {
      addIssue(ctx, [...experience.path, 'sceneId'], `unknown scene id "${experience.sceneId}"`)
      continue
    }
    if (!scene.views.some(view => view.id === experience.viewId)) {
      addIssue(
        ctx,
        [...experience.path, 'viewId'],
        `unknown view id "${experience.viewId}" in scene "${experience.sceneId}"`,
      )
    }
  }
}

function checkSpatialPatch(
  ctx: z.RefinementCtx,
  spatial: z.infer<typeof AuthoringSpatialPatchSchema> | undefined,
  knowledge: KnowledgeIndex,
  hasKnowledgeReplacement: boolean,
): void {
  if (!spatial || !hasKnowledgeReplacement) return

  spatial.categories?.upsert?.forEach((entry, index) => {
    if (!knowledge.categoryIds.has(entry.categoryId)) {
      addIssue(
        ctx,
        ['partitions', 'spatial', 'categories', 'upsert', index, 'categoryId'],
        `unknown category id "${entry.categoryId}" in replacement knowledge`,
      )
    }
  })
  spatial.items?.upsert?.forEach((entry, index) => {
    if (!knowledge.itemIds.has(entry.itemId)) {
      addIssue(
        ctx,
        ['partitions', 'spatial', 'items', 'upsert', index, 'itemId'],
        `unknown item id "${entry.itemId}" in replacement knowledge`,
      )
    }
  })
}

function checkPanoramaPatch(
  ctx: z.RefinementCtx,
  panorama: z.infer<typeof AuthoringPanoramaPatchSchema> | undefined,
  appendedAssets: Map<string, RuntimeAuthoringFile>,
): void {
  const imageAssetId = panorama?.patch.imageAssetId
  if (!imageAssetId) return
  const asset = checkAppendedAsset(ctx, appendedAssets, imageAssetId, 'image', [
    'partitions',
    'panorama',
    'patch',
    'imageAssetId',
  ])
  if (asset && asset.semanticRole !== 'panorama-image') {
    addIssue(
      ctx,
      ['partitions', 'panorama', 'patch', 'imageAssetId'],
      'an appended panorama image must use semanticRole "panorama-image"',
    )
  }
}

function checkNavigation(
  ctx: z.RefinementCtx,
  routes: Array<z.infer<typeof ExperienceRouteSchema>> | undefined,
  knowledge: KnowledgeIndex,
  scenes: SceneIndex,
  appendedAssets: Map<string, RuntimeAuthoringFile>,
  hasKnowledgeReplacement: boolean,
  hasScenesReplacement: boolean,
): void {
  const routeIds = new Set<string>()
  routes?.forEach((route, routeIndex) => {
    const routePath: Array<string | number> = [
      'partitions',
      'navigation',
      'replace',
      'routes',
      routeIndex,
    ]
    if (routeIds.has(route.id)) {
      addIssue(ctx, [...routePath, 'id'], `duplicate route id "${route.id}"`)
    }
    routeIds.add(route.id)
    checkAssetId(ctx, route.id, [...routePath, 'id'], 'route id')
    if (
      (hasKnowledgeReplacement &&
        (knowledge.categoryIds.has(route.id) || knowledge.itemIds.has(route.id))) ||
      (hasScenesReplacement && scenes.byId.has(route.id))
    ) {
      addIssue(ctx, [...routePath, 'id'], `route id "${route.id}" conflicts with another id`)
    }
    checkLocation(
      ctx,
      route.from,
      [...routePath, 'from'],
      knowledge,
      scenes,
      hasKnowledgeReplacement,
      hasScenesReplacement,
    )
    checkLocation(
      ctx,
      route.to,
      [...routePath, 'to'],
      knowledge,
      scenes,
      hasKnowledgeReplacement,
      hasScenesReplacement,
    )
    if (route.transition) {
      checkAppendedAsset(ctx, appendedAssets, route.transition.assetId, 'video', [
        ...routePath,
        'transition',
        'assetId',
      ])
      if (route.transition.posterAssetId) {
        checkAppendedAsset(ctx, appendedAssets, route.transition.posterAssetId, 'image', [
          ...routePath,
          'transition',
          'posterAssetId',
        ])
      }
    }
  })
}

function checkLocation(
  ctx: z.RefinementCtx,
  location: z.infer<typeof ExperienceRouteSchema>['from'],
  path: Array<string | number>,
  knowledge: KnowledgeIndex,
  scenes: SceneIndex,
  hasKnowledgeReplacement: boolean,
  hasScenesReplacement: boolean,
): void {
  if (location.kind === 'panorama') {
    if (
      hasKnowledgeReplacement &&
      location.categoryId &&
      !knowledge.categoryIds.has(location.categoryId)
    ) {
      addIssue(ctx, [...path, 'categoryId'], `unknown category id "${location.categoryId}"`)
    }
    if (hasKnowledgeReplacement && location.itemId && !knowledge.itemIds.has(location.itemId)) {
      addIssue(ctx, [...path, 'itemId'], `unknown item id "${location.itemId}"`)
    }
    if (
      hasKnowledgeReplacement &&
      location.categoryId &&
      location.itemId &&
      knowledge.itemCategoryById.get(location.itemId) !== location.categoryId
    ) {
      addIssue(
        ctx,
        [...path, 'itemId'],
        `item "${location.itemId}" does not belong to category "${location.categoryId}"`,
      )
    }
    return
  }

  if (!hasScenesReplacement) return
  const scene = scenes.byId.get(location.sceneId)
  if (!scene) {
    addIssue(ctx, [...path, 'sceneId'], `unknown scene id "${location.sceneId}"`)
    return
  }
  if (location.viewId && !scene.views.some(view => view.id === location.viewId)) {
    addIssue(
      ctx,
      [...path, 'viewId'],
      `unknown view id "${location.viewId}" in scene "${location.sceneId}"`,
    )
  }
}

function checkProducts(
  ctx: z.RefinementCtx,
  products: z.infer<typeof AuthoringProductsSchema> | undefined,
  knowledge: KnowledgeIndex,
  supportedLocales: string[] | undefined,
  hasKnowledgeReplacement: boolean,
): void {
  if (!products) return
  const expectedOrder = ['upstream', 'midstream', 'downstream'] as const
  products.catalog.stageOrder.forEach((stage, index) => {
    if (stage !== expectedOrder[index]) {
      addIssue(
        ctx,
        ['partitions', 'products', 'replace', 'catalog', 'stageOrder', index],
        `catalog stageOrder[${index}] must be "${expectedOrder[index]}"`,
      )
    }
  })

  const atlasCategoryIds = new Set<string>()
  products.atlas.categoryIds.forEach((categoryId, index) => {
    if (atlasCategoryIds.has(categoryId)) {
      addIssue(
        ctx,
        ['partitions', 'products', 'replace', 'atlas', 'categoryIds', index],
        `duplicate Atlas category id "${categoryId}"`,
      )
    }
    atlasCategoryIds.add(categoryId)
    if (hasKnowledgeReplacement && !knowledge.categoryIds.has(categoryId)) {
      addIssue(
        ctx,
        ['partitions', 'products', 'replace', 'atlas', 'categoryIds', index],
        `unknown category id "${categoryId}" in replacement knowledge`,
      )
    }
  })
  if (products.atlas.hintText) {
    checkLocalizedText(
      ctx,
      products.atlas.hintText,
      ['partitions', 'products', 'replace', 'atlas', 'hintText'],
      supportedLocales,
    )
  }
  if (products.catalog.hintText) {
    checkLocalizedText(
      ctx,
      products.catalog.hintText,
      ['partitions', 'products', 'replace', 'catalog', 'hintText'],
      supportedLocales,
    )
  }
}

function checkIntegrations(
  ctx: z.RefinementCtx,
  integrations: z.infer<typeof ProjectIntegrationsSchema> | undefined,
  appendedAssets: Map<string, RuntimeAuthoringFile>,
  supportedLocales: string[] | undefined,
): void {
  const share = integrations?.share
  if (!share) return
  if (share.title) {
    checkLocalizedText(
      ctx,
      share.title,
      ['partitions', 'integrations', 'replace', 'share', 'title'],
      supportedLocales,
    )
  }
  if (share.description) {
    checkLocalizedText(
      ctx,
      share.description,
      ['partitions', 'integrations', 'replace', 'share', 'description'],
      supportedLocales,
    )
  }
  if (share.imageAssetId) {
    checkAppendedAsset(ctx, appendedAssets, share.imageAssetId, 'image', [
      'partitions',
      'integrations',
      'replace',
      'share',
      'imageAssetId',
    ])
  }
}

function checkAppendedAsset(
  ctx: z.RefinementCtx,
  assets: Map<string, RuntimeAuthoringFile>,
  assetId: string,
  expectedKind: RuntimeAuthoringFile['kind'],
  path: Array<string | number>,
): RuntimeAuthoringFile | undefined {
  const asset = assets.get(assetId)
  if (asset && asset.kind !== expectedKind) {
    addIssue(ctx, path, `appended runtime asset "${assetId}" must have kind "${expectedKind}"`)
  }
  return asset
}

function checkAssetId(
  ctx: z.RefinementCtx,
  value: string,
  path: Array<string | number>,
  label: string,
): void {
  if (!AssetIdSchema.safeParse(value).success) {
    addIssue(ctx, path, `${label} must be a safe asset-style id`)
  }
}
