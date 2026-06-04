﻿import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Box, Button, Flex, Heading, Text, type ButtonProps } from '@chakra-ui/react'
import type {
  CameraState,
  SurfaceCard,
  SurfaceConfig,
  SurfaceFocusLayer,
  SurfaceHotspot,
} from '../../../shared/types'

const BORDER = '#2a2d3a'
const PANEL_BG = '#0a0b0f'
const MIN_PREVIEW_HEIGHT = 320
const DEFAULT_SOURCE_ASPECT = 375 / 808
const ZOOM_STEP = 1.12

type PreviewMode = 'browse' | 'cards' | 'hotspots'
type EditMode = 'card-anchor' | 'callout' | 'hotspot-anchor' | null
type PreviewDragKind = 'pan' | 'card-anchor' | 'callout' | 'hotspot-anchor'

interface SurfaceNodeDesignerProps {
  imageUrl?: string
  surfaceConfigText: string
  onSurfaceConfigTextChange: (value: string) => void
  surfaceLayersText: string
  onSurfaceLayersTextChange: (value: string) => void
  deviceAspectRatio?: number
  compact?: boolean
  editable?: boolean
  onOpenEditor?: () => void
}

interface PreviewViewportRect {
  x: number
  y: number
  width: number
  height: number
}

interface SurfacePreviewLayout {
  camera: CameraState
  viewportWidth: number
  viewportHeight: number
  baseWidth: number
  baseHeight: number
  originX: number
  originY: number
  scaledWidth: number
  scaledHeight: number
  translateX: number
  translateY: number
}

