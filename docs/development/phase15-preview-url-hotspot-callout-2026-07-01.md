# Phase 15 — 预览底图 / Hotspot / Callout 样式对齐运行时（2026-07-01）

> 状态：实施完成
> 日期：2026-07-01
> 范围：admin 端 Atlas 实时预览 / 画布 hotspot / 画布 callout

## 1. 问题与根因

Phase 14 之后用户反馈两个剩余问题：

1. **实时预览底图还是挂的**。DevTools Network 显示图片 URL 是 `./images/root/image.jpg`，浏览器报 404。
2. **Hotspot / Callout 视觉和旧版（运行时）完全不一样**。新版画布上 hotspot 是 20×20 红（active 时变 brand 红色），callout 线是 olive 虚线，目标 pin 是 14×14 olive；运行时是 24×24 琥珀圆、实线琥珀 1.5px、无明显 pin。

逐一排查根因：

| # | 根因 |
|---| --- |
| 1 | `AtlasPreview` 把 `compileAtlas(project, resolveSourcePath)` 留空，compiler 退回到 `assetClosure(projectId, sourcePath)`，把 sourcePath 包成 `./${sourcePath}` 拼到 `manifest.panorama.url`。编辑器上下文里没有 `./images/root/...` 这种相对路径解析，所以 URL 落到运行时直接 404 |
| 2 | `HotspotDot` 之前 20×20、active 用 `var(--ig-colors-brand)`（红/红棕）—— `marker-renderer.ts` 是 24×24 + 琥珀 `rgba(245, 158, 11, 0.9)` + 白边；active 在运行时没有意义所以运行时不做 |
| 3 | `CalloutLayer` line 用 `var(--ig-colors-accent)`（olive 暗绿）+ `strokeDasharray="3,3"` + `strokeWidth="1"`；运行时 `callout-renderer.ts` 是琥珀 `rgba(245,158,11,0.6)` + 1.5 + 无 dasharray |
| 4 | `CalloutLayer` target pin 14×14 + olive + 1.5px olive border；运行时没有 pin（只有 line + label），编辑器需要保留 pin 但要和 hotspot 风格统一 |

## 2. 修复

### 2.1 预览底图 URL 解析（修复问题 1）

文件：`src/admin/src/features/atlas-editor/components/AtlasPreview.tsx`

- 引入 `assetBlobUrl` 工具（`../../projects/api.ts` 导出：`/api/projects/:id/assets/blob/:assetId`）
- 在 `useEffect` 内构造 `bySourcePath: Map<string, string>` —— 遍历 `project.assets.byId`，把每个 `asset.sourcePath → asset.id` 索引
- `resolveSourcePath` 闭包：拿到 `sourcePath` 后查 `bySourcePath`，命中就返回 `assetBlobUrl(projectId, aid)`，未命中（异常）fallback `./${sourcePath}`（保持原行为不破坏 release 构建）

不修改 `compileAtlas` 本体 —— 它接受 `assetClosure`，由调用方决定 sourcePath 到 URL 的映射。editor 把映射重定向到 dev server 的 blob 端点，runtime 的 release 构建继续用 `./assets/...` 相对路径。

### 2.2 Hotspot 视觉对齐运行时（修复问题 2）

文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`，`HotspotDot` 子组件

- 尺寸 20 → **24**（与 `marker-renderer.ts:62-63` 一致）
- 背景 `var(--ig-colors-brand)`（active）/ `rgba(245, 158, 11, 0.92)`（idle）→ 统一 `rgba(245, 158, 11, 0.9)`，永远与运行时一致
- 边框：保留 `2px solid #fff`（运行时也是白边）
- 选中态：**保持琥珀底色**，叠加 4px brand-tinted ring（`rgba(181, 67, 24, 0.25)`）+ scale 1.18 —— 视觉上"被选中"但底色不漂移，与运行时"未选中"保持一致
- hover 态：3px 琥珀色 ring（`rgba(245, 158, 11, 0.25)`）—— 提示"可拖动"
- 保留 dnd-kit `useDraggable` + `data-testid` / `data-active` / `data-dragging` 契约

### 2.3 Item Marker 视觉对齐运行时（附赠对齐）

文件：同 `AtlasCanvas.tsx`，`ItemMarkerDot` 子组件

