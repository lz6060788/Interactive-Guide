/**
 * React Query client config.
 *
 * Single source of truth for cache defaults. Stale/gc times are tuned
 * per queryKey in feature hooks (see features/{name}/api), not here.
 */
import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api-client'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            // Don't retry client errors; only network/transient
            if (error.status >= 400 && error.status < 500) return false
          }
          return failureCount < 2
        },
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      mutations: {
        retry: false,
      },
    },
  })
}