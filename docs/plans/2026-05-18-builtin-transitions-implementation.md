# 内置转场系统实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为边转场添加内置转场选项（平移、翻页、缩放），通过 Transition 逻辑层 + TransitionRenderer DOM 层抽象实现代码解耦。

**Architecture:** 采用双层抽象：Transition 接口负责动画进度计算，TransitionRenderer 接口负责 DOM 操作，两者通过 TransitionContext 共享上下文。

**Tech Stack:** TypeScript + CSS transform + CSS 3D perspective

---

## 实现顺序总览

1. Task 1: 创建目录结构和类型定义
2. Task 2: 实现 TransitionRenderer 接口和三个渲染器
3. Task 3: 实现 Transition 接口和三个转场逻辑
4. Task 4: 实现工厂函数
5. Task 5: 扩展 PublishEdge 类型并更新 shared/types.ts
6. Task 6: 集成到 PreviewModal（管理员预览）
7. Task 7: 集成到 runtime-bundle.ts（独立运行时）
8. Task 8: 类型导出验证

---

## Task 1: 创建目录结构和类型定义

**Files:**
- Create: `src/runtime/transitions/transition-interface.ts`
- Create: `src/runtime/transitions/index.ts`

**Step 1: Create directory**

```bash
mkdir -p src/runtime/transitions/transitions src/runtime/transitions/renderers
```

**Step 2: Write `src/runtime/transitions/transition-interface.ts`**

```typescript
// Builtin transition types
export type BuiltinTransitionType = 'pan' | 'flip' | 'zoom'

// Easing functions
export type EasingType = 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'

// Pan transition config
export interface PanTransitionConfig {
  type: 'pan'
  direction: 'left' | 'right' | 'up' | 'down'
  duration: number        // ms, default 600
  easing: EasingType      // default 'ease-in-out'
}

// Flip transition config
export interface FlipTransitionConfig {
  type: 'flip'
  direction: 'horizontal' | 'vertical'  // default 'horizontal'
  flipStyle: 'fade' | 'cut' | 'curl'   // default 'fade'
  duration: number
  easing: EasingType
}

// Zoom transition config
export interface ZoomTransitionConfig {
  type: 'zoom'
  direction: 'in' | 'out'
  scale: number           // default 1.5
  centerX: number        // 0-1, default hotspot x
  centerY: number        // 0-1, default hotspot y
  duration: number
  easing: EasingType
}

// Union type for all builtin transition configs
export type BuiltinTransitionConfig = PanTransitionConfig | FlipTransitionConfig | ZoomTransitionConfig

// Context passed to transitions and renderers
export interface TransitionContext {
  container: HTMLElement
  fromNodeEl: HTMLElement
  toNodeEl: HTMLElement
  hotspot: { x: number, y: number }  // normalized 0-1
  config: BuiltinTransitionConfig
}

// Transition logic interface (pure computation, no DOM)
export interface Transition {
  readonly type: BuiltinTransitionType
  play(context: TransitionContext): Promise<void>
  abort(): void
}

// TransitionRenderer interface (pure DOM operations)
export interface TransitionRenderer {
  readonly transitionType: BuiltinTransitionType
  renderSetup(context: TransitionContext): void
  applyAnimation(progress: number): void  // 0-1
  renderCleanup(): void
}

// Default config values
export const DEFAULT_PAN_CONFIG: Partial<PanTransitionConfig> = {
  duration: 600,
  easing: 'ease-in-out',
}

export const DEFAULT_FLIP_CONFIG: Partial<FlipTransitionConfig> = {
  direction: 'horizontal',
  flipStyle: 'fade',
  duration: 600,
  easing: 'ease-in-out',
}

export const DEFAULT_ZOOM_CONFIG: Partial<ZoomTransitionConfig> = {
  direction: 'in',
  scale: 1.5,
  duration: 600,
  easing: 'ease-in-out',
}
```

**Step 3: Write `src/runtime/transitions/index.ts`**

```typescript
// Re-export all public types and functions
export * from './transition-interface.js'
export { createTransition } from './transitions/transition-factory.js'
export { createRenderer } from './renderers/renderer-factory.js'
```

