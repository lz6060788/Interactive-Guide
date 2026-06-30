/**
 * AtlasEditor — main page for editing the Atlas product config of a
 * project. Replaces the legacy SurfaceNodeDesigner / HotspotEditorModal
 * React Flow workbench.
 *
 * Layout (three columns):
 *   - Left: project structure (stages + categories) and asset library
 *   - Center: AtlasCanvas (panorama image + draggable hotspots/markers)
 *   - Right: AtlasInspector (selected object properties) + AtlasToolbar
 *
 * Real-time preview is mounted via AtlasPreview in a side panel — not an
 * iframe. The preview reads the same AtlasRuntime state.
 */
import { useState } from 'react'
import { AtlasCanvas } from './AtlasCanvas'
import { AtlasToolbar } from './AtlasToolbar'
import { AtlasInspector } from './AtlasInspector'
import { AtlasPreview } from './AtlasPreview'
import type { GuideProject } from '../../../domain/project-types'

export type Tool = 'select' | 'marker' | 'callout'

export interface AtlasEditorSelection {
  kind: 'category' | 'item'
  id: string
}

export interface AtlasEditorProps {
  project: GuideProject
  onPatch: (patch: Partial<GuideProject['products']['atlas']>, expectedRevision: number) => void
  expectedRevision: number
}

export function AtlasEditor({ project, onPatch, expectedRevision }: AtlasEditorProps): JSX.Element {
  const [tool, setTool] = useState<Tool>('select')
  const [selection, setSelection] = useState<AtlasEditorSelection | null>(null)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 320px', height: '100%' }}>
      <aside style={{ borderRight: '1px solid #e5e7eb', padding: 16, overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 12px' }}>结构与资源</h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {project.knowledge.stages.flatMap((s) =>
            s.categories.map((c) => (
              <li
                key={c.id}
                onClick={() => setSelection({ kind: 'category', id: c.id })}
                style={{
                  padding: '4px 8px',
                  cursor: 'pointer',
                  background:
                    selection?.kind === 'category' && selection.id === c.id ? '#fef3c7' : undefined,
                }}
              >
                {c.title} <small style={{ color: '#6b7280' }}>({s.key})</small>
              </li>
            )),
          )}
        </ul>
      </aside>
      <main style={{ display: 'flex', flexDirection: 'column' }}>
        <AtlasToolbar
          tool={tool}
          onToolChange={setTool}
          onSave={() => onPatch(project.products.atlas, expectedRevision)}
        />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr' }}>
          <AtlasCanvas
            project={project}
            tool={tool}
            selection={selection}
            onSelect={setSelection}
            onPatch={(patch) => onPatch(patch, expectedRevision)}
          />
          <AtlasPreview project={project} />
        </div>
      </main>
      <aside style={{ borderLeft: '1px solid #e5e7eb', padding: 16, overflow: 'auto' }}>
        <AtlasInspector
          project={project}
          selection={selection}
          onPatch={(patch) => onPatch(patch, expectedRevision)}
        />
      </aside>
    </div>
  )
}