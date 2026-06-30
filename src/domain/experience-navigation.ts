/**
 * ExperienceNavigation — finite union of experience locations and routes.
 *
 * Replaces the legacy KnowledgeEdge graph. Locations are restricted to a
 * closed union so that no general-purpose graph editor can sneak back in.
 */
import { z } from 'zod'

export const ExperienceLocationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('panorama'),
    categoryId: z.string().min(1).optional(),
    itemId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('scene'),
    sceneId: z.string().min(1),
    viewId: z.string().min(1).optional(),
  }),
])

export type ExperienceLocation = z.infer<typeof ExperienceLocationSchema>

export const ExperienceRouteSchema = z.object({
  id: z.string().min(1),
  from: ExperienceLocationSchema,
  to: ExperienceLocationSchema,
  transition: z
    .object({
      kind: z.literal('video'),
      assetId: z.string().min(1),
      posterAssetId: z.string().min(1).optional(),
      timeoutMs: z.number().int().positive().optional(),
      onFailure: z.enum(['abort-navigation', 'cut']),
    })
    .optional(),
})

export type ExperienceRoute = z.infer<typeof ExperienceRouteSchema>

export interface ExperienceNavigation {
  routes: ExperienceRoute[]
}

export const ExperienceNavigationSchema: z.ZodType<ExperienceNavigation> = z.object({
  routes: z.array(ExperienceRouteSchema),
})

/**
 * Linear-scan route match. The first route whose `from` and `to` both
 * match the requested locations is returned. `matchAll` only enforces
 * structural equality on the discriminator keys; for finer matching
 * (e.g. specific categoryId) the caller must check the returned route.
 */
export function matchRoute(
  navigation: ExperienceNavigation,
  from: ExperienceLocation,
  to: ExperienceLocation,
): ExperienceRoute | undefined {
  return navigation.routes.find((r) => locationEquals(r.from, from) && locationEquals(r.to, to))
}

export function listRoutesFrom(
  navigation: ExperienceNavigation,
  from: ExperienceLocation,
): ExperienceRoute[] {
  return navigation.routes.filter((r) => locationEquals(r.from, from))
}

function locationEquals(a: ExperienceLocation, b: ExperienceLocation): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'panorama' && b.kind === 'panorama') {
    return a.categoryId === b.categoryId && a.itemId === b.itemId
  }
  if (a.kind === 'scene' && b.kind === 'scene') {
    return a.sceneId === b.sceneId && a.viewId === b.viewId
  }
  return false
}
