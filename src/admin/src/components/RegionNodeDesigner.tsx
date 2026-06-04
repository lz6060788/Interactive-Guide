import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Box, Button, Flex, HStack, IconButton, Text } from '@chakra-ui/react'
import { Expand, Minus, Plus, X } from 'lucide-react'
import type {
  ImageFitMode,
  NormalizedPoint,
  PackageResolution,
  QuadRange,
  RegionOverlayCard,
  RegionOverlayConfig,
  RegionViewportConfig,
} from '../../../shared/types'
import { getResolutionAspectRatio } from '../../../shared/utils'

const BORDER = '#2a2d3a'
const HANDLE_SIZE = 12
const MIN_RANGE_SIZE = 0.03
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const ZOOM_STEP = 1.12

type Rect = {
  left: number
  top: number
  right: number
  bottom: number
}

type DragState =
  | {
      kind: 'pan-move'
      startX: number
      startY: number
      startRect: Rect
    }
  | {
      kind: 'pan-resize'
      handle: 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'
      startX: number
      startY: number
      startRect: Rect
    }
  | {
      kind: 'card-move'
      cardId: string
      startX: number
      startY: number
      startAnchor: NormalizedPoint
    }

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
}

function toRect(range: QuadRange): Rect {
  return {
    left: range.topLeft.x,
    top: range.topLeft.y,
    right: range.bottomRight.x,
    bottom: range.bottomRight.y,
  }
}

function toQuad(rect: Rect): QuadRange {
  return {
    topLeft: { x: rect.left, y: rect.top },
    topRight: { x: rect.right, y: rect.top },
    bottomRight: { x: rect.right, y: rect.bottom },
    bottomLeft: { x: rect.left, y: rect.bottom },
  }
}

function normalizeRect(rect: Rect): Rect {
  let left = clamp01(Math.min(rect.left, rect.right))
  let right = clamp01(Math.max(rect.left, rect.right))
  let top = clamp01(Math.min(rect.top, rect.bottom))
  let bottom = clamp01(Math.max(rect.top, rect.bottom))

  if (right - left < MIN_RANGE_SIZE) {
    if (right >= 1) {
      left = Math.max(0, 1 - MIN_RANGE_SIZE)
      right = 1
    } else {
      right = Math.min(1, left + MIN_RANGE_SIZE)
    }
  }

  if (bottom - top < MIN_RANGE_SIZE) {
    if (bottom >= 1) {
      top = Math.max(0, 1 - MIN_RANGE_SIZE)
      bottom = 1
    } else {
      bottom = Math.min(1, top + MIN_RANGE_SIZE)
    }
  }

  return { left, top, right, bottom }
}

function parseRegionViewport(text: string): RegionViewportConfig | null {
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as RegionViewportConfig
  } catch {
    return null
  }
}

function parseRegionOverlay(text: string): RegionOverlayConfig | null {
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as RegionOverlayConfig
  } catch {
    return null
  }
}

interface RegionNodeDesignerProps {
  imageUrl?: string
  sourceNodeTitle?: string
  packageResolution?: PackageResolution
  imageFitMode?: ImageFitMode
  regionViewportText: string
  onRegionViewportTextChange: (value: string) => void
  regionOverlayText: string
  onRegionOverlayTextChange: (value: string) => void
  compact?: boolean
  editable?: boolean
  onOpenEditor?: () => void
}

interface RegionNodeEditorModalProps extends Omit<RegionNodeDesignerProps, 'compact' | 'editable' | 'onOpenEditor'> {
  isOpen: boolean
  onClose: () => void
  onSaveCurrent?: () => void
  saving?: boolean
}

