import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReviewSessionResource } from '../../../../automation/contracts/review-session-v1'
import { ApiError, apiFetch } from '../../lib/api-client'

export const reviewKeys = {
  all: ['review-sessions'] as const,
  detail: (reviewId: string) => [...reviewKeys.all, reviewId] as const,
}

export function useReviewSession(reviewId: string) {
  return useQuery({
    queryKey: reviewKeys.detail(reviewId),
    queryFn: () =>
      apiFetch<ReviewSessionResource>(
        `/automation/v1/review-sessions/${encodeURIComponent(reviewId)}`,
      ),
    enabled: Boolean(reviewId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })
}

export interface ApproveReviewInput {
  expectedRevision: number
  notes?: string
}

export function useApproveReviewSession(reviewId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ApproveReviewInput) =>
      apiFetch<ReviewSessionResource>(
        `/automation/v1/review-sessions/${encodeURIComponent(reviewId)}/approve`,
        {
          method: 'POST',
          body: input.notes ? { notes: input.notes } : {},
          expectedRevision: input.expectedRevision,
        },
      ),
    retry: false,
    onSuccess: session => {
      queryClient.setQueryData(reviewKeys.detail(reviewId), session)
    },
    onError: error => {
      if (
        error instanceof ApiError &&
        (error.code === 'REVISION_CONFLICT' || error.code === 'REVIEW_ALREADY_APPROVED')
      ) {
        void queryClient.refetchQueries({ queryKey: reviewKeys.detail(reviewId), exact: true })
      }
    },
  })
}