**Step 4: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 5: Commit**

```bash
git add src/runtime/transitions/transition-interface.ts src/runtime/transitions/index.ts
git commit -m "feat: add builtin transition type definitions and interfaces"
```

---

## Task 2: 实现 TransitionRenderer 接口和三个渲染器

**Files:**
- Create: `src/runtime/transitions/renderers/transition-renderer.ts`
- Create: `src/runtime/transitions/renderers/pan-renderer.ts`
- Create: `src/runtime/transitions/renderers/flip-renderer.ts`
- Create: `src/runtime/transitions/renderers/zoom-renderer.ts`
- Create: `src/runtime/transitions/renderers/renderer-factory.ts`

**Step 1: Write `src/runtime/transitions/renderers/transition-renderer.ts`**

```typescript
// Re-export interface from parent
export type { TransitionRenderer } from '../transition-interface.js'
```

**Step 2: Write `src/runtime/transitions/renderers/pan-renderer.ts`**

```typescript
import type { TransitionContext, TransitionRenderer, PanTransitionConfig } from '../transition-interface.js'

const PAN_CSS = `
  .transition-pan-container { position: absolute; inset: 0; overflow: hidden; }
  .transition-pan-from { position: absolute; inset: 0; }
  .transition-pan-to { position: absolute; inset: 0; }
`

export class PanRenderer implements TransitionRenderer {
  readonly transitionType = 'pan' as const

  private containerEl: HTMLElement | null = null
  private fromEl: HTMLElement | null = null
  private toEl: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null

  renderSetup(context: TransitionContext): void {
    // Inject CSS if not already present
    if (!document.getElementById('transition-pan-styles')) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'transition-pan-styles'
      this.styleEl.textContent = PAN_CSS
      document.head.appendChild(this.styleEl)
    }

    // Create container
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'transition-pan-container'

    // Clone fromNodeEl as fromEl
    this.fromEl = context.fromNodeEl.cloneNode(true) as HTMLElement
    this.fromEl.className = 'transition-pan-from'
    this.fromEl.style.position = 'absolute'
    this.fromEl.style.inset = '0'
    this.fromEl.style.width = '100%'
    this.fromEl.style.height = '100%'
    this.fromEl.style.objectFit = 'contain'

    // Clone toNodeEl as toEl
    this.toEl = context.toNodeEl.cloneNode(true) as HTMLElement
    this.toEl.className = 'transition-pan-to'
    this.toEl.style.position = 'absolute'
    this.toEl.style.inset = '0'
    this.toEl.style.width = '100%'
    this.toEl.style.height = '100%'
    this.toEl.style.objectFit = 'contain'

    // Apply initial offset based on direction
    const config = context.config as PanTransitionConfig
    const offset = this.calculateOffset(context, config.direction)

    this.containerEl.appendChild(this.fromEl)
    this.containerEl.appendChild(this.toEl)
    context.container.appendChild(this.containerEl)

    // Apply initial transform to toEl
    this.toEl.style.transform = `translate(${offset.x}px, ${offset.y}px)`
    this.toEl.style.transition = 'none'
  }

  applyAnimation(progress: number): void {
    if (!this.fromEl || !this.toEl) return

    const config = this.getConfig()
    const offset = this.calculateOffsetFromProgress(this.fromEl, this.toEl, config.direction, progress)

    this.fromEl.style.transform = `translate(${offset.fromX}px, ${offset.fromY}px)`
    this.toEl.style.transform = `translate(${offset.toX}px, ${offset.toY}px)`
  }

  renderCleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl)
    }
    this.containerEl = null
    this.fromEl = null
    this.toEl = null
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl)
      this.styleEl = null
    }
  }

  private calculateOffset(context: TransitionContext, direction: string): { x: number, y: number } {
    const containerWidth = context.container.offsetWidth
    const containerHeight = context.container.offsetHeight
    const multiplier = 1.5

    switch (direction) {
      case 'left': return { x: -containerWidth * multiplier, y: 0 }
      case 'right': return { x: containerWidth * multiplier, y: 0 }
      case 'up': return { x: 0, y: -containerHeight * multiplier }
      case 'down': return { x: 0, y: containerHeight * multiplier }
      default: return { x: 0, y: 0 }
    }
  }

  private calculateOffsetFromProgress(
    fromEl: HTMLElement, toEl: HTMLElement, direction: string, progress: number
  ): { fromX: number, fromY: number, toX: number, toY: number } {
    const containerWidth = fromEl.offsetWidth
    const containerHeight = fromEl.offsetHeight
    const multiplier = 1.5

    let fromX = 0, fromY = 0, toX = 0, toY = 0

    switch (direction) {
      case 'left':
        fromX = -containerWidth * progress
        toX = -containerWidth * multiplier + containerWidth * multiplier * progress
        break
      case 'right':
        fromX = containerWidth * progress
        toX = containerWidth * multiplier - containerWidth * multiplier * progress
        break
      case 'up':
        fromY = -containerHeight * progress
        toY = -containerHeight * multiplier + containerHeight * multiplier * progress
        break
      case 'down':
        fromY = containerHeight * progress
        toY = containerHeight * multiplier - containerHeight * multiplier * progress
        break
    }

    return { fromX, fromY, toX, toY }
  }

  private getConfig(): PanTransitionConfig {
    return {
      type: 'pan',
      direction: 'left',
      duration: 600,
      easing: 'ease-in-out',
    }
  }
}
```

