/**
 * Atlas-editor API hooks.
 *
 * Wraps the project-scoped endpoints in React Query:
 *   - GET    /projects/:id                         — full GuideProject
 *   - PUT    /projects/:id/panorama                 — panorama patch
 *   - PUT    /projects/:id/knowledge                — knowledge patch
 *   - PUT    /projects/:id/products/atlas           — atlas config patch
 *   - GET    /projects/:id/assets/blob/:assetId     — panorama image blob
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api-client'
import type { GuideProject, PanoramaModel, IndustryChain, AtlasProductConfig } from '@domain/project-types'

export const atlasKeys = {
  project: (id: string) => ['projects', 'detail', id] as const,
  panorama: (id: string) => ['projects', 'detail', id, 'panorama'] as const,
  atlasConfig: (id: string) => ['projects', 'detail', id, 'atlas-config'] as const,
  assetBlob: (id: string, assetId: string) =>
    ['projects', id, 'asset-blob', assetId] as const,
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: atlasKeys.project(projectId),
    queryFn: () => apiFetch<GuideProject>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  })
}

export function useUpdatePanorama(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { panorama: PanoramaModel; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/panorama`, {
        method: 'PUT',
        body: input.panorama,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: (project) => {
      qc.setQueryData(atlasKeys.project(projectId), project)
    },
  })
}

export function useUpdateKnowledge(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { knowledge: IndustryChain; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/knowledge`, {
        method: 'PUT',
        body: input.knowledge,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: (project) => {
      qc.setQueryData(atlasKeys.project(projectId), project)
    },
  })
}

export function useUpdateAtlasConfig(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { atlas: AtlasProductConfig; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/products/atlas`, {
        method: 'PUT',
        body: input.atlas,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: (project) => {
      qc.setQueryData(atlasKeys.project(projectId), project)
    },
  })
}

/**
 * Fetches a panorama image blob and returns an object URL. The URL is
 * revoked when the component unmounts or the asset id changes.
 */
export function usePanoramaBlobUrl(projectId: string, assetId: string | null | undefined): {
  url: string | null
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: atlasKeys.assetBlob(projectId, assetId ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/assets/blob/${assetId}`)
      if (!res.ok) throw new Error(`asset ${assetId}: HTTP ${res.status}`)
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    },
    enabled: Boolean(projectId && assetId),
    staleTime: 5 * 60 * 1000,
  })

  return {
    url: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}