export function RegionNodeEditorModal({
  isOpen,
  onClose,
  onSaveCurrent,
  saving,
  ...props
}: RegionNodeEditorModalProps) {
  if (!isOpen) return null

  return (
    <Flex position="fixed" inset="0" zIndex={220} align="center" justify="center">
      <Box position="absolute" inset="0" bg="blackAlpha.800" onClick={onClose} />
      <Box
        position="relative"
        zIndex={1}
        w="min(92vw, 1600px)"
        h="min(92vh, 980px)"
        bg="#0b0d12"
        rounded="xl"
        overflow="hidden"
        style={{ border: `1px solid ${BORDER}`, boxShadow: '0 40px 90px rgba(0,0,0,0.55)' }}
      >
        <Flex align="center" justify="space-between" px="5" py="4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <Box>
            <Text fontSize="sm" fontWeight="700" color="text-primary">Region 大画布编辑</Text>
            <Text fontSize="xs" color="text-tertiary">滚轮缩放画布，按住空格拖动画布浏览，调整结果会同步回节点详情。</Text>
          </Box>
          <IconButton
            size="sm"
            variant="ghost"
            color="text-secondary"
            _hover={{ bg: 'surface-raised' }}
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </IconButton>
        </Flex>
        <Box p="5" h="calc(100% - 134px)" overflow="hidden">
          <RegionNodeDesigner {...props} />
        </Box>
        <Flex
          align="center"
          justify="space-between"
          px="5"
          py="4"
          style={{ borderTop: `1px solid ${BORDER}`, background: '#090b10' }}
        >
          <Text fontSize="xs" color="text-tertiary">
            调整完成后可直接保存节点，无需返回详情弹窗底部。
          </Text>
          <HStack gap="2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              返回详情
            </Button>
            <Button size="sm" bg="brand" color="white" _hover={{ bg: 'brand-hover' }} onClick={onSaveCurrent} loading={saving}>
              保存节点
            </Button>
          </HStack>
        </Flex>
      </Box>
    </Flex>
  )
}

