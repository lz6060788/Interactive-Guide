/**
 * Zod schemas for the GuideProject 2.0 domain.
 *
 * This is the only place that defines the structural shape of a project.
 * Validators (project-validator.ts) and normalizers (project-normalizer.ts)
 * reuse these schemas and add business rules on top.
 */
import { z } from 'zod'
import { ExperienceNavigationSchema } from './experience-navigation.js'
import { SceneProtocolSchema } from './scene-protocol.js'

export const SchemaVersionSchema = z.literal('3.0.0')

const WINDOWS_RESERVED_SEGMENT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export const ProjectIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'project id must be a lowercase kebab-case path segment',
  )

export const ProjectVersionSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9._+-]*[A-Za-z0-9_+-])?$/,
    'project version must be a safe path segment',
  )
  .refine(value => !WINDOWS_RESERVED_SEGMENT.test(value), {
    message: 'project version must not use a reserved file name',
  })

export const AssetIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/, 'asset id must be a safe path segment')
  .refine(value => !WINDOWS_RESERVED_SEGMENT.test(value), {
    message: 'asset id must not use a reserved file name',
  })

export const LocalizedTextSchema = z.record(z.string().min(1), z.string())

export const LocalizationConfigSchema = z.object({
  defaultLocale: z.string().min(1),
  supportedLocales: z.array(z.string().min(1)).min(1),
})

export const NormalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

export const NormalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
})

export const CoordinateSpaceSchema = z.literal('normalized')

const AssetSourcePathSchema = z
  .string()
  .min(1)
  .refine(value => {
    const normalized = value.replaceAll('\\', '/')
    const segments = normalized.split('/')
    return (
      !normalized.startsWith('/') &&
      !/^[A-Za-z]:\//.test(normalized) &&
      !segments.includes('..') &&
      !segments.includes('.')
    )
  }, 'asset sourcePath must be project-relative and must not contain traversal segments')

export const AssetDefinitionSchema = z.object({
  id: AssetIdSchema,
  kind: z.enum(['image', 'video', 'html-bundle']),
  sourcePath: AssetSourcePathSchema,
  entryPath: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  size: z.number().int().nonnegative().optional(),
})

export const AssetRegistrySchema = z
  .object({
    byId: z.record(AssetIdSchema, AssetDefinitionSchema),
  })
  .superRefine((registry, ctx) => {
    for (const [key, definition] of Object.entries(registry.byId)) {
      if (key !== definition.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['byId', key, 'id'],
          message: `asset registry key "${key}" must equal definition id "${definition.id}"`,
        })
      }
    }
  })

export const ViewportSchema = z.object({
  centerX: z.number().min(0).max(1),
  centerY: z.number().min(0).max(1),
  zoom: z.number().positive(),
})

export const CameraBoundsSchema = z
  .object({
    minZoom: z.number().positive(),
    maxZoom: z.number().positive(),
  })
  .refine(b => b.maxZoom > b.minZoom, {
    message: 'maxZoom must be greater than minZoom',
  })

export const ItemCalloutSchema = z.object({
  markerPosition: z.enum(['top', 'bottom']),
  markerGapPx: z.number().int().min(0).max(64),
  minZoom: z.number().positive().optional(),
})

export const CategorySpatialLayoutSchema = z.object({
  viewport: ViewportSchema,
  hotspot: NormalizedPointSchema.optional(),
  hotspotMinZoom: z.number().positive().optional(),
})

export const ItemSpatialLayoutSchema = z.object({
  marker: NormalizedPointSchema,
  // Catalog-only focus rect. Optional at the project level: catalog items
  // must provide it (catalog compiler skips items missing focusRect),
  // atlas-only items can omit it.
  focusRect: NormalizedRectSchema.optional(),
  // Catalog-only background camera for the selected item.
  viewportOverride: ViewportSchema.optional(),
  callout: ItemCalloutSchema.optional(),
  markerMinZoom: z.number().positive().optional(),
})

export const PanoramaModelSchema = z.object({
  // panorama.assetId may be '' on a freshly-created empty draft; the
  // release-tier validator (checkPanoramaAsset) rejects empty values.
  assetId: z.string(),
  coordinateSpace: CoordinateSpaceSchema,
  cameraBounds: CameraBoundsSchema,
  initialViewport: ViewportSchema,
  categories: z.record(z.string(), CategorySpatialLayoutSchema),
  items: z.record(z.string(), ItemSpatialLayoutSchema),
})

export const IndustryStageKeySchema = z.enum(['upstream', 'midstream', 'downstream'])

export const CategoryExperienceBindingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('panorama') }),
  z.object({
    kind: z.literal('html-scene'),
    sceneId: z.string().min(1),
    viewId: z.string().min(1),
  }),
])

export const IndustryItemSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  title: LocalizedTextSchema,
  description: LocalizedTextSchema,
  order: z.number().int().nonnegative(),
})

export const IndustryCategorySchema = z.object({
  id: z.string().min(1),
  title: LocalizedTextSchema,
  order: z.number().int().nonnegative(),
  description: LocalizedTextSchema.optional(),
  itemIds: z.array(z.string().min(1)),
  experience: CategoryExperienceBindingSchema,
})

export const IndustryStageSchema = z.object({
  key: IndustryStageKeySchema,
  label: LocalizedTextSchema,
  order: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  categories: z.array(IndustryCategorySchema),
})

export const IndustryChainSchema = z.object({
  stages: z.tuple([IndustryStageSchema, IndustryStageSchema, IndustryStageSchema]),
  items: z.record(z.string(), IndustryItemSchema),
})

export const SceneFocusCommandSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const SceneChromeConfigSchema = z.object({
  textColor: z.string().optional(),
})

