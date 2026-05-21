import { useState, useRef, useEffect } from 'react'
import { Box, Text, Button, Flex, VStack } from '@chakra-ui/react'
import { Play, Pause } from 'lucide-react'

const BORDER = '#2a2d3a'

export interface ZoomPoint {
  x: number
  y: number
}

export interface ZoomQuad {
  topLeft: ZoomPoint
  topRight: ZoomPoint
  bottomRight: ZoomPoint
  bottomLeft: ZoomPoint
}

export interface ZoomConfig {
  type: 'zoom'
  direction: 'in' | 'out'
  scale: number
  centerX: number
  centerY: number
  focusMode?: 'center' | 'quad'
  focusQuad?: ZoomQuad
  duration: number
  easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'
}

interface Props {
  config: ZoomConfig
  onChange: (config: ZoomConfig) => void
  disabled?: boolean
  fromImageUrl?: string
  toImageUrl?: string
  hotspotX?: number
  hotspotY?: number
}

interface ZoomFrame {
  scale: number
  translateX: number
  translateY: number
}

const DIRECTION_OPTIONS = [
  { value: 'in', label: '放大淡入' },
  { value: 'out', label: '缩小淡出' },
]

const FOCUS_MODE_OPTIONS = [
  { value: 'center', label: '中心点缩放' },
  { value: 'quad', label: '四点区域缩放' },
]

const EASING_OPTIONS = [
  { value: 'ease-in-out', label: '缓入缓出' },
  { value: 'ease-in', label: '缓入' },
  { value: 'ease-out', label: '缓出' },
  { value: 'linear', label: '线性' },
]

const QUAD_POINT_LABELS: Array<{ key: keyof ZoomQuad, label: string }> = [
  { key: 'topLeft', label: '左上' },
  { key: 'topRight', label: '右上' },
  { key: 'bottomRight', label: '右下' },
  { key: 'bottomLeft', label: '左下' },
]

