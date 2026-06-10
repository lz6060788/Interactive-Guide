import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Flex, Heading } from '@chakra-ui/react'
import type { PanoramaFocusRect, PanoramaGroup, PanoramaItem, PanoramaMarker, PanoramaViewport } from '../../../shared/panorama-types'

interface PanoramaCanvasProps {
  backgroundImageUrl: string
  group: PanoramaGroup | null
  item: PanoramaItem | null
  viewport: PanoramaViewport | null
  marker: PanoramaMarker | null
  focusRect: PanoramaFocusRect | null
  onMarkerChange: (marker: PanoramaMarker) => void
  onFocusRectChange: (focusRect: PanoramaFocusRect) => void
  onViewportChange: (viewport: PanoramaViewport) => void
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clampMinMax(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type DragState =
  | { kind: 'marker' }
  | { kind: 'viewport' }
  | {
      kind: 'focusRect-move'
      startClientX: number
      startClientY: number
      startRect: PanoramaFocusRect
    }
  | {
      kind: 'focusRect-resize'
      startClientX: number
      startClientY: number
      startRect: PanoramaFocusRect
    }

export function PanoramaCanvas({
  backgroundImageUrl,
  group,
  item,
  viewport,
  marker,
  focusRect,
  onMarkerChange,
  onFocusRectChange,
  onViewportChange,
}: PanoramaCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const backgroundImage = useMemo(() => {
    const imageUrl = backgroundImageUrl.trim()
    return imageUrl ? `url("${imageUrl}")` : undefined
  }, [backgroundImageUrl])

  const viewportEstimate = useMemo(() => {
    if (!viewport) return null
    const width = clampMinMax(1 / viewport.zoom, 0.08, 1)
    const height = width
    return {
      x: clampMinMax(viewport.centerX - width / 2, 0, 1 - width),
      y: clampMinMax(viewport.centerY - height / 2, 0, 1 - height),
      width,
      height,
    }
  }, [viewport])

  const resolveNormalizedPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
      width: rect.width,
      height: rect.height,
    }
  }

