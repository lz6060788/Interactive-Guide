import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AtlasProductConfig,
  ExperienceNavigation,
  GalleryProductConfig,
  GuideProject,
  HtmlScenePackage,
  IndustryChain,
  PanoramaModel,
} from '@domain/project-types'
import { apiFetch } from '../../lib/api-client'

const projectKey = (id: string) => ['projects', 'detail', id] as const

export function useGalleryProject(projectId: string) {
  return useQuery({
    queryKey: projectKey(projectId),
    queryFn: () => apiFetch<GuideProject>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  })
}

export function useUpdateGalleryConfig(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { gallery: GalleryProductConfig; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/products/gallery`, {
        method: 'PUT',
        body: input.gallery,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: project => queryClient.setQueryData(projectKey(projectId), project),
  })
}

export function useUpdateGalleryKnowledge(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { knowledge: IndustryChain; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/knowledge`, {
        method: 'PUT',
        body: input.knowledge,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: project => queryClient.setQueryData(projectKey(projectId), project),
  })
}

export function useUpdateGalleryPanorama(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { panorama: PanoramaModel; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/panorama`, {
        method: 'PUT',
        body: input.panorama,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: project => queryClient.setQueryData(projectKey(projectId), project),
  })
}

export function useUpdateGalleryAtlasConfig(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { atlas: AtlasProductConfig; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/products/atlas`, {
        method: 'PUT',
        body: input.atlas,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: project => queryClient.setQueryData(projectKey(projectId), project),
  })
}

export function useUpdateGalleryNavigation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { navigation: ExperienceNavigation; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/navigation`, {
        method: 'PUT',
        body: input.navigation,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: project => queryClient.setQueryData(projectKey(projectId), project),
  })
}

export function useUpdateGalleryScenes(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { scenes: HtmlScenePackage[]; expectedRevision: number }) =>
      apiFetch<GuideProject>(`/projects/${projectId}/scenes`, {
        method: 'PUT',
        body: input.scenes,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: project => queryClient.setQueryData(projectKey(projectId), project),
  })
}
