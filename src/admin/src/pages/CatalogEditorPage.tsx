/**
 * CatalogEditorPage — fetches a GuideProject from the API and renders
 * the CatalogEditor. Mirrors AtlasEditorPage but for the structured-
 * knowledge product.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CatalogEditor } from '../editors/catalog/CatalogEditor'
import type { GuideProject } from '../../../domain/project-types'

export function CatalogEditorPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>()
  const [project, setProject] = useState<GuideProject | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!projectId) return
    void fetch(`/api/projects/${projectId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`failed: ${r.status}`)
        return (await r.json()) as { data: GuideProject }
      })
      .then((r) => setProject(r.data))
      .catch((e: Error) => setError(e.message))
  }, [projectId])

  async function patch(
    catalog: GuideProject['products']['catalog'],
    expectedRevision: number,
  ): Promise<void> {
    if (!project) return
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/products/catalog`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-expected-revision': String(expectedRevision) },
        body: JSON.stringify(catalog),
      })
      if (!res.ok) throw new Error(`failed: ${res.status}`)
      const r = (await res.json()) as { data: GuideProject }
      setProject(r.data)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div style={{ padding: 24, color: '#dc2626' }}>{error}</div>
  if (!project) return <div style={{ padding: 24 }}>加载中…</div>
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <strong>{project.title}</strong> <small style={{ color: '#6b7280' }}>· Catalog Editor</small>
        {busy && <span style={{ marginLeft: 12, color: '#6b7280' }}>保存中…</span>}
      </header>
      <div style={{ flex: 1 }}>
        <CatalogEditor
          project={project}
          expectedRevision={project.metadata.revision}
          onPatch={patch}
        />
      </div>
    </div>
  )
}