export const HtmlSceneViewSchema = z.object({
  // id/title/activationMessage.type may be '' while the user is typing
  // (transient empty state mid-edit). Release-tier validation
  // (checkUniqueIds / checkSceneReferences) catches dangling refs at
  // publish time.
  id: z.string(),
  title: LocalizedTextSchema,
  activationMessage: z.object({
    type: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
  categoryIds: z.array(z.string().min(1)),
  itemFocusMap: z.record(z.string(), SceneFocusCommandSchema).optional(),
  chrome: SceneChromeConfigSchema.optional(),
})

export const HtmlScenePackageSchema = z.object({
  id: z.string().min(1),
  title: LocalizedTextSchema,
  // assetId may be '' on a freshly-created scene that has not yet been
  // paired with an uploaded zip bundle. The release-tier validator
  // (checkSceneAsset in static-validator / project-validator) catches
  // dangling references at release time.
  assetId: z.string(),
  protocol: SceneProtocolSchema,
  views: z.array(HtmlSceneViewSchema).min(1),
})

export const ProductViewportConfigSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  backgroundColor: z.string().optional(),
})

export const ProductChromeConfigSchema = z.object({
  showToolbar: z.boolean().optional(),
  showZoomIndicator: z.boolean().optional(),
  showHints: z.boolean().optional(),
})

export const AtlasThemeSchema = z.object({
  hotspotVariant: z.enum(['default', 'highlight', 'minimal']),
  calloutVariant: z.enum(['classic', 'connector', 'none']),
  hotspotMinZoom: z.number().positive().optional(),
  calloutMinZoom: z.number().positive().optional(),
  itemMarkerMinZoom: z.number().positive().optional(),
  accentColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
})

export const CatalogThemeSchema = z.object({
  listDensity: z.enum(['compact', 'comfortable']),
  focusVariant: z.enum(['rect', 'pill']),
  accentColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  maskOpacity: z.number().min(0).max(1).optional(),
})

export const AtlasProductConfigSchema = z.object({
  enabled: z.literal(true),
  viewport: ProductViewportConfigSchema,
  theme: AtlasThemeSchema,
  chrome: ProductChromeConfigSchema,
  interaction: z.object({
    wheelZoom: z.boolean(),
    dragPan: z.boolean(),
    pinchZoom: z.boolean(),
    resetCameraEnabled: z.boolean(),
  }),
  categoryIds: z.array(z.string().min(1)),
  hintText: LocalizedTextSchema.optional(),
})

export const CatalogProductConfigSchema = z.object({
  enabled: z.literal(true),
  viewport: ProductViewportConfigSchema,
  theme: CatalogThemeSchema,
  chrome: ProductChromeConfigSchema,
  interaction: z.object({
    listActivation: z.literal('center-nearest'),
    markerActivation: z.boolean(),
    viewportAnimationMs: z.number().int().nonnegative(),
  }),
  stageOrder: z.tuple([IndustryStageKeySchema, IndustryStageKeySchema, IndustryStageKeySchema]),
  hintText: LocalizedTextSchema.optional(),
  atlasLaunchUrl: z.string().url().optional(),
})

export const AnalyticsConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.literal('weblog'),
  appKey: z.string().min(1),
  pageType: z.string().min(1),
  name: z.string().min(1),
  defaultSource: z.string().min(1),
})

export const ShareConfigSchema = z.object({
  enabled: z.boolean(),
  title: LocalizedTextSchema.optional(),
  description: LocalizedTextSchema.optional(),
  imageAssetId: z.string().optional(),
})

export const ProjectIntegrationsSchema = z.object({
  analytics: AnalyticsConfigSchema.optional(),
  share: ShareConfigSchema.optional(),
})

export const ProjectMetadataSchema = z.object({
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().nonnegative(),
  schemaVersion: SchemaVersionSchema,
})

export const GuideProjectSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    id: ProjectIdSchema,
    title: LocalizedTextSchema,
    version: ProjectVersionSchema,
    localization: LocalizationConfigSchema,
    knowledge: IndustryChainSchema,
    assets: AssetRegistrySchema,
    panorama: PanoramaModelSchema,
    scenes: z.array(HtmlScenePackageSchema),
    navigation: ExperienceNavigationSchema,
    products: z.object({
      atlas: AtlasProductConfigSchema,
      catalog: CatalogProductConfigSchema,
    }),
    integrations: ProjectIntegrationsSchema,
    metadata: ProjectMetadataSchema,
  })
  .strict()
  .superRefine((project, ctx) => {
    if (!project.localization.supportedLocales.includes(project.localization.defaultLocale)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['localization', 'defaultLocale'],
        message: 'defaultLocale must be included in supportedLocales',
      })
    }
    if (
      new Set(project.localization.supportedLocales).size !==
      project.localization.supportedLocales.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['localization', 'supportedLocales'],
        message: 'supportedLocales must not contain duplicates',
      })
    }
    if (!project.title[project.localization.defaultLocale]?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title', project.localization.defaultLocale],
        message: 'project title is required for defaultLocale',
      })
    }
    // Hard structural invariants that Zod's declarative shape cannot express.
    const expected: Array<['upstream', 1] | ['midstream', 2] | ['downstream', 3]> = [
      ['upstream', 1],
      ['midstream', 2],
      ['downstream', 3],
    ]
    project.knowledge.stages.forEach((stage, index) => {
      const [expectedKey, expectedOrder] = expected[index]
      if (stage.key !== expectedKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['knowledge', 'stages', index, 'key'],
          message: `stage[${index}].key must be "${expectedKey}"`,
        })
      }
      if (stage.order !== expectedOrder) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['knowledge', 'stages', index, 'order'],
          message: `stage[${index}].order must be ${expectedOrder}`,
        })
      }
    })
  })
