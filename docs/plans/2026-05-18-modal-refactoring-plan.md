# DetailDrawer 重构与转场表单实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 DetailDrawer 拆分为独立 Modal 组件（NodeModal、EdgeModal），并为每种转场类型（video、pan、flip、zoom）创建独立子表单，支持预览功能。

**Architecture:** 采用独立 Modal 组件 + 转场子表单分层架构，通过 Props 传递数据和回调，保持组件职责单一。

**Tech Stack:** React + Chakra UI + TypeScript

---

## 目标文件结构

```
src/admin/src/components/
├── DetailDrawer.tsx              # 仅保留侧边栏容器框架（简化后）
├── NodeModal.tsx                 # 节点编辑独立 Modal
├── EdgeModal.tsx                 # 边编辑独立 Modal
└── Edge/
    └── transitions/
        ├── index.ts             # 统一导出
        ├── TransitionSelector.tsx  # 转场类型选择器
        ├── VideoTransitionForm.tsx  # 视频转场表单
        ├── PanTransitionForm.tsx   # 平移转场表单
        ├── FlipTransitionForm.tsx  # 翻页转场表单
        └── ZoomTransitionForm.tsx # 缩放转场表单
```

---

## 实现顺序总览

1. Task 1: 创建 `Edge/transitions/` 目录结构和统一导出
2. Task 2: 实现 `TransitionSelector` 转场类型选择器
3. Task 3: 实现 `VideoTransitionForm` 视频转场表单
4. Task 4: 实现 `PanTransitionForm` 平移转场表单（带预览）
5. Task 5: 实现 `FlipTransitionForm` 翻页转场表单（带预览）
6. Task 6: 实现 `ZoomTransitionForm` 缩放转场表单（带预览）
7. Task 7: 创建 `NodeModal.tsx` 节点编辑 Modal
8. Task 8: 创建 `EdgeModal.tsx` 边编辑 Modal
9. Task 9: 重构 `DetailDrawer.tsx` 为简化容器
10. Task 10: 验证和测试

---

## Task 1: 创建 Edge/transitions/ 目录结构

**Files:**
- Create: `src/admin/src/components/Edge/transitions/index.ts`
- Create: `src/admin/src/components/Edge/transitions/TransitionSelector.tsx`
- Create: `src/admin/src/components/Edge/transitions/VideoTransitionForm.tsx`
- Create: `src/admin/src/components/Edge/transitions/PanTransitionForm.tsx`
- Create: `src/admin/src/components/Edge/transitions/FlipTransitionForm.tsx`
- Create: `src/admin/src/components/Edge/transitions/ZoomTransitionForm.tsx`

**Step 1: Create directory**

```bash
mkdir -p src/admin/src/components/Edge/transitions
```

**Step 2: Write `src/admin/src/components/Edge/transitions/index.ts`**

```typescript
export { TransitionSelector } from './TransitionSelector.js'
export { VideoTransitionForm } from './VideoTransitionForm.js'
export { PanTransitionForm } from './PanTransitionForm.js'
export { FlipTransitionForm } from './FlipTransitionForm.js'
export { ZoomTransitionForm } from './ZoomTransitionForm.js'
```

**Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors (files don't exist yet, but imports should resolve)

**Step 4: Commit**

```bash
git add src/admin/src/components/Edge/transitions/index.ts
git commit -m "feat: add Edge/transitions directory structure"
```

---

## Task 2: 实现 TransitionSelector 转场类型选择器

**Files:**
- Create: `src/admin/src/components/Edge/transitions/TransitionSelector.tsx`

**Step 1: Write TransitionSelector component**

```typescript
import { Box, Flex, Text, Button, VStack } from '@chakra-ui/react'

const BORDER = '#2a2d3a'

export interface TransitionOption {
  type: 'video' | 'builtin'
  builtinType?: 'pan' | 'flip' | 'zoom'
  label: string
  description: string
}

const TRANSITION_OPTIONS: TransitionOption[] = [
  {
    type: 'video',
    label: '视频转场',
    description: '使用 AI 生成的视频作为转场效果',
  },
  {
    type: 'builtin',
    builtinType: 'pan',
    label: '平移切换',
    description: '当前节点向指定方向移出，目标节点从视口外移入',
  },
  {
    type: 'builtin',
    builtinType: 'flip',
    label: '翻页切换',
    description: '3D 翻页效果，可选水平/垂直方向',
  },
  {
    type: 'builtin',
    builtinType: 'zoom',
    label: '缩放切换',
    description: '以热点位置为中心进行缩放，淡入目标节点',
  },
]

interface Props {
  value: TransitionOption | null
  onChange: (option: TransitionOption) => void
  disabled?: boolean
}

export function TransitionSelector({ value, onChange, disabled }: Props) {
  const isSelected = (opt: TransitionOption) => {
    if (!value) return false
    if (value.type !== opt.type) return false
    if (opt.type === 'builtin' && value.builtinType !== opt.builtinType) return false
    return true
  }

  return (
    <VStack align="stretch" gap="2">
      <Text fontSize="xs" fontWeight="500" color="text-tertiary" mb="1">
        转场类型
      </Text>
      {TRANSITION_OPTIONS.map((opt) => {
        const selected = isSelected(opt)
        return (
          <Box
            key={`${opt.type}-${opt.builtinType || ''}`}
            as="button"
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt)}
            textAlign="left"
            p="3"
            rounded="md"
            bg={selected ? 'rgba(59,130,246,0.12)' : 'rgba(92,95,119,0.08)'}
            border="1px solid"
            borderColor={selected ? 'rgba(59,130,246,0.5)' : BORDER}
            cursor={disabled ? 'not-allowed' : 'pointer'}
            opacity={disabled ? 0.5 : 1}
            transition="all 150ms ease"
            _hover={disabled ? {} : {
              borderColor: selected ? 'rgba(59,130,246,0.7)' : 'rgba(92,95,119,0.3)',
              bg: selected ? 'rgba(59,130,246,0.16)' : 'rgba(92,95,119,0.12)',
            }}
          >
            <Flex justify="space-between" align="center">
              <Box>
                <Text fontSize="sm" fontWeight="500" color={selected ? '#7dd3fc' : 'text-primary'}>
                  {opt.label}
                </Text>
                <Text fontSize="xs" color="text-tertiary" mt="0.5">
                  {opt.description}
                </Text>
              </Box>
              {selected && (
                <Box w="16px" h="16px" rounded="full" bg="#3b82f6" color="white" fontSize="10px">
                  ✓
                </Box>
              )}
            </Flex>
          </Box>
        )
      })}
    </VStack>
  )
}
```

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/admin/src/components/Edge/transitions/TransitionSelector.tsx
git commit -m "feat: add TransitionSelector component"
```

---

## Task 3: 实现 VideoTransitionForm 视频转场表单

**Files:**
- Create: `src/admin/src/components/Edge/transitions/VideoTransitionForm.tsx`

**Step 1: Write VideoTransitionForm component**

```typescript
import { useState } from 'react'
import { Box, Text, Button, Flex, Input } from '@chakra-ui/react'
import { Upload } from 'lucide-react'
import { uploadEdgeVideo } from '../../../../services/api'

const BORDER = '#2a2d3a'

interface Props {
  guideId: string
  edgeId: string
  videoUrl: string | undefined
  onChange: (videoUrl: string) => void
  disabled?: boolean
}

export function VideoTransitionForm({ guideId, edgeId, videoUrl, onChange, disabled }: Props) {
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  return (
    <Box>
      <Text fontSize="xs" color="text-tertiary" mb="2">
        当前视频
      </Text>

      {videoUrl ? (
        <Box rounded="md" overflow="hidden" mb="3" style={{ border: `1px solid ${BORDER}` }}>
          <video
            src={videoUrl}
            controls
            muted
            playsInline
            style={{ width: '100%', display: 'block', background: '#05060a', maxHeight: '200px', objectFit: 'contain' }}
          />
        </Box>
      ) : (
        <Flex
          align="center"
          justify="center"
          mb="3"
          p="6"
          rounded="md"
          bg="rgba(92,95,119,0.08)"
          style={{ border: `1px dashed ${BORDER}` }}
        >
          <Text fontSize="xs" color="text-tertiary">暂未设置视频</Text>
        </Flex>
      )}

      <input
        type="file"
        accept="video/*"
        id={`video-upload-${edgeId}`}
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          setUploading(true)
          setUploadMsg(null)
          try {
            const result = await uploadEdgeVideo(guideId, edgeId, file)
            onChange(result.videoUrl)
            setUploadMsg('视频上传成功')
            setTimeout(() => setUploadMsg(null), 3000)
          } catch (err: any) {
            setUploadMsg(err.message || '上传失败')
          } finally {
            setUploading(false)
            e.target.value = ''
          }
        }}
      />

      <Button
        w="100%"
        size="sm"
        variant="ghost"
        color="text-secondary"
        _hover={{ bg: 'surface-raised' }}
        loading={uploading}
        disabled={disabled}
        onClick={() => document.getElementById(`video-upload-${edgeId}`)?.click()}
      >
        <Upload size={14} style={{ marginRight: 6 }} />
        {videoUrl ? '上传视频替换' : '上传视频'}
      </Button>

      {uploadMsg && (
        <Text
          fontSize="xs"
          color={uploadMsg.includes('成功') ? '#22c55e' : '#ef4444'}
          mt="2"
          px="1"
        >
          {uploadMsg}
        </Text>
      )}
    </Box>
  )
}
```

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/admin/src/components/Edge/transitions/VideoTransitionForm.tsx
git commit -m "feat: add VideoTransitionForm component"
```

