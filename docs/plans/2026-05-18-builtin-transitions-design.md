# 边的内置转场系统设计

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为边的转场添加内置转场选项（平移、翻页、缩放），通过抽象层+独立实现类实现代码解耦。

**Architecture:** 采用 Transition（转场逻辑）+ TransitionRenderer（DOM渲染）的双层抽象，Transition 负责动画进度计算，TransitionRenderer 负责 DOM 操作，两者通过 TransitionContext 共享上下文。

**Tech Stack:** TypeScript + CSS transform + CSS 3D (perspective/rotate)

---

## 1. 架构概览

```
src/runtime/transitions/
├── index.ts                    # 导出统一入口
├── transition-interface.ts    # 转场接口 + 类型定义
├── transition-factory.ts      # 工厂函数
├── transitions/
│   ├── pan-transition.ts       # 平移转场逻辑
│   ├── flip-transition.ts      # 翻页转场逻辑
│   └── zoom-transition.ts      # 缩放转场逻辑
└── renderers/
    ├── transition-renderer.ts   # 渲染器接口
    ├── pan-renderer.ts         # 平移 DOM 渲染
    ├── flip-renderer.ts        # 翻页 DOM 渲染
    └── zoom-renderer.ts        # 缩放 DOM 渲染
```

---

## 2. 数据模型扩展

### 2.1 转场配置类型

```typescript
type BuiltinTransitionType = 'pan' | 'flip' | 'zoom'

interface PanTransitionConfig {
  type: 'pan'
  direction: 'left' | 'right' | 'up' | 'down'
  duration: number        // 默认 600ms
  easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'  // 默认 'ease-in-out'
}

interface FlipTransitionConfig {
  type: 'flip'
  direction: 'horizontal' | 'vertical'  // 默认 'horizontal'
  flipStyle: 'fade' | 'cut' | 'curl'   // 默认 'fade'
  duration: number
  easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'
}

interface ZoomTransitionConfig {
  type: 'zoom'
  direction: 'in' | 'out'
  scale: number           // 默认 1.5
  centerX: number        // 默认读取热点 x (0-1)
  centerY: number        // 默认读取热点 y (0-1)
  duration: number
  easing: 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'
}

type BuiltinTransitionConfig = PanTransitionConfig | FlipTransitionConfig | ZoomTransitionConfig
```

### 2.2 PublishEdge 扩展

```typescript
interface PublishEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationLabel?: string
  transitionType?: 'video' | 'builtin' | 'none'
  builtinTransition?: BuiltinTransitionConfig
  videoUrl?: string
}
```

---

## 3. 核心接口定义

### 3.1 TransitionContext

```typescript
interface TransitionContext {
  container: HTMLElement           // 舞台容器
  fromNodeEl: HTMLElement          // 起始节点元素
  toNodeEl: HTMLElement           // 目标节点元素
  hotspot: { x: number, y: number }  // 热点位置 (normalized 0-1)
  config: BuiltinTransitionConfig // 转场配置
}
```

### 3.2 Transition 接口（纯计算，不涉及 DOM）

```typescript
interface Transition {
  readonly type: BuiltinTransitionType
  play(context: TransitionContext): Promise<void>
  abort(): void
}
```

### 3.3 TransitionRenderer 接口（纯 DOM 操作）

```typescript
interface TransitionRenderer {
  readonly transitionType: BuiltinTransitionType
  renderSetup(context: TransitionContext): void
  applyAnimation(progress: number): void  // progress: 0-1
  renderCleanup(): void
}
```

---

## 4. 各转场实现要点

### 4.1 PanTransition（平移切换）

**逻辑：**
- 根据 `direction` 计算初始偏移量（toNodeEl 移到视口外）
- fromNodeEl 向 direction 方向移出
- toNodeEl 从偏移位置归位
- 使用 `requestAnimationFrame` + CSS transform 实现动画

**渲染器职责：**
- 计算偏移量（container width/height × 1.5）
- 设置初始 transform: translate(偏移量)
- 应用目标 transform: translate(0)

### 4.2 FlipTransition（翻页切换）3D

**逻辑：**
- 使用 CSS 3D：`perspective` + `rotateY`（水平翻）或 `rotateX`（垂直翻）
- 翻页轴心在热点对侧边缘
- 前层节点 rotate 角度从 0° 到 90°（显示背面）
- 下层节点随翻页逐渐显露

**渲染器职责：**
- 构建 3D DOM 结构：perspective container > transform-style: preserve-3d > front/back layer
- 设置 perspective 距离（通常 1000px）
- 计算 rotate 角度与 transform-origin

### 4.3 ZoomTransition（缩放切换）

**逻辑：**
- 对 fromNodeEl 做 scale + translate 变换（缩放中心 = 热点位置）
- 同时 toNodeEl 从 opacity 0 淡入
- direction='in'：放大热点区域（当前节点缩小）
- direction='out'：缩小暴露下一节点（当前节点缩小，toNodeEl 淡入）

**渲染器职责：**
- 计算 scale 起点/终点
- 计算 translate（以热点为中心）
- 设置 crossfade opacity 过渡

---

## 5. 执行流程

```
用户点击热点
    ↓
读取 edge 配置 (transitionType)
    ↓
┌─ 'video'  → 播放视频（现有逻辑）
├─ 'builtin' → 创建内置转场
│   ├── createRenderer(type) → 创建 DOM 渲染器实例
│   ├── renderer.renderSetup() → 构建转场 DOM 结构
│   ├── createTransition(type, config) → 创建转场逻辑实例
│   ├── transition.play(context) → 执行动画
│   │   ├── 动画进行中 → renderer.applyAnimation(progress) 更新 DOM
│   │   └── 动画完成 → Promise resolve
│   └── renderer.renderCleanup() → 清理临时 DOM
│   ↓
└─ 'none' → 立即切换节点
    ↓
切换到目标节点，显示热点
```

---

## 6. 扩展性预留

- 新增转场类型：创建 `xxx-transition.ts` + `xxx-renderer.ts`，在工厂函数中注册
- 不修改现有接口，只扩展 `BuiltinTransitionType`
- 每个转场完全独立，可独立测试

---

## 7. 实现顺序

1. 创建目录结构和类型定义
2. 实现 TransitionRenderer 接口和三个渲染器
3. 实现 Transition 接口和三个转场逻辑
4. 实现工厂函数
5. 集成到 PreviewModal（管理员预览）
6. 集成到 runtime-bundle.ts（独立运行时）
7. 类型导出到 shared/types.ts