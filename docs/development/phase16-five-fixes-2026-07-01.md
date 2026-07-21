# Phase 16 — 五个连续问题修复（2026-07-01）

> 状态：实施完成
> 日期：2026-07-01
> 范围：Atlas 运行时 / 画布 / Inspector / Camera / 域模型 / 归一化器

## 1. 问题与根因

Phase 15 之后用户反馈五个新问题：

1. **全景图在编辑区域和预览区域都无法拖动和缩放** —— 编辑区域 `AtlasCanvas` 自带一套自实现的 `panState` / `setViewport`，没有真正把 viewport 应用到 DOM；预览区域 `AtlasRuntime` 内部用 `Camera` 计算 viewport 但从未把 transform 写回 DOM。
2. **Hotspot / Callout 在编辑区域和预览区域定位不一致，且样式与重构前不一致** —— 编辑区域 hotspot/callout 用了和运行时不同的 transform 公式（缩放下不跟随）和不同的视觉 token（olive 虚线 vs 琥珀实线）。
3. **Atlas 编辑器不应有焦点矩形** —— 这是 Catalog 的功能，Atlas 编辑器有焦点矩形 FieldGroup 让 inspector 显得"既管这个又管那个"，但运行时根本不会渲染它。
4. **点击三级项目时底部没有"详情卡片"了** —— Phase 11 Chakra 迁移时 `ItemDetailCard` 被删了，没有替代实现。运行时需要这个面板：选 industry item 时弹底部卡片展示 title / description / tags。
5. **Hotspot 和 Callout 的 zoom 阈值分开设置的功能丢了** —— 旧版可以分别配置"hotspot 1× 就显示 / callout 要 2× 才显示"，新版二者共用一个 `theme.minZoom`（实际上根本没有这个字段）。

### 逐项根因

| # | 根因 |
|---|------|
| 1 | `Camera` 类记录 viewport 但没有把 transform 写入 DOM；`AtlasCanvas` 完全用自己的一套 `useState<{ centerX, centerY, zoom }>`，没复用 Camera 也没同步到 viewport layer 的 CSS transform |
| 2 | 画布 marker / callout 的 `transform` 是 `translate(-50%, -50%) translate(${dndKit}px, ${dndKit}px)` —— dnd-kit delta 是屏幕像素，但图层已经被 zoom 缩放，所以缩放下拖动速度不对位；样式已经 Phase 15 对齐过 |
| 3 | `AtlasInspector` 的 链接 / 标注 / 焦点矩形 三个 FieldGroup 是历史遗留，atlas 运行时只关心 marker / callout，焦点矩形是 catalog 的事 |
| 4 | `AtlasRuntime` 重写时只做了 image + markers + callouts，panel 只是空占位 div，没有 show / hide 逻辑也没有内容 |
| 5 | `AtlasTheme` schema 只有 `hotspotVariant` / `calloutVariant`，没有任何 `*MinZoom` 字段；`AtlasCategoryEntry` / `AtlasItemEntry` / `ItemCallout` 也都没有 zoom 阈值字段 |

## 2. 修复

### 2.1 Camera 真正把 transform 写回 DOM（修复问题 1）

文件：`src/products/atlas/runtime/camera.ts`

新增 `getTransform(): CameraTransform`，返回 `{ translatePercent: 'translate(...)', scale: number }`，把 viewport 翻译成 viewport-layer 的 CSS transform 字符串：

```ts
const tx = (0.5 - this.viewport.centerX) * 100
const ty = (0.5 - this.viewport.centerY) * 100
return {
  translatePercent: `translate(${tx}%, ${ty}%)`,
  scale: this.viewport.zoom,
}
```

新增 `getViewport(): Viewport` 供编辑器读取当前 viewport（用于拖拽数学）。

`onPointerDown` 新增守卫 `if (ev.target !== this.el) return` —— 阻止 hotspot / callout pin / focus handle 上的 pointerdown 触发 pan（避免和 dnd-kit 冲突）。

### 2.2 AtlasRuntime 应用 Camera transform + 底部详情面板（修复问题 1 + 4）

文件：`src/products/atlas/runtime/atlas-runtime.ts`

DOM 结构改为：

```
mountedEl
├── viewportLayer (transform 由 Camera.getTransform() 写入)
│   ├── img (atlas-panorama)
│   ├── hotspot dots
│   └── callout lines + labels
└── bottomPanel (atlas-item-panel, 在 viewportLayer 之外，固定不缩放)
```

