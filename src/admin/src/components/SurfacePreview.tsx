import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Box, Flex, Text } from '@chakra-ui/react'
import type { CameraState, SurfaceConfig, SurfaceFocusLayer } from '../../../shared/types'
import {
  type EditMode,
  type PreviewDragKind,
  BORDER,
  MIN_PREVIEW_HEIGHT,
  DEFAULT_SOURCE_ASPECT,
  ZOOM_STEP,
  clampSurfaceCameraForPreview,
  getBrowseAnnotations,
  getHotspotMarkerConfig,
  normalizePointFromViewport,
  parseHotspotPreviewStyle,
  projectPoint,
  resolveDeviceViewportRect,
  resolvePreviewLayout,
} from './surface-node-utils'

function MarkerPreview({ selected = false }: { selected?: boolean }) {
  return (
    <Box position="relative" w="21px" h="21px" flexShrink={0}>
      <Box
        position="absolute"
        inset="0"
        rounded="full"
        bg={selected ? 'rgba(255, 36, 54, 0.1)' : 'rgba(255,255,255,0.1)'}
        border={selected ? '0.5px solid #FF2436' : '0.5px solid rgba(255,255,255,0.9)'}
      />
      <Box
        position="absolute"
        left="50%"
        top="50%"
        transform="translate(-50%, -50%)"
        w={selected ? '11px' : '9px'}
        h={selected ? '11px' : '9px'}
        rounded="full"
        bg={selected ? '#FF2436' : '#FFFFFF'}
        border={selected ? '1px solid #FFFFFF' : 'none'}
      />
    </Box>
  )
}

function renderTertiaryButtonPreview(card: { title: string }, selected: boolean) {
  return (
    <Box
      display="flex"
      flexDir="column"
      alignItems="center"
      gap="6px"
    >
      <MarkerPreview selected={selected} />
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        minW="80px"
        h="36px"
        px="3"
        py="2"
        rounded="30px"
        bg={selected ? '#3366FF' : 'rgba(255,255,255,0.8)'}
        color={selected ? '#FFFFFF' : 'rgba(0,0,0,0.84)'}
        border={selected ? 'none' : '1px solid rgba(255,255,255,0.36)'}
        boxShadow="0 8px 24px rgba(0, 0, 0, 0.08)"
        textAlign="center"
        maxW="180px"
      >
        <Text fontSize="16px" fontWeight="600" lineHeight="20px" wordBreak="break-word" noOfLines={1}>
          {card.title}
        </Text>
      </Box>
    </Box>
  )
}

function renderBottomSheetPreview(layer: SurfaceFocusLayer, selectedCardId: string | null) {
  return (
    <Box
      position="absolute"
      left="0"
      right="0"
      bottom="0"
      display="flex"
      flexDir="column"
      gap="14px"
      px="4"
      pt="3.5"
      pb="4"
      borderTopLeftRadius="20px"
      borderTopRightRadius="20px"
      bg="rgba(250, 250, 250, 0.94)"
      boxShadow="0 -10px 36px rgba(15, 23, 42, 0.12)"
      backdropFilter="blur(18px)"
      pointerEvents="none"
    >
      <Flex align="center" justify="space-between" gap="3">
        <Text
          flex="1"
          minW="0"
          fontSize="15px"
          lineHeight="22px"
          fontWeight="600"
          color="rgba(0, 0, 0, 0.84)"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {`${layer.primaryCategory ?? ''} > ${layer.title}`.trim()}
        </Text>
        <Flex align="center" gap="1.5">
          <Box w="28px" h="28px" rounded="full" bg="#FFFFFF" boxShadow="0 4px 14px rgba(15, 23, 42, 0.10)" />
          <Box w="28px" h="28px" rounded="full" bg="transparent" />
        </Flex>
      </Flex>
      <Flex gap="3" overflowX="hidden">
        {layer.cards.map(card => {
          const selected = card.id === selectedCardId
          return (
            <Box
              key={card.id}
              flex="0 0 260px"
              minH="108px"
              px="4"
              py="3.5"
              borderRadius="12px"
              border={selected ? '2px solid #3366FF' : '1px solid rgba(15, 23, 42, 0.08)'}
              bg={selected ? 'rgba(51, 102, 255, 0.10)' : '#FFFFFF'}
              boxShadow="0 8px 24px rgba(15, 23, 42, 0.06)"
            >
              <Text fontSize="16px" lineHeight="22px" fontWeight="700" color="rgba(0, 0, 0, 0.88)">
                {card.title}
              </Text>
              <Text mt="2" fontSize="14px" lineHeight="22px" color="rgba(0, 0, 0, 0.72)" noOfLines={3}>
                {card.description ?? '请填写三级按钮说明文案'}
              </Text>
            </Box>
          )
        })}
      </Flex>
    </Box>
  )
}