**Step 3: Write `src/runtime/transitions/renderers/flip-renderer.ts`**

```typescript
import type { TransitionContext, TransitionRenderer, FlipTransitionConfig } from '../transition-interface.js'

const FLIP_CSS = `
  .transition-flip-container { position: absolute; inset: 0; perspective: 1000px; overflow: hidden; }
  .transition-flip-scene { position: absolute; inset: 0; transform-style: preserve-3d; }
  .transition-flip-from { position: absolute; inset: 0; backface-visibility: hidden; }
  .transition-flip-to { position: absolute; inset: 0; backface-visibility: hidden; }
`

export class FlipRenderer implements TransitionRenderer {
  readonly transitionType = 'flip' as const

  private containerEl: HTMLElement | null = null
  private sceneEl: HTMLElement | null = null
  private fromEl: HTMLElement | null = null
  private toEl: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null

  renderSetup(context: TransitionContext): void {
    if (!document.getElementById('transition-flip-styles')) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'transition-flip-styles'
      this.styleEl.textContent = FLIP_CSS
      document.head.appendChild(this.styleEl)
    }

    const config = context.config as FlipTransitionConfig
    const isHorizontal = config.direction === 'horizontal'

    // Container with perspective
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'transition-flip-container'

    // Scene element for 3D transforms
    this.sceneEl = document.createElement('div')
    this.sceneEl.className = 'transition-flip-scene'

    // From element (front face)
    this.fromEl = context.fromNodeEl.cloneNode(true) as HTMLElement
    this.fromEl.className = 'transition-flip-from'
    this.fromEl.style.position = 'absolute'
    this.fromEl.style.inset = '0'
    this.fromEl.style.width = '100%'
    this.fromEl.style.height = '100%'
    this.fromEl.style.objectFit = 'contain'

    // To element (back face, initially hidden)
    this.toEl = context.toNodeEl.cloneNode(true) as HTMLElement
    this.toEl.className = 'transition-flip-to'
    this.toEl.style.position = 'absolute'
    this.toEl.style.inset = '0'
    this.toEl.style.width = '100%'
    this.toEl.style.height = '100%'
    this.toEl.style.objectFit = 'contain'
    this.toEl.style.opacity = '0'

    this.sceneEl.appendChild(this.fromEl)
    this.sceneEl.appendChild(this.toEl)
    this.containerEl.appendChild(this.sceneEl)
    context.container.appendChild(this.containerEl)

    // Set initial rotate based on direction
    const initialRotate = isHorizontal ? 0 : 0
    this.sceneEl.style.transform = `rotate${isHorizontal ? 'Y' : 'X'}(${initialRotate}deg)`
    this.sceneEl.style.transition = 'none'
  }

  applyAnimation(progress: number): void {
    if (!this.sceneEl || !this.fromEl || !this.toEl) return

    const config = this.getConfig()
    const isHorizontal = config.direction === 'horizontal'
    const axis = isHorizontal ? 'Y' : 'X'
    const maxAngle = 90

    // Rotate scene
    const rotateAngle = progress * maxAngle
    this.sceneEl.style.transform = `rotate${axis}(${rotateAngle}deg)`

    // Fade in toEl as flip progresses (after 50%)
    if (progress > 0.5) {
      const toOpacity = (progress - 0.5) * 2  // 0 to 1 in the second half
      this.toEl!.style.opacity = String(toOpacity)
    }
  }

  renderCleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl)
    }
    this.containerEl = null
    this.sceneEl = null
    this.fromEl = null
    this.toEl = null
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl)
      this.styleEl = null
    }
  }

  private getConfig(): FlipTransitionConfig {
    return {
      type: 'flip',
      direction: 'horizontal',
      flipStyle: 'fade',
      duration: 600,
      easing: 'ease-in-out',
    }
  }
}
```