const IDENTITY_FRAME: ZoomFrame = {
  scale: 1,
  translateX: 0,
  translateY: 0,
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

function getEasingFn(easing: string) {
  switch (easing) {
    case 'ease-in': return (t: number) => t * t
    case 'ease-out': return (t: number) => t * (2 - t)
    case 'linear': return (t: number) => t
    default: return (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t)
  }
}

function createQuadFromCenter(centerX: number, centerY: number, scale: number): ZoomQuad {
  const rawWidth = 1 / Math.max(scale, 1)
  const rawHeight = 1 / Math.max(scale, 1)
  const width = Math.min(1, rawWidth)
  const height = Math.min(1, rawHeight)
  const left = clamp01(centerX - width / 2)
  const top = clamp01(centerY - height / 2)
  const normalizedLeft = clamp01(Math.min(left, 1 - width))
  const normalizedTop = clamp01(Math.min(top, 1 - height))
  const right = clamp01(normalizedLeft + width)
  const bottom = clamp01(normalizedTop + height)

  return {
    topLeft: { x: normalizedLeft, y: normalizedTop },
    topRight: { x: right, y: normalizedTop },
    bottomRight: { x: right, y: bottom },
    bottomLeft: { x: normalizedLeft, y: bottom },
  }
}

function getEffectiveQuad(config: ZoomConfig, hotspotX: number, hotspotY: number): ZoomQuad {
  if (config.focusMode === 'quad' && config.focusQuad) {
    return config.focusQuad
  }
  return createQuadFromCenter(
    config.centerX ?? hotspotX,
    config.centerY ?? hotspotY,
    config.scale || 1.5,
  )
}

function getAspectLockedDisplayQuad(
  quad: ZoomQuad,
  width: number,
  height: number,
): ZoomQuad {
  const left = clamp01(Math.min(quad.topLeft.x, quad.topRight.x))
  const right = clamp01(Math.max(quad.topLeft.x, quad.topRight.x))
  const top = clamp01((quad.topLeft.y + quad.topRight.y) / 2)
  const widthNorm = Math.max(0.0001, right - left)
  const aspect = width / Math.max(height, 0.0001)
  const heightNorm = widthNorm / Math.max(aspect, 0.0001)
  const clampedTop = clamp01(Math.min(top, 1 - heightNorm))
  const bottom = clamp01(clampedTop + heightNorm)

  return {
    topLeft: { x: left, y: clampedTop },
    topRight: { x: right, y: clampedTop },
    bottomRight: { x: right, y: bottom },
    bottomLeft: { x: left, y: bottom },
  }
}

function getFocusFrame(
  config: ZoomConfig,
  hotspotX: number,
  hotspotY: number,
  width: number,
  height: number,
): ZoomFrame {
  if ((config.focusMode ?? 'center') === 'quad') {
    const quad = getAspectLockedDisplayQuad(
      getEffectiveQuad(config, hotspotX, hotspotY),
      width,
      height,
    )
    const regionWidth = Math.max(0.0001, quad.topRight.x - quad.topLeft.x)
    const centerX = (quad.topLeft.x + quad.topRight.x) / 2
    const centerY = (quad.topLeft.y + quad.bottomLeft.y) / 2
    const scale = 1 / regionWidth

    return {
      scale,
      translateX: width * (0.5 - scale * centerX),
      translateY: height * (0.5 - scale * centerY),
    }
  }

  const scale = Math.max(config.scale || 1.5, 1)
  const centerX = clamp01(config.centerX ?? hotspotX)
  const centerY = clamp01(config.centerY ?? hotspotY)

  return {
    scale,
    translateX: width * (0.5 - scale * centerX),
    translateY: height * (0.5 - scale * centerY),
  }
}

function interpolateFrame(from: ZoomFrame, to: ZoomFrame, progress: number): ZoomFrame {
  return {
    scale: lerp(from.scale, to.scale, progress),
    translateX: lerp(from.translateX, to.translateX, progress),
    translateY: lerp(from.translateY, to.translateY, progress),
  }
}

function serializeFrame(frame: ZoomFrame): string {
  return `translate(${frame.translateX}px, ${frame.translateY}px) scale(${frame.scale})`
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <Box>
      <Text fontSize="xs" color="text-tertiary" mb="1">{label}</Text>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        style={{
          width: '100%',
          background: '#0a0b0f',
          border: `1px solid ${BORDER}`,
          borderRadius: '6px',
          color: '#e4e4e7',
          fontSize: '13px',
          padding: '8px 12px',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </Box>
  )
}

export function ZoomTransitionForm({
  config,
  onChange,
  disabled,
  fromImageUrl,
  toImageUrl,
  hotspotX = 0.5,
  hotspotY = 0.5,
}: Props) {
  const [previewing, setPreviewing] = useState(false)
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const fromElRef = useRef<HTMLDivElement>(null)
  const toElRef = useRef<HTMLDivElement>(null)
  const previewFrameRef = useRef<HTMLDivElement>(null)

  const duration = config.duration || 600
  const scale = config.scale || 1.5
  const centerX = config.centerX ?? hotspotX
  const centerY = config.centerY ?? hotspotY
  const focusMode = config.focusMode ?? 'center'
  const effectiveQuad = getEffectiveQuad(config, hotspotX, hotspotY)
  const displayQuad = getAspectLockedDisplayQuad(effectiveQuad, 100, 100)

  const updateConfig = (patch: Partial<ZoomConfig>) => {
    onChange({ ...config, ...patch })
  }

  const updateQuadPoint = (key: keyof ZoomQuad, axis: 'x' | 'y', value: number) => {
    const currentQuad = getEffectiveQuad(config, hotspotX, hotspotY)
    updateConfig({
      focusQuad: {
        ...currentQuad,
        [key]: {
          ...currentQuad[key],
          [axis]: clamp01(value),
        },
      },
    })
  }

  const resetPreviewState = () => {
    if (!previewFrameRef.current || !fromElRef.current || !toElRef.current) return

    const rect = previewFrameRef.current.getBoundingClientRect()
    const focusFrame = getFocusFrame(config, hotspotX, hotspotY, rect.width, rect.height)
    fromElRef.current.style.transformOrigin = '0 0'
    toElRef.current.style.transformOrigin = '0 0'
    fromElRef.current.style.transform = serializeFrame(IDENTITY_FRAME)
    fromElRef.current.style.opacity = '1'
    toElRef.current.style.transform = config.direction === 'out'
      ? serializeFrame(focusFrame)
      : serializeFrame(IDENTITY_FRAME)
    toElRef.current.style.opacity = config.direction === 'out' ? '1' : '0'
  }

  const stopPreview = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setPreviewing(false)
    resetPreviewState()
  }

  const runPreview = () => {
    if (!fromElRef.current || !toElRef.current || !previewFrameRef.current) return

    stopPreview()
    setPreviewing(true)
    startTimeRef.current = performance.now()

    const rect = previewFrameRef.current.getBoundingClientRect()
    const focusFrame = getFocusFrame(config, hotspotX, hotspotY, rect.width, rect.height)
    const easingFn = getEasingFn(config.easing)

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easingFn(progress)

      if (config.direction === 'in') {
        if (fromElRef.current) {
          fromElRef.current.style.transform = serializeFrame(
            interpolateFrame(IDENTITY_FRAME, focusFrame, easedProgress),
          )
          fromElRef.current.style.opacity = '1'
        }
        if (toElRef.current) {
          toElRef.current.style.transform = serializeFrame(IDENTITY_FRAME)
          toElRef.current.style.opacity = '0'
        }
      } else {
        if (fromElRef.current) {
          fromElRef.current.style.opacity = '0'
        }
        if (toElRef.current) {
          toElRef.current.style.transform = serializeFrame(
            interpolateFrame(focusFrame, IDENTITY_FRAME, easedProgress),
          )
          toElRef.current.style.opacity = '1'
        }
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        window.setTimeout(() => {
          stopPreview()
        }, 300)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    resetPreviewState()
  }, [config.direction, config.scale, config.centerX, config.centerY, config.focusMode, config.focusQuad, hotspotX, hotspotY])

  useEffect(() => {
    return () => stopPreview()
  }, [])

  return (
    <Box>
      <VStack align="stretch" gap="3" mb="4">
        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">方向</Text>
          <select
            value={config.direction || 'in'}
            onChange={(e) => updateConfig({ direction: e.target.value as ZoomConfig['direction'] })}
            disabled={disabled}
            style={{ width: '100%', background: '#0a0b0f', border: `1px solid ${BORDER}`, borderRadius: '6px', color: '#e4e4e7', fontSize: '13px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
          >
            {DIRECTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Box>

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">缩放控制方式</Text>
          <select
            value={focusMode}
            onChange={(e) => {
              const nextMode = e.target.value as ZoomConfig['focusMode']
              updateConfig({
                focusMode: nextMode,
                ...(nextMode === 'quad'
                  ? { focusQuad: config.focusQuad ?? createQuadFromCenter(centerX, centerY, scale) }
                  : {}),
              })
            }}
            disabled={disabled}
            style={{ width: '100%', background: '#0a0b0f', border: `1px solid ${BORDER}`, borderRadius: '6px', color: '#e4e4e7', fontSize: '13px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
          >
            {FOCUS_MODE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Box>

        {focusMode === 'center' ? (
          <>
            <NumberField
              label="缩放比例"
              value={scale}
              min={1.1}
              max={8}
              step={0.1}
              disabled={disabled}
              onChange={(value) => updateConfig({ scale: Math.max(1.1, value) })}
            />
            <Box>
              <Text fontSize="xs" color="text-tertiary" mb="1">中心点 X</Text>
              <Box display="flex" gap="2" alignItems="center">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={centerX}
                  onChange={(e) => updateConfig({ centerX: clamp01(Number(e.target.value)) })}
                  disabled={disabled}
                  style={{
                    flex: 1,
                    background: '#0a0b0f',
                    border: `1px solid ${BORDER}`,
                    borderRadius: '6px',
                    color: '#e4e4e7',
                    fontSize: '13px',
                    padding: '8px 12px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Text fontSize="xs" color="text-tertiary" flex="none">
                  热点: {hotspotX.toFixed(2)}
                </Text>
              </Box>
            </Box>
            <Box>
              <Text fontSize="xs" color="text-tertiary" mb="1">中心点 Y</Text>
              <Box display="flex" gap="2" alignItems="center">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={centerY}
                  onChange={(e) => updateConfig({ centerY: clamp01(Number(e.target.value)) })}
                  disabled={disabled}
                  style={{
                    flex: 1,
                    background: '#0a0b0f',
                    border: `1px solid ${BORDER}`,
                    borderRadius: '6px',
                    color: '#e4e4e7',
                    fontSize: '13px',
                    padding: '8px 12px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <Text fontSize="xs" color="text-tertiary" flex="none">
                  热点: {hotspotY.toFixed(2)}
                </Text>
              </Box>
            </Box>
          </>
        ) : (
          <Box
            p="3"
            rounded="md"
            style={{ border: `1px solid ${BORDER}`, background: 'rgba(59,130,246,0.08)' }}
          >
            <Text fontSize="xs" color="text-secondary" mb="3">
              当前以左上和右上两个点确定镜头宽度，并自动按画面比例推导高度；运行时只做平移和等比缩放，不再拉伸画面。
            </Text>
            <VStack align="stretch" gap="3">
              {QUAD_POINT_LABELS.map(point => (
                <Box key={point.key}>
                  <Text fontSize="xs" color="text-tertiary" mb="1.5">{point.label}</Text>
                  <Box display="grid" gridTemplateColumns="1fr 1fr" gap="2">
                    <NumberField
                      label="X"
                      value={effectiveQuad[point.key].x}
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={disabled}
                      onChange={(value) => updateQuadPoint(point.key, 'x', value)}
                    />
                    <NumberField
                      label="Y"
                      value={effectiveQuad[point.key].y}
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={disabled}
                      onChange={(value) => updateQuadPoint(point.key, 'y', value)}
                    />
                  </Box>
                </Box>
              ))}
            </VStack>
          </Box>
        )}

        <NumberField
          label="时长 (ms)"
          value={duration}
          step={50}
          disabled={disabled}
          onChange={(value) => updateConfig({ duration: Math.max(50, value) })}
        />

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">缓动函数</Text>
          <select
            value={config.easing || 'ease-in-out'}
            onChange={(e) => updateConfig({ easing: e.target.value as ZoomConfig['easing'] })}
            disabled={disabled}
            style={{ width: '100%', background: '#0a0b0f', border: `1px solid ${BORDER}`, borderRadius: '6px', color: '#e4e4e7', fontSize: '13px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
          >
            {EASING_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Box>
      </VStack>

      <Box mb="3">
        <Flex justify="space-between" align="center" mb="2">
          <Text fontSize="xs" color="text-tertiary">预览</Text>
          <Button
            size="xs"
            variant="ghost"
            color="brand"
            _hover={{ bg: 'brand-subtle' }}
            onClick={previewing ? stopPreview : runPreview}
            disabled={!fromImageUrl || !toImageUrl}
          >
            {previewing ? (
              <><Pause size={12} style={{ marginRight: 4 }} />停止</>
            ) : (
              <><Play size={12} style={{ marginRight: 4 }} />播放</>
            )}
          </Button>
        </Flex>

        <Box
          ref={previewFrameRef}
          position="relative"
          h="140px"
          rounded="md"
          overflow="hidden"
          bg="#05060a"
          style={{ border: `1px solid ${BORDER}` }}
        >
          {fromImageUrl && (
            <div
              ref={fromElRef}
              style={{
                position: 'absolute',
                inset: 0,
                transformOrigin: '0 0',
                transition: 'none',
              }}
            >
              <img
                src={fromImageUrl}
                alt="from"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
          {toImageUrl && (
            <div
              ref={toElRef}
              style={{
                position: 'absolute',
                inset: 0,
                transformOrigin: '0 0',
                transition: 'none',
              }}
            >
              <img
                src={toImageUrl}
                alt="to"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          )}

          <svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            <polygon
              points={[
                `${displayQuad.topLeft.x * 100},${displayQuad.topLeft.y * 100}`,
                `${displayQuad.topRight.x * 100},${displayQuad.topRight.y * 100}`,
                `${displayQuad.bottomRight.x * 100},${displayQuad.bottomRight.y * 100}`,
                `${displayQuad.bottomLeft.x * 100},${displayQuad.bottomLeft.y * 100}`,
              ].join(' ')}
              fill="rgba(56,189,248,0.18)"
              stroke="rgba(125,211,252,0.95)"
              strokeWidth="1.2"
              strokeDasharray={focusMode === 'quad' ? '0' : '4 3'}
            />
          </svg>
        </Box>
      </Box>
    </Box>
  )
}