export function SurfacePreview({
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
  previewMode: string
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
        {previewHotspots.map(hotspot => {
          const point = projectPoint(hotspot.anchor, layout)
          const selected = hotspot.id === selectedHotspotId
          const draggable = selected && editMode === 'hotspot-anchor'
          const markerConfig = getHotspotMarkerConfig(hotspot.style)
          const previewStyle = parseHotspotPreviewStyle(hotspot.style)
          return (
            <Box
              key={hotspot.id}
              position="absolute"
              left={`${point.x}px`}
              top={`${point.y}px`}
              transform="translate(-50%, -50%)"
              display="flex"
              flexDir="column"
              alignItems="center"
              gap={`${markerConfig.gapPx}px`}
              pointerEvents="none"
            >
              {markerConfig.visible && markerConfig.position === 'top' && <MarkerPreview />}
              <Box
                px="3"
                py="2"
                minW="88px"
                h="36px"
                rounded="30px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                bg="rgba(255,255,255,0.96)"
                color="#111"
                border={selected ? '2px solid #f59e0b' : '1px solid rgba(0,0,0,0.14)'}
                boxShadow="0 8px 24px rgba(0,0,0,0.16)"
                fontSize="16px"
                fontWeight="600"
                lineHeight="20px"
                maxW="180px"
                textAlign="center"
                pointerEvents={draggable ? 'auto' : 'none'}
                cursor={draggable ? 'move' : 'default'}
                data-preview-drag-kind={draggable ? 'hotspot-anchor' : undefined}
                style={previewStyle}
              >
                {hotspot.label}
              </Box>
              {markerConfig.visible && markerConfig.position === 'bottom' && <MarkerPreview />}
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
              {renderTertiaryButtonPreview(card, card.id === selectedCardId)}
            </Box>
          )
        })}
      </Box>

      {selectedLayer && previewMode !== 'browse' && renderBottomSheetPreview(selectedLayer, selectedCardId)}

      <Box position="absolute" top="3" right="3" px="3" py="2" bg="rgba(10,11,15,0.88)" rounded="md">
        <Text fontSize="xs" color="white">预览模式：{previewMode === 'browse' ? '运行时预览' : previewMode === 'cards' ? '三级按钮编辑' : '二级热点编辑'}</Text>
        <Text fontSize="xs" color="rgba(255,255,255,0.72)">Zoom {layout.camera.zoom.toFixed(2)}</Text>
      </Box>

      <Box position="absolute" left="3" bottom="3" px="3" py="2" bg="rgba(10,11,15,0.88)" rounded="md" maxW="min(520px, calc(100% - 24px))">
        <Text fontSize="xs" color="white">{panHint}</Text>
        {editMode === 'card-anchor' && selectedCard && (
          <Text mt="1" fontSize="xs" color="rgba(255,255,255,0.72)">{`直接拖拽三级按钮 "${selectedCard.title}" 调整位置`}</Text>
        )}
        {editMode === 'hotspot-anchor' && selectedHotspot && (
          <Text mt="1" fontSize="xs" color="rgba(255,255,255,0.72)">{`直接拖拽二级热点 "${selectedHotspot.label}" 调整位置`}</Text>
        )}
      </Box>
    </Box>
  )
}