**Step 4: Write `src/runtime/transitions/renderers/zoom-renderer.ts`**

```typescript
import type { TransitionContext, TransitionRenderer, ZoomTransitionConfig } from '../transition-interface.js'

const ZOOM_CSS = `
  .transition-zoom-container { position: absolute; inset: 0; overflow: hidden; }
  .transition-zoom-from { position: absolute; inset: 0; transform-origin: var(--zoom-origin-x, 50%) var(--zoom-origin-y, 50%); }
  .transition-zoom-to { position: absolute; inset: 0; opacity: 0; }
`

export class ZoomRenderer implements TransitionRenderer {
  readonly transitionType = 'zoom' as const

  private containerEl: HTMLElement | null = null
  private fromEl: HTMLElement | null = null
  private toEl: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null

  renderSetup(context: TransitionContext): void {
    if (!document.getElementById('transition-zoom-styles')) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'transition-zoom-styles'
      this.styleEl.textContent = ZOOM_CSS
      document.head.appendChild(this.styleEl)
    }

    const config = context.config as ZoomTransitionConfig
    const centerX = config.centerX ?? context.hotspot.x
    const centerY = config.centerY ?? context.hotspot.y

    // Container
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'transition-zoom-container'

    // From element
    this.fromEl = context.fromNodeEl.cloneNode(true) as HTMLElement
    this.fromEl.className = 'transition-zoom-from'
    this.fromEl.style.position = 'absolute'
    this.fromEl.style.inset = '0'
    this.fromEl.style.width = '100%'
    this.fromEl.style.height = '100%'
    this.fromEl.style.objectFit = 'contain'
    this.fromEl.style.setProperty('--zoom-origin-x', `${centerX * 100}%`)
    this.fromEl.style.setProperty('--zoom-origin-y', `${centerY * 100}%`)

    // To element (initially invisible)
    this.toEl = context.toNodeEl.cloneNode(true) as HTMLElement
    this.toEl.className = 'transition-zoom-to'
    this.toEl.style.position = 'absolute'
    this.toEl.style.inset = '0'
    this.toEl.style.width = '100%'
    this.toEl.style.height = '100%'
    this.toEl.style.objectFit = 'contain'

    this.containerEl.appendChild(this.fromEl)
    this.containerEl.appendChild(this.toEl)
    context.container.appendChild(this.containerEl)

    // Initial transform
    this.fromEl.style.transform = 'scale(1) translate(0, 0)'
    this.fromEl.style.transition = 'none'
  }

  applyAnimation(progress: number): void {
    if (!this.fromEl || !this.toEl) return

    const config = this.getConfig()
    const scale = config.scale ?? 1.5
    const centerX = config.centerX ?? 0.5
    const centerY = config.centerY ?? 0.5

    if (config.direction === 'in') {
      // Zoom in: fromNode scales down, toNode fades in
      const scaleVal = 1 - (1 - 1/scale) * progress
      const tx = (centerX - 0.5) * (1 - scaleVal) * 100
      const ty = (centerY - 0.5) * (1 - scaleVal) * 100

      this.fromEl.style.transform = `scale(${scaleVal}) translate(${tx}%, ${ty}%)`
      this.toEl.style.opacity = String(progress > 0.3 ? (progress - 0.3) / 0.7 : 0)
    } else {
      // Zoom out: fromNode scales up, toNode fades in
      const scaleVal = 1 + (scale - 1) * progress
      const tx = (0.5 - centerX) * (scaleVal - 1) * 100
      const ty = (0.5 - centerY) * (scaleVal - 1) * 100

      this.fromEl.style.transform = `scale(${scaleVal}) translate(${tx}%, ${ty}%)`
      this.toEl.style.opacity = String(progress > 0.3 ? (progress - 0.3) / 0.7 : 0)
    }
  }

  renderCleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl)
    }
    this.containerEl = null
    this.fromEl = null
    this.toEl = null
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl)
      this.styleEl = null
    }
  }

  private getConfig(): ZoomTransitionConfig {
    return {
      type: 'zoom',
      direction: 'in',
      scale: 1.5,
      centerX: 0.5,
      centerY: 0.5,
      duration: 600,
      easing: 'ease-in-out',
    }
  }
}
```