- 尺寸：10/14（idle/selected）→ 统一 **12**（与 `marker-renderer.ts:85-86` 一致）
- 默认态：`#3b82f6` 蓝 + 0.7 opacity + 无 border（运行时 `marker-renderer.ts:88-89`）
- 选中态：brand 红色 + 1.0 opacity + `2px solid #fff` 边 + 3px brand-tinted ring —— 编辑器独有的"已选"提示
- 保留 dnd-kit / `data-testid` 契约

### 2.4 Callout Line + Pin 视觉对齐运行时（修复问题 3 + 4）

文件：同 `AtlasCanvas.tsx`，`CalloutLayer` 子组件

- Line stroke：`var(--ig-colors-accent)`（olive）+ `strokeDasharray="3,3"` + `strokeWidth="1"` → `rgba(245, 158, 11, 0.6)` + **无 dasharray** + `strokeWidth="1.5"`（与 `callout-renderer.ts:70-71` 逐字段对齐）
- Target pin：14×14 olive + 1.5px olive border → **12×12** 琥珀（`rgba(245, 158, 11, 0.9)`）+ `2px solid #fff` —— 尺寸与 hotspot 家族统一（运行时没有 pin，但编辑器要保留可拖动手柄）
- active 态：3px 琥珀色 ring + scale 1.2（保留拖拽反馈）

### 2.5 CSS `.callout-pin` 配色更新

文件：`src/admin/src/index.css`

`.callout-pin` 之前用 `--ig-colors-accent`（olive）做 background / border / box-shadow，与新的 inline style（琥珀 0.9 + 白边）冲突。改为：

- 删 background / border / 默认 box-shadow —— 让 inline 接管
- hover：scale 1.15 + 3px 琥珀色 ring
- `[data-active='true']`：scale 1.2

## 3. 修改的文件

```
M  src/admin/src/features/atlas-editor/components/AtlasPreview.tsx
   - import assetBlobUrl
   - bySourcePath Map + resolveSourcePath closure

M  src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx
   - HotspotDot: 24px, 琥珀, 选中 = 琥珀+ring
   - ItemMarkerDot: 12px, 蓝 0.7 / brand 1.0 选中
   - CalloutLayer: 琥珀实线 1.5, 12px 琥珀 pin

M  src/admin/src/index.css
   - .callout-pin 配色改琥珀（去 olive / 让 inline 接管 background）
```

## 4. 验证

```bash
cd src/admin && npx tsc --noEmit          # exit 0
cd src/admin && npm run build             # ✓ built in ~10s
npx tsx --test tests/products/atlas/atlas-runtime.test.ts   # 6 tests, all pass
```

### 肉眼验收

1. 实时预览：底图正常加载（DevTools 看 `panorama.url` 应是 `/api/projects/:id/assets/blob/:aid`，不是 `./images/...`）
2. Hotspot 视觉：所有 hotspot 是 24px 琥珀圆 + 白边；选中时底色不变，外圈多一个 brand 红色光圈 + 略放大
3. Item marker 视觉：未选中 12px 蓝色半透明（与运行时一致）；选中 brand 红色 + 白边
4. Callout 线：实线琥珀，1.5px 粗细，不再是 olive 虚线
5. Callout 目标 pin：12px 琥珀圆 + 白边 + 1px 阴影，与 hotspot 视觉风格一致

### 保留契约

| 契约 | 状态 |
| --- | --- |
| `data-testid` | `hotspot-${id}` / `item-marker-${id}` / `callout-target-${id}` / `focus-rect-${id}` / `focus-handle-${kind}-${id}` / `canvas-pan-layer` 全部保留 |
| `data-active` / `data-dragging` / `data-pos` / `data-tool` / `data-zoom` | 全部保留 |
| 拖拽手柄（hotspot / focus / callout） | 行为不变，dnd-kit 链路未动 |
| `compileAtlas` 公共签名 | 未动（仍接受 `assetClosure` 闭包） |
| 实时预览 `assetBlobUrl` 路径 | 匹配 `src/server/routes/assets.ts` 的 blob 路由 |

## 5. 后续可选优化

- 把 `useDraggable` 的 `transform` 应用到 hotspot 改成 dnd-kit 的 `CSS.Translate.toString()` 组合，让所有 transform 写在一行（可读性）
- AtlasPreview 跑 1.0s debounce，编辑器改一下属性不立刻重编译（编译是同步的，目前每次 project 变化就重新 mount；不卡顿但浪费）
- 把 hotspot / callout 样式统一抽到 `src/products/atlas/runtime/styles.ts`，让 editor 和 runtime 共享一份常量（避免再次出现"editor 漂移"）
