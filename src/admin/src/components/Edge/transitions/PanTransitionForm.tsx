import { useState, useRef, useEffect } from 'react'
import { Box, Text, Button, Flex, VStack } from '@chakra-ui/react'
import { Play, Pause } from 'lucide-react'

const BORDER = '#2a2d3a'

interface PanConfig {
  type: 'pan'
  direction: 'left' | 'right' | 'up' | 'down'
  duration: number
  easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'
}

interface Props {
  config: PanConfig
  onChange: (config: PanConfig) => void
  disabled?: boolean
  fromImageUrl?: string
  toImageUrl?: string
}

const DIRECTION_OPTIONS = [
  { value: 'left', label: '向左' },
  { value: 'right', label: '向右' },
  { value: 'up', label: '向上' },
  { value: 'down', label: '向下' },
]

const EASING_OPTIONS = [
  { value: 'ease-in-out', label: '缓入缓出' },
  { value: 'ease-in', label: '缓入' },
  { value: 'ease-out', label: '缓出' },
  { value: 'linear', label: '线性' },
]

export function PanTransitionForm({
  config,
  onChange,
  disabled,
  fromImageUrl,
  toImageUrl,
}: Props) {
  const [previewing, setPreviewing] = useState(false)
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const fromElRef = useRef<HTMLImageElement>(null)
  const toElRef = useRef<HTMLImageElement>(null)

  const duration = config.duration || 600

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
    setPreviewProgress(0)
    if (fromElRef.current) {
      fromElRef.current.style.transform = ''
      fromElRef.current.style.opacity = '1'
    }
    if (toElRef.current && containerRef.current) {
      const m = 1.5
      const w = containerRef.current.offsetWidth
      const h = containerRef.current.offsetHeight
      let tx = 0
      switch (config.direction) {
        case 'left': tx = -w * m; break
        case 'right': tx = w * m; break
        default: tx = 0
      }
      const ty = config.direction === 'up' ? -h * m : config.direction === 'down' ? h * m : 0
      toElRef.current.style.transform = `translate(${tx}px, ${ty}px)`
      toElRef.current.style.opacity = '0'
    }
  }

  const [previewProgress, setPreviewProgress] = useState(0)

  const runPreview = () => {
    if (!fromElRef.current || !toElRef.current || !containerRef.current) return

    stopPreview()
    setPreviewing(true)
    startTimeRef.current = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = getEasingFn(config.easing)(progress)

      setPreviewProgress(easedProgress)

      const w = containerRef.current!.offsetWidth
      const h = containerRef.current!.offsetHeight
      const m = 1.5

      let fx = 0, fy = 0, tx = 0, ty = 0
      switch (config.direction) {
        case 'left':
          fx = -w * easedProgress
          tx = -w * m + w * m * easedProgress
          break
        case 'right':
          fx = w * easedProgress
          tx = w * m - w * m * easedProgress
          break
        case 'up':
          fy = -h * easedProgress
          ty = -h * m + h * m * easedProgress
          break
        case 'down':
          fy = h * easedProgress
          ty = h * m - h * m * easedProgress
          break
      }

      if (fromElRef.current) {
        fromElRef.current.style.transform = `translate(${fx}px, ${fy}px)`
        fromElRef.current.style.opacity = String(1 - easedProgress)
      }
      if (toElRef.current) {
        toElRef.current.style.transform = `translate(${tx}px, ${ty}px)`
        toElRef.current.style.opacity = String(easedProgress)
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

  // Initialize toEl position when direction or images change
  useEffect(() => {
    if (toElRef.current && containerRef.current) {
      const m = 1.5
      const w = containerRef.current.offsetWidth
      const h = containerRef.current.offsetHeight
      let tx = 0, ty = 0
      switch (config.direction) {
        case 'left': tx = -w * m; break
        case 'right': tx = w * m; break
        case 'up': ty = -h * m; break
        case 'down': ty = h * m; break
      }
      toElRef.current.style.transform = `translate(${tx}px, ${ty}px)`
      toElRef.current.style.opacity = '0'  // Start fully transparent
    }
  }, [config.direction, fromImageUrl, toImageUrl])

  return (
    <Box>
      <VStack align="stretch" gap="3" mb="4">
        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">方向</Text>
          <select
            value={config.direction}
            onChange={(e) => onChange({ ...config, direction: e.target.value as PanConfig['direction'] })}
            disabled={disabled}
            style={{ width: '100%', background: '#0a0b0f', border: `1px solid ${BORDER}`, borderRadius: '6px', color: '#e4e4e7', fontSize: '13px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
          >
            {DIRECTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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
          <select
            value={config.easing || 'ease-in-out'}
            onChange={(e) => onChange({ ...config, easing: e.target.value as PanConfig['easing'] })}
            disabled={disabled}
            style={{ width: '100%', background: '#0a0b0f', border: `1px solid ${BORDER}`, borderRadius: '6px', color: '#e4e4e7', fontSize: '13px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
          >
            {EASING_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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
            <img
              ref={fromElRef}
              src={fromImageUrl}
              alt="from"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
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