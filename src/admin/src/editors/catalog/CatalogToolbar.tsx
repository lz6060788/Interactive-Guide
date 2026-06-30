/**
 * CatalogToolbar — tool selector + save / preview / publish actions
 * for the Catalog editor.
 */
import type { CatalogTool } from './CatalogEditor'

export interface CatalogToolbarProps {
  tool: CatalogTool
  onToolChange: (tool: CatalogTool) => void
  onSave: () => void
}

export function CatalogToolbar({ tool, onToolChange, onSave }: CatalogToolbarProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderBottom: '1px solid #e5e7eb',
        background: '#fff',
      }}
    >
      <ToolButton active={tool === 'select'} onClick={() => onToolChange('select')} label="选择 V" />
      <ToolButton active={tool === 'focus'} onClick={() => onToolChange('focus')} label="聚焦框 F" />
      <span style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onSave}
        style={{
          padding: '6px 14px',
          border: '1px solid #2563eb',
          background: '#2563eb',
          color: '#fff',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        保存
      </button>
    </div>
  )
}

function ToolButton(props: { active: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        padding: '4px 10px',
        border: '1px solid ' + (props.active ? '#2563eb' : '#d1d5db'),
        background: props.active ? '#eff6ff' : '#fff',
        color: props.active ? '#1d4ed8' : '#374151',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {props.label}
    </button>
  )
}