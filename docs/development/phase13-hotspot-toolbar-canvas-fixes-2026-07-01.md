# Phase 13 — 六处交互细节修复（2026-07-01）

> 状态：实施完成
> 日期：2026-07-01
> 范围：admin 端资源面板 / Schema 校验 / Atlas 预览占位 / Hotspot 拖拽视觉 / 工具栏边界

## 1. 问题与根因

用户反馈六个具体问题：

1. Settings → 资源里"HTML 包"上传入口不知道什么意思 — 实际 zip 包应该挂在 scene 上才能被识别
2. Settings → HTML 场景 → 编辑 view 的 id / title / activation message type 时报 `400 invalid body`
3. Atlas 编辑器右侧预览图挂了（`AtlasRuntime` mount 失败）
4. hotspots 视觉与改前不一致（颜色 / 阴影 / 选中态）
5. 拖拽 hotspot 松开鼠标时 hotspot 会抖一下
6. 工具栏"选择 / Hotspot / Callout / 平移"边界混乱：任何工具下都能拖动 hotspot，且"平移"按钮始终 disabled

逐一排查根因：

| # | 根因 |
|---| --- |
| 1 | `AssetsPanel.KINDS` 包含 `html-bundle`，operator 误以为通用入口；实际 zip 包必须挂在某个 scene 上，由 `HtmlScenePanel` 内的上传按钮处理，且 asset id 约定为 `scene-${sceneId}` |
| 2 | `HtmlSceneViewSchema` 的 `id` / `title` / `activationMessage.type` 是 `z.string().min(1)`，但用户输入过程中字段为空（中间状态），Zod 拒绝 |
| 3 | `project.panorama.assetId === ''` 时 `compileAtlas(project, ...)` 仍然尝试解析，抛错；以及 asset id 在 `assets.byId` 查不到时同样挂 |
| 4 | 原 `index.css` 的 `.hotspot-pin:hover { transform: scale(1.18) }` / `[data-active='true'] { transform: scale(1.18) }` 被 `AtlasCanvas` 内联 `transform: translate(...)` 覆盖（specificity），scale 永远不生效 |
| 5 | dnd-kit 在 `isDragging=true` 时把 transform 应用到 `style.transform`，但 CSS 上仍有 `transition: box-shadow 150ms`（虽然只 transition box-shadow，但拖动过程 React 每次 render 重新写 transform，浏览器在 transition window 内插值）— 松手瞬间 transform 跳回 0 时插值错位 |
| 6 | `HotspotDot` 始终 `useDraggable({...})` 没设 disabled；toolbar 的"平移"按钮仅是占位 UI，panning 已经实现在 Select 工具的拖拽空白画布逻辑里 |

## 2. 修复

### 2.1 AssetsPanel 移除 html-bundle 上传（修复问题 1）

文件：`src/admin/src/features/projects/settings/AssetsPanel.tsx`

- `KINDS` 数组从 `['image', 'video', 'html-bundle']` 减为 `['image', 'video']`
- 注释说明：html-bundle 必须挂在某个 scene 上，由 `HtmlScenePanel` 内的上传入口处理
- id 输入框 `placeholder` 从 `'scene-xxx'` 简化为 `'asset-xxx'`
- `useUploadAsset` 仍保留 `kind: 'html-bundle'` 分支（被 `HtmlScenePanel` 调用），不删

### 2.2 Schema 放宽 HtmlSceneView 字段（修复问题 2）

文件：`src/domain/project-schema.ts`

```ts
export const HtmlSceneViewSchema = z.object({
  // id/title/activationMessage.type may be '' while the user is typing
  // (transient empty state mid-edit). Release-tier validation
  // (checkUniqueIds / checkSceneReferences) catches dangling refs at
  // publish time.
  id: z.string(),
  title: z.string(),
  activationMessage: z.object({
    type: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
  categoryIds: z.array(z.string().min(1)),
  itemFocusMap: z.record(z.string(), SceneFocusCommandSchema).optional(),
})
```

- `id` / `title` / `activationMessage.type` 三个字段从 `z.string().min(1)` 改为 `z.string()`
- 发布时由 `static-validator` 的 `checkUniqueIds` / `checkSceneReferences` 兜底

### 2.3 AtlasPreview 占位（修复问题 3）

文件：`src/admin/src/features/atlas-editor/components/AtlasPreview.tsx`

- 派生：
  ```ts
  const panoramaMissing = !project.panorama.assetId
  const panoramaAssetMissing =
    !panoramaMissing && !project.assets.byId[project.panorama.assetId]
  const blocked = panoramaMissing || panoramaAssetMissing
  ```
- `useEffect` 在 `blocked === true` 时提前 `return`，跳过 `compileAtlas` / `rt.loadManifest`
- 渲染分支：
  - `blocked === true` → `<div data-testid="atlas-preview-placeholder">`（Compass icon + "尚未绑定全景底图" / "全景底图无效" + 引导文案）
  - 否则 → 正常 mount runtime