关键改动：
- `mount()` 内创建 `viewportLayer` 包裹 image + markers + callouts
- `applyTransform()` 每次 viewport 变化把 `layer.style.transform = ${t.translatePercent} scale(${t.scale})`，并把 `zoom` 透传给 marker / callout renderer（用于 zoom 阈值可见性判断）
- `renderBottomPanel()` 创建空 panel 容器在 mountedEl（**不**在 viewportLayer 里 —— 否则高 zoom 时面板也跟着放大）
- `showItemPanel(itemId)` / `hideItemPanel()` 渲染 / 隐藏 item title + description + tags + close 按钮
- `handleImageClick()` 通过 `viewportLayer.getBoundingClientRect()` 反算 normalized 坐标，能同时命中 hotspot（高亮 + focusCategory）和 item marker（弹面板 + emit `itemclick`）

事件契约：`AnalyticsEvent` 增加 `'itemclick'` 类型，payload `{ itemId, categoryId }`。

### 2.3 AtlasCanvas 复用 Camera 并对齐缩放数学（修复问题 1 + 2）

文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

- 删 `panState` / 自实现的 pan/zoom 逻辑，改用 `new Camera(container, ...)`
- 容器固定 `viewport.width × viewport.height`（与运行时一致），margin: 0 auto 居中
- 新 `layerRef` 包裹 image + markers + callouts，`transformOrigin: '0 0'`，transform 写入同 `Camera.getTransform()`
- 缩放下的拖拽数学修正（dnd-kit delta 是屏幕像素，图层已经 zoom 缩放 N 倍）：
  ```ts
  const zoom = camera.getViewport().zoom ?? 1
  const dx = e.delta.x / (rect.width * zoom)
  const dy = e.delta.y / (rect.height * zoom)
  ```
- 缩放控件（zoom-in / out / reset）改用 `camera.animateTo({...viewport, zoom: ...}, 200)`，与运行时一致的 350ms 缓动（编辑器略快）

### 2.4 删除 Atlas 焦点矩形（修复问题 3）

文件：`src/admin/src/features/atlas-editor/components/AtlasInspector.tsx` + `src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

- Inspector 删 `<FieldGroup icon={Compass} title="焦点矩形">` 整段（x/y/width/height 四个 NumberField）
- Inspector `makeDefaultItemLayout()` 删 `focusRect: { x: 0.4, y: 0.4, width: 0.2, height: 0.2 }`
- Canvas 删 `FocusRectLayer` / `FocusHandle` / focus-corner-* / focus-center 拖拽处理器 / `onAttachCallout` 按钮
- `HandleKind` 简化为 `'hotspot' | 'callout-target' | 'item-marker'`
- `data-testid="focus-rect-*"` / `focus-handle-*-*` 由 Catalog 编辑器独立维护，不动

### 2.5 域模型：focusRect 改为 catalog-only 可选（修复问题 3 的连锁）

文件：`src/domain/project-schema.ts` + `src/domain/project-types.ts` + `src/domain/project-normalizer.ts` + `src/domain/project-validator.ts`

- `ItemSpatialLayoutSchema.focusRect` 改为 `.optional()` —— 域对象同时描述 atlas 和 catalog 两种产物，焦点矩形只对 catalog 有意义；atlas-only 的 item 不需要 focusRect
- `normalizeProject` 不再为新 item 自动填 focusRect 默认值（删 `radius` / `maskOpacity` 默认填充逻辑）
- `project-validator.checkSpatialRanges` 在 `focusRect` 存在时才校验它

更新测试 `tests/domain/project-normalizer.test.ts` 的断言：focusRect 在新生成的 atlas-only item 上是 `undefined`。

### 2.6 Hotspot / Callout / ItemMarker 的 zoom 阈值（修复问题 5）

文件：`src/products/atlas/contract/atlas-manifest.ts` + `src/products/atlas/compiler/atlas-compiler.ts` + `src/products/atlas/runtime/marker-renderer.ts` + `src/products/atlas/runtime/callout-renderer.ts` + `src/domain/project-schema.ts` + `src/domain/project-types.ts`

新增字段：
- `CategorySpatialLayout.hotspotMinZoom?: number`
- `ItemSpatialLayout.markerMinZoom?: number`
- `ItemCallout.minZoom?: number`
- `AtlasTheme.{ hotspotMinZoom, calloutMinZoom, itemMarkerMinZoom }?: number`

行为（element 优先于 theme，element 没设就用 theme 的，再没有就总是可见）：
- hotspot：`el.hotspotMinZoom ?? theme.hotspotMinZoom ?? null`
- item marker：`el.markerMinZoom ?? theme.itemMarkerMinZoom ?? null`
- callout：`callout.minZoom ?? theme.calloutMinZoom ?? null`

可见性逻辑：`visible = min === null || currentZoom >= min`，逐元素遍历设置 `style.display`。

renderer 新增 `setZoomThresholds({ hotspotMinZoom?, itemMarkerMinZoom? })` / `setZoom(zoom)` 接口，`AtlasRuntime` 在 transform 应用时统一调用。

## 3. 修改的文件

```
M  src/products/atlas/runtime/camera.ts
   - getTransform() / getViewport() / onPointerDown 守卫