  useEffect(() => {
    if (!dragState) return

    const handlePointerMove = (event: PointerEvent) => {
      const point = resolveNormalizedPoint(event.clientX, event.clientY)
      if (!point) return
      if (dragState.kind === 'marker' && marker) {
        onMarkerChange({
          ...marker,
          x: point.x,
          y: point.y,
        })
        return
      }
      if (dragState.kind === 'viewport' && viewport) {
        onViewportChange({
          ...viewport,
          centerX: point.x,
          centerY: point.y,
        })
        return
      }
      if (dragState.kind === 'focusRect-move') {
        const deltaX = (event.clientX - dragState.startClientX) / point.width
        const deltaY = (event.clientY - dragState.startClientY) / point.height
        onFocusRectChange({
          ...dragState.startRect,
          x: clampMinMax(dragState.startRect.x + deltaX, 0, 1 - dragState.startRect.width),
          y: clampMinMax(dragState.startRect.y + deltaY, 0, 1 - dragState.startRect.height),
        })
        return
      }
      if (dragState.kind === 'focusRect-resize') {
        const deltaX = (event.clientX - dragState.startClientX) / point.width
        const deltaY = (event.clientY - dragState.startClientY) / point.height
        onFocusRectChange({
          ...dragState.startRect,
          width: clampMinMax(dragState.startRect.width + deltaX, 0.04, 1 - dragState.startRect.x),
          height: clampMinMax(dragState.startRect.height + deltaY, 0.04, 1 - dragState.startRect.y),
        })
      }
    }

    const handlePointerUp = () => {
      setDragState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, focusRect, marker, onFocusRectChange, onMarkerChange, onViewportChange, viewport])

  return (
    <Box
      flex="1.15"
      bg="surface"
      borderRadius="xl"
      p="5"
      minH="620px"
      border="1px solid"
      borderColor="border-default"
      boxShadow="lg"
    >
      <Heading size="sm" color="text-primary" mb="3">全景画布</Heading>
      <Flex
        ref={canvasRef}
        position="relative"
        h="calc(100% - 44px)"
        minH="520px"
        borderRadius="xl"
        border="1px solid"
        borderColor="border-default"
        bgImage={backgroundImage}
        bgPosition="center"
        bgSize="cover"
        bgColor="surface-raised"
        boxShadow="inset 0 0 0 1px rgba(255,255,255,0.02)"
        align="center"
        justify="center"
        direction="column"
        gap="2"
        overflow="hidden"
      >
        <Box position="absolute" inset="0" bg="rgba(5, 8, 15, 0.42)" pointerEvents="none" />
        {focusRect ? (
          <Box
            position="absolute"
            left={`${focusRect.x * 100}%`}
            top={`${focusRect.y * 100}%`}
            width={`${focusRect.width * 100}%`}
            height={`${focusRect.height * 100}%`}
            border="2px solid"
            borderColor="rgba(130, 143, 163, 0.92)"
            borderRadius={`${focusRect.radius ?? 12}px`}
            boxShadow="0 0 0 9999px rgba(0, 0, 0, 0.54), 0 0 28px rgba(255,255,255,0.16)"
            cursor="move"
            zIndex="2"
            onPointerDown={event => {
              event.preventDefault()
              setDragState({
                kind: 'focusRect-move',
                startClientX: event.clientX,
                startClientY: event.clientY,
                startRect: focusRect,
              })
            }}
          >
            <Box
              position="absolute"
              right="-6px"
              bottom="-6px"
              width="14px"
              height="14px"
              borderRadius="999px"
              bg="text-primary"
              border="2px solid"
              borderColor="base"
              cursor="nwse-resize"
              onPointerDown={event => {
                event.stopPropagation()
                event.preventDefault()
                setDragState({
                  kind: 'focusRect-resize',
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startRect: focusRect,
                })
              }}
            />
          </Box>
        ) : null}
        {viewport ? (
          <>
            {viewportEstimate ? (
              <Box
                position="absolute"
                left={`${viewportEstimate.x * 100}%`}
                top={`${viewportEstimate.y * 100}%`}
                width={`${viewportEstimate.width * 100}%`}
                height={`${viewportEstimate.height * 100}%`}
                border="1.5px dashed"
                borderColor="rgba(34, 211, 238, 0.88)"
                bg="rgba(34, 211, 238, 0.06)"
                boxShadow="0 0 0 1px rgba(34, 211, 238, 0.08) inset"
                borderRadius="md"
                zIndex="1"
                pointerEvents="none"
              />
            ) : null}
            <Box
              position="absolute"
              left={`calc(${viewport.centerX * 100}% - 10px)`}
              top={`calc(${viewport.centerY * 100}% - 10px)`}
              width="20px"
              height="20px"
              borderRadius="999px"
              border="2px solid"
              borderColor="cyan.300"
              bg="rgba(34, 211, 238, 0.18)"
              cursor="grab"
              zIndex="3"
              onPointerDown={event => {
                event.preventDefault()
                setDragState({ kind: 'viewport' })
              }}
            >
              <Box position="absolute" left="50%" top="2px" width="1px" height="16px" bg="cyan.200" transform="translateX(-50%)" />
              <Box position="absolute" top="50%" left="2px" height="1px" width="16px" bg="cyan.200" transform="translateY(-50%)" />
            </Box>
          </>
        ) : null}
        {marker ? (
          <Box
            position="absolute"
            left={`calc(${marker.x * 100}% - 10px)`}
            top={`calc(${marker.y * 100}% - 10px)`}
            width="20px"
            height="20px"
            borderRadius="999px"
            bg="#f24e5c"
            border="3px solid"
            borderColor="white"
            boxShadow="0 6px 16px rgba(0, 0, 0, 0.35), 0 0 0 4px rgba(242, 78, 92, 0.16)"
            cursor="grab"
            zIndex="4"
            onPointerDown={event => {
              event.preventDefault()
              setDragState({ kind: 'marker' })
            }}
          />
        ) : null}
      </Flex>
    </Box>
  )
}