**Step 5: Write `src/runtime/transitions/renderers/renderer-factory.ts`**

```typescript
import type { TransitionRenderer, BuiltinTransitionType } from '../transition-interface.js'
import { PanRenderer } from './pan-renderer.js'
import { FlipRenderer } from './flip-renderer.js'
import { ZoomRenderer } from './zoom-renderer.js'

export function createRenderer(type: BuiltinTransitionType): TransitionRenderer {
  switch (type) {
    case 'pan':
      return new PanRenderer()
    case 'flip':
      return new FlipRenderer()
    case 'zoom':
      return new ZoomRenderer()
    default:
      throw new Error(`Unknown transition renderer type: ${type}`)
  }
}
```

**Step 6: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -30
```

Expected: No errors

**Step 7: Commit**

```bash
git add src/runtime/transitions/renderers/
git commit -m "feat: add transition renderer implementations (pan, flip, zoom)"
```

---

## Task 3: 实现 Transition 接口和三个转场逻辑

**Files:**
- Create: `src/runtime/transitions/transitions/pan-transition.ts`
- Create: `src/runtime/transitions/transitions/flip-transition.ts`
- Create: `src/runtime/transitions/transitions/zoom-transition.ts`
- Create: `src/runtime/transitions/transitions/transition-factory.ts`

**Step 1: Write `src/runtime/transitions/transitions/pan-transition.ts`**

```typescript
import type { Transition, TransitionContext, PanTransitionConfig, EasingType } from '../transition-interface.js'
import { createRenderer } from '../renderers/renderer-factory.js'

// Easing function generator
function getEasing(easing: EasingType): (t: number) => number {
  switch (easing) {
    case 'ease-in': return t => t * t
    case 'ease-out': return t => t * (2 - t)
    case 'linear': return t => t
    case 'ease-in-out':
    default: return t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }
}

export class PanTransition implements Transition {
  readonly type = 'pan' as const

  private aborted = false
  private animationId: number | null = null

  async play(context: TransitionContext): Promise<void> {
    const config = context.config as PanTransitionConfig
    const duration = config.duration ?? 600
    const easingFn = getEasing(config.easing ?? 'ease-in-out')

    const renderer = createRenderer('pan')
    renderer.renderSetup(context)

    return new Promise((resolve) => {
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        if (this.aborted) {
          renderer.renderCleanup()
          resolve()
          return
        }

        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const easedProgress = easingFn(progress)

        renderer.applyAnimation(easedProgress)

        if (progress < 1) {
          this.animationId = requestAnimationFrame(animate)
        } else {
          renderer.renderCleanup()
          resolve()
        }
      }

      this.animationId = requestAnimationFrame(animate)
    })
  }

  abort(): void {
    this.aborted = true
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
}
```

**Step 2: Write `src/runtime/transitions/transitions/flip-transition.ts`**

```typescript
import type { Transition, TransitionContext, FlipTransitionConfig, EasingType } from '../transition-interface.js'
import { createRenderer } from '../renderers/renderer-factory.js'