### 2.4 HotspotDot composite transform（修复问题 4）

文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`、`src/admin/src/index.css`

- `HotspotDot` 加 `useState<boolean>(hovered)`，`onMouseEnter` / `onMouseLeave` 切换
- 把 CSS 里的 `transform: scale(1.18)` 全部合并进 inline style：
  ```ts
  const scale = active || hovered || isDragging ? 1.18 : 1
  style.transform = `translate(-50%, -50%) translate(${transform?.x ?? 0}px, ${transform?.y ?? 0}px) scale(${scale})`
  ```
- `index.css` 删除两条规则：
  ```css
  .hotspot-pin:hover { transform: scale(1.18); }
  .hotspot-pin[data-active='true'] { transform: scale(1.18); }
  ```
- 保留 cursor / box-shadow transition

### 2.5 HotspotDot 拖拽期禁用 transition（修复问题 5）

文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

- `style.transition = isDragging ? 'none' : 'box-shadow 150ms'`
- 松手瞬间 `isDragging` 从 `true` → `false`，transform 跳变不插值，不再抖
- 增加 `data-dragging={isDragging ? 'true' : 'false'}` 属性（CSS / 测试 hook 可读）

### 2.6 Hotspot 拖拽受 Select 工具控制 + 删除"平移"按钮（修复问题 6）

文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`、`AtlasToolbar.tsx`

- `HotspotDot` props 加 `draggable: boolean`
- `useDraggable({ id, disabled: !draggable })`
- 调用点：
  ```tsx
  <HotspotDot draggable={tool === 'select'} ... />
  ```
- `AtlasToolbar.tsx`：
  - 删 `Hand` 图标 + `Box` import
  - 删硬编码 `<Button variant="primary" size="sm" disabled>平移</Button>`
  - 注释更新：`Note: there's no separate "Pan" tool button — panning the canvas is built into the Select tool (drag empty canvas area).`
- canvas `onMouseDown` 已经支持空白区域拖拽作为 pan（Select 工具），无需额外按钮

## 3. 修改的文件

```
M  src/admin/src/features/projects/settings/AssetsPanel.tsx   # 删除 html-bundle kind
M  src/domain/project-schema.ts                                # HtmlSceneViewSchema 放宽
M  src/admin/src/features/atlas-editor/components/AtlasPreview.tsx   # 占位
M  src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx    # composite transform / drag disable / transition:none
M  src/admin/src/features/atlas-editor/components/AtlasToolbar.tsx   # 删"平移"按钮
M  src/admin/src/index.css                                     # 删 .hotspot-pin scale 规则
```

## 4. 验证

```bash
cd src/admin && npx tsc --noEmit       # exit 0
cd src/admin && npm run build          # ✓ built in ~12s
cd src/admin && npx vitest run         # 4 files, 21 tests, all pass
```

### 肉眼验收

1. 资源面板：上传区只显示「图片 / 视频」两个 kind；HTML 场景面板内的 scene 卡片仍能上传 zip 包
2. HTML 场景面板：编辑 view 的 id 临时清空 / title 临时清空 / activation message type 临时清空都能保存，不再 400
3. Atlas 编辑器：未绑定底图 / 底图 asset 失效时，预览区显示 Compass 占位 + 引导文案；绑定有效底图后正常显示
4. Hotspot 视觉：hover 放大 1.18、active / 拖拽中也是 1.18；与改前一致
5. 拖拽：按住 hotspot 拖动 → 松手 — hotspot 不再抖
6. 工具栏边界：选中 Hotspot 工具时拖动 hotspot 无效（光标变成 pointer）；选中 Callout 工具时同样无效；只有 Select 工具下能拖；"平移"按钮不再出现

### 保留契约

| 契约 | 状态 |
| --- | --- |
| `data-testid` 增量 | `atlas-preview-placeholder` 新增；`data-dragging` 增量属性（CSS / 测试可读） |
| API 兼容性 | `PUT /panorama` / `POST /assets` 入参不变 |
| Schema 兼容性 | `HtmlSceneViewSchema` 放宽后旧数据仍合法；空串由 release validator 兜底 |
| 拖拽手势 | Select 工具空白区拖拽 = 平移（已有）；hotspot 拖拽 = 移动 hotspot（仍只有 Select） |

## 5. 后续可选优化

- `dnd-kit` 的 `restrictToParentElement` modifier 防止 hotspot 拖出画布边界
- Hotspot 拖拽时若 `isDragging` 显示吸附线 / 坐标 readout（live-coordinate-readout 已存在，看是否够用）
- `HtmlSceneView` 的 id / title 留空时 input 边框用 `state.warn` 提示（视觉提示，比 silent 通过更明确）