function parseJsonSafe<T>(value: string): T | null {
  if (!value.trim()) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function round(value: number): number {
  return Number(value.toFixed(6))
}

function getDefaultSurfaceConfig(imageUrl?: string): SurfaceConfig {
  return {
    sourceImageUrl: imageUrl ?? '',
    coordSpace: 'surface-normalized',
    initialCamera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    bounds: { minZoom: 1, maxZoom: 4 },
    gesture: { wheelZoom: true, dragPan: true },
  }
}

function getDefaultLayer(index: number): SurfaceFocusLayer {
  return {
    id: `layer_${index}`,
    title: `图层 ${index}`,
    visibility: {
      minZoom: 1,
      hotspotsMinZoom: 1,
      cardsMinZoom: 1.8,
    },
    cards: [],
    hotspots: [],
  }
}

function resolveDefaultHotspotTarget(
  layers: SurfaceFocusLayer[],
  currentLayerId: string | null,
  previewCamera: CameraState,
): SurfaceHotspot['target'] {
  const fallbackLayer = layers.find(layer => layer.id !== currentLayerId) ?? layers[0]
  if (fallbackLayer) {
    return {
      type: 'focus-layer',
      layerId: fallbackLayer.id,
    }
  }
  return {
    type: 'camera-preset',
    camera: previewCamera,
  }
}

function resolveSharedLayerThreshold(
  layers: SurfaceFocusLayer[],
  key: 'minZoom' | 'hotspotsMinZoom' | 'cardsMinZoom',
  fallback: number,
): number {
  const firstLayer = layers[0]
  if (!firstLayer) return fallback
  if (key === 'minZoom') return firstLayer.visibility.minZoom
  return firstLayer.visibility[key] ?? firstLayer.visibility.minZoom
}

function resolveLayerThreshold(
  layer: SurfaceFocusLayer,
): number {
  return layer.visibility.minZoom
}

function clampCameraToBounds(camera: CameraState, bounds: SurfaceConfig['bounds']): CameraState {
  return {
    centerX: round(clamp(camera.centerX, 0, 1)),
    centerY: round(clamp(camera.centerY, 0, 1)),
    zoom: round(clamp(camera.zoom, bounds.minZoom, bounds.maxZoom)),
  }
}

function clampSurfaceCameraForPreview(
  camera: CameraState,
  viewportRect: PreviewViewportRect,
  sourceAspect: number,
  bounds: SurfaceConfig['bounds'],
): CameraState {
  const safeViewportWidth = Math.max(viewportRect.width, 1)
  const safeViewportHeight = Math.max(viewportRect.height, 1)
  const safeSourceAspect = Math.max(sourceAspect, 0.0001)
  const minZoom = Math.max(bounds.minZoom, 0.0001)
  const maxZoom = Math.max(bounds.maxZoom, minZoom)
  const zoom = clamp(camera.zoom, minZoom, maxZoom)

  let baseWidth = safeViewportWidth
  let baseHeight = baseWidth / safeSourceAspect
  if (baseHeight < safeViewportHeight) {
    baseHeight = safeViewportHeight
    baseWidth = baseHeight * safeSourceAspect
  }

  const visibleWidthNorm = Math.min(safeViewportWidth / Math.max(baseWidth * zoom, 1), 1)
  const visibleHeightNorm = Math.min(safeViewportHeight / Math.max(baseHeight * zoom, 1), 1)

  return {
    centerX: round(clamp(camera.centerX, visibleWidthNorm / 2, 1 - visibleWidthNorm / 2)),
    centerY: round(clamp(camera.centerY, visibleHeightNorm / 2, 1 - visibleHeightNorm / 2)),
    zoom: round(zoom),
  }
}

function resolvePreviewLayout(
  viewportRect: PreviewViewportRect,
  sourceAspect: number,
  camera: CameraState,
  bounds: SurfaceConfig['bounds'],
): SurfacePreviewLayout {
  const safeViewportWidth = Math.max(viewportRect.width, 1)
  const safeViewportHeight = Math.max(viewportRect.height, 1)
  const safeSourceAspect = Math.max(sourceAspect, 0.0001)
  const nextCamera = clampSurfaceCameraForPreview(
    camera,
    viewportRect,
    safeSourceAspect,
    bounds,
  )

  let baseWidth = safeViewportWidth
  let baseHeight = baseWidth / safeSourceAspect
  if (baseHeight < safeViewportHeight) {
    baseHeight = safeViewportHeight
    baseWidth = baseHeight * safeSourceAspect
  }

  const originX = viewportRect.x + (safeViewportWidth - baseWidth) / 2
  const originY = viewportRect.y + (safeViewportHeight - baseHeight) / 2
  const scaledWidth = baseWidth * nextCamera.zoom
  const scaledHeight = baseHeight * nextCamera.zoom
  const translateX = viewportRect.x + safeViewportWidth / 2 - originX - nextCamera.centerX * scaledWidth
  const translateY = viewportRect.y + safeViewportHeight / 2 - originY - nextCamera.centerY * scaledHeight

  return {
    camera: nextCamera,
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
    baseWidth,
    baseHeight,
    originX,
    originY,
    scaledWidth,
    scaledHeight,
    translateX,
    translateY,
  }
}

function resolveDeviceViewportRect(
  containerWidth: number,
  containerHeight: number,
  aspectRatio: number,
): PreviewViewportRect {
  const height = Math.max(containerHeight, 1)
  const width = Math.max(height * Math.max(aspectRatio, 0.0001), 1)
  return {
    x: (containerWidth - width) / 2,
    y: 0,
    width,
    height,
  }
}

function projectPoint(point: { x: number; y: number }, layout: SurfacePreviewLayout) {
  return {
    x: layout.originX + layout.translateX + point.x * layout.scaledWidth,
    y: layout.originY + layout.translateY + point.y * layout.scaledHeight,
  }
}

function normalizePointFromViewport(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  layout: SurfacePreviewLayout,
) {
  return {
    x: clamp01((clientX - rect.left - layout.originX - layout.translateX) / Math.max(layout.scaledWidth, 1)),
    y: clamp01((clientY - rect.top - layout.originY - layout.translateY) / Math.max(layout.scaledHeight, 1)),
  }
}

function getBrowseAnnotations(layers: SurfaceFocusLayer[], camera: CameraState) {
  const visibleLayers = layers.filter(layer => camera.zoom >= resolveLayerThreshold(layer))
  const cards = visibleLayers.flatMap(layer => layer.cards)
  const hotspots = cards.length > 0
    ? []
    : visibleLayers.flatMap(layer => layer.hotspots)
  return { layers: visibleLayers, cards, hotspots }
}

function updateSelectedCard(
  layers: SurfaceFocusLayer[],
  selectedLayerId: string | null,
  selectedCardId: string | null,
  updater: (card: SurfaceCard) => SurfaceCard,
): SurfaceFocusLayer[] {
  return layers.map(layer => {
    if (layer.id !== selectedLayerId) return layer
    return {
      ...layer,
      cards: layer.cards.map(card => (card.id === selectedCardId ? updater(card) : card)),
    }
  })
}

function updateSelectedHotspot(
  layers: SurfaceFocusLayer[],
  selectedLayerId: string | null,
  selectedHotspotId: string | null,
  updater: (hotspot: SurfaceHotspot) => SurfaceHotspot,
): SurfaceFocusLayer[] {
  return layers.map(layer => {
    if (layer.id !== selectedLayerId) return layer
    return {
      ...layer,
      hotspots: layer.hotspots.map(hotspot => (
        hotspot.id === selectedHotspotId ? updater(hotspot) : hotspot
      )),
    }
  })
}

function updateSelectedLayer(
  layers: SurfaceFocusLayer[],
  selectedLayerId: string | null,
  updater: (layer: SurfaceFocusLayer) => SurfaceFocusLayer,
): SurfaceFocusLayer[] {
  return layers.map(layer => (
    layer.id === selectedLayerId ? updater(layer) : layer
  ))
}

function resolvePreviewCameraForLayer(
  layer: SurfaceFocusLayer | null,
  surfaceConfig: SurfaceConfig,
  mode: PreviewMode,
): CameraState {
  if (!layer) return surfaceConfig.initialCamera
  if (layer.cameraPreset) {
    return clampCameraToBounds({
      ...layer.cameraPreset,
      zoom: resolveLayerThreshold(layer),
    }, surfaceConfig.bounds)
  }

  const points = [
    ...layer.cards.map(card => card.anchor),
    ...layer.cards.flatMap(card => (card.callout ? [card.callout.target] : [])),
    ...layer.hotspots.map(hotspot => hotspot.anchor),
  ]
  if (!points.length) return surfaceConfig.initialCamera

  const minX = Math.min(...points.map(point => point.x))
  const maxX = Math.max(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  const maxY = Math.max(...points.map(point => point.y))
  const padding = 0.08
  const targetZoom = resolveLayerThreshold(layer)

  return clampCameraToBounds({
    centerX: clamp01((minX + maxX) / 2),
    centerY: clamp01((minY + maxY) / 2),
    zoom: Math.max(targetZoom, 1 / Math.max(maxX - minX + padding, maxY - minY + padding, 0.0001)),
  }, surfaceConfig.bounds)
}

function ActionButton({ active = false, ...props }: ButtonProps & { active?: boolean }) {
  return (
    <Button
      size="xs"
      variant="solid"
      color={active ? '#ffffff' : '#dbe7ff'}
      bg={active ? '#295dff' : 'rgba(82, 109, 176, 0.16)'}
      border="1px solid"
      borderColor={active ? 'rgba(96, 142, 255, 0.82)' : 'rgba(82, 109, 176, 0.26)'}
      _hover={{
        bg: active ? '#3467ff' : 'rgba(82, 109, 176, 0.24)',
      }}
      _active={{
        bg: active ? '#1f4fe8' : 'rgba(82, 109, 176, 0.28)',
      }}
      {...props}
    />
  )
}

function ControlField({
  label,
  value,
  onChange,
  type = 'text',
  step,
  min,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  step?: string
  min?: string
}) {
  return (
    <Box mb="2.5">
      <Text fontSize="xs" color="#8ea0c4" mb="1">{label}</Text>
      <input
        type={type}
        value={value}
        step={step}
        min={min}
        onChange={event => onChange(event.target.value)}
        style={{
          width: '100%',
          background: '#090b10',
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          color: '#e4e4e7',
          fontSize: 12,
          padding: '8px 10px',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
    </Box>
  )
}

function renderCardPreview(card: SurfaceCard, selected: boolean) {
  const distinctTags = (card.tags ?? []).filter(tagText =>
    !(card.stocks ?? []).some(stock => stock.label === tagText))

  return (
    <Box
      display="inline-flex"
      flexDir="column"
      alignItems="center"
      px="3"
      py="2"
      rounded="md"
      bg="rgba(255,255,255,0.94)"
      color="#111"
      border={selected ? '2px solid #f59e0b' : '1px solid rgba(0,0,0,0.14)'}
      boxShadow="0 8px 24px rgba(0, 0, 0, 0.16)"
      textAlign="center"
      maxW="220px"
      width="fit-content"
      minW="84px"
    >
      <Text fontSize="12px" fontWeight="600" lineHeight="18px" wordBreak="break-word">
        {card.title}
      </Text>
      {distinctTags.length > 0 && (
        <Flex mt="2" gap="1" wrap="wrap" justify="center">
          {distinctTags.map(tag => (
            <Box
              key={tag}
              px="2.5"
              py="0.5"
              rounded="full"
              bg="#FF2436"
              color="white"
              fontSize="10px"
              fontWeight="500"
              lineHeight="15px"
            >
              {tag}
            </Box>
          ))}
        </Flex>
      )}
      {card.stocks?.length ? (
        <Flex mt="2" gap="1" wrap="wrap" justify="center">
          {card.stocks.map(stock => (
            <Box
              key={stock.label}
              px="2.5"
              py="0.5"
              rounded="full"
              bg="#FF2436"
              color="white"
              fontSize="10px"
              fontWeight="500"
              lineHeight="15px"
            >
              {stock.label}
            </Box>
          ))}
        </Flex>
      ) : null}
    </Box>
  )
}

function SurfacePreview({
  imageUrl,
  surfaceConfig,
  layers,
  selectedLayerId,
  selectedCardId,
  selectedHotspotId,
  previewMode,
  editMode,
  editable,
  previewCamera,
  onPreviewCameraChange,
  onDragPoint,
  deviceAspectRatio,
  showDeviceFrame,
}: {
  imageUrl?: string
  surfaceConfig: SurfaceConfig
  layers: SurfaceFocusLayer[]
  selectedLayerId: string | null
  selectedCardId: string | null
  selectedHotspotId: string | null
  previewMode: PreviewMode
  editMode: EditMode
  editable: boolean
  previewCamera: CameraState
  onPreviewCameraChange: (camera: CameraState) => void
  onDragPoint?: (x: number, y: number) => void
  deviceAspectRatio: number
  showDeviceFrame: boolean
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragStateRef = useRef<
    | {
        kind: 'pan'
        pointerId: number
        startX: number
        startY: number
        startCamera: CameraState
      }
    | {
        kind: 'point'
        pointerId: number
        dragKind: Exclude<PreviewDragKind, 'pan'>
      }
    | null
  >(null)
  const [viewport, setViewport] = useState({ width: 1, height: MIN_PREVIEW_HEIGHT })
  const [sourceAspect, setSourceAspect] = useState(DEFAULT_SOURCE_ASPECT)
  const [spacePressed, setSpacePressed] = useState(false)
  const previewImageUrl = imageUrl ?? surfaceConfig.sourceImageUrl
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      setViewport({
        width: Math.max(entry.contentRect.width, 1),
        height: Math.max(entry.contentRect.height, MIN_PREVIEW_HEIGHT),
      })
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      event.preventDefault()
      setSpacePressed(true)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      setSpacePressed(false)
      dragStateRef.current = null
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    if (!previewImageUrl) {
      setSourceAspect(DEFAULT_SOURCE_ASPECT)
      setLoadedImage(null)
      return
    }

    let cancelled = false
    const probe = new window.Image()
    probe.decoding = 'async'
    const applyAspect = () => {
      if (cancelled) return
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setLoadedImage(probe)
        setSourceAspect(probe.naturalWidth / probe.naturalHeight)
      }
    }
    const handleError = () => {
      if (cancelled) return
      setLoadedImage(null)
    }

    probe.addEventListener('load', applyAspect)
    probe.addEventListener('error', handleError)
    probe.src = previewImageUrl
    if (probe.complete) {
      applyAspect()
    }

    return () => {
      cancelled = true
      probe.removeEventListener('load', applyAspect)
      probe.removeEventListener('error', handleError)
    }
  }, [previewImageUrl])

  const layout = useMemo(
    () => resolvePreviewLayout(
      resolveDeviceViewportRect(viewport.width, viewport.height, deviceAspectRatio),
      sourceAspect,
      previewCamera,
      surfaceConfig.bounds,
    ),
    [deviceAspectRatio, previewCamera, sourceAspect, surfaceConfig.bounds, viewport.height, viewport.width],
  )
  const deviceViewport = useMemo(
    () => resolveDeviceViewportRect(viewport.width, viewport.height, deviceAspectRatio),
    [deviceAspectRatio, viewport.height, viewport.width],
  )

  useEffect(() => {
    if (
      layout.camera.centerX !== previewCamera.centerX
      || layout.camera.centerY !== previewCamera.centerY
      || layout.camera.zoom !== previewCamera.zoom
    ) {
      onPreviewCameraChange(layout.camera)
    }
  }, [layout.camera, onPreviewCameraChange, previewCamera.centerX, previewCamera.centerY, previewCamera.zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const devicePixelRatio = window.devicePixelRatio || 1
    const width = Math.max(Math.round(viewport.width * devicePixelRatio), 1)
    const height = Math.max(Math.round(viewport.height * devicePixelRatio), 1)
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    if (!loadedImage) return
    ctx.drawImage(
      loadedImage,
      layout.originX + layout.translateX,
      layout.originY + layout.translateY,
      layout.scaledWidth,
      layout.scaledHeight,
    )
  }, [
    layout.originX,
    layout.originY,
    layout.scaledHeight,
    layout.scaledWidth,
    layout.translateX,
    layout.translateY,
    loadedImage,
    viewport.height,
    viewport.width,
  ])

  const selectedLayer = layers.find(layer => layer.id === selectedLayerId) ?? null
  const selectedCard = selectedLayer?.cards.find(card => card.id === selectedCardId) ?? null
  const selectedHotspot = selectedLayer?.hotspots.find(hotspot => hotspot.id === selectedHotspotId) ?? null
  const browseAnnotations = useMemo(
    () => getBrowseAnnotations(layers, layout.camera),
    [layers, layout.camera],
  )

  const previewCards = previewMode === 'browse'
    ? browseAnnotations.cards
    : previewMode === 'cards'
      ? selectedLayer?.cards ?? []
      : []

  const previewHotspots = previewMode === 'browse'
    ? browseAnnotations.hotspots
    : previewMode === 'hotspots'
      ? selectedLayer?.hotspots ?? []
      : []

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!editable || !imageUrl) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const normalized = normalizePointFromViewport(event.clientX, event.clientY, rect, layout)
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const nextZoom = layout.camera.zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
    onPreviewCameraChange(clampSurfaceCameraForPreview(
      {
        centerX: normalized.x - (pointerX - (deviceViewport.x + deviceViewport.width / 2)) / Math.max(layout.baseWidth * nextZoom, 1),
        centerY: normalized.y - (pointerY - (deviceViewport.y + deviceViewport.height / 2)) / Math.max(layout.baseHeight * nextZoom, 1),
        zoom: nextZoom,
      },
      deviceViewport,
      sourceAspect,
      surfaceConfig.bounds,
    ))
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || !imageUrl || !event.isPrimary) return
    const target = event.target as HTMLElement | null
    const dragKindAttr = target?.closest<HTMLElement>('[data-preview-drag-kind]')?.dataset.previewDragKind

    if (spacePressed) {
      dragStateRef.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startCamera: layout.camera,
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      event.preventDefault()
      return
    }

    if (dragKindAttr && onDragPoint) {
      dragStateRef.current = {
        kind: 'point',
        pointerId: event.pointerId,
        dragKind: dragKindAttr as Exclude<PreviewDragKind, 'pan'>,
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    if (dragState.kind === 'pan') {
      onPreviewCameraChange(clampSurfaceCameraForPreview(
        {
          centerX: dragState.startCamera.centerX - (event.clientX - dragState.startX) / Math.max(layout.baseWidth * layout.camera.zoom, 1),
          centerY: dragState.startCamera.centerY - (event.clientY - dragState.startY) / Math.max(layout.baseHeight * layout.camera.zoom, 1),
          zoom: dragState.startCamera.zoom,
        },
        deviceViewport,
        sourceAspect,
        surfaceConfig.bounds,
      ))
      return
    }

    if (!onDragPoint) return
    const rect = event.currentTarget.getBoundingClientRect()
    const normalized = normalizePointFromViewport(event.clientX, event.clientY, rect, layout)
    onDragPoint(normalized.x, normalized.y)
  }

  const clearDragState = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    dragStateRef.current = null
  }

  const panHint = spacePressed
    ? '已按下空格，可拖动画布'
    : '按住空格拖动画布，滚轮缩放预览'

  return (
    <Box
      ref={frameRef}
      position="relative"
      rounded="md"
      overflow="hidden"
      border={`1px solid ${BORDER}`}
      bg="#050608"
      h="100%"
      minH={`${MIN_PREVIEW_HEIGHT}px`}
      cursor={spacePressed ? 'grab' : editable ? 'default' : 'default'}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearDragState}
      onPointerCancel={clearDragState}
    >
      {previewImageUrl ? (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <Flex minH={`${MIN_PREVIEW_HEIGHT}px`} align="center" justify="center">
          <Text fontSize="sm" color="#8ea0c4">请先上传总图图片</Text>
        </Flex>
      )}

      {showDeviceFrame && (
        <>
          <Box
            position="absolute"
            inset="0"
            bg="rgba(4, 8, 18, 0.42)"
            pointerEvents="none"
          />
          <Box
            position="absolute"
            left={`${deviceViewport.x}px`}
            top={`${deviceViewport.y}px`}
            width={`${deviceViewport.width}px`}
            height={`${deviceViewport.height}px`}
            bg="transparent"
            border="2px dashed rgba(182, 214, 255, 0.95)"
            boxShadow="0 0 0 1px rgba(255,255,255,0.18), 0 0 0 9999px rgba(4, 8, 18, 0.18), 0 0 28px rgba(102, 163, 255, 0.28)"
            pointerEvents="none"
          />
        </>
      )}

      <Box position="absolute" inset="0" pointerEvents="none">
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          {previewCards.map(card => {
            if (!card.callout) return null
            const from = projectPoint(card.anchor, layout)
            const to = projectPoint(card.callout.target, layout)
            return (
              <line
                key={`${card.id}-callout`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={selectedCardId === card.id ? '#f59e0b' : 'rgba(255,255,255,0.95)'}
                strokeWidth="2"
                strokeLinecap="round"
              />
            )
          })}
        </svg>

        {previewHotspots.map(hotspot => {
          const point = projectPoint(hotspot.anchor, layout)
          const selected = hotspot.id === selectedHotspotId
          const draggable = selected && editMode === 'hotspot-anchor'
          return (
            <Box
              key={hotspot.id}
              position="absolute"
              left={`${point.x}px`}
              top={`${point.y}px`}
              transform="translate(-50%, -50%)"
              px="3"
              py="1.5"
              rounded="md"
              bg="rgba(255,255,255,0.96)"
              color="#111"
              border={selected ? '2px solid #f59e0b' : '1px solid rgba(0,0,0,0.14)'}
              boxShadow="0 8px 24px rgba(0,0,0,0.16)"
              fontSize="12px"
              lineHeight="18px"
              maxW="180px"
              textAlign="center"
              pointerEvents={draggable ? 'auto' : 'none'}
              cursor={draggable ? 'move' : 'default'}
              data-preview-drag-kind={draggable ? 'hotspot-anchor' : undefined}
            >
              {hotspot.label}
            </Box>
          )
        })}

        {previewCards.map(card => {
          const point = projectPoint(card.anchor, layout)
          const draggable = card.id === selectedCardId && editMode === 'card-anchor'
          return (
            <Box
              key={card.id}
              position="absolute"
              left={`${point.x}px`}
              top={`${point.y}px`}
              transform="translate(-50%, -50%)"
              pointerEvents={draggable ? 'auto' : 'none'}
              cursor={draggable ? 'move' : 'default'}
              data-preview-drag-kind={draggable ? 'card-anchor' : undefined}
            >
              {renderCardPreview(card, card.id === selectedCardId)}
            </Box>
          )
        })}

        {selectedCard?.callout && editMode === 'callout' && (() => {
          const targetPoint = projectPoint(selectedCard.callout.target, layout)
          return (
            <Box
              position="absolute"
              left={`${targetPoint.x}px`}
              top={`${targetPoint.y}px`}
              transform="translate(-50%, -50%)"
              w="14px"
              h="14px"
              rounded="full"
              bg="#f59e0b"
              border="2px solid white"
              boxShadow="0 8px 20px rgba(0,0,0,0.24)"
              pointerEvents="auto"
              cursor="move"
              data-preview-drag-kind="callout"
            />
          )
        })()}
      </Box>

      <Box position="absolute" top="3" right="3" px="3" py="2" bg="rgba(10,11,15,0.88)" rounded="md">
        <Text fontSize="xs" color="white">预览模式：{previewMode === 'browse' ? '浏览态' : previewMode === 'cards' ? '标的卡片' : 'Hotspots'}</Text>
        <Text fontSize="xs" color="rgba(255,255,255,0.72)">Zoom {layout.camera.zoom.toFixed(2)}</Text>
      </Box>

      <Box position="absolute" left="3" bottom="3" px="3" py="2" bg="rgba(10,11,15,0.88)" rounded="md" maxW="min(520px, calc(100% - 24px))">
        <Text fontSize="xs" color="white">{panHint}</Text>
        {editMode === 'card-anchor' && selectedCard && (
          <Text mt="1" fontSize="xs" color="rgba(255,255,255,0.72)">{`直接拖拽卡片 "${selectedCard.title}" 调整位置`}</Text>
        )}
        {editMode === 'callout' && selectedCard && (
          <Text mt="1" fontSize="xs" color="rgba(255,255,255,0.72)">{`拖拽橙色控制点调整卡片 "${selectedCard.title}" 的连线终点`}</Text>
        )}
        {editMode === 'hotspot-anchor' && selectedHotspot && (
          <Text mt="1" fontSize="xs" color="rgba(255,255,255,0.72)">{`直接拖拽热点 "${selectedHotspot.label}" 调整位置`}</Text>
        )}
      </Box>
    </Box>
  )
}

