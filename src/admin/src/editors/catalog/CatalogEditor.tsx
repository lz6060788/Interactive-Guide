/**
 * CatalogEditor — main page for editing the Catalog (structured
 * knowledge) product config of a project.
 *
 * Layout (three columns):
 *   - Left: project structure (3 stages → categories → items)
 *   - Center: CatalogCanvas (panorama image with draggable focusRect)
 *   - Right: CatalogInspector + real-time CatalogPreview
 *
 * The Catalog product replaces the legacy "产业图谱" view. It does not
 * show hotspots; instead, each item owns a focusRect (a region the
 * runtime animates to / highlights when the item is clicked).
 */
import { useState } from 'react'
import { CatalogCanvas } from './CatalogCanvas'
import { CatalogInspector } from './CatalogInspector'
import { CatalogPreview } from './CatalogPreview'
import { CatalogToolbar } from './CatalogToolbar'
import type { GuideProject } from '../../../domain/project-types'

export type CatalogTool = 'select' | 'focus'

export interface CatalogEditorSelection {
  kind: 'category' | 'item'
  id: string
}

export interface CatalogEditorProps {
  project: GuideProject
  onPatch: (patch: Partial<GuideProject['products']['catalog']>, expectedRevision: number) => void
  expectedRevision: number
}

export function CatalogEditor({
  project,
  onPatch,
  expectedRevision,
}: CatalogEditorProps): JSX.Element {
  const [tool, setTool] = useState<CatalogTool>('select')
  const [selection, setSelection] = useState<CatalogEditorSelection | null>(null)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 320px', height: '100%' }}>
      <aside
        style={{
          borderRight: '1px solid #e5e7eb',
          padding: 16,
          overflow: 'auto',
          background: '#fafafa',
        }}
      >
        <h3 style={{ margin: '0 0 12px' }}>产业链结构</h3>
        {project.knowledge.stages.map((stage) => (
          <div key={stage.key} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 4 }}>
              {stage.order}. {stage.label}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {stage.categories.map((c) => (
                <li
                  key={c.id}
                  onClick={() => setSelection({ kind: 'category', id: c.id })}
                  style={{
                    padding: '4px 8px',
                    cursor: 'pointer',
                    background:
                      selection?.kind === 'category' && selection.id === c.id
                        ? '#fef3c7'
                        : undefined,
                  }}
                >
                  {c.title}
                </li>
              ))}
            </ul>
            <ul style={{ listStyle: 'none', padding: '0 0 0 16px', margin: 0 }}>
              {stage.categories.flatMap((c) =>
                c.itemIds.map((itemId) => {
                  const item = project.knowledge.items[itemId]
                  if (!item) return null
                  return (
                    <li
                      key={itemId}
                      onClick={() => setSelection({ kind: 'item', id: itemId })}
                      style={{
                        padding: '2px 8px',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: '#4b5563',
                        background:
                          selection?.kind === 'item' && selection.id === itemId
                            ? '#dbeafe'
                            : undefined,
                      }}
                    >
                      · {item.title}
                    </li>
                  )
                }),
              )}
            </ul>
          </div>
        ))}
      </aside>
      <main style={{ display: 'flex', flexDirection: 'column' }}>
        <CatalogToolbar
          tool={tool}
          onToolChange={setTool}
          onSave={() => onPatch(project.products.catalog, expectedRevision)}
        />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px' }}>
          <CatalogCanvas
            project={project}
            tool={tool}
            selection={selection}
            onSelect={setSelection}
            onPatch={(patch) => onPatch(patch, expectedRevision)}
          />
          <CatalogPreview project={project} />
        </div>
      </main>
      <aside
        style={{
          borderLeft: '1px solid #e5e7eb',
          padding: 16,
          overflow: 'auto',
          background: '#fff',
        }}
      >
        <CatalogInspector
          project={project}
          selection={selection}
          onPatch={(patch) => onPatch(patch, expectedRevision)}
        />
      </aside>
    </div>
  )
}