function getEasing(easing: EasingType): (t: number) => number {
  switch (easing) {
    case 'ease-in': return t => t * t
    case 'ease-out': return t => t * (2 - t)
    case 'linear': return t => t
    case 'ease-in-out':
    default: return t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }
}

export class FlipTransition implements Transition {
  readonly type = 'flip' as const

  private aborted = false
  private animationId: number | null = null

  async play(context: TransitionContext): Promise<void> {
    const config = context.config as FlipTransitionConfig
    const duration = config.duration ?? 600
    const easingFn = getEasing(config.easing ?? 'ease-in-out')

    const renderer = createRenderer('flip')
    renderer.renderSetup(context)

    return new Promise((resolve) => {
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        if (this.aborted) {
          renderer.renderCleanup()
          resolve()
          return
        }

        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const easedProgress = easingFn(progress)

        renderer.applyAnimation(easedProgress)

        if (progress < 1) {
          this.animationId = requestAnimationFrame(animate)
        } else {
          renderer.renderCleanup()
          resolve()
        }
      }

      this.animationId = requestAnimationFrame(animate)
    })
  }

  abort(): void {
    this.aborted = true
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
}
```

**Step 3: Write `src/runtime/transitions/transitions/zoom-transition.ts`**

```typescript
import type { Transition, TransitionContext, ZoomTransitionConfig, EasingType } from '../transition-interface.js'
import { createRenderer } from '../renderers/renderer-factory.js'

function getEasing(easing: EasingType): (t: number) => number {
  switch (easing) {
    case 'ease-in': return t => t * t
    case 'ease-out': return t => t * (2 - t)
    case 'linear': return t => t
    case 'ease-in-out':
    default: return t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }
}

export class ZoomTransition implements Transition {
  readonly type = 'zoom' as const

  private aborted = false
  private animationId: number | null = null

  async play(context: TransitionContext): Promise<void> {
    const config = context.config as ZoomTransitionConfig
    const duration = config.duration ?? 600
    const easingFn = getEasing(config.easing ?? 'ease-in-out')

    const renderer = createRenderer('zoom')
    renderer.renderSetup(context)

    return new Promise((resolve) => {
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        if (this.aborted) {
          renderer.renderCleanup()
          resolve()
          return
        }

        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const easedProgress = easingFn(progress)

        renderer.applyAnimation(easedProgress)

        if (progress < 1) {
          this.animationId = requestAnimationFrame(animate)
        } else {
          renderer.renderCleanup()
          resolve()
        }
      }

      this.animationId = requestAnimationFrame(animate)
    })
  }

  abort(): void {
    this.aborted = true
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
}
```

**Step 4: Write `src/runtime/transitions/transitions/transition-factory.ts`**

```typescript
import type { Transition, BuiltinTransitionType, BuiltinTransitionConfig } from '../transition-interface.js'
import { PanTransition } from './pan-transition.js'
import { FlipTransition } from './flip-transition.js'
import { ZoomTransition } from './zoom-transition.js'

export function createTransition(type: BuiltinTransitionType, config: BuiltinTransitionConfig): Transition {
  switch (type) {
    case 'pan':
      return new PanTransition()
    case 'flip':
      return new FlipTransition()
    case 'zoom':
      return new ZoomTransition()
    default:
      throw new Error(`Unknown transition type: ${type}`)
  }
}
```

**Step 5: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -30
```

Expected: No errors

**Step 6: Commit**

```bash
git add src/runtime/transitions/transitions/
git commit -m "feat: add transition logic implementations (pan, flip, zoom)"
```

---

## Task 4: 更新 index.ts 导出工厂函数

**Files:**
- Modify: `src/runtime/transitions/index.ts`

**Step 1: Update index.ts to re-export factories**