export function SurfaceNodeDesigner({
  imageUrl,
  surfaceConfigText,
  onSurfaceConfigTextChange,
  surfaceLayersText,
  onSurfaceLayersTextChange,
  deviceAspectRatio,
  compact = false,
  editable = true,
  onOpenEditor,
}: SurfaceNodeDesignerProps) {
  const layers = useMemo(
    () => parseJsonSafe<SurfaceFocusLayer[]>(surfaceLayersText) ?? [],
    [surfaceLayersText],
  )
  const surfaceConfig = useMemo(
    () => parseJsonSafe<SurfaceConfig>(surfaceConfigText) ?? getDefaultSurfaceConfig(imageUrl),
    [imageUrl, surfaceConfigText],
  )

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(layers[0]?.id ?? null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(layers[0]?.cards[0]?.id ?? null)
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(layers[0]?.hotspots[0]?.id ?? null)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('browse')
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [previewCamera, setPreviewCamera] = useState<CameraState>(surfaceConfig.initialCamera)
  const [showDeviceFrame, setShowDeviceFrame] = useState(true)
  const [editorNotice, setEditorNotice] = useState<string | null>(null)
  const resolvedDeviceAspectRatio = deviceAspectRatio ?? DEFAULT_SOURCE_ASPECT

  useEffect(() => {
    const nextLayer = layers.find(layer => layer.id === selectedLayerId) ?? layers[0] ?? null
    if (nextLayer?.id !== selectedLayerId) {
      setSelectedLayerId(nextLayer?.id ?? null)
    }
    const nextCard = nextLayer?.cards.find(card => card.id === selectedCardId) ?? nextLayer?.cards[0] ?? null
    if (nextCard?.id !== selectedCardId) {
      setSelectedCardId(nextCard?.id ?? null)
    }
    const nextHotspot = nextLayer?.hotspots.find(hotspot => hotspot.id === selectedHotspotId) ?? nextLayer?.hotspots[0] ?? null
    if (nextHotspot?.id !== selectedHotspotId) {
      setSelectedHotspotId(nextHotspot?.id ?? null)
    }
  }, [layers, selectedCardId, selectedHotspotId, selectedLayerId])

  useEffect(() => {
    setPreviewCamera(surfaceConfig.initialCamera)
  }, [surfaceConfig.initialCamera.centerX, surfaceConfig.initialCamera.centerY, surfaceConfig.initialCamera.zoom])

  const selectedLayer = layers.find(layer => layer.id === selectedLayerId) ?? null
  const selectedCard = selectedLayer?.cards.find(card => card.id === selectedCardId) ?? null
  const selectedHotspot = selectedLayer?.hotspots.find(hotspot => hotspot.id === selectedHotspotId) ?? null
  const sharedMinZoom = resolveSharedLayerThreshold(layers, 'minZoom', 1)
  const detailThresholdZoom = (
    selectedLayer && selectedLayer.id !== 'overview'
      ? selectedLayer.visibility.minZoom
      : layers.find(layer => layer.id !== 'overview')?.visibility.minZoom
  ) ?? sharedMinZoom
  const alignPreviewZoomToThreshold = () => {
    setPreviewCamera(current => clampCameraToBounds({
      ...current,
      zoom: detailThresholdZoom,
    }, surfaceConfig.bounds))
  }

  const applyLayers = (nextLayers: SurfaceFocusLayer[]) => {
    onSurfaceLayersTextChange(stringify(nextLayers))
  }

  const applySurfaceConfig = (nextConfig: SurfaceConfig) => {
    onSurfaceConfigTextChange(stringify(nextConfig))
  }

  const applySharedThreshold = (value: number) => {
    applyLayers(layers.map(layer => ({
      ...layer,
      visibility: {
        ...layer.visibility,
        minZoom: value,
        hotspotsMinZoom: value,
        cardsMinZoom: value,
      },
      cameraPreset: layer.cameraPreset
        ? {
            ...layer.cameraPreset,
            zoom: value,
          }
        : layer.cameraPreset,
    })))
  }

  const focusLayer = (layer: SurfaceFocusLayer | null, mode: PreviewMode) => {
    setPreviewCamera(resolvePreviewCameraForLayer(layer, surfaceConfig, mode))
  }

  const ensureDefaults = () => {
    if (!surfaceConfigText.trim()) {
      applySurfaceConfig(getDefaultSurfaceConfig(imageUrl))
    }
    if (layers.length === 0) {
      const nextLayer = getDefaultLayer(1)
      applyLayers([nextLayer])
      setSelectedLayerId(nextLayer.id)
      setPreviewMode('browse')
      focusLayer(nextLayer, 'browse')
    }
  }

  const addLayer = () => {
    const nextLayer: SurfaceFocusLayer = {
      ...getDefaultLayer(layers.length + 1),
      visibility: {
        minZoom: sharedMinZoom,
        hotspotsMinZoom: sharedMinZoom,
        cardsMinZoom: sharedMinZoom,
      },
    }
    const nextLayers = [...layers, nextLayer]
    applyLayers(nextLayers)
    setSelectedLayerId(nextLayer.id)
    setSelectedCardId(null)
    setSelectedHotspotId(null)
    setPreviewMode('browse')
    setEditMode(null)
    focusLayer(nextLayer, 'browse')
  }

  const addCard = () => {
    const targetLayerId = selectedLayerId ?? layers[0]?.id
    if (!targetLayerId) return
    const nextLayers = layers.map(layer => (
      layer.id === targetLayerId
        ? {
            ...layer,
            cards: [
              ...layer.cards,
              {
                id: `card_${Date.now()}`,
                title: `卡片 ${layer.cards.length + 1}`,
                anchor: { x: 0.5, y: 0.5 },
                coordSpace: 'surface-normalized',
                tags: [],
                stocks: [],
                callout: {
                  fromDock: 'bottom',
                  target: { x: 0.58, y: 0.62 },
                },
              },
            ],
          }
        : layer
    ))
    applyLayers(nextLayers)
    const latestLayer = nextLayers.find(layer => layer.id === targetLayerId) ?? null
    const latestCard = latestLayer?.cards[latestLayer.cards.length - 1] ?? null
    setSelectedCardId(latestCard?.id ?? null)
    setPreviewMode('cards')
    setEditMode('card-anchor')
    focusLayer(latestLayer, 'cards')
  }

  const addHotspot = () => {
    const targetLayerId = selectedLayerId ?? layers[0]?.id
    if (!targetLayerId) return
    const defaultTarget = resolveDefaultHotspotTarget(layers, targetLayerId, previewCamera)
    const nextLayers = layers.map(layer => (
      layer.id === targetLayerId
        ? {
            ...layer,
            hotspots: [
              ...layer.hotspots,
              {
                id: `hotspot_${Date.now()}`,
                label: `热点 ${layer.hotspots.length + 1}`,
                anchor: { x: 0.5, y: 0.5 },
                coordSpace: 'surface-normalized',
                target: defaultTarget,
              },
            ],
          }
        : layer
    ))
    applyLayers(nextLayers)
    const latestLayer = nextLayers.find(layer => layer.id === targetLayerId) ?? null
    const latestHotspot = latestLayer?.hotspots[latestLayer.hotspots.length - 1] ?? null
    setSelectedHotspotId(latestHotspot?.id ?? null)
    setPreviewMode('hotspots')
    setEditMode('hotspot-anchor')
    focusLayer(latestLayer, 'hotspots')
  }

  const handleDragPoint = (x: number, y: number) => {
    if (!selectedLayerId || !editMode) return
    if (editMode === 'hotspot-anchor' && selectedHotspotId) {
      applyLayers(updateSelectedHotspot(layers, selectedLayerId, selectedHotspotId, hotspot => ({
        ...hotspot,
        anchor: { x, y },
      })))
      return
    }
    if (!selectedCardId) return
    applyLayers(updateSelectedCard(layers, selectedLayerId, selectedCardId, card => (
      editMode === 'card-anchor'
        ? { ...card, anchor: { x, y } }
        : {
            ...card,
            callout: {
              fromDock: card.callout?.fromDock ?? 'bottom',
              target: { x, y },
            },
          }
    )))
  }

  if (compact) {
    return (
      <Box mb="4" p="3" rounded="md" border={`1px solid ${BORDER}`} bg={PANEL_BG}>
        <Box h="260px">
          <SurfacePreview
            imageUrl={imageUrl}
            surfaceConfig={surfaceConfig}
            layers={layers}
            selectedLayerId={selectedLayerId}
            selectedCardId={selectedCardId}
            selectedHotspotId={selectedHotspotId}
            previewMode="browse"
            editMode={null}
            editable={false}
            previewCamera={surfaceConfig.initialCamera}
            onPreviewCameraChange={() => {}}
            deviceAspectRatio={resolvedDeviceAspectRatio}
            showDeviceFrame={false}
          />
        </Box>
        <Flex mt="3" gap="2" justify="space-between">
          <ActionButton onClick={ensureDefaults}>初始化 Surface</ActionButton>
          {onOpenEditor && (
            <ActionButton active onClick={onOpenEditor}>打开大画布编辑</ActionButton>
          )}
        </Flex>
      </Box>
    )
  }

  return (
    <Flex gap="4" h="100%" minH="0">
      <Box flex="1" minW="0" minH="0" display="flex" flexDir="column">
        <Box flex="1" minH="420px">
          <SurfacePreview
            imageUrl={imageUrl}
            surfaceConfig={surfaceConfig}
            layers={layers}
            selectedLayerId={selectedLayerId}
            selectedCardId={selectedCardId}
            selectedHotspotId={selectedHotspotId}
            previewMode={previewMode}
            editMode={editable ? editMode : null}
            editable={editable}
            previewCamera={previewCamera}
            onPreviewCameraChange={setPreviewCamera}
            onDragPoint={editable ? handleDragPoint : undefined}
            deviceAspectRatio={resolvedDeviceAspectRatio}
            showDeviceFrame={showDeviceFrame}
          />
        </Box>
        <Flex mt="3" gap="2" wrap="wrap">
          <ActionButton onClick={ensureDefaults}>初始化</ActionButton>
          <ActionButton active={previewMode === 'browse'} onClick={() => {
            setPreviewMode('browse')
            setEditMode(null)
            focusLayer(selectedLayer, 'browse')
          }}>
            浏览预览
          </ActionButton>
          <ActionButton active={previewMode === 'cards'} onClick={() => {
            setPreviewMode('cards')
            setEditMode(null)
            focusLayer(selectedLayer, 'cards')
          }} disabled={!selectedLayer}>
            只看标的
          </ActionButton>
          <ActionButton active={previewMode === 'hotspots'} onClick={() => {
            setPreviewMode('hotspots')
            setEditMode(null)
            focusLayer(selectedLayer, 'hotspots')
          }} disabled={!selectedLayer}>
            只看 Hotspots
          </ActionButton>
          <ActionButton onClick={() => setPreviewCamera(surfaceConfig.initialCamera)}>
            重置视角
          </ActionButton>
          <ActionButton onClick={alignPreviewZoomToThreshold}>
            缩放到阈值
          </ActionButton>
          <ActionButton onClick={addLayer}>新增图层</ActionButton>
          <ActionButton onClick={addCard} disabled={!layers.length}>新增卡片</ActionButton>
          <ActionButton onClick={addHotspot} disabled={!layers.length}>新增 Hotspot</ActionButton>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#dbe7ff', fontSize: 12, padding: '0 4px' }}>
            <input
              type="checkbox"
              checked={showDeviceFrame}
              onChange={event => setShowDeviceFrame(event.target.checked)}
            />
            显示设备取景框
          </label>
        </Flex>
      </Box>

      <Box w="360px" minW="360px" h="100%" overflow="auto" pr="1">
        <Heading size="xs" mb="2" color="#dbe7ff">Surface 图层</Heading>
        <Box mb="3" p="3" border={`1px solid ${BORDER}`} rounded="md" bg={PANEL_BG}>
          {layers.map(layer => (
            <Box key={layer.id} mb="2">
              <ActionButton
                active={selectedLayerId === layer.id}
                onClick={() => {
                  setSelectedLayerId(layer.id)
                  setSelectedCardId(layer.cards[0]?.id ?? null)
                  setSelectedHotspotId(layer.hotspots[0]?.id ?? null)
                  focusLayer(layer, previewMode)
                }}
              >
                {layer.title}
              </ActionButton>
            </Box>
          ))}
          {layers.length === 0 && (
            <Text fontSize="xs" color="#8ea0c4">暂无图层，点击“初始化”或“新增图层”。</Text>
          )}
        </Box>

        {selectedLayer && (
          <Box mb="3" p="3" border={`1px solid ${BORDER}`} rounded="md" bg={PANEL_BG}>
            <Heading size="xs" mb="2" color="#dbe7ff">当前图层</Heading>
            <ControlField
              label="图层标题"
              value={selectedLayer.title}
              onChange={value => applyLayers(updateSelectedLayer(layers, selectedLayer.id, layer => ({ ...layer, title: value })))}
            />
            <ControlField
              label="全图显示阈值"
              type="number"
              step="0.1"
              min="0.1"
              value={String(sharedMinZoom)}
              onChange={value => {
                const next = Number(value || sharedMinZoom)
                applySharedThreshold(next)
              }}
            />
            <ActionButton onClick={() => {
              applyLayers(updateSelectedLayer(layers, selectedLayer.id, layer => ({
                ...layer,
                cameraPreset: {
                  ...previewCamera,
                  zoom: sharedMinZoom,
                },
              })))
              setEditorNotice(`已写入图层 "${selectedLayer.title}" 的 cameraPreset，点击保存后生效`)
            }}>
              用当前视角写入 cameraPreset
            </ActionButton>
            {editorNotice && (
              <Text mt="2" fontSize="xs" color="#8fd3ff">{editorNotice}</Text>
            )}
          </Box>
        )}

        {selectedLayer && (
          <Box mb="3" p="3" border={`1px solid ${BORDER}`} rounded="md" bg={PANEL_BG}>
            <Heading size="xs" mb="2" color="#dbe7ff">标的卡片</Heading>
            <Flex gap="2" wrap="wrap" mb="3">
              {selectedLayer.cards.map(card => (
                <ActionButton
                  key={card.id}
                  active={selectedCardId === card.id}
                  onClick={() => {
                    setSelectedCardId(card.id)
                    setPreviewMode('cards')
                    focusLayer(selectedLayer, 'cards')
                  }}
                >
                  {card.title}
                </ActionButton>
              ))}
              {!selectedLayer.cards.length && (
                <Text fontSize="xs" color="#8ea0c4">当前图层暂无卡片</Text>
              )}
            </Flex>

            {selectedCard && (
              <>
                <ControlField
                  label="卡片标题"
                  value={selectedCard.title}
                  onChange={value => {
                    applyLayers(updateSelectedCard(layers, selectedLayer.id, selectedCard.id, card => ({
                      ...card,
                      title: value,
                    })))
                  }}
                />
                <Text fontSize="xs" color="#8ea0c4" mb="1">连线方向</Text>
                <select
                  value={selectedCard.callout?.fromDock ?? 'bottom'}
                  onChange={event => {
                    applyLayers(updateSelectedCard(layers, selectedLayer.id, selectedCard.id, card => ({
                      ...card,
                      callout: {
                        fromDock: event.target.value as 'top' | 'right' | 'bottom' | 'left',
                        target: card.callout?.target ?? { x: 0.58, y: 0.62 },
                      },
                    })))
                  }}
                  style={{
                    width: '100%',
                    background: '#090b10',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    color: '#e4e4e7',
                    fontSize: 12,
                    padding: '8px 10px',
                    boxSizing: 'border-box',
                    outline: 'none',
                    marginBottom: 10,
                  }}
                >
                  <option value="top">top</option>
                  <option value="right">right</option>
                  <option value="bottom">bottom</option>
                  <option value="left">left</option>
                </select>
                <Flex gap="2" wrap="wrap">
                  <ActionButton active={editMode === 'card-anchor'} onClick={() => {
                    setPreviewMode('cards')
                    setEditMode(editMode === 'card-anchor' ? null : 'card-anchor')
                    focusLayer(selectedLayer, 'cards')
                  }}>
                    拖拽卡片位置
                  </ActionButton>
                  <ActionButton active={editMode === 'callout'} onClick={() => {
                    setPreviewMode('cards')
                    setEditMode(editMode === 'callout' ? null : 'callout')
                    focusLayer(selectedLayer, 'cards')
                  }}>
                    拖拽连线终点
                  </ActionButton>
                </Flex>
              </>
            )}
          </Box>
        )}

        {selectedLayer && (
          <Box mb="3" p="3" border={`1px solid ${BORDER}`} rounded="md" bg={PANEL_BG}>
            <Heading size="xs" mb="2" color="#dbe7ff">Hotspots</Heading>
            <Flex gap="2" wrap="wrap" mb="3">
              {selectedLayer.hotspots.map(hotspot => (
                <ActionButton
                  key={hotspot.id}
                  active={selectedHotspotId === hotspot.id}
                  onClick={() => {
                    setSelectedHotspotId(hotspot.id)
                    setPreviewMode('hotspots')
                    focusLayer(selectedLayer, 'hotspots')
                  }}
                >
                  {hotspot.label}
                </ActionButton>
              ))}
              {!selectedLayer.hotspots.length && (
                <Text fontSize="xs" color="#8ea0c4">当前图层暂无 Hotspot</Text>
              )}
            </Flex>

            {selectedHotspot && (
              <>
                <ControlField
                  label="Hotspot 标题"
                  value={selectedHotspot.label}
                  onChange={value => {
                    applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                      ...hotspot,
                      label: value,
                    })))
                  }}
                />
                <Text fontSize="xs" color="#8ea0c4" mb="1">目标类型</Text>
                <select
                  value={selectedHotspot.target.type}
                  onChange={event => {
                    const nextType = event.target.value as SurfaceHotspot['target']['type']
                    applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => {
                      if (nextType === 'focus-layer') {
                        const fallbackLayerId = layers.find(layer => layer.id !== selectedLayer.id)?.id ?? selectedLayer.id
                        return {
                          ...hotspot,
                          target: {
                            type: 'focus-layer',
                            layerId: fallbackLayerId,
                          },
                        }
                      }
                      if (nextType === 'edge') {
                        return {
                          ...hotspot,
                          target: {
                            type: 'edge',
                            edgeId: hotspot.target.type === 'edge' ? hotspot.target.edgeId : '',
                          },
                        }
                      }
                      return {
                        ...hotspot,
                        target: {
                          type: 'camera-preset',
                          camera: previewCamera,
                        },
                      }
                    }))
                  }}
                  style={{
                    width: '100%',
                    background: '#090b10',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    color: '#e4e4e7',
                    fontSize: 12,
                    padding: '8px 10px',
                    boxSizing: 'border-box',
                    outline: 'none',
                    marginBottom: 10,
                  }}
                >
                  <option value="focus-layer">focus-layer</option>
                  <option value="camera-preset">camera-preset</option>
                  <option value="edge">edge</option>
                </select>
                {selectedHotspot.target.type === 'focus-layer' && (
                  <>
                    <Text fontSize="xs" color="#8ea0c4" mb="1">目标图层</Text>
                    <select
                      value={selectedHotspot.target.layerId}
                      onChange={event => {
                        applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                          ...hotspot,
                          target: {
                            type: 'focus-layer',
                            layerId: event.target.value,
                          },
                        })))
                      }}
                      style={{
                        width: '100%',
                        background: '#090b10',
                        border: `1px solid ${BORDER}`,
                        borderRadius: 6,
                        color: '#e4e4e7',
                        fontSize: 12,
                        padding: '8px 10px',
                        boxSizing: 'border-box',
                        outline: 'none',
                        marginBottom: 10,
                      }}
                    >
                      {layers.map(layer => (
                        <option key={layer.id} value={layer.id}>{layer.title}</option>
                      ))}
                    </select>
                  </>
                )}
                {selectedHotspot.target.type === 'camera-preset' && (
                  <ActionButton onClick={() => {
                    applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                      ...hotspot,
                      target: {
                        type: 'camera-preset',
                        camera: previewCamera,
                      },
                    })))
                  }}>
                    用当前视角写入热点镜头
                  </ActionButton>
                )}
                {selectedHotspot.target.type === 'edge' && (
                  <ControlField
                    label="目标 Edge ID"
                    value={selectedHotspot.target.edgeId}
                    onChange={value => {
                      applyLayers(updateSelectedHotspot(layers, selectedLayer.id, selectedHotspot.id, hotspot => ({
                        ...hotspot,
                        target: {
                          type: 'edge',
                          edgeId: value,
                        },
                      })))
                    }}
                  />
                )}
                <ActionButton active={editMode === 'hotspot-anchor'} onClick={() => {
                  setPreviewMode('hotspots')
                  setEditMode(editMode === 'hotspot-anchor' ? null : 'hotspot-anchor')
                  focusLayer(selectedLayer, 'hotspots')
                }}>
                  拖拽 Hotspot 位置
                </ActionButton>
              </>
            )}
          </Box>
        )}

        <Text fontSize="xs" color="#8ea0c4" mb="1.5">surfaceConfig JSON</Text>
        <textarea
          value={surfaceConfigText}
          onChange={event => onSurfaceConfigTextChange(event.target.value)}
          rows={10}
          style={{
            width: '100%',
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: '#e4e4e7',
            fontSize: 12,
            padding: 12,
            boxSizing: 'border-box',
          }}
        />
        <Text fontSize="xs" color="#8ea0c4" mt="3" mb="1.5">surfaceLayers JSON</Text>
        <textarea
          value={surfaceLayersText}
          onChange={event => onSurfaceLayersTextChange(event.target.value)}
          rows={16}
          style={{
            width: '100%',
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            color: '#e4e4e7',
            fontSize: 12,
            padding: 12,
            boxSizing: 'border-box',
          }}
        />
      </Box>
    </Flex>
  )
}

