# Phase 14 — 六处交互细节修复（2026-07-01）

> 状态：实施完成
> 日期：2026-07-01
> 范围：admin 端 Atlas 运行时 / HTML 场景 IME / 面包屑 / Hotspot 视觉 / 工具栏激活态 / 画布平移

## 1. 问题与根因

用户反馈六个具体问题：

1. Atlas 编辑器右侧预览图挂了，控制台报 `Cannot read properties of null (reading 'appendChild')` at `atlas-runtime.ts:105:20`
2. HTML 场景的视图内输入框输入中文，文本框里出现 "a's'daa's'd" 这类 IME 中间字符
3. 顶部面包屑导航栏仍然缺少 `>` 图标
4. hotspots 样式与旧版不一致，且显示名称（首字母标签）也不一致
5. 顶部「选择 / Hotspot / Callout」按钮选中时缺少样式
6. 编辑器内的全景图无法拖动（只能看到中间区域，两边没法访问）

逐一排查根因：

| # | 根因 |
|---| --- |
| 1 | `AtlasRuntime.mount()` 是 async，在 `await loadImage()` 之间，`useEffect` 清理函数调用 `destroy()` 把 `mountedEl = null`，await 恢复后第 105 行 `mountedEl.appendChild(img)` 报 null。竞态 |
| 2 | 受控 `<Input>` 在 IME composition 期间每次 input 事件都触发 onChange → 父组件 `await persist(...)` 异步 setState → 受控值回写 → React 把 IME 中间字符回滚回去 |
| 3 | 自定义 `<ChevronRight size={14} color="var(--ig-colors-ink-faint)" />` 与 Chakra `<Breadcrumb.Separator>` 默认 `ChevronRightIcon` 冲突；Chakra 的 recipe CSS `_icon: { boxSize: '1em' }` 不适用于 lucide icon（无 `chakra-icon` class），最终图标不可见 |
| 4 | 新版 hotspot 是 26×26 圆 + 首字母，旧版是 20×20 纯圆点；新版 active 用 `accent`（橄榄绿），旧版用 `#dc2626`（红） |
| 5 | `ToolButton` 内联 `background` / `color` / `border: 'none'` 把 `index.css` 里 `.icon-btn[data-active='true']` 的 brand-muted 背景 + brand 边框全部覆盖了 |
| 6 | 工具栏 docstring 写"panning the canvas is built into the Select tool (drag empty canvas area)"，但 `AtlasCanvas` 实际并未实现 — `handleCanvasClick` 只处理 select / marker 点击，没有拖拽平移 |

## 2. 修复

### 2.1 AtlasRuntime mount 竞态（修复问题 1）

文件：`src/products/atlas/runtime/atlas-runtime.ts`

- 加 `private destroyed: boolean = false` 字段
- `mount()` 在 `await loadImage()` 之后增加守卫：`if (this.destroyed || !this.mountedEl) return`
- `destroy()` 设置 `this.destroyed = true`，并加 `this.mountedAt` 守卫避免 0 时长时多发 `analytics:stay` 事件

测试：`tests/products/atlas/atlas-runtime.test.ts` 新增 `AtlasRuntime.mount survives destroy() called during awaited image load`，用 deferred Promise 模拟竞态。

### 2.2 IME 组合（修复问题 2）

新建 `src/admin/src/components/ImeSafeInput.tsx`：
- 内部 `internal` state + `composing` state + `lastSentRef`
- composition 期间 `onChange` 只更新 `internal`，不调父 `onChange`
- `onCompositionEnd` 时一次性提交 `internal` 的最终值
- `useEffect` 同步外部 `value` 时，如果等于 `lastSentRef`（即父刚回声确认我们提交的值）就跳过，避免把最终值回写为父的旧值

应用到 `src/admin/src/features/projects/settings/HtmlScenePanel.tsx`：
- 场景标题 input
- 视图 title input
- 视图 id input
- 视图 activationMessage.type input

测试：`src/admin/src/test/ImeSafeInput.test.tsx` 4 个用例 — 常规输入透传、IME 期间不调 onChange、composition end 单次提交、composition 后继续正常透传。

### 2.3 面包屑分隔符（修复问题 3）

文件：`src/admin/src/components/PageHeader.tsx`

- 删除 lucide `ChevronRight` import
- 简化为 `<Breadcrumb.Separator />`（用 Chakra 默认的 `ChevronRightIcon`，`recipe` 的 `_icon: { boxSize: '1em' }` 适用，1em = 14px 来自父 `fontSize`）

### 2.4 Hotspot 视觉（修复问题 4）

