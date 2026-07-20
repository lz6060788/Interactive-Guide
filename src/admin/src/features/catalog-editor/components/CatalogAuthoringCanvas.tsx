import { useEffect, useMemo, useRef, useState } from 'react'
import { Compass } from 'lucide-react'
import type {
  GuideProject,
  NormalizedFocusRect,
  PanoramaModel,
  Viewport,
} from '@domain/project-types'
import type { CatalogSelection } from '../store'
import { createProjectAssetUrlResolver } from '../../projects/asset-url-resolver'
import { createCatalogAtlasLaunchButton } from '@products/catalog/runtime/catalog-atlas-launch'

interface Props {
  project: GuideProject
  selectedStage: 'upstream' | 'midstream' | 'downstream'
  selection: CatalogSelection
  onSelect: (selection: CatalogSelection) => void
  onPatchPanorama: (mutator: (panorama: PanoramaModel) => PanoramaModel) => void
  locale?: string
}

interface Point {
  x: number
  y: number
}
interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Full-image authoring surface for Catalog. This deliberately does not share
 * runtime DOM with CatalogScene: authors need to see every item in the active
 * category while configuring viewport and focus coordinates.
 */
export function CatalogAuthoringCanvas({
  project,
  selectedStage,
  selection,
  onSelect,
  onPatchPanorama,
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null)
  const atlasButtonHostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 })
  const asset = project.panorama.assetId ? project.assets.byId[project.panorama.assetId] : undefined
  const stage = project.knowledge.stages.find(entry => entry.key === selectedStage)
  const category =
    stage?.categories.find(
      entry =>
        entry.id ===
        (selection?.kind === 'item'
          ? project.knowledge.items[selection.id]?.categoryId
          : selection?.kind === 'category'
            ? selection.id
            : undefined),
    ) ?? stage?.categories[0]
  const items = useMemo(
    () => (category?.itemIds ?? []).map(id => project.knowledge.items[id]).filter(Boolean),
    [category?.itemIds, project.knowledge.items],
  )
  const activeItem = selection?.kind === 'item' ? project.knowledge.items[selection.id] : items[0]
  const activeLayout = activeItem ? project.panorama.items[activeItem.id] : undefined
  const categoryViewport = category
    ? (project.panorama.categories[category.id]?.viewport ?? defaultViewport())
    : defaultViewport()
  const effectiveViewport = activeLayout?.viewportOverride ?? categoryViewport

  useEffect(() => {
    const node = canvasRef.current
    if (!node) return
    const measure = () =>
      setSize({ width: Math.max(node.clientWidth, 1), height: Math.max(node.clientHeight, 1) })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!asset) return
    const resolver = createProjectAssetUrlResolver(project)
    const image = new Image()
    image.onload = () =>
      setImageSize({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    image.src = resolver(project.id, asset.sourcePath)
  }, [asset, project])

  useEffect(() => {
    const host = atlasButtonHostRef.current
    if (!asset || !host) return
    const button = createCatalogAtlasLaunchButton({
      url: project.products.catalog.atlasLaunchUrl?.trim(),
      onLaunch: url => window.open(url, '_blank', 'noopener,noreferrer'),
    })
    host.replaceChildren(button)
    return () => button.remove()
  }, [asset, project.products.catalog.atlasLaunchUrl])

  if (!asset) return <EmptyCanvas />

  const logical = 1000
  const scale = Math.min(
    Math.max((size.width - 32) / logical, 0.01),
    Math.max((size.height - 32) / logical, 0.01),
  )
  const source = createProjectAssetUrlResolver(project)(project.id, asset.sourcePath)
  const projection = fullImageProjection(imageSize.width / Math.max(imageSize.height, 1))
  const imageAspect = imageSize.width / Math.max(imageSize.height, 1)
  const focus = activeLayout?.focusRect ?? defaultFocusRect()
  const focusScreen = projectRect(focus, projection)
  const cameraScreen = projectRect(cameraRect(effectiveViewport, imageAspect), projection)

  const toLogical = (event: Pick<PointerEvent, 'clientX' | 'clientY'>): Point => {
    const bounds = canvasRef.current
      ?.querySelector<HTMLElement>('[data-testid="catalog-authoring-logical"]')
      ?.getBoundingClientRect()
    if (!bounds) return { x: logical / 2, y: logical / 2 }
    return {
      x: clamp(((event.clientX - bounds.left) / bounds.width) * logical, 0, logical),
      y: clamp(((event.clientY - bounds.top) / bounds.height) * logical, 0, logical),
    }
  }

  const toSource = (event: Pick<PointerEvent, 'clientX' | 'clientY'>): Point => {
    const point = toLogical(event)
    return {
      x: clamp01((point.x - projection.x) / projection.width),
      y: clamp01((point.y - projection.y) / projection.height),
    }
  }

  const beginDrag = (event: React.PointerEvent, move: (next: Point) => void) => {
    event.preventDefault()
    event.stopPropagation()
    const pointerId = event.pointerId
    const node = event.currentTarget as HTMLElement
    node.setPointerCapture?.(pointerId)
    const onMove = (nativeEvent: PointerEvent) => move(toSource(nativeEvent))
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const beginLogicalDrag = (event: React.PointerEvent, move: (next: Point) => void) => {
    event.preventDefault()
    event.stopPropagation()
    const pointerId = event.pointerId
    const node = event.currentTarget as HTMLElement
    node.setPointerCapture?.(pointerId)
    const onMove = (nativeEvent: PointerEvent) => move(toLogical(nativeEvent))
    const finish = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }

  const patchViewport = (viewport: Viewport) => {
    if (!category) return
    onPatchPanorama(panorama => {
      if (activeItem && panorama.items[activeItem.id]?.viewportOverride) {
        return {
          ...panorama,
          items: {
            ...panorama.items,
            [activeItem.id]: { ...panorama.items[activeItem.id], viewportOverride: viewport },
          },
        }
      }
      const current = panorama.categories[category.id] ?? { viewport: defaultViewport() }
      return {
        ...panorama,
        categories: { ...panorama.categories, [category.id]: { ...current, viewport } },
      }
    })
  }

  const patchFocus = (nextFocus: NormalizedFocusRect) => {
    if (!activeItem) return
    onPatchPanorama(panorama => ({
      ...panorama,
      items: {
        ...panorama.items,
        [activeItem.id]: {
          ...panorama.items[activeItem.id],
          marker: panorama.items[activeItem.id]?.marker ?? { x: 0.5, y: 0.5 },
          focusRect: nextFocus,
        },
      },
    }))
  }

  const patchMarker = (itemId: string, marker: Point) =>
    onPatchPanorama(panorama => ({
      ...panorama,
      items: {
        ...panorama.items,
        [itemId]: {
          ...panorama.items[itemId],
          marker,
          focusRect: panorama.items[itemId]?.focusRect ?? defaultFocusRect(),
        },
      },
    }))

  return (
    <div ref={canvasRef} data-testid="catalog-authoring-canvas" style={stageStyle}>
      <div
        style={{
          width: logical * scale,
          height: logical * scale,
          position: 'relative',
          flex: '0 0 auto',
        }}
      >
        <div
          data-testid="catalog-authoring-logical"
          style={{ ...logicalStyle, transform: `scale(${scale})` }}
        >
          <img
            src={source}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: projection.x,
              top: projection.y,
              width: projection.width,
              height: projection.height,
              objectFit: 'fill',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(15,23,42,.1), rgba(15,23,42,.32))',
              pointerEvents: 'none',
            }}
          />

          <div
            data-testid="catalog-authoring-camera-frame"
            title="拖动定位背景镜头；拖动四角等比缩放"
            onPointerDown={event => {
              const start = toSource(event)
              const initial = effectiveViewport
              beginDrag(event, point =>
                patchViewport({
                  ...initial,
                  centerX: clamp01(initial.centerX + point.x - start.x),
                  centerY: clamp01(initial.centerY + point.y - start.y),
                }),
              )
            }}
            style={{
              position: 'absolute',
              left: cameraScreen.x,
              top: cameraScreen.y,
              width: cameraScreen.width,
              height: cameraScreen.height,
              border: '2px solid rgba(96,165,250,.95)',
              background: 'rgba(37,99,235,.09)',
              boxShadow: '0 0 0 1px rgba(15,23,42,.6), 0 0 20px rgba(59,130,246,.28)',
              cursor: 'grab',
              zIndex: 2,
            }}
          >
            <span style={cameraLabelStyle}>背景镜头</span>
            {(['nw', 'ne', 'se', 'sw'] as const).map(corner => (
              <span
                key={corner}
                data-testid={`catalog-authoring-camera-resize-${corner}`}
                onPointerDown={event => {
                  const initial = effectiveViewport
                  const minZoom = Math.max(
                    project.panorama.cameraBounds.minZoom,
                    coverZoom(imageAspect),
                  )
                  const maxZoom = Math.max(project.panorama.cameraBounds.maxZoom, minZoom)
                  beginLogicalDrag(event, point =>
                    patchViewport(
                      resizeCameraViewport(
                        initial,
                        cameraScreen,
                        projection,
                        point,
                        corner,
                        minZoom,
                        maxZoom,
                      ),
                    ),
                  )
                }}
                style={cameraHandleStyle(corner)}
              />
            ))}
          </div>

          {items.map(item => {
            const marker = project.panorama.items[item.id]?.marker ?? { x: 0.5, y: 0.5 }
            const isActive = item.id === activeItem?.id
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`catalog-authoring-marker-${item.id}`}
                onClick={() => onSelect({ kind: 'item', id: item.id })}
                onPointerDown={event => {
                  const start = toSource(event)
                  const initial = marker
                  beginDrag(event, point =>
                    patchMarker(item.id, {
                      x: clamp01(initial.x + point.x - start.x),
                      y: clamp01(initial.y + point.y - start.y),
                    }),
                  )
                }}
                style={{
                  position: 'absolute',
                  left: projection.x + marker.x * projection.width - 12,
                  top: projection.y + marker.y * projection.height - 12,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: isActive ? '2px solid #ff2436' : '2px solid #fff',
                  background: isActive ? 'rgba(255,36,54,.35)' : 'rgba(15,23,42,.58)',
                  boxShadow: '0 1px 10px rgba(0,0,0,.45)',
                  zIndex: 5,
                  cursor: 'move',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: 8,
                    height: 8,
                    margin: 'auto',
                    borderRadius: '50%',
                    background: isActive ? '#ff2436' : '#fff',
                  }}
                />
              </button>
            )
          })}

          {activeItem && (
            <FocusEditor
              rect={focus}
              screen={focusScreen}
              onStart={beginDrag}
              toSource={toSource}
              onChange={patchFocus}
            />
          )}
          <div style={authoringHintStyle}>
            完整原图编辑：拖动蓝框定位，拖动蓝框四角等比缩放背景镜头；拖动节点与红框配置三级项目
          </div>
          <div
            ref={atlasButtonHostRef}
            data-testid="catalog-authoring-atlas-launch-host"
            style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none' }}
          />
        </div>
      </div>
    </div>
  )
}