export function SurfaceNodeEditorModal(props: SurfaceNodeDesignerProps & {
  isOpen: boolean
  onClose: () => void
  onSaveCurrent: () => Promise<boolean> | boolean
  saving: boolean
}) {
  const { isOpen, onClose, onSaveCurrent, saving, ...designerProps } = props
  if (!isOpen) return null

  return (
    <Flex position="fixed" inset="0" zIndex={300} align="center" justify="center">
      <Box position="fixed" inset="0" bg="rgba(2,3,5,0.78)" onClick={onClose} />
      <Box position="relative" zIndex={1} w="min(1440px, 96vw)" h="min(900px, 92vh)" bg="#111318" rounded="lg" border={`1px solid ${BORDER}`} p="5">
        <Flex align="center" justify="space-between" mb="4">
          <Heading size="sm" color="white">Surface 节点编辑器</Heading>
          <Flex gap="2">
            <ActionButton onClick={onClose}>关闭</ActionButton>
            <ActionButton
              active
              onClick={async () => {
                const saved = await onSaveCurrent()
                if (saved) {
                  onClose()
                }
              }}
              loading={saving}
            >
              保存并关闭
            </ActionButton>
          </Flex>
        </Flex>
        <Box h="calc(100% - 52px)">
          <SurfaceNodeDesigner {...designerProps} compact={false} editable />
        </Box>
      </Box>
    </Flex>
  )
}
