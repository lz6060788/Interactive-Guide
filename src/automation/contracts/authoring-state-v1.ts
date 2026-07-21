import { z } from 'zod'
import { ExperienceRouteSchema } from '../../domain/experience-navigation.js'
import {
  AssetIdSchema,
  CameraBoundsSchema,
  HtmlScenePackageSchema,
  LocalizationConfigSchema,
  LocalizedTextSchema,
  ProjectIdSchema,
  ProjectIntegrationsSchema,
  ProjectVersionSchema,
  ViewportSchema,
} from '../../domain/project-schema.js'
import {
  AuthoringBlobSha256Schema,
  AuthoringKnowledgeSchema,
  AuthoringProductsSchema,
  AuthoringSourceFileSchema,
  AuthoringSpatialSchema,
} from './authoring-bundle-v1.js'

export const GUIDE_AUTHORING_STATE_CONTRACT = 'guide-authoring-state' as const
export const GUIDE_AUTHORING_STATE_VERSION = '1.0.0' as const
export const PROJECT_TREE_HASH_ALGORITHM = 'sha256-path-length-content-v1' as const

const PortableRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    value =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'),
    'entryPath must be a portable relative path',
  )

const IsoTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value)

export const AuthoringRuntimeAssetStateSchema = z
  .object({
    assetId: AssetIdSchema,
    kind: z.enum(['image', 'video', 'html-bundle']),
    entryPath: PortableRelativePathSchema.optional(),
    mimeType: z.string().trim().min(1).max(255).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    sha256: AuthoringBlobSha256Schema.optional(),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict()

export const AuthoringSourceStateSchema = AuthoringSourceFileSchema.omit({ usage: true })

const AuthoringStateProjectSchema = z
  .object({
    title: LocalizedTextSchema,
    version: ProjectVersionSchema,
    localization: LocalizationConfigSchema.strict(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .strict()

const AuthoringStatePanoramaSchema = z
  .object({
    imageAssetId: AssetIdSchema.nullable(),
    cameraBounds: CameraBoundsSchema.strict(),
    initialViewport: ViewportSchema.strict(),
  })
  .strict()

/**
 * Stable, path-free read model for automation clients. It deliberately omits
 * AssetDefinition.sourcePath and every Workbench-local filesystem location.
 */
export const GuideAuthoringStateV1Schema = z
  .object({
    contract: z.literal(GUIDE_AUTHORING_STATE_CONTRACT),
    contractVersion: z.literal(GUIDE_AUTHORING_STATE_VERSION),
    workbenchVersion: z.string().min(1),
    projectId: ProjectIdSchema,
    revision: z.number().int().positive(),
    projectSha256: AuthoringBlobSha256Schema,
    projectTreeSha256: AuthoringBlobSha256Schema,
    projectTreeHashAlgorithm: z.literal(PROJECT_TREE_HASH_ALGORITHM),
    project: AuthoringStateProjectSchema,
    knowledge: AuthoringKnowledgeSchema,
    runtimeAssets: z.array(AuthoringRuntimeAssetStateSchema),
    panorama: AuthoringStatePanoramaSchema,
    spatial: AuthoringSpatialSchema.extend({
      categories: AuthoringSpatialSchema.shape.categories.unwrap(),
      items: AuthoringSpatialSchema.shape.items.unwrap(),
    }).strict(),
    scenes: z.array(HtmlScenePackageSchema.strict()),
    navigation: z.object({ routes: z.array(ExperienceRouteSchema.strict()) }).strict(),
    products: AuthoringProductsSchema,
    integrations: ProjectIntegrationsSchema.strict(),
    authoringSources: z.array(AuthoringSourceStateSchema),
  })
  .strict()
  .superRefine((state, ctx) => {
    requireUnique(
      ctx,
      state.runtimeAssets.map(asset => asset.assetId),
      ['runtimeAssets'],
    )
    requireUnique(
      ctx,
      state.authoringSources.map(source => source.fileRef),
      ['authoringSources'],
    )
  })

export type GuideAuthoringStateV1 = z.infer<typeof GuideAuthoringStateV1Schema>
export type AuthoringRuntimeAssetState = z.infer<typeof AuthoringRuntimeAssetStateSchema>
export type AuthoringSourceState = z.infer<typeof AuthoringSourceStateSchema>

function requireUnique(ctx: z.RefinementCtx, values: string[], path: string[]): void {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (seen.has(value)) {
      ctx.addIssue({ code: 'custom', path: [...path, index], message: `duplicate id "${value}"` })
    }
    seen.add(value)
  })
}
