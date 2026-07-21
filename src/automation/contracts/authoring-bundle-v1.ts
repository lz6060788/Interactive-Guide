import { z } from 'zod'
import { ExperienceRouteSchema } from '../../domain/experience-navigation.js'
import {
  AssetIdSchema,
  AtlasProductConfigSchema,
  CameraBoundsSchema,
  CatalogProductConfigSchema,
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

export const GUIDE_AUTHORING_BUNDLE_CONTRACT = 'guide-authoring-bundle' as const
export const GUIDE_AUTHORING_BUNDLE_VERSION = '1.0.0' as const

export const AuthoringBlobSha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
export const AuthoringBlobSizeSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

const OriginalFileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    value =>
      value !== '.' &&
      value !== '..' &&
      !value.includes('/') &&
      !value.includes('\\') &&
      !value.includes('\0'),
    'originalName must be a file name, not a path',
  )

const MediaTypeSchema = z.string().trim().min(1).max(255)
const AssetExtensionSchema = z
  .string()
  .regex(/^[a-z0-9]{1,10}$/, 'extension must be 1-10 lowercase alphanumeric characters')

export const RuntimeAssetSemanticRoleSchema = z.enum([
  'panorama-image',
  'html-scene-bundle',
  'transition-video',
  'transition-poster',
  'share-image',
])

export const AuthoringSourceSemanticRoleSchema = z.enum([
  'knowledge-source',
  'hotspot-map',
  'callout-map',
  'focusrect-map',
])

export const RuntimeAuthoringFileSchema = z
  .object({
    usage: z.literal('runtime'),
    assetId: AssetIdSchema,
    kind: z.enum(['image', 'video', 'html-bundle']),
    blobSha256: AuthoringBlobSha256Schema,
    size: AuthoringBlobSizeSchema,
    mimeType: MediaTypeSchema,
    extension: AssetExtensionSchema,
    semanticRole: RuntimeAssetSemanticRoleSchema,
    originalName: OriginalFileNameSchema,
  })
  .strict()

export const AuthoringSourceFileSchema = z
  .object({
    usage: z.literal('authoring-source'),
    fileRef: AssetIdSchema,
    blobSha256: AuthoringBlobSha256Schema,
    size: AuthoringBlobSizeSchema,
    mediaType: MediaTypeSchema,
    semanticRole: AuthoringSourceSemanticRoleSchema,
    originalName: OriginalFileNameSchema,
  })
  .strict()

/**
 * Files cross the automation boundary only as content-addressed blobs. Paths
 * intentionally are not part of the contract, so a bundle is portable across
 * machines and an installed Skill never needs Workbench filesystem access.
 */
export const AuthoringFileSchema = z.discriminatedUnion('usage', [
  RuntimeAuthoringFileSchema,
  AuthoringSourceFileSchema,
])

const AuthoringCategoryExperienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('panorama') }).strict(),
  z
    .object({
      kind: z.literal('html-scene'),
      sceneId: AssetIdSchema,
      viewId: AssetIdSchema,
    })
    .strict(),
])

export const AuthoringIndustryItemSchema = z
  .object({
    id: AssetIdSchema,
    title: LocalizedTextSchema,
    description: LocalizedTextSchema,
  })
  .strict()

export const AuthoringIndustryCategorySchema = z
  .object({
    id: AssetIdSchema,
    title: LocalizedTextSchema,
    description: LocalizedTextSchema.optional(),
    experience: AuthoringCategoryExperienceSchema,
    items: z.array(AuthoringIndustryItemSchema),
  })
  .strict()

function authoringStageSchema<Key extends 'upstream' | 'midstream' | 'downstream'>(key: Key) {
  return z
    .object({
      key: z.literal(key),
      label: LocalizedTextSchema,
      categories: z.array(AuthoringIndustryCategorySchema),
    })
    .strict()
}

export const AuthoringKnowledgeSchema = z
  .object({
    stages: z.tuple([
      authoringStageSchema('upstream'),
      authoringStageSchema('midstream'),
      authoringStageSchema('downstream'),
    ]),
  })
  .strict()