```typescript
// Re-export all public types
export * from './transition-interface.js'

// Re-export factories
export { createTransition } from './transitions/transition-factory.js'
export { createRenderer } from './renderers/renderer-factory.js'
```

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/runtime/transitions/index.ts
git commit -m "feat: export transition factories from index"
```

---

## Task 5: 扩展 PublishEdge 类型并更新 shared/types.ts

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Find and update PublishEdge interface**

Locate the `PublishEdge` interface in `src/shared/types.ts` and add:

```typescript
// Add near the top of the file, after type exports
export type BuiltinTransitionType = 'pan' | 'flip' | 'zoom'
export type EasingType = 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'

export interface PanTransitionConfig {
  type: 'pan'
  direction: 'left' | 'right' | 'up' | 'down'
  duration: number
  easing: EasingType
}

export interface FlipTransitionConfig {
  type: 'flip'
  direction: 'horizontal' | 'vertical'
  flipStyle: 'fade' | 'cut' | 'curl'
  duration: number
  easing: EasingType
}

export interface ZoomTransitionConfig {
  type: 'zoom'
  direction: 'in' | 'out'
  scale: number
  centerX: number
  centerY: number
  duration: number
  easing: EasingType
}

export type BuiltinTransitionConfig = PanTransitionConfig | FlipTransitionConfig | ZoomTransitionConfig
```

Then update `PublishEdge`:

```typescript
export interface PublishEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationLabel?: string
  transitionType?: 'video' | 'builtin' | 'none'
  builtinTransition?: BuiltinTransitionConfig
  videoUrl?: string
}
```

**Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -30
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: extend PublishEdge with builtin transition support"
```

---

## Task 6: 集成到 PreviewModal（管理员预览）

**Files:**
- Modify: `src/admin/src/components/PreviewModal.tsx`

**Step 1: Find the existing transition handling code**

Locate the `handleHotspotClick` function and the video transition code.

**Step 2: Import the transition system**

Add to the imports at the top:

```typescript
import { createTransition, createRenderer, type BuiltinTransitionConfig, type Transition } from '../../../runtime/transitions/index.js'
```

**Step 3: Add builtin transition state**

Find where `transitioning` and `pendingTransition` are defined and add:

```typescript
const [builtinTransition, setBuiltinTransition] = useState<{
  targetNodeId: string
  transition: Transition
} | null>(null)
```

**Step 4: Update handleHotspotClick**

Find the click handler that sets `pendingTransition` and modify:

```typescript
// Existing video transition logic stays as-is for 'video' type

// Add new case for 'builtin'
if (edge?.transitionType === 'builtin' && edge.builtinTransition) {
  const hotspot = manifest.nodeMap[hotspot.targetNodeId]?.hotspots?.find(
    h => h.targetNodeId === hotspot.targetNodeId
  )
  if (hotspot) {
    setTransitioning(true)
    const transition = createTransition(edge.builtinTransition.type, edge.builtinTransition)
    setBuiltinTransition({
      targetNodeId: hotspot.targetNodeId,
      transition,
    })
  }
  return
}

if (edge?.transitionType === 'none') {
  switchNode(hotspot.targetNodeId)
  return
}
```

**Step 5: Add effect to run builtin transition**

Find the `useEffect` for video playback and add a similar one for builtin transitions:

```typescript
useEffect(() => {
  if (!builtinTransition || !manifestRef.current) return

  const edgeId = Object.keys(manifestRef.current.edgeMap).find(
    key => manifestRef.current!.edgeMap[key].toNodeId === builtinTransition.targetNodeId
  )

  if (!edgeId) {
    setTransitioning(false)
    setBuiltinTransition(null)
    return
  }

  const fromNodeId = manifestRef.current.edgeMap[edgeId].fromNodeId
  const hotspot = manifestRef.current.nodeMap[fromNodeId]?.hotspots?.find(
    h => h.targetNodeId === builtinTransition.targetNodeId
  )

  if (!hotspot) {
    setTransitioning(false)
    setBuiltinTransition(null)
    return
  }

  const fromNodeEl = nodeImageRef.current
  const toNodeEl = nodeImageRefs.current[builtinTransition.targetNodeId]

  if (!fromNodeEl || !toNodeEl) {
    setTransitioning(false)
    setBuiltinTransition(null)
    return
  }

  const context = {
    container: videoRef.current!.parentElement!,
    fromNodeEl,
    toNodeEl,
    hotspot: { x: hotspot.normalizedX, y: hotspot.normalizedY },
    config: manifestRef.current.edgeMap[edgeId].builtinTransition!,
  }

  builtinTransition.transition.play(context).then(() => {
    switchNode(builtinTransition.targetNodeId)
    setTransitioning(false)
    setBuiltinTransition(null)
  })
}, [builtinTransition])
```