---

## Task 4: 实现 PanTransitionForm 平移转场表单（带预览）

**Files:**
- Create: `src/admin/src/components/Edge/transitions/PanTransitionForm.tsx`

**Step 1: Write PanTransitionForm component**

```typescript
import { useState, useRef, useEffect } from 'react'
import { Box, Text, Button, Flex, Select, HStack, VStack } from '@chakra-ui/react'
import { Play, Pause } from 'lucide-react'

const BORDER = '#2a2d3a'

interface Props {
  config: {
    type: 'pan'
    direction: 'left' | 'right' | 'up' | 'down'
    duration: number
    easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'
  }
  onChange: (config: Props['config']) => void
  disabled?: boolean
  // 预览相关
  fromImageUrl?: string
  toImageUrl?: string
  hotspotX?: number
  hotspotY?: number
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
  const [previewProgress, setPreviewProgress] = useState(0)
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

      setPreviewProgress(easedProgress)

      // Apply transform
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
      }
      if (toElRef.current) {
        toElRef.current.style.transform = `translate(${tx}px, ${ty}px)`
        toElRef.current.style.opacity = '1'
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setTimeout(() => {
          stopPreview()
          // Reset
          if (fromElRef.current) fromElRef.current.style.transform = ''
          if (toElRef.current) {
            toElRef.current.style.transform = `translate(${-w * m}px, 0)`
            toElRef.current.style.opacity = '0'
          }
        }, 300)
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    return () => stopPreview()
  }, [])

  // Initialize toEl position
  useEffect(() => {
    if (toElRef.current && containerRef.current) {
      const m = 1.5
      let tx = 0
      const w = containerRef.current.offsetWidth
      switch (config.direction) {
        case 'left': tx = -w * m; break
        case 'right': tx = w * m; break
        default: tx = 0
      }
      toElRef.current.style.transform = `translate(${tx}px, 0)`
    }
  }, [config.direction, fromImageUrl, toImageUrl])

  return (
    <Box>
      <VStack align="stretch" gap="3" mb="4">
        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">方向</Text>
          <Select
            value={config.direction}
            onChange={(e) => onChange({ ...config, direction: e.target.value as any })}
            disabled={disabled}
            style={{ background: '#0a0b0f', border: `1px solid ${BORDER}`, color: '#e4e4e7' }}
          >
            {DIRECTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </Box>

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">时长 (ms)</Text>
          <Input
            type="number"
            value={config.duration || 600}
            onChange={(e) => onChange({ ...config, duration: Number(e.target.value) })}
            disabled={disabled}
            style={{ background: '#0a0b0f', border: `1px solid ${BORDER}`, color: '#e4e4e7' }}
          />
        </Box>

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">缓动函数</Text>
          <Select
            value={config.easing || 'ease-in-out'}
            onChange={(e) => onChange({ ...config, easing: e.target.value as any })}
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
            {previewing ? <Pause size={12} style={{ marginRight: 4 }} /> : <Play size={12} style={{ marginRight: 4 }} />}
            {previewing ? '停止' : '播放'}
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
```

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/admin/src/components/Edge/transitions/PanTransitionForm.tsx
git commit -m "feat: add PanTransitionForm with preview"
```

---

## Task 5: 实现 FlipTransitionForm 翻页转场表单（带预览）

**Files:**
- Create: `src/admin/src/components/Edge/transitions/FlipTransitionForm.tsx`

**Step 1: Write FlipTransitionForm component**

```typescript
import { useState, useRef, useEffect } from 'react'
import { Box, Text, Button, Flex, Select, VStack } from '@chakra-ui/react'
import { Play, Pause } from 'lucide-react'