文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`，`HotspotDot` 子组件

- 尺寸 26 → 20（与旧版一致）
- active 颜色：`var(--ig-colors-accent)` → `var(--ig-colors-brand)`（旧版的红/红棕色）
- inactive 颜色：`rgba(217, 119, 6, 0.92)` → `rgba(245, 158, 11, 0.92)`（与旧版 `#f59e0b` 一致）
- box-shadow active ring 用 brand 调色（`rgba(181, 67, 24, 0.22)`）
- 删除首字母 `<span>` 标签，纯圆点（与旧版一致）
- 保留 hover/active scale 1.18 过渡改进

### 2.5 工具栏激活态（修复问题 5）

文件：`src/admin/src/features/atlas-editor/components/AtlasToolbar.tsx`，`ToolButton` 子组件

- 删除内联 `color` / `background` / `border: 'none'` 三条样式（之前覆盖了 CSS）
- 保留 `display` / `alignItems` / `gap` / `height` / `padding` / `fontSize` / `fontWeight` / `borderRadius` / `cursor` 这些结构性样式
- 现在 `data-active='true'` 状态下，CSS `.icon-btn[data-active='true'] { background: var(--ig-colors-brand-muted); color: var(--ig-colors-brand); border-color: var(--ig-colors-brand); }` 生效

### 2.6 画布平移（修复问题 6）

文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

- 加 `pan: { x, y }` state + `isPanning` state + `panStartRef`
- 加 `handlePanStart(e)`：仅 `tool === 'select'` 且 `e.target === e.currentTarget`（点击空白区，不是 hotspot / focus handle / callout pin）时启动平移
- 加 `useEffect` 注册 window `mousemove` / `mouseup`：在 pan 期间累积 offset
- 容器 `onMouseDown={handlePanStart}`，cursor 随状态切换（`grab` / `grabbing`）
- 加 `<div data-testid="canvas-pan-layer">` 包裹 image + item markers + hotspots，统一应用 `transform: translate(pan.x, pan.y)` — hotspots 跟着平移，坐标保持正确
- 切项目时 `useEffect` 重置 pan，避免跨项目残留

## 3. 修改的文件

```
M  src/products/atlas/runtime/atlas-runtime.ts               # destroyed flag + 守卫
M  src/admin/src/components/PageHeader.tsx                   # 默认 Breadcrumb.Separator
M  src/admin/src/features/atlas-editor/components/AtlasToolbar.tsx  # 删内联覆盖
M  src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx   # hotspot 样式 + pan
M  src/admin/src/features/projects/settings/HtmlScenePanel.tsx      # 4 个 ImeSafeInput

A  src/admin/src/components/ImeSafeInput.tsx                 # 新组件
A  src/admin/src/test/ImeSafeInput.test.tsx                  # 4 用例

M  tests/products/atlas/atlas-runtime.test.ts                # +1 race condition test
```

## 4. 验证

```bash
cd src/admin && npx tsc --noEmit       # exit 0
cd src/admin && npm run build          # ✓ built in ~10s
cd src/admin && npx vitest run         # 5 files, 25 tests, all pass
npx tsx --test tests/products/atlas/atlas-runtime.test.ts  # 6 tests, all pass
```

### 肉眼验收

1. Atlas 编辑器：右侧预览区不再抛 `appendChild` 错误；切项目瞬间不再因 destroy-during-mount 崩
2. HTML 场景 → 视图：编辑器内输入框输入中文（拼音 → 候选 → 选）正常显示最终字符，不再出现 "a's'daa's'd"
3. 面包屑：项目列表 / 编辑器 / 设置页 顶部出现 `>` 分隔
4. Atlas 编辑器画布：hotspots 20px 圆点，active 红色（brand），不再有首字母
5. 工具栏：选中 V / M / C 工具时，按钮有 brand-muted 背景 + brand 文字 + brand 边框
6. Atlas 编辑器画布（Select 工具）：鼠标在空白处按下拖动 → 全景图与 hotspots 一起平移 → 松手停；Hotspot / Callout 工具下平移无效

### 保留契约

| 契约 | 状态 |
| --- | --- |
| `data-testid` 增量 | `canvas-pan-layer` 新增；`hotspot-${id}` 的视觉属性变化但 `data-testid` / `data-active` / `data-dragging` 保持 |
| 拖拽手势 | 空白区拖动 = 平移（新增）；hotspot / focus / callout 拖动不受影响 |
| IME 输入 | 现有 4 个 input 改用 ImeSafeInput，行为对父组件是同步的（composition end 才 commit） |
| Schema / API | 全部未动 |

## 5. 后续可选优化

- 画布平移可加缩略图导航（mini-map），尤其当全景图远大于视口时
- 工具栏激活态目前用 `brand-muted` 背景，可以做成更明显的左侧 brand 竖条
- ImeSafeInput 可考虑推广到 AssetsPanel / MetadataForm / StructurePanel 等其他文本输入处（用户目前没报这些地方的 IME 问题）