export const AuthoringPanoramaSchema = z
  .object({
    imageAssetId: AssetIdSchema,
    cameraBounds: CameraBoundsSchema.strict().optional(),
    initialViewport: ViewportSchema.strict().optional(),
  })
  .strict()

const CategorySpatialEntrySchema = z
  .object({
    categoryId: AssetIdSchema,
    layout: CategorySpatialLayoutSchema.strict(),
  })
  .strict()

const ItemSpatialEntrySchema = z
  .object({
    itemId: AssetIdSchema,
    layout: ItemSpatialLayoutSchema.strict(),
  })
  .strict()

export const AuthoringSpatialSchema = z
  .object({
    categories: z.array(CategorySpatialEntrySchema).optional(),
    items: z.array(ItemSpatialEntrySchema).optional(),
  })
  .strict()

export const AuthoringProductsSchema = z
  .object({
    atlas: AtlasProductConfigSchema.strict(),
    catalog: CatalogProductConfigSchema.strict(),
  })
  .strict()

const AuthoringProjectIdentitySchema = z
  .object({
    id: ProjectIdSchema,
    version: ProjectVersionSchema,
    title: LocalizedTextSchema,
    localization: LocalizationConfigSchema.strict(),
  })
  .strict()

const AuthoringNavigationSchema = z
  .object({
    routes: z.array(ExperienceRouteSchema.strict()),
  })
  .strict()

