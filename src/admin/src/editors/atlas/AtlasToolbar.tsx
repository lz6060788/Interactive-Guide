/**
 * AtlasToolbar — tool selector + save / preview / dual-publish buttons.
 */
import type { Tool } from './AtlasEditor'

interface AtlasToolbarProps {
  tool: Tool
  onToolChange: (t: Tool) => void
  onSave: () => void
}

export function AtlasToolbar({ tool, onToolChange, onSave }: AtlasToolbarProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: 8,
        borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        data-testid="tool-select"
        onClick={() => onToolChange('select')}
        style={{ fontWeight: tool === 'select' ? 'bold' : 'normal' }}
      >
        V 选择
      </button>
      <button
        type="button"
        data-testid="tool-marker"
        onClick={() => onToolChange('marker')}
        style={{ fontWeight: tool === 'marker' ? 'bold' : 'normal' }}
      >
        M Hotspot
      </button>
      <button
        type="button"
        data-testid="tool-callout"
        onClick={() => onToolChange('callout')}
        style={{ fontWeight: tool === 'callout' ? 'bold' : 'normal' }}
      >
        C Callout
      </button>
      <span style={{ flex: 1 }} />
      <button type="button" data-testid="btn-save" onClick={onSave}>
        保存
      </button>
      <button type="button" data-testid="btn-preview" disabled>
        预览（开发中）
      </button>
      <button type="button" data-testid="btn-publish" disabled>
        发布
      </button>
    </div>
  )
}