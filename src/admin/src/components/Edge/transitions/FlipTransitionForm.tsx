import { useState, useRef, useEffect } from 'react'
import { Box, Text, Button, Flex, VStack } from '@chakra-ui/react'
import { Play, Pause } from 'lucide-react'

const BORDER = '#2a2d3a'

interface FlipConfig {
  type: 'flip'
  direction: 'horizontal' | 'vertical'
  flipStyle: 'fade' | 'cut' | 'curl'
  duration: number
  easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'
}

interface Props {
  config: FlipConfig
  onChange: (config: FlipConfig) => void
  disabled?: boolean
  fromImageUrl?: string
  toImageUrl?: string
}

const DIRECTION_OPTIONS = [
  { value: 'horizontal', label: '水平翻页' },
  { value: 'vertical', label: '垂直翻页' },
]

const FLIP_STYLE_OPTIONS = [
  { value: 'fade', label: '淡入淡出' },
  { value: 'cut', label: '切换' },
  { value: 'curl', label: '卷曲' },
]

const EASING_OPTIONS = [
  { value: 'ease-in-out', label: '缓入缓出' },
  { value: 'ease-in', label: '缓入' },
  { value: 'ease-out', label: '缓出' },
  { value: 'linear', label: '线性' },
]

export function FlipTransitionForm({
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
  const fromElRef = useRef<HTMLDivElement>(null)
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
    if (fromElRef.current) {
      fromElRef.current.style.transform = ''
      fromElRef.current.style.opacity = '1'
    }
    if (toElRef.current) toElRef.current.style.opacity = '0'
  }

  const runPreview = () => {
    if (!fromElRef.current || !toElRef.current) return

    stopPreview()
    setPreviewing(true)
    startTimeRef.current = performance.now()

    const isH = config.direction === 'horizontal'
    const axis = isH ? 'Y' : 'X'

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = getEasingFn(config.easing)(progress)

      const angle = easedProgress * 90
      if (fromElRef.current) {
        fromElRef.current.style.transform = `rotate${axis}(${angle}deg)`
      }
      if (toElRef.current) {
        toElRef.current.style.opacity = progress > 0.5 ? String((progress - 0.5) * 2) : '0'
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
          <select
            value={config.direction}
            onChange={(e) => onChange({ ...config, direction: e.target.value as FlipConfig['direction'] })}
            disabled={disabled}
            style={{ width: '100%', background: '#0a0b0f', border: `1px solid ${BORDER}`, borderRadius: '6px', color: '#e4e4e7', fontSize: '13px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
          >
            {DIRECTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </Box>

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">翻页样式</Text>
          <select
            value={config.flipStyle || 'fade'}
            onChange={(e) => onChange({ ...config, flipStyle: e.target.value as FlipConfig['flipStyle'] })}
            disabled={disabled}
            style={{ width: '100%', background: '#0a0b0f', border: `1px solid ${BORDER}`, borderRadius: '6px', color: '#e4e4e7', fontSize: '13px', padding: '8px 12px', outline: 'none', boxSizing: 'border-box' }}
          >
            {FLIP_STYLE_OPTIONS.map(opt => (
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
            onChange={(e) => onChange({ ...config, easing: e.target.value as FlipConfig['easing'] })}
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
          style={{ border: `1px solid ${BORDER}`, perspective: '200px' }}
        >
          <div
            ref={fromElRef}
            style={{
              position: 'absolute',
              inset: 0,
              transformStyle: 'preserve-3d',
              backfaceVisibility: 'hidden',
            }}
          >
            {fromImageUrl && (
              <img
                src={fromImageUrl}
                alt="from"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            )}
          </div>
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