**Step 6: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -30
```

Expected: No errors

**Step 7: Commit**

```bash
git add src/admin/src/components/PreviewModal.tsx
git commit -m "feat: integrate builtin transitions into PreviewModal"
```

---

## Task 7: 集成到 runtime-bundle.ts（独立运行时）

**Files:**
- Modify: `src/server/services/runtime-bundle.ts`

**Step 1: Read the current file to understand the structure**

Focus on:
- How `playTransition()` function works
- How `handleHotspotClick` works
- Where state variables are defined

**Step 2: Add transition system import**

At the top where other imports are:

```typescript
import { createTransition, createRenderer } from '../transitions/index.js'
```

**Step 3: Update the state and transition handling**

Add builtin transition state alongside existing `transitioning` and `pendingTransition`:

```javascript
// Add to state initialization
state.pendingBuiltinTransition = null
state.currentBuiltinTransition = null

// Modify handleHotspotClick to handle 'builtin' transitionType
// When edge.transitionType === 'builtin':
//   1. Create transition
//   2. Set state.currentBuiltinTransition = transition
//   3. Call renderBuiltinTransition()
//   4. return (don't call playTransition yet)

// Modify playTransition to not run if we have a builtin transition pending
// If state.currentBuiltinTransition exists, skip the video-based transition

// Add new function renderBuiltinTransition():
function renderBuiltinTransition() {
  const transition = state.currentBuiltinTransition
  if (!transition || !state.pendingBuiltinTransition) return

  const container = refs.video.parentElement
  const fromEl = document.querySelector('.node-image') as HTMLElement
  const toEl = refs.images[state.pendingBuiltinTransition.targetNodeId]
  if (!fromEl || !toEl || !container) return

  const hotspot = state.pendingBuiltinTransition.hotspot
  const config = state.pendingBuiltinTransition.config

  const context = { container, fromNodeEl: fromEl, toNodeEl: toEl, hotspot, config }

  // Setup renderer and play
  const renderer = createRenderer(config.type)
  renderer.renderSetup(context)

  transition.play(context).then(() => {
    switchNode(state.pendingBuiltinTransition.targetNodeId)
    renderer.renderCleanup()
    state.transitioning = false
    state.currentBuiltinTransition = null
    state.pendingBuiltinTransition = null
    render()
  })
}
```

**Step 4: Verify TypeScript compilation**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -30
```

Expected: No errors

**Step 5: Commit**

```bash
git add src/server/services/runtime-bundle.ts
git commit -m "feat: integrate builtin transitions into runtime bundle"
```

---

## Task 8: 最终验证

**Step 1: Full TypeScript compilation check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1
```

Expected: No errors

**Step 2: Verify all files exist**

```bash
ls -la src/runtime/transitions/
ls -la src/runtime/transitions/transitions/
ls -la src/runtime/transitions/renderers/
```

Expected: All files created in Tasks 1-4

**Step 3: Commit any remaining changes**

```bash
git status
```

**Step 4: Final verification commit**

```bash
git add -A
git commit -m "feat: complete builtin transitions system integration"
```

---

## 完整文件列表

```
src/runtime/transitions/
├── index.ts
├── transition-interface.ts
├── transitions/
│   ├── pan-transition.ts
│   ├── flip-transition.ts
│   ├── zoom-transition.ts
│   └── transition-factory.ts
└── renderers/
    ├── pan-renderer.ts
    ├── flip-renderer.ts
    ├── zoom-renderer.ts
    └── renderer-factory.ts
```

修改的文件：
```
src/shared/types.ts
src/admin/src/components/PreviewModal.tsx
src/server/services/runtime-bundle.ts
```