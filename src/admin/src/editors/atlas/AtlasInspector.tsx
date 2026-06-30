/**
 * AtlasInspector — properties of the currently selected object.
 *
 * Coordinates are hidden behind a "advanced" disclosure by default
 * (since they're normalized [0,1] floats most operators don't need to
 * hand-edit). The common properties (title, hotspot toggle) are
 * always visible.
 */
import { useState } from 'react'
import type { GuideProject } from '../../../domain/project-types'
import type { AtlasEditorSelection } from './AtlasEditor'

interface AtlasInspectorProps {
  project: GuideProject
  selection: AtlasEditorSelection | null
  onPatch: (patch: Partial<GuideProject['products']['atlas']>) => void
}

export function AtlasInspector({ project, selection }: AtlasInspectorProps): JSX.Element {
  const [advanced, setAdvanced] = useState(false)
  if (!selection) {
    return (
      <div style={{ color: '#6b7280' }}>
        <h3 style={{ margin: '0 0 12px' }}>属性</h3>
        <p>未选择对象。</p>
      </div>
    )
  }
  if (selection.kind === 'category') {
    const cat = project.knowledge.stages.flatMap((s) => s.categories).find((c) => c.id === selection.id)
    const layout = project.panorama.categories[selection.id]
    if (!cat || !layout) return <div>未找到分类</div>
    return (
      <div>
        <h3 style={{ margin: '0 0 12px' }}>分类 · {cat.title}</h3>
        <p style={{ color: '#6b7280', margin: '0 0 12px' }}>{cat.id}</p>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <input type="checkbox" defaultChecked={!!layout.hotspot} /> 显示 Hotspot
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          视图：分类视口 zoom{' '}
          <input
            type="number"
            defaultValue={layout.viewport?.zoom ?? 2}
            step={0.1}
            min={1}
            max={4}
            style={{ width: 80 }}
          />
        </label>
        <button type="button" onClick={() => setAdvanced((v) => !v)}>
          {advanced ? '收起' : '高级 · 坐标'}
        </button>
        {advanced && layout.hotspot && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#374151' }}>
            hotspot.x = {layout.hotspot.x.toFixed(3)} <br />
            hotspot.y = {layout.hotspot.y.toFixed(3)}
          </div>
        )}
      </div>
    )
  }
  // item
  const item = project.knowledge.items[selection.id]
  const layout = project.panorama.items[selection.id]
  if (!item || !layout) return <div>未找到项目</div>
  return (
    <div>
      <h3 style={{ margin: '0 0 12px' }}>项目 · {item.title}</h3>
      <p style={{ color: '#6b7280', margin: '0 0 12px' }}>{item.id}</p>
      <label style={{ display: 'block', marginBottom: 8 }}>
        <input type="checkbox" defaultChecked={!!layout.callout} /> 启用 Callout
      </label>
    </div>
  )
}