export function RegionNodeDesigner({
  imageUrl,
  sourceNodeTitle,
  packageResolution,
  imageFitMode,
  regionViewportText,
  onRegionViewportTextChange,
  regionOverlayText,
  onRegionOverlayTextChange,
  compact = false,
  editable = true,
  onOpenEditor,
}: RegionNodeDesignerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const canvasPanStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startScrollLeft: number
    startScrollTop: number
  } | null>(null)
  const [imageAspectRatio, setImageAspectRatio] = useState(375 / 808)
  const [canvasViewportWidth, setCanvasViewportWidth] = useState(960)
  const [zoom, setZoom] = useState(1)
  const [spacePressed, setSpacePressed] = useState(false)
  const [canvasPanning, setCanvasPanning] = useState(false)
  const [rectInput, setRectInput] = useState({
    left: '',
    top: '',
    width: '',
    height: '',
  })

  const regionViewport = useMemo(() => parseRegionViewport(regionViewportText), [regionViewportText])
  const regionOverlay = useMemo(() => parseRegionOverlay(regionOverlayText), [regionOverlayText])
  const panRect = useMemo(
    () => (regionViewport?.panRange ? toRect(regionViewport.panRange) : null),
    [regionViewport],
  )

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      setCanvasViewportWidth(Math.max(entry.contentRect.width, compact ? 320 : 640))
    })
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [compact])

  useEffect(() => {
    if (compact) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space') {
        const target = event.target as HTMLElement | null
        if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
        event.preventDefault()
        setSpacePressed(true)
      }
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') {
        setSpacePressed(false)
        setCanvasPanning(false)
        canvasPanStateRef.current = null
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [compact])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const panState = canvasPanStateRef.current
      const scroll = scrollRef.current
      if (panState && scroll && event.pointerId === panState.pointerId) {
        scroll.scrollLeft = panState.startScrollLeft - (event.clientX - panState.startX)
        scroll.scrollTop = panState.startScrollTop - (event.clientY - panState.startY)
        return
      }

      const frame = frameRef.current
      const dragState = dragStateRef.current
      if (!frame || !dragState || !editable) return

      const bounds = frame.getBoundingClientRect()
      const dx = (event.clientX - dragState.startX) / Math.max(bounds.width, 1)
      const dy = (event.clientY - dragState.startY) / Math.max(bounds.height, 1)

      if (dragState.kind === 'pan-move' && regionViewport) {
        const width = dragState.startRect.right - dragState.startRect.left
        const height = dragState.startRect.bottom - dragState.startRect.top
        const nextRect = normalizeRect({
          left: clamp01(dragState.startRect.left + dx),
          top: clamp01(dragState.startRect.top + dy),
          right: clamp01(dragState.startRect.left + dx + width),
          bottom: clamp01(dragState.startRect.top + dy + height),
        })

        const adjustedRect: Rect = {
          left: nextRect.left,
          top: nextRect.top,
          right: nextRect.right,
          bottom: nextRect.bottom,
        }

        if (adjustedRect.right - adjustedRect.left !== width) {
          adjustedRect.left = clamp01(adjustedRect.right - width)
          adjustedRect.right = clamp01(adjustedRect.left + width)
        }
        if (adjustedRect.bottom - adjustedRect.top !== height) {
          adjustedRect.top = clamp01(adjustedRect.bottom - height)
          adjustedRect.bottom = clamp01(adjustedRect.top + height)
        }

        onRegionViewportTextChange(formatJson({
          ...regionViewport,
          panRange: toQuad(adjustedRect),
        }))
        return
      }

      if (dragState.kind === 'pan-resize' && regionViewport) {
        const nextRect = { ...dragState.startRect }
        if (dragState.handle.includes('Left')) nextRect.left = dragState.startRect.left + dx
        if (dragState.handle.includes('Right')) nextRect.right = dragState.startRect.right + dx
        if (dragState.handle.includes('top')) nextRect.top = dragState.startRect.top + dy
        if (dragState.handle.includes('bottom')) nextRect.bottom = dragState.startRect.bottom + dy
        const normalized = normalizeRect(nextRect)
        onRegionViewportTextChange(formatJson({
          ...regionViewport,
          panRange: toQuad(normalized),
        }))
        return
      }

      if (dragState.kind === 'card-move' && regionOverlay) {
        const nextAnchor = {
          x: clamp01(dragState.startAnchor.x + dx),
          y: clamp01(dragState.startAnchor.y + dy),
        }
        onRegionOverlayTextChange(formatJson({
          ...regionOverlay,
          cards: regionOverlay.cards.map(card => (
            card.id === dragState.cardId
              ? { ...card, anchor: nextAnchor }
              : card
          )),
        }))
      }
    }

    function handlePointerUp() {
      canvasPanStateRef.current = null
      setCanvasPanning(false)
      dragStateRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [editable, onRegionOverlayTextChange, onRegionViewportTextChange, regionOverlay, regionViewport])

  function startCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (compact || !spacePressed || !scrollRef.current) return
    event.preventDefault()
    event.stopPropagation()
    canvasPanStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scrollRef.current.scrollLeft,
      startScrollTop: scrollRef.current.scrollTop,
    }
    setCanvasPanning(true)
  }

  function startPanMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panRect || !editable || spacePressed) return
    event.preventDefault()
    event.stopPropagation()
    dragStateRef.current = {
      kind: 'pan-move',
      startX: event.clientX,
      startY: event.clientY,
      startRect: panRect,
    }
  }

  function startPanResize(
    event: ReactPointerEvent<HTMLDivElement>,
    handle: 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft',
  ) {
    if (!panRect || !editable || spacePressed) return
    event.preventDefault()
    event.stopPropagation()
    dragStateRef.current = {
      kind: 'pan-resize',
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startRect: panRect,
    }
  }

  function startCardMove(event: ReactPointerEvent<HTMLDivElement>, card: RegionOverlayCard) {
    if (!editable || spacePressed) return
    event.preventDefault()
    event.stopPropagation()
    dragStateRef.current = {
      kind: 'card-move',
      cardId: card.id,
      startX: event.clientX,
      startY: event.clientY,
      startAnchor: card.anchor,
    }
  }

  function addCard() {
    const baseOverlay: RegionOverlayConfig = regionOverlay ?? {
      template: 'stock-info-v1',
      showWhenActive: true,
      cards: [],
    }
    const defaultAnchor = panRect
      ? {
          x: (panRect.left + panRect.right) / 2,
          y: (panRect.top + panRect.bottom) / 2,
        }
      : { x: 0.5, y: 0.5 }
    const cardIndex = baseOverlay.cards.length + 1
    const nextOverlay: RegionOverlayConfig = {
      ...baseOverlay,
      cards: [
        ...baseOverlay.cards,
        {
          id: `card-${Date.now()}`,
          title: `新卡片 ${cardIndex}`,
          anchor: defaultAnchor,
          coordSpace: 'source-normalized',
          tags: [],
          stocks: [],
        },
      ],
    }
    onRegionOverlayTextChange(formatJson(nextOverlay))
  }

  function setZoomWithAnchor(nextZoom: number, origin?: { clientX: number; clientY: number }) {
    if (compact) return
    const scroll = scrollRef.current
    if (!scroll) {
      setZoom(clampZoom(nextZoom))
      return
    }
    const targetZoom = clampZoom(nextZoom)
    const previousZoom = zoom
    if (Math.abs(targetZoom - previousZoom) < 0.0001) return

    const rect = scroll.getBoundingClientRect()
    const pointerX = origin ? origin.clientX - rect.left : rect.width / 2
    const pointerY = origin ? origin.clientY - rect.top : rect.height / 2
    const contentX = (scroll.scrollLeft + pointerX) / Math.max(previousZoom, 0.0001)
    const contentY = (scroll.scrollTop + pointerY) / Math.max(previousZoom, 0.0001)

    setZoom(targetZoom)
    requestAnimationFrame(() => {
      scroll.scrollLeft = contentX * targetZoom - pointerX
      scroll.scrollTop = contentY * targetZoom - pointerY
    })
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (compact) return
    event.preventDefault()
    const direction = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    setZoomWithAnchor(zoom * direction, { clientX: event.clientX, clientY: event.clientY })
  }

  const cards = regionOverlay?.cards ?? []
  const viewportError = regionViewportText.trim() && !regionViewport ? 'Region 视窗 JSON 当前不可解析，可视化编辑已暂时禁用。' : ''
  const overlayError = regionOverlayText.trim() && !regionOverlay ? 'Region 卡片 JSON 当前不可解析，可视化编辑已暂时禁用。' : ''
  const packageAspectRatio = packageResolution ? getResolutionAspectRatio(packageResolution) : null

  const baseWidth = compact ? Math.max(canvasViewportWidth - 2, 320) : Math.max(canvasViewportWidth - 32, 1200)
  const frameWidth = compact ? baseWidth : baseWidth * zoom
  const frameHeight = frameWidth / Math.max(imageAspectRatio, 0.0001)

  useEffect(() => {
    if (!panRect) return
    setRectInput({
      left: panRect.left.toFixed(4),
      top: panRect.top.toFixed(4),
      width: (panRect.right - panRect.left).toFixed(4),
      height: (panRect.bottom - panRect.top).toFixed(4),
    })
  }, [panRect?.left, panRect?.top, panRect?.right, panRect?.bottom])

  function updatePanRect(nextRect: Rect) {
    if (!regionViewport) return
    const normalized = normalizeRect(nextRect)
    onRegionViewportTextChange(formatJson({
      ...regionViewport,
      panRange: toQuad(normalized),
    }))
  }

  function applyRectInputs() {
    if (!regionViewport) return
    const left = Number(rectInput.left)
    const top = Number(rectInput.top)
    const width = Number(rectInput.width)
    const height = Number(rectInput.height)
    if ([left, top, width, height].some(value => Number.isNaN(value))) return

    updatePanRect({
      left,
      top,
      right: left + Math.max(width, MIN_RANGE_SIZE),
      bottom: top + Math.max(height, MIN_RANGE_SIZE),
    })
  }

  function alignWidthToPackageResolution() {
    if (!panRect || !packageAspectRatio) return
    const currentHeight = panRect.bottom - panRect.top
    const targetWidth = Math.max(
      MIN_RANGE_SIZE,
      (currentHeight * packageAspectRatio) / Math.max(imageAspectRatio, 0.0001),
    )
    const centerX = (panRect.left + panRect.right) / 2
    updatePanRect({
      left: centerX - targetWidth / 2,
      right: centerX + targetWidth / 2,
      top: panRect.top,
      bottom: panRect.bottom,
    })
  }

  return (
    <Box mb="4" h={compact ? 'auto' : '100%'} display="flex" flexDirection="column">
      <Flex justify="space-between" align="center" mb="2" gap="3" wrap="wrap">
        <Box>
          <Text fontSize="xs" fontWeight="500" color="text-tertiary">
            {compact ? 'Region 预览' : 'Region 大画布编辑'}
          </Text>
          <Text fontSize="2xs" color="text-tertiary">
            {sourceNodeTitle ? `基于源节点 ${sourceNodeTitle}` : '基于源图'}
            {compact ? '，在此预览当前区域与卡片位置。' : '，拖拽框选区域与卡片锚点后会自动更新下方 JSON。'}
          </Text>
        </Box>
        <HStack gap="2" wrap="wrap">
          {!compact && (
            <>
              <Button size="xs" variant="ghost" onClick={() => setZoomWithAnchor(zoom / ZOOM_STEP)}>
                <Minus size={12} style={{ marginRight: 4 }} />
                缩小
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setZoomWithAnchor(1)}>
                {Math.round(zoom * 100)}%
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setZoomWithAnchor(zoom * ZOOM_STEP)}>
                <Plus size={12} style={{ marginRight: 4 }} />
                放大
              </Button>
            </>
          )}
          {editable && !compact && (
            <Button
              size="xs"
              variant="ghost"
              color="brand"
              _hover={{ bg: 'brand-subtle' }}
              onClick={addCard}
              disabled={!imageUrl || !regionViewport}
            >
              <Plus size={12} style={{ marginRight: 4 }} />
              新增卡片
            </Button>
          )}
          {compact && onOpenEditor && (
            <Button
              size="xs"
              variant="ghost"
              color="brand"
              _hover={{ bg: 'brand-subtle' }}
              onClick={onOpenEditor}
            >
              <Expand size={12} style={{ marginRight: 4 }} />
              打开大画布编辑
            </Button>
          )}
        </HStack>
      </Flex>

      <Box
        p="3"
        rounded="md"
        flex={compact ? undefined : '1'}
        minH={compact ? undefined : '0'}
        display="flex"
        flexDirection="column"
        style={{ border: `1px solid ${BORDER}`, background: '#0a0b0f' }}
      >
        {!imageUrl ? (
          <Text fontSize="xs" color="text-tertiary">请先为源节点准备图片资源后再进行区域编辑。</Text>
        ) : (
          <>
            <Box
              ref={scrollRef}
              position="relative"
              flex={compact ? undefined : '1'}
              h={compact ? '360px' : undefined}
              minH={compact ? undefined : '320px'}
              overflow={compact ? 'hidden' : 'auto'}
              onWheel={handleWheel}
              onPointerDown={startCanvasPan}
              cursor={compact ? 'default' : canvasPanning ? 'grabbing' : spacePressed ? 'grab' : 'default'}
              sx={compact ? undefined : { '&::-webkit-scrollbar': { display: 'none' } }}
              style={{
                borderRadius: '10px',
                background: '#05060a',
                border: `1px solid ${BORDER}`,
                scrollbarWidth: compact ? undefined : 'none',
                msOverflowStyle: compact ? undefined : 'none',
              }}
            >
              <Flex align="center" justify={compact ? 'center' : 'flex-start'} minW="100%" minH="100%" p={compact ? '0' : '5'}>
                <Box
                  ref={frameRef}
                  position="relative"
                  width={`${frameWidth}px`}
                  height={`${frameHeight}px`}
                  flex="0 0 auto"
                  style={{
                    borderRadius: '10px',
                    overflow: 'hidden',
                    background: '#05060a',
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <img
                    src={imageUrl}
                    alt="region-source"
                    onLoad={(event) => {
                      const img = event.currentTarget
                      if (img.naturalWidth && img.naturalHeight) {
                        setImageAspectRatio(img.naturalWidth / img.naturalHeight)
                      }
                    }}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'fill',
                      display: 'block',
                      userSelect: 'none',
                    }}
                  />

                  {panRect && (
                    <>
                      <Box
                        position="absolute"
                        inset="0"
                        pointerEvents="none"
                        style={{
                          boxShadow: `inset 0 0 0 9999px rgba(0, 0, 0, 0.42)`,
                          clipPath: `polygon(
                            0% 0%,
                            0% 100%,
                            ${panRect.left * 100}% 100%,
                            ${panRect.left * 100}% ${panRect.top * 100}%,
                            ${panRect.right * 100}% ${panRect.top * 100}%,
                            ${panRect.right * 100}% ${panRect.bottom * 100}%,
                            ${panRect.left * 100}% ${panRect.bottom * 100}%,
                            ${panRect.left * 100}% 100%,
                            100% 100%,
                            100% 0%
                          )`,
                        }}
                      />
                      <Box
                        position="absolute"
                        left={`${panRect.left * 100}%`}
                        top={`${panRect.top * 100}%`}
                        width={`${(panRect.right - panRect.left) * 100}%`}
                        height={`${(panRect.bottom - panRect.top) * 100}%`}
                        cursor={editable ? 'move' : 'default'}
                        onPointerDown={startPanMove}
                        style={{
                          border: '2px solid #6366f1',
                          boxShadow: '0 0 0 1px rgba(99, 102, 241, 0.35)',
                          background: 'rgba(99, 102, 241, 0.08)',
                        }}
                      >
                        {editable && ([
                          { key: 'topLeft', left: 0, top: 0, cursor: 'nwse-resize' },
                          { key: 'topRight', left: 100, top: 0, cursor: 'nesw-resize' },
                          { key: 'bottomRight', left: 100, top: 100, cursor: 'nwse-resize' },
                          { key: 'bottomLeft', left: 0, top: 100, cursor: 'nesw-resize' },
                        ] as const).map(handle => (
                          <Box
                            key={handle.key}
                            position="absolute"
                            left={`calc(${handle.left}% - ${HANDLE_SIZE / 2}px)`}
                            top={`calc(${handle.top}% - ${HANDLE_SIZE / 2}px)`}
                            w={`${HANDLE_SIZE}px`}
                            h={`${HANDLE_SIZE}px`}
                            rounded="full"
                            bg="#fff"
                            border="2px solid #6366f1"
                            cursor={handle.cursor}
                            onPointerDown={(event) => startPanResize(event, handle.key)}
                            style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.35)' }}
                          />
                        ))}
                      </Box>
                    </>
                  )}

                  {cards.map(card => (
                    <Box
                      key={card.id}
                      position="absolute"
                      left={`${card.anchor.x * 100}%`}
                      top={`${card.anchor.y * 100}%`}
                      transform="translate(-50%, -50%)"
                      cursor={editable ? 'grab' : 'default'}
                      onPointerDown={(event) => startCardMove(event, card)}
                    >
                      <Box
                        px="2.5"
                        py="1.5"
                        rounded="md"
                        style={{
                          background: 'rgba(255,255,255,0.92)',
                          border: '1px solid rgba(0,0,0,0.75)',
                          boxShadow: '0 10px 20px rgba(0,0,0,0.24)',
                        }}
                      >
                        <Text fontSize="2xs" color="#09090b" fontWeight="600" whiteSpace="nowrap">
                          {card.title || card.id}
                        </Text>
                      </Box>
                      <Box
                        position="absolute"
                        left="50%"
                        top="50%"
                        transform="translate(-50%, -50%)"
                        w="10px"
                        h="10px"
                        rounded="full"
                        bg="#FF2436"
                        border="2px solid #fff"
                        style={{ boxShadow: '0 4px 12px rgba(255,36,54,0.35)' }}
                      />
                    </Box>
                  ))}
                </Box>
              </Flex>
            </Box>

            {!compact && editable && panRect && (
              <Box
                mt="3"
                flexShrink={0}
                p="3"
                rounded="md"
                style={{ border: `1px solid ${BORDER}`, background: '#0b0d12' }}
              >
                <Flex justify="space-between" align="center" mb="2" gap="3" wrap="wrap">
                  <Box>
                    <Text fontSize="2xs" color="text-tertiary">数值校准</Text>
                    <Text fontSize="2xs" color="text-secondary">
                      直接修改 left / top / width / height；对于 fill 节点可用快捷按钮按项目分辨率修正宽度。
                    </Text>
                  </Box>
                  {imageFitMode === 'fill' && packageAspectRatio && (
                    <Button size="xs" variant="ghost" color="brand" _hover={{ bg: 'brand-subtle' }} onClick={alignWidthToPackageResolution}>
                      按项目分辨率设置宽度
                    </Button>
                  )}
                </Flex>
                <Flex gap="2" wrap="wrap">
                  {([
                    { key: 'left', label: 'Left' },
                    { key: 'top', label: 'Top' },
                    { key: 'width', label: 'Width' },
                    { key: 'height', label: 'Height' },
                  ] as const).map(item => (
                    <Box key={item.key} minW="120px" flex="1">
                      <Text fontSize="2xs" color="text-tertiary" mb="1">{item.label}</Text>
                      <input
                        type="number"
                        step="0.0001"
                        value={rectInput[item.key]}
                        onChange={(event) => setRectInput(prev => ({ ...prev, [item.key]: event.target.value }))}
                        style={{
                          width: '100%',
                          background: '#05060a',
                          border: `1px solid ${BORDER}`,
                          borderRadius: '6px',
                          color: '#e4e4e7',
                          fontSize: '12px',
                          padding: '8px 10px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </Box>
                  ))}
                  <Flex align="flex-end">
                    <Button size="sm" variant="ghost" onClick={applyRectInputs}>
                      应用数值
                    </Button>
                  </Flex>
                </Flex>
              </Box>
            )}

            <Flex justify="space-between" mt="3" gap="3" wrap="wrap">
              <HStack gap="3" align="stretch">
                <Box minW="140px">
                  <Text fontSize="2xs" color="text-tertiary" mb="1">框选范围</Text>
                  <Text fontSize="2xs" color="text-secondary">
                    {panRect
                      ? `L ${panRect.left.toFixed(4)} / T ${panRect.top.toFixed(4)} / R ${panRect.right.toFixed(4)} / B ${panRect.bottom.toFixed(4)}`
                      : '等待有效配置'}
                  </Text>
                </Box>
                <Box minW="120px">
                  <Text fontSize="2xs" color="text-tertiary" mb="1">卡片数量</Text>
                  <Text fontSize="2xs" color="text-secondary">{cards.length} 张</Text>
                </Box>
              </HStack>
              <Text fontSize="2xs" color="text-tertiary">
                {compact
                  ? '节点详情中仅做预览，建议打开大画布编辑器进行精细调整。'
                  : '滚轮缩放画布，按住空格拖动画布浏览；拖动蓝色框调整子区域，拖动卡片标签调整标的信息位置。'}
              </Text>
            </Flex>
          </>
        )}
      </Box>

      {(viewportError || overlayError) && (
        <Box mt="2">
          {viewportError && <Text fontSize="2xs" color="#ef4444">{viewportError}</Text>}
          {overlayError && <Text fontSize="2xs" color="#ef4444">{overlayError}</Text>}
        </Box>
      )}
    </Box>
  )
}