export const GuideAuthoringBundleV1Schema = z
  .object({
    contract: z.literal(GUIDE_AUTHORING_BUNDLE_CONTRACT),
    contractVersion: z.literal(GUIDE_AUTHORING_BUNDLE_VERSION),
    idempotencyKey: z.string().uuid(),
    expectedRevision: z.literal(0),
    project: AuthoringProjectIdentitySchema,
    knowledge: AuthoringKnowledgeSchema,
    files: z.array(AuthoringFileSchema).min(1),
    panorama: AuthoringPanoramaSchema,
    spatial: AuthoringSpatialSchema.optional(),
    scenes: z.array(HtmlScenePackageSchema.strict()).optional(),
    navigation: AuthoringNavigationSchema.optional(),
    products: AuthoringProductsSchema.optional(),
    integrations: ProjectIntegrationsSchema.strict().optional(),
  })
  .strict()
  .superRefine((bundle, ctx) => {
    const supportedLocales = bundle.project.localization.supportedLocales
    const supportedLocaleSet = new Set(supportedLocales)
    if (!supportedLocaleSet.has(bundle.project.localization.defaultLocale)) {
      addIssue(
        ctx,
        ['project', 'localization', 'defaultLocale'],
        'defaultLocale must be included in supportedLocales',
      )
    }
    if (supportedLocaleSet.size !== supportedLocales.length) {
      addIssue(
        ctx,
        ['project', 'localization', 'supportedLocales'],
        'supportedLocales must not contain duplicates',
      )
    }

    checkLocalizedText(ctx, bundle.project.title, ['project', 'title'], supportedLocales)

    const categoryIds = new Set<string>()
    const itemIds = new Set<string>()
    const itemCategoryById = new Map<string, string>()
    const categoryExperiences: Array<{
      path: Array<string | number>
      experience: z.infer<typeof AuthoringCategoryExperienceSchema>
    }> = []

    bundle.knowledge.stages.forEach((stage, stageIndex) => {
      checkLocalizedText(
        ctx,
        stage.label,
        ['knowledge', 'stages', stageIndex, 'label'],
        supportedLocales,
      )
      stage.categories.forEach((category, categoryIndex) => {
        const categoryPath: Array<string | number> = [
          'knowledge',
          'stages',
          stageIndex,
          'categories',
          categoryIndex,
        ]
        if (categoryIds.has(category.id)) {
          addIssue(ctx, [...categoryPath, 'id'], `duplicate category id "${category.id}"`)
        }
        if (itemIds.has(category.id)) {
          addIssue(
            ctx,
            [...categoryPath, 'id'],
            `category id "${category.id}" conflicts with an item id`,
          )
        }
        categoryIds.add(category.id)
        checkLocalizedText(ctx, category.title, [...categoryPath, 'title'], supportedLocales)
        if (category.description) {
          checkLocalizedText(
            ctx,
            category.description,
            [...categoryPath, 'description'],
            supportedLocales,
          )
        }
        categoryExperiences.push({
          path: [...categoryPath, 'experience'],
          experience: category.experience,
        })

        category.items.forEach((item, itemIndex) => {
          const itemPath = [...categoryPath, 'items', itemIndex]
          if (itemIds.has(item.id)) {
            addIssue(ctx, [...itemPath, 'id'], `duplicate item id "${item.id}"`)
          }
          if (categoryIds.has(item.id)) {
            addIssue(ctx, [...itemPath, 'id'], `item id "${item.id}" conflicts with a category id`)
          }
          itemIds.add(item.id)
          itemCategoryById.set(item.id, category.id)
          checkLocalizedText(ctx, item.title, [...itemPath, 'title'], supportedLocales)
          checkLocalizedText(ctx, item.description, [...itemPath, 'description'], supportedLocales)
        })
      })
    })

    const runtimeAssets = new Map<
      string,
      Extract<z.infer<typeof AuthoringFileSchema>, { usage: 'runtime' }>
    >()
    const authoringFileRefs = new Set<string>()
    bundle.files.forEach((file, fileIndex) => {
      const filePath = ['files', fileIndex]
      if (file.usage === 'runtime') {
        if (runtimeAssets.has(file.assetId)) {
          addIssue(ctx, [...filePath, 'assetId'], `duplicate runtime asset id "${file.assetId}"`)
        }
        runtimeAssets.set(file.assetId, file)
        const expectedKind = expectedKindForRole(file.semanticRole)
        if (file.kind !== expectedKind) {
          addIssue(
            ctx,
            [...filePath, 'kind'],
            `semanticRole "${file.semanticRole}" requires kind "${expectedKind}"`,
          )
        }
      } else {
        if (authoringFileRefs.has(file.fileRef)) {
          addIssue(
            ctx,
            [...filePath, 'fileRef'],
            `duplicate authoring source fileRef "${file.fileRef}"`,
          )
        }
        authoringFileRefs.add(file.fileRef)
      }
    })

    requireRuntimeAsset(ctx, runtimeAssets, bundle.panorama.imageAssetId, 'image', [
      'panorama',
      'imageAssetId',
    ])
    const panoramaFile = runtimeAssets.get(bundle.panorama.imageAssetId)
    if (panoramaFile && panoramaFile.semanticRole !== 'panorama-image') {
      addIssue(
        ctx,
        ['panorama', 'imageAssetId'],
        'panorama.imageAssetId must reference a panorama-image runtime file',
      )
    }

    const categorySpatialIds = new Set<string>()
    bundle.spatial?.categories?.forEach((entry, index) => {
      if (!categoryIds.has(entry.categoryId)) {
        addIssue(
          ctx,
          ['spatial', 'categories', index, 'categoryId'],
          `unknown category id "${entry.categoryId}"`,
        )
      }
      if (categorySpatialIds.has(entry.categoryId)) {
        addIssue(
          ctx,
          ['spatial', 'categories', index, 'categoryId'],
          `duplicate category spatial entry "${entry.categoryId}"`,
        )
      }
      categorySpatialIds.add(entry.categoryId)
    })

    const itemSpatialIds = new Set<string>()
    bundle.spatial?.items?.forEach((entry, index) => {
      if (!itemIds.has(entry.itemId)) {
        addIssue(ctx, ['spatial', 'items', index, 'itemId'], `unknown item id "${entry.itemId}"`)
      }
      if (itemSpatialIds.has(entry.itemId)) {
        addIssue(
          ctx,
          ['spatial', 'items', index, 'itemId'],
          `duplicate item spatial entry "${entry.itemId}"`,
        )
      }
      itemSpatialIds.add(entry.itemId)
    })

    const scenesById = new Map<
      string,
      NonNullable<z.infer<typeof GuideAuthoringBundleV1Schema>['scenes']>[number]
    >()
    bundle.scenes?.forEach((scene, sceneIndex) => {
      const scenePath = ['scenes', sceneIndex]
      if (scenesById.has(scene.id)) {
        addIssue(ctx, [...scenePath, 'id'], `duplicate scene id "${scene.id}"`)
      }
      if (categoryIds.has(scene.id) || itemIds.has(scene.id)) {
        addIssue(
          ctx,
          [...scenePath, 'id'],
          `scene id "${scene.id}" conflicts with a category or item id`,
        )
      }
      scenesById.set(scene.id, scene)
      requireRuntimeAsset(ctx, runtimeAssets, scene.assetId, 'html-bundle', [
        ...scenePath,
        'assetId',
      ])
      const viewIds = new Set<string>()
      scene.views.forEach((view, viewIndex) => {
        const viewPath = [...scenePath, 'views', viewIndex]
        if (viewIds.has(view.id)) {
          addIssue(
            ctx,
            [...viewPath, 'id'],
            `duplicate view id "${view.id}" in scene "${scene.id}"`,
          )
        }
        viewIds.add(view.id)
        checkLocalizedText(ctx, view.title, [...viewPath, 'title'], supportedLocales)
        for (const [categoryIndex, categoryId] of view.categoryIds.entries()) {
          if (!categoryIds.has(categoryId)) {
            addIssue(
              ctx,
              [...viewPath, 'categoryIds', categoryIndex],
              `unknown category id "${categoryId}"`,
            )
          }
        }
        for (const itemId of Object.keys(view.itemFocusMap ?? {})) {
          if (!itemIds.has(itemId)) {
            addIssue(ctx, [...viewPath, 'itemFocusMap', itemId], `unknown item id "${itemId}"`)
          }
        }
      })
      checkLocalizedText(ctx, scene.title, [...scenePath, 'title'], supportedLocales)
    })

    for (const entry of categoryExperiences) {
      if (entry.experience.kind !== 'html-scene') continue
      const scene = scenesById.get(entry.experience.sceneId)
      if (!scene) {
        addIssue(ctx, [...entry.path, 'sceneId'], `unknown scene id "${entry.experience.sceneId}"`)
        continue
      }
      const viewId = entry.experience.viewId
      if (!scene.views.some(view => view.id === viewId)) {
        addIssue(
          ctx,
          [...entry.path, 'viewId'],
          `unknown view id "${viewId}" in scene "${scene.id}"`,
        )
      }
    }

    const routeIds = new Set<string>()
    bundle.navigation?.routes.forEach((route, routeIndex) => {
      const routePath = ['navigation', 'routes', routeIndex]
      if (routeIds.has(route.id)) {
        addIssue(ctx, [...routePath, 'id'], `duplicate route id "${route.id}"`)
      }
      if (categoryIds.has(route.id) || itemIds.has(route.id) || scenesById.has(route.id)) {
        addIssue(
          ctx,
          [...routePath, 'id'],
          `route id "${route.id}" conflicts with a category, item, or scene id`,
        )
      }
      routeIds.add(route.id)
      checkLocation(
        ctx,
        route.from,
        [...routePath, 'from'],
        categoryIds,
        itemIds,
        itemCategoryById,
        scenesById,
      )
      checkLocation(
        ctx,
        route.to,
        [...routePath, 'to'],
        categoryIds,
        itemIds,
        itemCategoryById,
        scenesById,
      )
      if (route.transition) {
        requireRuntimeAsset(ctx, runtimeAssets, route.transition.assetId, 'video', [
          ...routePath,
          'transition',
          'assetId',
        ])
        if (route.transition.posterAssetId) {
          requireRuntimeAsset(ctx, runtimeAssets, route.transition.posterAssetId, 'image', [
            ...routePath,
            'transition',
            'posterAssetId',
          ])
        }
      }
    })

    const atlasCategoryIds = new Set<string>()
    bundle.products?.atlas.categoryIds.forEach((categoryId, index) => {
      if (!categoryIds.has(categoryId)) {
        addIssue(
          ctx,
          ['products', 'atlas', 'categoryIds', index],
          `unknown category id "${categoryId}"`,
        )
      }
      if (atlasCategoryIds.has(categoryId)) {
        addIssue(
          ctx,
          ['products', 'atlas', 'categoryIds', index],
          `duplicate Atlas category id "${categoryId}"`,
        )
      }
      atlasCategoryIds.add(categoryId)
    })
    if (bundle.products) {
      const expectedStageOrder = ['upstream', 'midstream', 'downstream'] as const
      bundle.products.catalog.stageOrder.forEach((stageKey, index) => {
        if (stageKey !== expectedStageOrder[index]) {
          addIssue(
            ctx,
            ['products', 'catalog', 'stageOrder', index],
            `catalog stageOrder[${index}] must be "${expectedStageOrder[index]}"`,
          )
        }
      })
      if (bundle.products.atlas.hintText) {
        checkLocalizedText(
          ctx,
          bundle.products.atlas.hintText,
          ['products', 'atlas', 'hintText'],
          supportedLocales,
        )
      }
      if (bundle.products.catalog.hintText) {
        checkLocalizedText(
          ctx,
          bundle.products.catalog.hintText,
          ['products', 'catalog', 'hintText'],
          supportedLocales,
        )
      }
    }

    const share = bundle.integrations?.share
    if (share?.title) {
      checkLocalizedText(ctx, share.title, ['integrations', 'share', 'title'], supportedLocales)
    }
    if (share?.description) {
      checkLocalizedText(
        ctx,
        share.description,
        ['integrations', 'share', 'description'],
        supportedLocales,
      )
    }
    if (share?.imageAssetId) {
      requireRuntimeAsset(ctx, runtimeAssets, share.imageAssetId, 'image', [
        'integrations',
        'share',
        'imageAssetId',
      ])
    }
  })