function FocusEditor({
  rect,
  screen,
  onStart,
  toSource,
  onChange,
}: {
  rect: NormalizedFocusRect
  screen: Rect
  onStart: (event: React.PointerEvent, move: (point: Point) => void) => void
  toSource: (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => Point
  onChange: (rect: NormalizedFocusRect) => void
}): JSX.Element {
  const begin = (event: React.PointerEvent, mode: 'move' | 'nw' | 'ne' | 'se' | 'sw') => {
    const start = toSource(event)
    onStart(event, point => onChange(resizeRect(rect, point.x - start.x, point.y - start.y, mode)))
  }
  return (
    <div
      data-testid="catalog-authoring-focus-rect"
      onPointerDown={event => begin(event, 'move')}
      style={{
        position: 'absolute',
        left: screen.x,
        top: screen.y,
        width: screen.width,
        height: screen.height,
        outline: '2px solid #ff2436',
        background: 'rgba(255,36,54,.08)',
        zIndex: 4,
        cursor: 'move',
      }}
    >
      {(['nw', 'ne', 'se', 'sw'] as const).map(corner => (
        <span
          key={corner}
          onPointerDown={event => begin(event, corner)}
          style={handleStyle(corner)}
        />
      ))}
    </div>
  )
}

function fullImageProjection(aspect: number): Rect {
  if (aspect >= 1)
    return { x: 0, y: (1000 - 1000 / aspect) / 2, width: 1000, height: 1000 / aspect }
  return { x: (1000 - 1000 * aspect) / 2, y: 0, width: 1000 * aspect, height: 1000 }
}

function cameraRect(viewport: Viewport, aspect: number): Rect {
  const zoom = Math.max(viewport.zoom, coverZoom(aspect), 0.01)
  const width = Math.min(1, 1 / (Math.max(aspect, 0.01) * zoom))
  const height = Math.min(1, 1 / zoom)
  return {
    x: clamp(viewport.centerX - width / 2, 0, 1 - width),
    y: clamp(viewport.centerY - height / 2, 0, 1 - height),
    width,
    height,
  }
}

function resizeCameraViewport(
  viewport: Viewport,
  screen: Rect,
  projection: Rect,
  point: Point,
  corner: 'nw' | 'ne' | 'se' | 'sw',
  minZoom: number,
  maxZoom: number,
): Viewport {
  const east = corner.includes('e')
  const south = corner.includes('s')
  const anchorX = east ? screen.x : screen.x + screen.width
  const anchorY = south ? screen.y : screen.y + screen.height
  const horizontalDistance = Math.abs(point.x - anchorX)
  const verticalDistance = Math.abs(point.y - anchorY)
  const requestedSide = Math.max(horizontalDistance, verticalDistance)
  const boundarySideX = east ? projection.x + projection.width - anchorX : anchorX - projection.x
  const boundarySideY = south ? projection.y + projection.height - anchorY : anchorY - projection.y
  const minimumSide = projection.height / maxZoom
  const maximumSide = Math.min(projection.height / minZoom, boundarySideX, boundarySideY)
  const side = clamp(requestedSide, Math.min(minimumSide, maximumSide), maximumSide)
  const left = east ? anchorX : anchorX - side
  const top = south ? anchorY : anchorY - side

  return {
    ...viewport,
    centerX: clamp01((left + side / 2 - projection.x) / projection.width),
    centerY: clamp01((top + side / 2 - projection.y) / projection.height),
    zoom: clamp(projection.height / Math.max(side, 0.01), minZoom, maxZoom),
  }
}

function coverZoom(aspect: number): number {
  return Math.max(1, 1 / Math.max(aspect, 0.01))
}

function projectRect(rect: Rect, projection: Rect): Rect {
  return {
    x: projection.x + rect.x * projection.width,
    y: projection.y + rect.y * projection.height,
    width: rect.width * projection.width,
    height: rect.height * projection.height,
  }
}
function defaultViewport(): Viewport {
  return { centerX: 0.5, centerY: 0.5, zoom: 1 }
}
function defaultFocusRect(): NormalizedFocusRect {
  return { x: 0.35, y: 0.35, width: 0.2, height: 0.2 }
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
function resizeRect(
  rect: NormalizedFocusRect,
  dx: number,
  dy: number,
  mode: 'move' | 'nw' | 'ne' | 'se' | 'sw',
): NormalizedFocusRect {
  const min = 0.03
  let { x, y, width, height } = rect
  if (mode === 'move') {
    x += dx
    y += dy
  } else {
    if (mode.includes('w')) {
      x += dx
      width -= dx
    }
    if (mode.includes('e')) width += dx
    if (mode.includes('n')) {
      y += dy
      height -= dy
    }
    if (mode.includes('s')) height += dy
  }
  width = clamp(width, min, 1)
  height = clamp(height, min, 1)
  return { ...rect, x: clamp(x, 0, 1 - width), y: clamp(y, 0, 1 - height), width, height }
}
function handleStyle(corner: 'nw' | 'ne' | 'se' | 'sw'): React.CSSProperties {
  return {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#fff',
    border: '2px solid #ff2436',
    ...(corner.includes('n') ? { top: -7 } : { bottom: -7 }),
    ...(corner.includes('w') ? { left: -7 } : { right: -7 }),
    cursor: `${corner}-resize`,
  }
}
function cameraHandleStyle(corner: 'nw' | 'ne' | 'se' | 'sw'): React.CSSProperties {
  return {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: '#fff',
    border: '3px solid #2563eb',
    boxShadow: '0 1px 5px rgba(15,23,42,.45)',
    zIndex: 3,
    ...(corner.includes('n') ? { top: -8 } : { bottom: -8 }),
    ...(corner.includes('w') ? { left: -8 } : { right: -8 }),
    cursor: `${corner}-resize`,
    touchAction: 'none',
  }
}
function EmptyCanvas(): JSX.Element {
  return (
    <div data-testid="catalog-authoring-canvas-empty" style={stageStyle}>
      <Compass size={32} />
      <strong>请先配置全景底图</strong>
    </div>
  )
}

const stageStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  background: '#0f172a',
  color: '#dbeafe',
}
const logicalStyle: React.CSSProperties = {
  width: 1000,
  height: 1000,
  position: 'absolute',
  left: 0,
  top: 0,
  transformOrigin: 'top left',
  overflow: 'hidden',
  background: '#111827',
}
const cameraLabelStyle: React.CSSProperties = {
  position: 'absolute',
  left: 8,
  top: 8,
  padding: '3px 6px',
  borderRadius: 3,
  background: '#2563eb',
  color: '#fff',
  fontSize: 12,
  pointerEvents: 'none',
}
const authoringHintStyle: React.CSSProperties = {
  position: 'absolute',
  left: 20,
  bottom: 18,
  zIndex: 8,
  padding: '7px 10px',
  borderRadius: 4,
  color: '#e2e8f0',
  background: 'rgba(15,23,42,.74)',
  fontSize: 12,
  pointerEvents: 'none',
}
