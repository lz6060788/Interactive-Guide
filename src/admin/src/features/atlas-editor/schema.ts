/**
 * Zod schemas for atlas-editor forms.
 *
 * The runtime project is already validated server-side via GuideProjectSchema.
 * Here we only need lightweight schemas for the operator-facing forms:
 * hotspot patch, viewport patch, and atlas-config patch.
 */
import { z } from 'zod'

export const NormalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

export const HotspotFormSchema = z.object({
  enabled: z.boolean(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

export const ViewportFormSchema = z.object({
  centerX: z.number().min(0).max(1),
  centerY: z.number().min(0).max(1),
  zoom: z.number().min(1).max(4),
})

export const CalloutFormSchema = z.object({
  enabled: z.boolean(),
  markerPosition: z.enum(['top', 'bottom']),
  markerGapPx: z.number().int().min(0).max(64),
})

export const AtlasConfigFormSchema = z.object({
  hintText: z.string().max(200),
  hotspotVariant: z.enum(['default', 'highlight', 'minimal']),
  calloutVariant: z.enum(['classic', 'connector', 'none']),
  viewportWidth: z.number().int().min(240).max(2400),
  viewportHeight: z.number().int().min(320).max(4000),
  wheelZoom: z.boolean(),
  dragPan: z.boolean(),
  pinchZoom: z.boolean(),
  resetCameraEnabled: z.boolean(),
  showToolbar: z.boolean(),
  showZoomIndicator: z.boolean(),
  showHints: z.boolean(),
})

export type HotspotForm = z.infer<typeof HotspotFormSchema>
export type ViewportForm = z.infer<typeof ViewportFormSchema>
export type CalloutForm = z.infer<typeof CalloutFormSchema>
export type AtlasConfigForm = z.infer<typeof AtlasConfigFormSchema>
