/**
 * Catalog-editor API hooks.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api-client'
import type {
  GuideProject,
  CatalogProductConfig,
  IndustryChain,
  PanoramaModel,
} from '@domain/project-types'

export const catalogKeys = {
  project: (id: string) => ['projects', 'detail', id] as const,
  catalogConfig: (id: string) => ['projects', 'detail', id, 'catalog-config'] as const,
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: catalogKeys.project(projectId),
    queryFn: () => apiFetch<GuideProject>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  })
}

export function useUpdateCatalogConfig(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { catalog: CatalogProductConfig; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/products/catalog`, {
        method: 'PUT',
        body: input.catalog,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: (project) => {
      qc.setQueryData(catalogKeys.project(projectId), project)
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
      qc.setQueryData(catalogKeys.project(projectId), project)
    },
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
    onSuccess: project => {
      qc.setQueryData(catalogKeys.project(projectId), project)
    },
  })
}
