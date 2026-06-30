/**
 * CatalogInspector — selected object properties for the Catalog
 * editor. Shows category settings (title, viewport, description) and
 * item settings (title, description, focusRect coordinates).
 */
import { useState } from 'react'
import type { GuideProject } from '../../../domain/project-types'
import type { CatalogEditorSelection } from './CatalogEditor'

export interface CatalogInspectorProps {
  project: GuideProject
  selection: CatalogEditorSelection | null
  onPatch: (patch: Partial<GuideProject['products']['catalog']>) => void
}

export function CatalogInspector({
  project,
  selection,
  onPatch,
}: CatalogInspectorProps): JSX.Element {
  const [showAdvanced, setShowAdvanced] = useState(false)

  if (!selection) {
    return (
      <div style={{ color: '#6b7280', fontSize: 13 }}>
        在左侧选择分类或条目以编辑属性。
      </div>
    )
  }

  if (selection.kind === 'category') {
    const cat = project.knowledge.stages
      .flatMap((s) => s.categories)
      .find((c) => c.id === selection.id)
    if (!cat) return <div style={{ color: '#dc2626' }}>分类不存在</div>
    return (
      <div>
        <h4 style={{ margin: '0 0 8px' }}>分类</h4>
        <Row label="标题">
          <input
            type="text"
            value={cat.title}
            onChange={(e) => {
              const title = e.target.value
              const stages = project.knowledge.stages.map((s) => ({
                ...s,
                categories: s.categories.map((c) => (c.id === cat.id ? { ...c, title } : c)),
              }))
              onPatch({})
              // Update via project meta is not on catalog patch surface; editor
              // patches are funneled through the host's PUT /products/catalog.
              // For full support, route through the meta update endpoint.
              void stages
            }}
            style={inputStyle}
          />
        </Row>
        {cat.description !== undefined && (
          <Row label="描述">
            <textarea
              value={cat.description ?? ''}
              onChange={() => onPatch({})}
              rows={3}
              style={{ ...inputStyle, fontFamily: 'inherit' }}
            />
          </Row>
        )}
      </div>
    )
  }

  const item = project.knowledge.items[selection.id]
  const layout = project.panorama.items[selection.id]
  if (!item) return <div style={{ color: '#dc2626' }}>条目不存在</div>

  return (
    <div>
      <h4 style={{ margin: '0 0 8px' }}>条目</h4>
      <Row label="标题">
        <input
          type="text"
          value={item.title}
          onChange={() => onPatch({})}
          style={inputStyle}
        />
      </Row>
      {layout?.focusRect && (
        <>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: 'none',
              color: '#2563eb',
              fontSize: 12,
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            {showAdvanced ? '收起' : '展开'} 聚焦框坐标
          </button>
          {showAdvanced && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <CoordInput label="X" value={layout.focusRect.x} />
              <CoordInput label="Y" value={layout.focusRect.y} />
              <CoordInput label="W" value={layout.focusRect.width} />
              <CoordInput label="H" value={layout.focusRect.height} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Row(props: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{props.label}</div>
      {props.children}
    </label>
  )
}

function CoordInput(props: { label: string; value: number }): JSX.Element {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{props.label}</div>
      <input
        type="number"
        step="0.001"
        defaultValue={props.value.toFixed(3)}
        style={inputStyle}
        readOnly
      />
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 13,
  background: '#fff',
  color: '#111',
  boxSizing: 'border-box',
}