M  src/products/atlas/runtime/atlas-runtime.ts
   - viewportLayer 包裹 + applyTransform + showItemPanel

M  src/products/atlas/runtime/marker-renderer.ts
   - setZoomThresholds / setZoom / recomputeVisibility

M  src/products/atlas/runtime/callout-renderer.ts
   - setZoomThresholds / setZoom / recomputeVisibility

M  src/products/atlas/contract/atlas-manifest.ts
   - 新增 hotspotMinZoom / markerMinZoom / callout.minZoom / theme.*MinZoom

M  src/products/atlas/compiler/atlas-compiler.ts
   - 透传新字段到 manifest

M  src/domain/project-schema.ts
   - ItemSpatialLayoutSchema.focusRect 改为 optional；新增 *MinZoom 字段

M  src/domain/project-types.ts
   - ItemSpatialLayout.focusRect 改为 optional；新增 *MinZoom 字段

M  src/domain/project-normalizer.ts
   - 移除 focusRect 默认填充（catalog-only 字段）

M  src/domain/project-validator.ts
   - checkSpatialRanges 在 focusRect 存在时校验

M  src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx
   - 改用 Camera 类 + viewport layer + 缩放拖拽数学修正

M  src/admin/src/features/atlas-editor/components/AtlasInspector.tsx
   - 删 焦点矩形 FieldGroup；makeDefaultItemLayout 不再含 focusRect

M  tests/products/atlas/atlas-runtime.test.ts
   - 适配新 DOM 结构（viewportLayer / panel 分层）；destroy 后不再断言 0 子节点

M  tests/domain/project-normalizer.test.ts
   - focusRect 在 atlas-only item 上是 undefined
```

## 4. 验证

```bash
npx tsc --noEmit                              # exit 0
cd src/admin && npx tsc --noEmit             # exit 0
cd src/admin && npx vitest run               # 25 tests, all pass
npx tsx --test tests/**/*.test.ts            # 73 tests, all pass
```

### 肉眼验收

1. 实时预览：进入 atlas 编辑器，能拖动全景图、按滚轮缩放
2. 编辑画布：拖动 hotspot / item marker / callout pin，无论 zoom 多少倍都不会"飘"
3. 缩放控件：点击 + / − / 重置，与运行时有相同的缓动曲线（编辑器 200ms，运行 350ms）
4. 删除焦点矩形：Inspector 不再出现 焦点矩形 FieldGroup；运行时也不会有焦点矩形
5. 底部详情面板：点击任一 item marker（不是 hotspot），底部出现 `<atlas-item-panel>` 显示 title / description / tags，关闭按钮可关闭
6. zoom 阈值：在 catalog 编辑器把 callout 的 minZoom 设成 2，进入预览，缩放到 1.5× 时 callout 不可见，缩放到 2× 时出现
7. hotspot 阈值同理

### 保留契约

| 契约 | 状态 |
|---|------|
| `data-testid="atlas-panorama"` / `"atlas-item-panel"` / `"atlas-viewport-layer"` | 全部保留（运行时 / 编辑器） |
| `data-testid="hotspot-${id}"` / `"item-marker-${id}"` / `"callout-target-${id}"` | 全部保留 |
| dnd-kit 拖拽链路 | 行为不变；缩放下数学修正 |
| `AtlasRuntime` 公共 API（mount/destroy/focusCategory/openRoute/on/off） | 未动；新增 `showItemPanel` 是内部方法 |
| `compileAtlas` 公共签名 | 未动 |
| `ItemSpatialLayout.focusRect` 在持久化 JSON 中的存在性 | 向后兼容 —— 老项目若有 focusRect 继续生效，没有也不报错 |

## 5. 后续可选优化

- 把 hotspot / callout / item marker 的视觉 token 抽到 `src/products/atlas/runtime/styles.ts`，让 atlas 编辑器和运行时共享一份常量（避免再次漂移）
- 详情面板可加滚动 / 标题固定 / 多 item 切换 tab
- zoom 阈值在 inspector 给一个滑条 UI（目前是 number input）
- AtlasCanvas 的 layer transform 改为 dnd-kit `CSS.Translate.toString()` 组合写法（可读性）