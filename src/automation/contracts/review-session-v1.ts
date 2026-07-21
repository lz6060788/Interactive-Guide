import { z } from 'zod'
import { ProjectIdSchema } from '../../domain/project-schema.js'

export const REVIEW_SESSION_SCHEMA_VERSION = '1.0.0' as const
export const REVIEW_PROJECT_HASH_ALGORITHM = 'sha256-stable-json-v1' as const
export const REVIEW_ASSET_HASH_ALGORITHM = 'sha256-asset-tree-v1' as const
export const ReviewIdSchema = z
  .string()
  .regex(/^review-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

export const ReviewApprovalSchema = z.object({
  approvedRevision: z.number().int().nonnegative(),
  approvedWorkbenchVersion: z.string().min(1),
  approvedProjectSha256: z.string().regex(/^[a-f0-9]{64}$/),
  approvedAssetClosureSha256: z.string().regex(/^[a-f0-9]{64}$/),
  hashAlgorithm: z.literal(REVIEW_PROJECT_HASH_ALGORITHM),
  assetHashAlgorithm: z.literal(REVIEW_ASSET_HASH_ALGORITHM),
  approvedAt: z.string().min(1),
  notes: z.string().max(2000).optional(),
})

export const ReviewSessionRecordSchema = z.object({
  schemaVersion: z.literal(REVIEW_SESSION_SCHEMA_VERSION),
  id: ReviewIdSchema,
  projectId: ProjectIdSchema,
  openedRevision: z.number().int().nonnegative(),
  openedAt: z.string().min(1),
  approval: ReviewApprovalSchema.optional(),
})

export type ReviewSessionRecord = z.infer<typeof ReviewSessionRecordSchema>
export type ReviewSessionStatus = 'pending' | 'approved' | 'stale'
export type ReviewStaleReason =
  | 'WORKBENCH_VERSION_CHANGED'
  | 'REVISION_CHANGED'
  | 'PROJECT_HASH_CHANGED'
  | 'ASSET_CLOSURE_CHANGED'

export const ReviewApprovalReceiptSchema = z
  .object({
    reviewId: ReviewIdSchema,
    approvedRevision: z.number().int().nonnegative(),
    approvedWorkbenchVersion: z.string().min(1),
    approvedProjectSha256: z.string().regex(/^[a-f0-9]{64}$/),
    approvedAssetClosureSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

export type ReviewApprovalReceipt = z.infer<typeof ReviewApprovalReceiptSchema>

export interface ReviewSessionView {
  schemaVersion: typeof REVIEW_SESSION_SCHEMA_VERSION
  id: string
  projectId: string
  status: ReviewSessionStatus
  openedRevision: number
  currentRevision: number
  openedAt: string
  approvedRevision?: number
  approvedWorkbenchVersion?: string
  approvedProjectSha256?: string
  approvedAssetClosureSha256?: string
  hashAlgorithm?: typeof REVIEW_PROJECT_HASH_ALGORITHM
  assetHashAlgorithm?: typeof REVIEW_ASSET_HASH_ALGORITHM
  approvedAt?: string
  notes?: string
  staleReason?: ReviewStaleReason
}

export interface ReviewSessionResource extends ReviewSessionView {
  reviewPath: string
  reviewUrl: string
}
