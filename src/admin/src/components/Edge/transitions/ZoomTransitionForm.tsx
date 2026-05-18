import { useState, useRef, useEffect } from 'react'
import { Box, Text, Button, Flex, Select, VStack, Input } from '@chakra-ui/react'
import { Play, Pause } from 'lucide-react'

const BORDER = '#2a2d3a'

interface ZoomConfig {
  type: 'zoom'
  direction: 'in' | 'out'
  scale: number
  centerX: number
  centerY: number
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

const DIRECTION_OPTIONS = [
  { value: 'in', label: '放大淡入' },
  { value: 'out', label: '缩小淡出' },
]

const EASING_OPTIONS = [
  { value: 'ease-in-out', label: '缓入缓出' },
  { value: 'ease-in', label: '缓入' },
  { value: 'ease-out', label: '缓出' },
  { value: 'linear', label: '线性' },
]

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
  const containerRef = useRef<HTMLDivElement>(null)
  const fromElRef = useRef<HTMLDivElement>(null)
  const toElRef = useRef<HTMLImageElement>(null)

  const duration = config.duration || 600
  const scale = config.scale || 1.5
  const centerX = config.centerX ?? hotspotX
  const centerY = config.centerY ?? hotspotY

  const getEasingFn = (easing: string) => {
    switch (easing) {
      case 'ease-in': return (t: number) => t * t
      case 'ease-out': return (t: number) => t * (2 - t)
      case 'linear': return (t: number) => t
      default: return (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    }
  }

  const stopPreview = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setPreviewing(false)
    if (fromElRef.current) {
      fromElRef.current.style.transform = 'scale(1)'
      fromElRef.current.style.opacity = '1'
    }
    if (toElRef.current) {
      toElRef.current.style.opacity = '0'
    }
  }

  const runPreview = () => {
    if (!fromElRef.current || !toElRef.current || !containerRef.current) return

    stopPreview()
    setPreviewing(true)
    startTimeRef.current = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = getEasingFn(config.easing)(progress)

      const currentScale = config.direction === 'in'
        ? 1 - (1 - 1 / scale) * easedProgress
        : 1 + (scale - 1) * easedProgress

      // Calculate translation to keep hotspot position stable
      const tx = (centerX - 0.5) * (1 - currentScale) * 100
      const ty = (centerY - 0.5) * (1 - currentScale) * 100

      if (fromElRef.current) {
        fromElRef.current.style.transform = `scale(${currentScale}) translate(${tx}%, ${ty}%)`
        fromElRef.current.style.opacity = String(config.direction === 'in' ? 1 : 1 - easedProgress * 0.5)
      }
      if (toElRef.current) {
        toElRef.current.style.opacity = String(progress > 0.3 ? (progress - 0.3) / 0.7 : 0)
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setTimeout(() => {
          stopPreview()
        }, 300)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    return () => stopPreview()
  }, [])

  return (
    <Box>
      <VStack align="stretch" gap="3" mb="4">
        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">方向</Text>
          <Select
            value={config.direction || 'in'}
            onChange={(e) => onChange({ ...config, direction: e.target.value as ZoomConfig['direction'] })}
            disabled={disabled}
            style={{ background: '#0a0b0f', border: `1px solid ${BORDER}`, color: '#e4e4e7' }}
          >
            {DIRECTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </Box>

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">缩放比例</Text>
          <input
            type="number"
            step="0.1"
            min="1.1"
            max="3"
            value={config.scale || 1.5}
            onChange={(e) => onChange({ ...config, scale: Number(e.target.value) })}
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

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">中心点 X</Text>
          <Box display="flex" gap="2" alignItems="center">
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={config.centerX ?? hotspotX}
              onChange={(e) => onChange({ ...config, centerX: Number(e.target.value) })}
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
              value={config.centerY ?? hotspotY}
              onChange={(e) => onChange({ ...config, centerY: Number(e.target.value) })}
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

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">时长 (ms)</Text>
          <input
            type="number"
            value={config.duration || 600}
            onChange={(e) => onChange({ ...config, duration: Number(e.target.value) })}
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

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">缓动函数</Text>
          <Select
            value={config.easing || 'ease-in-out'}
            onChange={(e) => onChange({ ...config, easing: e.target.value as ZoomConfig['easing'] })}
            disabled={disabled}
            style={{ background: '#0a0b0f', border: `1px solid ${BORDER}`, color: '#e4e4e7' }}
          >
            {EASING_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </Box>
      </VStack>

      {/* Preview */}
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
          ref={containerRef}
          position="relative"
          h="120px"
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
                transformOrigin: `${centerX * 100}% ${centerY * 100}%`,
                transition: 'none',
              }}
            >
              <img
                src={fromImageUrl}
                alt="from"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          )}
          {toImageUrl && (
            <img
              ref={toElRef}
              src={toImageUrl}
              alt="to"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                opacity: 0,
              }}
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}