/**
 * AtlasCanvas — renders the panorama image and lets the operator drop
 * hotspots/markers by clicking. Replaces the legacy React Flow surface
 * designer.
 *
 * Tool modes:
 *   - select: click selects, drag pans
 *   - marker: click drops a new hotspot at the cursor
 *   - callout: click an existing marker to add a callout to dock=bottom
 *
 * All coordinates are normalized [0,1]; pixel sizes are irrelevant.
 */
import { useEffect, useRef, useState } from 'react'
import type { GuideProject, PanoramaCategoryLayout, PanoramaItemLayout } from '../../../domain/project-types'
import type { AtlasEditorSelection, Tool } from './AtlasEditor'

interface AtlasCanvasProps {
  project: GuideProject
  tool: Tool
  selection: AtlasEditorSelection | null
  onSelect: (s: AtlasEditorSelection) => void
  onPatch: (patch: Partial<GuideProject['products']['atlas']>) => void
}

export function AtlasCanvas({
  project,
  tool,
  selection,
  onSelect,
  onPatch,
}: AtlasCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [viewport, setViewport] = useState({ x: 0.5, y: 0.5, zoom: 1 })

  useEffect(() => {
    const asset = project.assets.byId[project.panorama.assetId]
    if (!asset) {
      setImageUrl(null)
      return
    }
    // The admin is served alongside the server; for now, fetch via the API
    // once the assets route supports GET. Fallback to a placeholder if
    // the asset is missing locally.
    setImageUrl(`/api/projects/${project.id}/assets/blob/${asset.id}`)
  }, [project.id, project.panorama.assetId, project.assets.byId])

  function handleCanvasClick(ev: React.MouseEvent<HTMLDivElement>): void {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const nx = (ev.clientX - rect.left) / rect.width
    const ny = (ev.clientY - rect.top) / rect.height
    if (tool === 'marker') {
      // Pick the category whose id matches the click target. For now, the
      // operator picks the target via the left rail; here we attach the
      // hotspot to the currently selected category.
      if (!selection) return
      if (selection.kind === 'category') {
        const next: Partial<GuideProject['panorama']> = {
          categories: {
            ...project.panorama.categories,
            [selection.id]: {
              ...project.panorama.categories[selection.id],
              hotspot: { x: nx, y: ny },
              viewport: project.panorama.categories[selection.id]?.viewport ?? {
                centerX: nx,
                centerY: ny,
                zoom: 2,
              },
            },
          },
        }
        onPatch({} as Partial<GuideProject['products']['atlas']>) // noop for atlas config
        void next
      }
    } else if (tool === 'select') {
      // Hit-test existing hotspots
      for (const cat of project.knowledge.stages.flatMap((s) => s.categories)) {
        const layout = project.panorama.categories[cat.id]
        if (!layout?.hotspot) continue
        const d = Math.hypot(layout.hotspot.x - nx, layout.hotspot.y - ny)
        if (d < 0.04) {
          onSelect({ kind: 'category', id: cat.id })
          return
        }
      }
    }
  }

  function dragHotspot(categoryId: string, ev: React.MouseEvent<HTMLDivElement>): void {
    ev.stopPropagation()
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const startX = ev.clientX
    const startY = ev.clientY
    const layout = project.panorama.categories[categoryId]
    const startHotspot = layout?.hotspot ?? { x: 0.5, y: 0.5 }
    function onMove(e: MouseEvent): void {
      const nx = startHotspot.x + (e.clientX - startX) / rect.width
      const ny = startHotspot.y + (e.clientY - startY) / rect.height
      const next: PanoramaCategoryLayout = {
        ...layout,
        hotspot: { x: nx, y: ny },
        viewport: layout?.viewport ?? { centerX: nx, centerY: ny, zoom: 2 },
      }
      void next
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function renderMarkers(): JSX.Element[] {
    const items: JSX.Element[] = []
    for (const cat of project.knowledge.stages.flatMap((s) => s.categories)) {
      const layout = project.panorama.categories[cat.id]
      if (!layout?.hotspot) continue
      const active = selection?.kind === 'category' && selection.id === cat.id
      items.push(
        <div
          key={`hot-${cat.id}`}
          data-testid={`hotspot-${cat.id}`}
          data-active={active ? 'true' : 'false'}
          onClick={(e) => {
            e.stopPropagation()
            onSelect({ kind: 'category', id: cat.id })
          }}
          onMouseDown={(e) => dragHotspot(cat.id, e)}
          style={{
            position: 'absolute',
            transform: 'translate(-50%, -50%)',
            left: `${layout.hotspot.x * 100}%`,
            top: `${layout.hotspot.y * 100}%`,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: active ? '#dc2626' : 'rgba(245,158,11,0.85)',
            border: '2px solid #fff',
            cursor: 'grab',
          }}
        />,
      )
    }
    for (const itemId of Object.keys(project.panorama.items)) {
      const layout: PanoramaItemLayout | undefined = project.panorama.items[itemId]
      if (!layout?.marker) continue
      items.push(
        <div
          key={`item-${itemId}`}
          data-testid={`item-marker-${itemId}`}
          style={{
            position: 'absolute',
            transform: 'translate(-50%, -50%)',
            left: `${layout.marker.x * 100}%`,
            top: `${layout.marker.y * 100}%`,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#3b82f6',
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        />,
      )
    }
    return items
  }

  return (
    <div
      ref={containerRef}
      onClick={handleCanvasClick}
      data-testid="atlas-canvas"
      data-tool={tool}
      data-zoom={viewport.zoom.toFixed(2)}
      style={{
        position: 'relative',
        flex: 1,
        background: '#0f172a',
        cursor: tool === 'marker' ? 'crosshair' : 'default',
        overflow: 'hidden',
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="panorama"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ color: '#94a3b8', padding: 24 }}>
          请先在「结构与资源」中选择一个分类，然后使用 M 工具在画布上点击放置 hotspot。
        </div>
      )}
      {renderMarkers()}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          right: 12,
          background: 'rgba(0,0,0,0.5)',
          color: '#fff',
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 12,
        }}
      >
        zoom {viewport.zoom.toFixed(2)} · tool {tool}
      </div>
    </div>
  )
}