const BORDER = '#2a2d3a'

interface Props {
  config: {
    type: 'flip'
    direction: 'horizontal' | 'vertical'
    flipStyle: 'fade' | 'cut' | 'curl'
    duration: number
    easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'
  }
  onChange: (config: Props['config']) => void
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
    if (fromElRef.current) fromElRef.current.style.transform = ''
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
          <Select
            value={config.direction}
            onChange={(e) => onChange({ ...config, direction: e.target.value as any })}
            disabled={disabled}
            style={{ background: '#0a0b0f', border: `1px solid ${BORDER}`, color: '#e4e4e7' }}
          >
            {DIRECTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
        </Box>

        <Box>
          <Text fontSize="xs" color="text-tertiary" mb="1">翻页样式</Text>
          <Select
            value={config.flipStyle || 'fade'}
            onChange={(e) => onChange({ ...config, flipStyle: e.target.value as any })}
            disabled={disabled}
            style={{ background: '#0a0b0f', border: `1px solid ${BORDER}`, color: '#e4e4e7' }}
          >
            {FLIP_STYLE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
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
            onChange={(e) => onChange({ ...config, easing: e.target.value as any })}
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
            {previewing ? <Pause size={12} style={{ marginRight: 4 }} /> : <Play size={12} style={{ marginRight: 4 }} />}
            {previewing ? '停止' : '播放'}
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
```

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/admin/src/components/Edge/transitions/FlipTransitionForm.tsx
git commit -m "feat: add FlipTransitionForm with preview"
```

---

## Task 6: 实现 ZoomTransitionForm 缩放转场表单（带预览）

**Files:**
- Create: `src/admin/src/components/Edge/transitions/ZoomTransitionForm.tsx`

**Step 1: Write ZoomTransitionForm component**

```typescript
import { useState, useRef, useEffect } from 'react'
import { Box, Text, Button, Flex, Select, VStack } from '@chakra-ui/react'
import { Play, Pause } from 'lucide-react'

const BORDER = '#2a2d3a'

interface Props {
  config: {
    type: 'zoom'
    direction: 'in' | 'out'
    scale: number
    centerX: number
    centerY: number
    duration: number
    easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'
  }
  onChange: (config: Props['config']) => void
  disabled?: boolean
  fromImageUrl?: string
  toImageUrl?: string
  // 默认使用热点的位置
  hotspotX?: number
  hotspotY?: number
}

const DIRECTION_OPTIONS = [
  { value: 'in', label: '放大进入（缩小当前节点）' },
  { value: 'out', label: '缩小暴露（放大当前节点）' },
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
  const fromElRef = useRef<HTMLImageElement>(null)
  const toElRef = useRef<HTMLImageElement>(null)

  const duration = config.duration || 600
  const scale = config.scale || 1.5
  const centerX = hotspotX
  const centerY = hotspotY

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
    if (fromElRef.current) fromElRef.current.style.transform = ''
    if (toElRef.current) toElRef.current.style.opacity = '0'
  }

  const runPreview = () => {
    if (!fromElRef.current || !toElRef.current) return

    stopPreview()
    setPreviewing(true)
    startTimeRef.current = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = getEasingFn(config.easing)(progress)

      if (config.direction === 'in') {
        const s = 1 - (1 - 1/scale) * easedProgress
        const tx = (centerX - 0.5) * (1 - s) * 100
        const ty = (centerY - 0.5) * (1 - s) * 100

        if (fromElRef.current) {
          fromElRef.current.style.transform = `scale(${s}) translate(${tx}%, ${ty}%)`
        }
        if (toElRef.current) {
          toElRef.current.style.opacity = progress > 0.3 ? String((progress - 0.3) / 0.7) : '0'
        }
      } else {
        const s = 1 + (scale - 1) * easedProgress
        const tx = (0.5 - centerX) * (s - 1) * 100
        const ty = (0.5 - centerY) * (s - 1) * 100

        if (fromElRef.current) {
          fromElRef.current.style.transform = `scale(${s}) translate(${tx}%, ${ty}%)`
        }
        if (toElRef.current) {
          toElRef.current.style.opacity = progress > 0.3 ? String((progress - 0.3) / 0.7) : '0'
        }
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
            value={config.direction}
            onChange={(e) => onChange({ ...config, direction: e.target.value as any })}
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
            min="1"
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

        <Flex gap="3">
          <Box flex="1">
            <Text fontSize="xs" color="text-tertiary" mb="1">中心 X (热点位置)</Text>
            <Text fontSize="xs" color="text-secondary" style={{ fontFamily: 'monospace' }}>
              {centerX.toFixed(2)}
            </Text>
          </Box>
          <Box flex="1">
            <Text fontSize="xs" color="text-tertiary" mb="1">中心 Y (热点位置)</Text>
            <Text fontSize="xs" color="text-secondary" style={{ fontFamily: 'monospace' }}>
              {centerY.toFixed(2)}
            </Text>
          </Box>
        </Flex>

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
            onChange={(e) => onChange({ ...config, easing: e.target.value as any })}
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
            {previewing ? <Pause size={12} style={{ marginRight: 4 }} /> : <Play size={12} style={{ marginRight: 4 }} />}
            {previewing ? '停止' : '播放'}
          </Button>
        </Flex>

        <Box
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
```

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/admin/src/components/Edge/transitions/ZoomTransitionForm.tsx
git commit -m "feat: add ZoomTransitionForm with preview"
```

---

## Task 7: 创建 NodeModal.tsx 节点编辑 Modal

**Files:**
- Create: `src/admin/src/components/NodeModal.tsx`

**Step 1: Write NodeModal component**

NodeModal 从原 DetailDrawer.tsx 中的 NodeForm 改造而来，保持原有字段和逻辑，但包装为独立的 Modal 组件。

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/admin/src/components/NodeModal.tsx
git commit -m "feat: add NodeModal as standalone component"
```

---

## Task 8: 创建 EdgeModal.tsx 边编辑 Modal

**Files:**
- Create: `src/admin/src/components/EdgeModal.tsx`

**Step 1: Write EdgeModal component**

EdgeModal 从原 DetailDrawer.tsx 中的 EdgeForm 改造而来，集成 TransitionSelector 和各转场子表单。

需要：
1. 引入所有 TransitionForm 组件
2. 根据 `transitionType` 和 `builtinTransition.type` 动态渲染对应的表单
3. 提供图片 URL 用于预览（需要从 nodeMap 获取 fromNode 和 toNode 的图片）

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/admin/src/components/EdgeModal.tsx
git commit -m "feat: add EdgeModal with transition forms"
```

---

## Task 9: 重构 DetailDrawer.tsx 为简化容器

**Files:**
- Modify: `src/admin/src/components/DetailDrawer.tsx`

**Step 1: Simplify DetailDrawer**

将 DetailDrawer 简化为仅做容器框架，不再包含具体的表单实现，而是根据 type 渲染对应的独立 Modal：

```typescript
// 移除所有 Form 组件（PackageForm, NodeForm, EdgeForm）
// 保留容器框架和路由逻辑
// 在 selected.type === 'node' 时渲染 NodeModal
// 在 selected.type === 'edge' 时渲染 EdgeModal
```

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/admin/src/components/DetailDrawer.tsx
git commit -m "refactor: simplify DetailDrawer to container only"
```

---

## Task 10: 最终验证

**Step 1: Full TypeScript compilation check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1
```

Expected: No errors

**Step 2: Verify all files exist**

```bash
ls -la src/admin/src/components/
ls -la src/admin/src/components/Edge/
ls -la src/admin/src/components/Edge/transitions/
```

**Step 3: Commit remaining changes**

```bash
git status
git add -A
git commit -m "feat: complete modal refactoring with transition forms"
```

---

## 完整文件列表

新建文件：
```
src/admin/src/components/
├── NodeModal.tsx
├── EdgeModal.tsx
└── Edge/
    └── transitions/
        ├── index.ts
        ├── TransitionSelector.tsx
        ├── VideoTransitionForm.tsx
        ├── PanTransitionForm.tsx
        ├── FlipTransitionForm.tsx
        └── ZoomTransitionForm.tsx
```

修改文件：
```
src/admin/src/components/DetailDrawer.tsx  (简化)
```

删除（从 DetailDrawer 中移除）：
- `PackageForm`
- `NodeForm`
- `EdgeForm`