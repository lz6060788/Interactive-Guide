/**
 * CatalogCanvas — renders the panorama image with focusRect overlays
 * for each item. In 'focus' tool mode the user can drag the focusRect
 * corners; in 'select' mode clicking an item selects it for the
 * inspector.
 */
import { useRef } from 'react'
import type { GuideProject } from '../../../domain/project-types'
import type { CatalogEditorSelection, CatalogTool } from './CatalogEditor'

export interface CatalogCanvasProps {
  project: GuideProject
  tool: CatalogTool
  selection: CatalogEditorSelection | null
  onSelect: (selection: CatalogEditorSelection | null) => void
  onPatch: (patch: Partial<GuideProject['products']['catalog']>) => void
}

interface FocusRectNormalized {
  x: number
  y: number
  width: number
  height: number
}

export function CatalogCanvas(props: CatalogCanvasProps): JSX.Element {
  const { project, tool, selection, onSelect } = props
  const imgRef = useRef<HTMLImageElement | null>(null)

  const panoramaUrl = project.panorama.assetId
    ? `./assets/images/${project.panorama.assetId}/image.jpg`
    : null

  return (
    <div
      style={{
        position: 'relative',
        background: '#0f172a',
        overflow: 'hidden',
        cursor: tool === 'focus' ? 'crosshair' : 'default',
      }}
      data-testid="catalog-canvas"
    >
      {panoramaUrl ? (
        <img
          ref={imgRef}
          src={panoramaUrl}
          alt="panorama"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          draggable={false}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: 13,
          }}
        >
          请先在项目管理中绑定一张全景图
        </div>
      )}
      {project.knowledge.stages.flatMap((stage) =>
        stage.categories.flatMap((cat) =>
          cat.itemIds.flatMap((itemId) => {
            const item = project.knowledge.items[itemId]
            const layout = project.panorama.items[itemId]
            if (!item || !layout?.focusRect) return []
            const isSelected = selection?.kind === 'item' && selection.id === itemId
            return (
              <FocusRectOverlay
                key={itemId}
                rect={layout.focusRect}
                label={item.title}
                selected={isSelected}
                onSelect={() => onSelect({ kind: 'item', id: itemId })}
              />
            )
          }),
        ),
      )}
    </div>
  )
}

function FocusRectOverlay(props: {
  rect: FocusRectNormalized
  label: string
  selected: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        props.onSelect()
      }}
      style={{
        position: 'absolute',
        left: `${props.rect.x * 100}%`,
        top: `${props.rect.y * 100}%`,
        width: `${props.rect.width * 100}%`,
        height: `${props.rect.height * 100}%`,
        border: `2px solid ${props.selected ? '#2563eb' : 'rgba(37,99,235,0.45)'}`,
        background: props.selected ? 'rgba(37,99,235,0.10)' : 'rgba(37,99,235,0.04)',
        borderRadius: 6,
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
      data-testid={`catalog-focus-${props.label}`}
    />
  )
}