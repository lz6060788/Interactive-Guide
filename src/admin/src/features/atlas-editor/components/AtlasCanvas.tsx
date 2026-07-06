/**
 * AtlasCanvas — calibration canvas for the atlas product.
 *
 * The editor mirrors the runtime's projection exactly:
 *   - panorama image lives in the transformed layer
 *   - hotspot / item marker / callout chip live in a fixed-size overlay
 *   - all point placement and drag math use PanoramaProjection
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { Plus, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type {
  CategorySpatialLayout,
  GuideProject,
  ItemSpatialLayout,
  NormalizedPoint,
  PanoramaModel,
} from '@domain/project-types'
import { Box, Stack } from '@chakra-ui/react'
import { usePanoramaBlobUrl } from '../api'
import { useAtlasEditorStore } from '../store'
import { Camera } from '@products/atlas/runtime/camera'
import {
  projectNormalizedPoint,
  unprojectScreenPoint,
} from '@products/atlas/runtime/panorama-projection'
import {
  ATLAS_CALLOUT_GAP_PX,
  ATLAS_ITEM_CHIP_MAX_WIDTH_PX,
  ATLAS_ITEM_CHIP_MIN_WIDTH_PX,
  ATLAS_MARKER_ANIMATION,
  ATLAS_MARKER_SIZE_PX,
  ensureAtlasVisualStyles,
  getAtlasChipStyle,
  getAtlasMarkerSvg,
} from '@products/atlas/runtime/atlas-visual-tokens'
import { LiveCoordinateReadout } from './LiveCoordinateReadout'
import { AxisIndicator } from './AxisIndicator'
import type { Tool } from './AtlasToolbar'

interface Props {
  project: GuideProject
  tool: Tool
  selection: ReturnType<typeof useAtlasEditorStore.getState>['selection']
  onSelect: (s: ReturnType<typeof useAtlasEditorStore.getState>['selection']) => void
  onPatchPanorama: (mutator: (p: PanoramaModel) => PanoramaModel) => void
  onRenameItem: (itemId: string, title: string) => void
}

type HandleKind = 'hotspot' | 'item-marker'
const DEFAULT_HOTSPOT_MIN_ZOOM = 1
const DEFAULT_CALLOUT_MIN_ZOOM = 2
const DEFAULT_ITEM_MARKER_MIN_ZOOM = 2

interface DragData {
  kind: HandleKind
  categoryId?: string
  itemId?: string
}

export function AtlasCanvas({
  project,
  tool,
  selection,
  onSelect,
  onPatchPanorama,
  onRenameItem,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<Camera | null>(null)
  const [hoverCoord, setHoverCoord] = useState<NormalizedPoint | null>(null)
  const [activeHandle, setActiveHandle] = useState<HandleKind | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const assetId = project.panorama.assetId || null
  const { url: imageUrl, isLoading, error } = usePanoramaBlobUrl(project.id, assetId)

  const setHoveredCoord = useAtlasEditorStore((s) => s.setHoveredCoord)
  const setZoomStore = useAtlasEditorStore((s) => s.setZoom)

  const viewportW = project.products.atlas.viewport.width
  const viewportH = project.products.atlas.viewport.height
  const [sourceSize, setSourceSize] = useState({ width: viewportW, height: viewportH })
  const [cameraViewport, setCameraViewport] = useState(project.panorama.initialViewport)

  useEffect(() => {
    ensureAtlasVisualStyles(document)
  }, [])

  const applyCameraTransform = useCallback(() => {
    const layer = layerRef.current
    const camera = cameraRef.current
    if (!layer || !camera) return
    const t = camera.getTransform()
    layer.style.left = `${t.originX}px`
    layer.style.top = `${t.originY}px`
    layer.style.width = `${t.width}px`
    layer.style.height = `${t.height}px`
    layer.style.transform = t.css
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const camera = new Camera(
      containerRef.current,
      project.panorama.initialViewport,
      project.panorama.cameraBounds,
      project.products.atlas.interaction,
      sourceSize,
    )
    cameraRef.current = camera
    const unsubscribe = camera.onChange((viewport) => {
      setCameraViewport(viewport)
      setZoomStore(viewport.zoom)
      applyCameraTransform()
    })
    setCameraViewport(camera.getViewport())
    applyCameraTransform()
    return () => {
      unsubscribe()
      camera.destroy()
      cameraRef.current = null
    }
  }, [
    applyCameraTransform,
    project.id,
    project.panorama.cameraBounds,
    project.panorama.initialViewport,
    project.products.atlas.interaction,
    setZoomStore,
    sourceSize,
  ])

  useEffect(() => {
    setHoveredCoord(hoverCoord)
  }, [hoverCoord, setHoveredCoord])

  const projection = cameraRef.current?.getProjection() ?? null

  const eventToNormalized = useCallback((clientX: number, clientY: number): NormalizedPoint | null => {
    const el = containerRef.current
    if (!el || !projection) return null
    const rect = el.getBoundingClientRect()
    const logicalWidth = el.clientWidth || el.offsetWidth || rect.width || 1
    const logicalHeight = el.clientHeight || el.offsetHeight || rect.height || 1
    const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1
    const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1
    return clamp(
      unprojectScreenPoint(
        {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY,
        },
        projection,
      ),
    )
  }, [projection])

  const stagesArr = useMemo(
    () => project.knowledge.stages as unknown as Array<{ key: string; categories: Array<{ id: string; title: string; itemIds: string[] }> }>,
    [project.knowledge.stages],
  )
  const allCategories = useMemo(
    () => stagesArr.flatMap((s) => s.categories.map((c) => ({ stage: s.key, cat: c }))),
    [stagesArr],
  )

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const coord = eventToNormalized(event.clientX, event.clientY)
    if (!coord) return

    if (tool === 'marker') {
      const targetCategoryId = selection?.kind === 'category' ? selection.id : null
      if (!targetCategoryId) return
      onPatchPanorama((p) => ({
        ...p,
        categories: {
          ...p.categories,
          [targetCategoryId]: ensureCategoryLayout(
            p.categories[targetCategoryId],
            coord,
          ),
        },
      }))
      onSelect({ kind: 'category', id: targetCategoryId })
      return
    }

    if (tool === 'select') {
      const itemHit = hitTestItem(project.panorama.items, coord)
      if (itemHit) {
        onSelect({ kind: 'item', id: itemHit })
        return
      }
      const categoryHit = hitTestHotspot(allCategories, project.panorama.categories, coord)
      onSelect(categoryHit ? { kind: 'category', id: categoryHit } : null)
    }
  }

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    setHoverCoord(eventToNormalized(event.clientX, event.clientY))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const handleDragStart = (event: { active: { data: { current: unknown } } }) => {
    const data = event.active.data.current as DragData | undefined
    if (data) setActiveHandle(data.kind)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveHandle(null)
    const data = event.active.data.current as DragData | undefined
    if (!data || !projection) return
    const dx = event.delta.x / projection.scaledWidth
    const dy = event.delta.y / projection.scaledHeight

    if (data.kind === 'hotspot' && data.categoryId) {
      onPatchPanorama((p) => {
        const layout = p.categories[data.categoryId!]
        if (!layout?.hotspot) return p
        return {
          ...p,
          categories: {
            ...p.categories,
            [data.categoryId!]: {
              ...layout,
              hotspot: clamp({ x: layout.hotspot.x + dx, y: layout.hotspot.y + dy }),
            },
          },
        }
      })
      return
    }

    if (data.kind === 'item-marker' && data.itemId) {
      onPatchPanorama((p) => {
        const layout = p.items[data.itemId!]
        if (!layout?.marker) return p
        return {
          ...p,
          items: {
            ...p.items,
            [data.itemId!]: {
              ...layout,
              marker: clamp({ x: layout.marker.x + dx, y: layout.marker.y + dy }),
            },
          },
        }
      })
    }
  }

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: viewportW,
    height: viewportH,
    flexShrink: 0,
    margin: '0 auto',
    background: '#0f172a',
    overflow: 'hidden',
    userSelect: 'none',
  }

  return (
    <Box
      data-testid="atlas-canvas"
      data-tool={tool}
      data-zoom={cameraViewport.zoom.toFixed(2)}
      position="relative"
      flex="1"
      bg="#020617"
      overflow="hidden"
      display="flex"
      alignItems="center"
      justifyContent="center"
      minH="0"
      p="4"
    >
      <DndContext
        sensors={sensors}
        modifiers={[restrictToParentElement]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          ref={containerRef}
          data-testid="canvas-viewport"
          onClick={handleCanvasClick}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverCoord(null)}
          style={containerStyle}
        >
          <div
            ref={layerRef}
            data-testid="canvas-viewport-layer"
            style={{ position: 'absolute', transformOrigin: '0 0' }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="panorama"
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget
                  setSourceSize({
                    width: image.naturalWidth || viewportW,
                    height: image.naturalHeight || viewportH,
                  })
                }}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <CanvasPlaceholder
                isLoading={isLoading}
                error={error}
                hasAsset={Boolean(assetId)}
                selection={selection}
                tool={tool}
              />
            )}
          </div>

          <div
            data-testid="canvas-overlay-layer"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            {projection && Object.entries(project.panorama.items).map(([itemId, layout]) => (
              <ItemOverlay
                key={itemId}
                itemId={itemId}
                itemTitle={project.knowledge.items[itemId]?.title ?? itemId}
                layout={layout}
                projection={projection}
                selected={selection?.kind === 'item' && selection.id === itemId}
                activeHandle={activeHandle}
                hidden={!isItemVisible(project, itemId, cameraViewport.zoom)}
                onSelect={onSelect}
                editing={editingItemId === itemId}
                editingTitle={editingTitle}
                onStartRename={() => {
                  setEditingItemId(itemId)
                  setEditingTitle(project.knowledge.items[itemId]?.title ?? '')
                }}
                onEditingTitleChange={setEditingTitle}
                onCommitRename={() => {
                  const trimmed = editingTitle.trim()
                  if (trimmed) onRenameItem(itemId, trimmed)
                  setEditingItemId(null)
                }}
                onCancelRename={() => {
                  setEditingItemId(null)
                  setEditingTitle('')
                }}
              />
            ))}

            {projection && allCategories.map(({ cat }) => {
              const layout = project.panorama.categories[cat.id]
              if (!layout?.hotspot) return null
              return (
                <HotspotOverlay
                  key={cat.id}
                  categoryId={cat.id}
                  title={cat.title}
                  layout={layout}
                  projection={projection}
                  active={selection?.kind === 'category' && selection.id === cat.id}
                  hasCallout={hasCalloutInCategory(project, cat.id)}
                  hidden={!isHotspotVisible(project, cat.id, cameraViewport.zoom)}
                  draggable={tool === 'select'}
                  onSelect={onSelect}
                />
              )
            })}
          </div>

          <AxisIndicator
            zoom={cameraViewport.zoom}
            centerX={cameraViewport.centerX}
            centerY={cameraViewport.centerY}
          />
          <LiveCoordinateReadout
            coord={hoverCoord}
            zoom={cameraViewport.zoom}
            tool={tool}
            activeHandle={activeHandle}
          />
        </div>
      </DndContext>

      <Stack position="absolute" top="3" right="3" gap="1" zIndex="9">
        <ZoomButton
          icon={ZoomIn}
          label="放大"
          onClick={() => cameraRef.current?.animateTo({
            ...(cameraRef.current?.getViewport() ?? project.panorama.initialViewport),
            zoom: clampNumber(
              (cameraRef.current?.getViewport().zoom ?? 1) + 0.25,
              project.panorama.cameraBounds.minZoom,
              project.panorama.cameraBounds.maxZoom,
            ),
          }, 200)}
          testid="canvas-zoom-in"
        />
        <ZoomButton
          icon={ZoomOut}
          label="缩小"
          onClick={() => cameraRef.current?.animateTo({
            ...(cameraRef.current?.getViewport() ?? project.panorama.initialViewport),
            zoom: clampNumber(
              (cameraRef.current?.getViewport().zoom ?? 1) - 0.25,
              project.panorama.cameraBounds.minZoom,
              project.panorama.cameraBounds.maxZoom,
            ),
          }, 200)}
          testid="canvas-zoom-out"
        />
        <ZoomButton
          icon={Maximize2}
          label="重置视图"
          onClick={() => cameraRef.current?.animateTo(project.panorama.initialViewport, 250)}
          testid="canvas-zoom-reset"
        />
      </Stack>
    </Box>
  )
}

function HotspotOverlay({
  categoryId,
  title,
  layout,
  projection,
  active,
  hasCallout,
  hidden,
  draggable,
  onSelect,
}: {
  categoryId: string
  title: string
  layout: CategorySpatialLayout
  projection: ReturnType<Camera['getProjection']>
  active: boolean
  hasCallout: boolean
  hidden: boolean
  draggable: boolean
  onSelect: (selection: { kind: 'category'; id: string }) => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `hotspot-${categoryId}`,
    data: { kind: 'hotspot', categoryId } satisfies DragData,
    disabled: !draggable,
  })
  const point = projectNormalizedPoint(layout.hotspot!, projection)
  return (
    <div
      ref={setNodeRef}
      data-testid={`hotspot-${categoryId}`}
      data-atlas-interactive="true"
      style={{
        position: 'absolute',
        left: point.x,
        top: point.y,
        transform: `translate(-50%, -50%) translate(${transform?.x ?? 0}px, ${transform?.y ?? 0}px)`,
        display: hidden ? 'none' : 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${ATLAS_CALLOUT_GAP_PX}px`,
        pointerEvents: 'none',
        zIndex: active || isDragging ? 16 : 12,
      }}
    >
      <button
        type="button"
        title={`${title}${hasCallout ? ' · has callout' : ''}`}
        data-atlas-interactive="true"
        style={markerButtonStyle}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onSelect({ kind: 'category', id: categoryId })
        }}
        {...listeners}
        {...attributes}
      >
        <MarkerGlyph active={active || isDragging} />
      </button>
      <button
        type="button"
        data-atlas-interactive="true"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onSelect({ kind: 'category', id: categoryId })
        }}
        style={{
          ...buttonResetStyle,
          ...getAtlasChipStyle(active || isDragging, 80),
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          outline: 'none',
          maxWidth: 'none',
          overflow: 'visible',
          textOverflow: 'clip',
          zIndex: 1,
          pointerEvents: 'auto',
        }}
      >
        <span style={annotationLabelStyle}>
          {title}
        </span>
      </button>
    </div>
  )
}

function ItemOverlay({
  itemId,
  itemTitle,
  layout,
  projection,
  selected,
  activeHandle,
  hidden,
  onSelect,
  editing,
  editingTitle,
  onStartRename,
  onEditingTitleChange,
  onCommitRename,
  onCancelRename,
}: {
  itemId: string
  itemTitle: string
  layout: ItemSpatialLayout
  projection: ReturnType<Camera['getProjection']>
  selected: boolean
  activeHandle: HandleKind | null
  hidden: boolean
  onSelect: (selection: { kind: 'item'; id: string }) => void
  editing: boolean
  editingTitle: string
  onStartRename: () => void
  onEditingTitleChange: (title: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `item-marker-${itemId}`,
    data: { kind: 'item-marker', itemId } satisfies DragData,
  })
  const point = projectNormalizedPoint(layout.marker, projection)
  const markerFirst = layout.callout?.markerPosition !== 'bottom'
  const zIndex = selected || isDragging || activeHandle === 'item-marker' ? 16 : 10
  const calloutGapPx = layout.callout?.markerGapPx ?? ATLAS_CALLOUT_GAP_PX

  return (
    <div
      ref={setNodeRef}
      data-testid={`callout-root-${itemId}`}
      data-atlas-interactive="true"
      style={{
        position: 'absolute',
        left: point.x,
        top: point.y,
        transform: `translate(-50%, -50%) translate(${transform?.x ?? 0}px, ${transform?.y ?? 0}px)`,
        display: hidden ? 'none' : 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: `${calloutGapPx}px`,
        pointerEvents: 'none',
        zIndex,
      }}
    >
      {layout.callout && !markerFirst ? (
        <CalloutChip
          itemId={itemId}
          itemTitle={itemTitle}
          selected={selected}
          editing={editing}
          editingTitle={editingTitle}
          onSelect={onSelect}
          onStartRename={onStartRename}
          onEditingTitleChange={onEditingTitleChange}
          onCommitRename={onCommitRename}
          onCancelRename={onCancelRename}
        />
      ) : null}
      <button
        type="button"
        ref={!layout.callout ? undefined : undefined}
        data-testid={`item-marker-${itemId}`}
        data-atlas-interactive="true"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onSelect({ kind: 'item', id: itemId })
        }}
        style={{
          ...markerButtonStyle,
          zIndex,
        }}
        {...listeners}
        {...attributes}
      >
        <MarkerGlyph active={selected || isDragging} />
      </button>
      {layout.callout && markerFirst ? (
        <CalloutChip
          itemId={itemId}
          itemTitle={itemTitle}
          selected={selected}
          editing={editing}
          editingTitle={editingTitle}
          onSelect={onSelect}
          onStartRename={onStartRename}
          onEditingTitleChange={onEditingTitleChange}
          onCommitRename={onCommitRename}
          onCancelRename={onCancelRename}
        />
      ) : null}
    </div>
  )
}

function CalloutChip({
  itemId,
  itemTitle,
  selected,
  editing,
  editingTitle,
  onSelect,
  onStartRename,
  onEditingTitleChange,
  onCommitRename,
  onCancelRename,
}: {
  itemId: string
  itemTitle: string
  selected: boolean
  editing: boolean
  editingTitle: string
  onSelect: (selection: { kind: 'item'; id: string }) => void
  onStartRename: () => void
  onEditingTitleChange: (title: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
}): JSX.Element {
  const sharedStyle: React.CSSProperties = {
    ...buttonResetStyle,
    ...getAtlasChipStyle(selected, ATLAS_ITEM_CHIP_MIN_WIDTH_PX, ATLAS_ITEM_CHIP_MAX_WIDTH_PX),
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    outline: 'none',
    zIndex: 1,
    pointerEvents: 'auto',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  if (editing) {
    return (
      <div
        data-testid={`callout-chip-edit-${itemId}`}
        data-atlas-interactive="true"
        style={{
          ...sharedStyle,
          padding: '0 10px',
          cursor: 'text',
        }}
      >
        <input
          autoFocus
          value={editingTitle}
          onChange={(event) => onEditingTitleChange(event.target.value)}
          onBlur={onCommitRename}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onDoubleClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onCommitRename()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancelRename()
            }
          }}
          style={{
            width: '100%',
            minWidth: 56,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            textAlign: 'center',
            fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
            fontWeight: 600,
            fontSize: 16,
            lineHeight: '20px',
            color: 'inherit',
          }}
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      data-testid={`callout-chip-${itemId}`}
      data-atlas-interactive="true"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onSelect({ kind: 'item', id: itemId })
      }}
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onStartRename()
      }}
      style={sharedStyle}
    >
      <span style={annotationLabelStyleEllipsis}>
        {itemTitle}
      </span>
    </button>
  )
}

function MarkerGlyph({ active }: { active: boolean }): JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${ATLAS_MARKER_SIZE_PX}px`,
        height: `${ATLAS_MARKER_SIZE_PX}px`,
        animation: ATLAS_MARKER_ANIMATION,
        pointerEvents: 'none',
        willChange: 'transform, opacity',
        lineHeight: 0,
        flexShrink: 0,
      }}
      dangerouslySetInnerHTML={{ __html: getAtlasMarkerSvg(active) }}
    />
  )
}

function CanvasPlaceholder({
  isLoading,
  error,
  hasAsset,
  selection,
  tool,
}: {
  isLoading: boolean
  error: Error | null
  hasAsset: boolean
  selection: { kind: 'category' | 'item'; id: string } | null
  tool: Tool
}): JSX.Element {
  let label = ''
  let sub: string | null = null
  if (error) {
    label = '加载全景图失败'
    sub = error.message
  } else if (isLoading) {
    label = '正在加载全景图…'
  } else if (!hasAsset) {
    label = '还没有上传全景图'
    sub = '到「项目设置」上传第一张 panorama，工具会自动以它为底图。'
  } else if (tool === 'marker' && !selection) {
    label = '请先在左侧选择一个分类'
    sub = '选择分类后，按 M 工具在画布上点击即可放置 hotspot。'
  } else if (tool === 'marker') {
    label = '点击画布放置 hotspot'
  } else {
    label = '选择一个分类后开始编辑'
  }

  return (
    <Stack
      position="absolute"
      inset="0"
      align="center"
      justify="center"
      color="#94a3b8"
      fontSize="13px"
      gap="1.5"
      p="6"
      textAlign="center"
      pointerEvents="none"
    >
      <Plus size={28} strokeWidth={1} style={{ opacity: 0.4 }} />
      <Box fontWeight="500" color="#cbd5e1">
        {label}
      </Box>
      {sub && (
        <Box fontSize="12px" maxW="320px" opacity="0.8">
          {sub}
        </Box>
      )}
    </Stack>
  )
}

function ZoomButton({
  icon: IconComp,
  label,
  onClick,
  testid,
}: {
  icon: typeof ZoomIn
  label: string
  onClick: () => void
  testid: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      data-testid={testid}
      data-atlas-interactive="true"
      className="icon-btn"
      style={{
        width: 32,
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.78)',
        color: '#e2e8f0',
        borderRadius: 4,
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
      }}
    >
      <IconComp size={14} strokeWidth={1.75} />
    </button>
  )
}

const buttonResetStyle: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  boxSizing: 'border-box',
}

const markerButtonStyle: React.CSSProperties = {
  ...buttonResetStyle,
  width: `${ATLAS_MARKER_SIZE_PX}px`,
  height: `${ATLAS_MARKER_SIZE_PX}px`,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'grab',
  pointerEvents: 'auto',
  lineHeight: 0,
  flexShrink: 0,
}

const annotationLabelStyle: React.CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'clip',
  fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  fontStyle: 'normal',
  fontWeight: 600,
  fontSize: '16px',
  lineHeight: '20px',
  textAlign: 'center',
  color: 'inherit',
}

const annotationLabelStyleEllipsis: React.CSSProperties = {
  ...annotationLabelStyle,
  maxWidth: '100%',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function clamp(point: NormalizedPoint): NormalizedPoint {
  return {
    x: clampNumber(point.x, 0, 1),
    y: clampNumber(point.y, 0, 1),
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function ensureCategoryLayout(
  layout: CategorySpatialLayout | undefined,
  coord: NormalizedPoint,
): CategorySpatialLayout {
  if (layout?.hotspot) return layout
  return {
    viewport: layout?.viewport ?? { centerX: coord.x, centerY: coord.y, zoom: 2 },
    hotspot: coord,
  }
}

function hitTestHotspot(
  allCategories: Array<{ cat: { id: string } }>,
  layouts: Record<string, CategorySpatialLayout>,
  coord: NormalizedPoint,
): string | null {
  const radius = 0.04
  for (const { cat } of allCategories) {
    const layout = layouts[cat.id]
    if (!layout?.hotspot) continue
    if (Math.hypot(layout.hotspot.x - coord.x, layout.hotspot.y - coord.y) < radius) return cat.id
  }
  return null
}

function hitTestItem(
  layouts: Record<string, ItemSpatialLayout>,
  coord: NormalizedPoint,
): string | null {
  const radius = 0.03
  for (const [itemId, layout] of Object.entries(layouts)) {
    if (Math.hypot(layout.marker.x - coord.x, layout.marker.y - coord.y) < radius) return itemId
  }
  return null
}

function hasCalloutInCategory(project: GuideProject, categoryId: string): boolean {
  const stages = project.knowledge.stages as unknown as Array<{
    categories: Array<{ id: string; itemIds: string[] }>
  }>
  const category = stages.flatMap((stage) => stage.categories).find((entry) => entry.id === categoryId)
  if (!category) return false
  return category.itemIds.some((itemId) => Boolean(project.panorama.items[itemId]?.callout))
}

function isHotspotVisible(project: GuideProject, categoryId: string, zoom: number): boolean {
  const categoryLayout = project.panorama.categories[categoryId]
  const hotspotMinZoom = categoryLayout?.hotspotMinZoom
    ?? project.products.atlas.theme.hotspotMinZoom
    ?? DEFAULT_HOTSPOT_MIN_ZOOM
  if (zoom < hotspotMinZoom) return false
  const category = findCategory(project, categoryId)
  if (!category) return true
  return !category.itemIds.some((itemId) => {
    const itemLayout = project.panorama.items[itemId]
    if (!itemLayout?.callout) return false
    const calloutMinZoom = itemLayout.callout.minZoom
      ?? project.products.atlas.theme.calloutMinZoom
      ?? DEFAULT_CALLOUT_MIN_ZOOM
    return zoom >= calloutMinZoom
  })
}

function isItemVisible(project: GuideProject, itemId: string, zoom: number): boolean {
  const itemLayout = project.panorama.items[itemId]
  if (!itemLayout) return false
  if (itemLayout.callout) {
    const calloutMinZoom = itemLayout.callout.minZoom
      ?? project.products.atlas.theme.calloutMinZoom
      ?? DEFAULT_CALLOUT_MIN_ZOOM
    return zoom >= calloutMinZoom
  }
  const markerMinZoom = itemLayout.markerMinZoom
    ?? project.products.atlas.theme.itemMarkerMinZoom
    ?? DEFAULT_ITEM_MARKER_MIN_ZOOM
  return zoom >= markerMinZoom
}

function findCategory(project: GuideProject, categoryId: string): { id: string; itemIds: string[] } | null {
  const stages = project.knowledge.stages as unknown as Array<{
    categories: Array<{ id: string; itemIds: string[] }>
  }>
  return stages.flatMap((stage) => stage.categories).find((entry) => entry.id === categoryId) ?? null
}
