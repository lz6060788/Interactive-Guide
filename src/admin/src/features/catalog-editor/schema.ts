/**
 * Zod schemas for catalog-editor forms.
 */
import { z } from 'zod'

export const CatalogConfigFormSchema = z.object({
  hintText: z.string().max(200),
  listDensity: z.enum(['compact', 'comfortable']),
  focusVariant: z.enum(['rect', 'pill']),
  viewportWidth: z.number().int().min(240).max(2400),
  viewportHeight: z.number().int().min(320).max(4000),
  maskOpacity: z.number().min(0).max(1),
  viewportAnimationMs: z.number().int().min(0).max(2000),
  listActivation: z.enum(['center-nearest']),
  markerActivation: z.boolean(),
  showToolbar: z.boolean(),
  showZoomIndicator: z.boolean(),
  showHints: z.boolean(),
})

export type CatalogConfigForm = z.infer<typeof CatalogConfigFormSchema>