export type GuideAuthoringBundleV1 = z.infer<typeof GuideAuthoringBundleV1Schema>
export type AuthoringFile = z.infer<typeof AuthoringFileSchema>

function expectedKindForRole(
  role: z.infer<typeof RuntimeAssetSemanticRoleSchema>,
): 'image' | 'video' | 'html-bundle' {
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

function addIssue(ctx: z.RefinementCtx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message })
}

function checkLocalizedText(
  ctx: z.RefinementCtx,
  text: Record<string, string>,
  path: Array<string | number>,
  supportedLocales: string[],
): void {
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

function requireRuntimeAsset(
  ctx: z.RefinementCtx,
  runtimeAssets: Map<string, Extract<z.infer<typeof AuthoringFileSchema>, { usage: 'runtime' }>>,
  assetId: string,
  kind: 'image' | 'video' | 'html-bundle',
  path: Array<string | number>,
): void {
  const asset = runtimeAssets.get(assetId)
  if (!asset) {
    addIssue(ctx, path, `runtime asset "${assetId}" is not declared in files`)
  } else if (asset.kind !== kind) {
    addIssue(ctx, path, `runtime asset "${assetId}" must have kind "${kind}"`)
  }
}

type SceneForReference = NonNullable<GuideAuthoringBundleV1['scenes']>[number]
type RouteLocation = z.infer<typeof ExperienceRouteSchema>['from']

function checkLocation(
  ctx: z.RefinementCtx,
  location: RouteLocation,
  path: Array<string | number>,
  categoryIds: Set<string>,
  itemIds: Set<string>,
  itemCategoryById: Map<string, string>,
  scenesById: Map<string, SceneForReference>,
): void {
  if (location.kind === 'panorama') {
    if (location.categoryId && !categoryIds.has(location.categoryId)) {
      addIssue(ctx, [...path, 'categoryId'], `unknown category id "${location.categoryId}"`)
    }
    if (location.itemId && !itemIds.has(location.itemId)) {
      addIssue(ctx, [...path, 'itemId'], `unknown item id "${location.itemId}"`)
    }
    if (
      location.categoryId &&
      location.itemId &&
      itemCategoryById.get(location.itemId) !== location.categoryId
    ) {
      addIssue(
        ctx,
        [...path, 'itemId'],
        `item "${location.itemId}" does not belong to category "${location.categoryId}"`,
      )
    }
    return
  }

  const scene = scenesById.get(location.sceneId)
  if (!scene) {
    addIssue(ctx, [...path, 'sceneId'], `unknown scene id "${location.sceneId}"`)
  } else if (location.viewId && !scene.views.some(view => view.id === location.viewId)) {
    addIssue(
      ctx,
      [...path, 'viewId'],
      `unknown view id "${location.viewId}" in scene "${scene.id}"`,
    )
  }
}
