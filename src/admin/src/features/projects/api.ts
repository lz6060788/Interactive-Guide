/**
 * Projects feature — API hooks.
 *
 * Each project resource lives at `/api/projects`. This module exposes
 * typed React Query hooks for list / get / create / update / delete
 * + asset upload / delete.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api-client'
import type {
  AssetDefinition,
  GuideProject,
  HtmlScenePackage,
  ExperienceNavigation,
} from '@domain/project-types'

export interface ListEntry {
  id: string
  title: string
  version: string
  locale: string
  revision: number
  updatedAt: string
  createdAt: string
  schemaVersion: string
}

export interface CreateInput {
  id: string
  title: string
  locale?: string
}

export interface UpdateMetadataInput {
  title?: string
  version?: string
  locale?: string
  expectedRevision: number
}

export const projectsKeys = {
  all: ['projects'] as const,
  list: () => [...projectsKeys.all, 'list'] as const,
  detail: (id: string) => [...projectsKeys.all, 'detail', id] as const,
}

export function useProjects() {
  return useQuery({
    queryKey: projectsKeys.list(),
    queryFn: () => apiFetch<ListEntry[]>('/projects'),
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectsKeys.detail(id),
    queryFn: () => apiFetch<GuideProject>(`/projects/${id}`),
    enabled: Boolean(id),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateInput) =>
      apiFetch<GuideProject>('/projects', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectsKeys.list() })
    },
  })
}

export function useUpdateProjectMetadata(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateMetadataInput) =>
      apiFetch<GuideProject>(`/projects/${id}/metadata`, {
        method: 'PATCH',
        body: input,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: (next) => {
      qc.setQueryData(projectsKeys.detail(id), next)
      void qc.invalidateQueries({ queryKey: projectsKeys.list() })
    },
  })
}

export function useDeleteProject(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: projectsKeys.detail(id) })
      void qc.invalidateQueries({ queryKey: projectsKeys.list() })
    },
  })
}

// ─── Assets ─────────────────────────────────────────────────

export type AssetKind = 'image' | 'video' | 'html-bundle'

export interface UploadAssetInput {
  kind: AssetKind
  assetId: string
  expectedRevision: number
  file: File
}

export function useUploadAsset(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UploadAssetInput) => {
      const buf = await input.file.arrayBuffer()
      const search = new URLSearchParams({
        id: input.assetId,
        expectedRevision: String(input.expectedRevision),
        filename: input.file.name,
      })
      const path = `/projects/${id}/assets/${input.kind}?${search.toString()}`
      const res = await fetch(`/api${path}`, {
        method: 'POST',
        headers: { 'Content-Type': input.file.type || 'application/octet-stream' },
        body: buf,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as
          | { error?: string; code?: string }
          | null
        throw new Error(body?.error ?? body?.code ?? `HTTP_${res.status}`)
      }
      const json = (await res.json()) as { data: AssetDefinition }
      return json.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectsKeys.detail(id) })
    },
  })
}

export interface DeleteAssetInput {
  assetId: string
  expectedRevision: number
}

export function useDeleteAsset(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DeleteAssetInput) => {
      const search = new URLSearchParams({
        expectedRevision: String(input.expectedRevision),
      })
      return apiFetch<{ ok: true }>(
        `/projects/${id}/assets/${input.assetId}?${search.toString()}`,
        { method: 'DELETE' },
      )
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectsKeys.detail(id) })
    },
  })
}

export function assetBlobUrl(projectId: string, assetId: string): string {
  return `/api/projects/${projectId}/assets/blob/${assetId}`
}

export function assetHtmlBundleFileUrl(
  projectId: string,
  assetId: string,
  filePath: string = 'index.html',
): string {
  const normalized = filePath.replace(/^\/+/, '')
  return `/api/projects/${projectId}/assets/html-bundle/${assetId}/${normalized}`
}

// ─── Scenes ────────────────────────────────────────────────

export interface UpdateScenesInput {
  scenes: HtmlScenePackage[]
  expectedRevision: number
}

export function useUpdateProjectScenes(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateScenesInput) =>
      apiFetch<GuideProject>(`/projects/${id}/scenes`, {
        method: 'PUT',
        body: input.scenes,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: (next) => {
      qc.setQueryData(projectsKeys.detail(id), next)
    },
  })
}

export interface UpdateNavigationInput {
  navigation: ExperienceNavigation
  expectedRevision: number
}

export function useUpdateProjectNavigation(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateNavigationInput) =>
      apiFetch<GuideProject>(`/projects/${id}/navigation`, {
        method: 'PUT',
        body: input.navigation,
        expectedRevision: input.expectedRevision,
      }),
    onSuccess: (next) => {
      qc.setQueryData(projectsKeys.detail(id), next)
    },
  })
}
