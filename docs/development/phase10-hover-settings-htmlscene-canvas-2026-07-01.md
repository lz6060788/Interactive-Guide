# Phase 10 — Hover States, Project Settings, HTML Scene 体验, 画布直接操作

> 状态: 已完成 (2026-07-01)
> 范围: 管理端 Atlas / Catalog / Project Settings 三处工作台

这一轮在保留双产品 (Atlas / Catalog) 共享 `PanoramaModel` 架构的前提下，集中补齐四类长期欠账的体验与功能:

1. 全面悬浮态 (hover state)
2. Project Settings 页面
3. HTML Scene 体验形式支持
4. 画布上对 Hotspot / Focus Rect / Callout 的直接操作

每项均经过 typecheck / production build / vitest 验证。

---

## 1. 全面悬浮态

把"在 React inline style 中无法实现 hover"这一长期约束替换为 **属性选择器 + CSS 类** 体系，所有 `data-interactive` 的元素自动继承悬停、激活、聚焦三态。

### 1.1 新增 CSS 约定 (src/admin/src/index.css)

- `[data-interactive]:focus-visible` — 全局可见焦点环，定位到 brand 颜色
- `.btn` + 变体 `.btn-{primary,secondary,ghost,brand,accent,danger}`
  - 自身有 `transition`，支持 `hover / active / [data-disabled]`
  - 各变体独立配色，hover 时阴影或边色变化
- `.tile` + `.tile-button` — 列表行/卡片，hover 时背景与边色上浮，`[data-active='true']` 给出 brand 描边
- `.icon-btn` — 工具栏图标按钮，hover 时浮起、`[data-active='true']` 走 brand 配色
- `.tab-btn` — 阶段 Tab，hover 提升到 sunken，激活态有 brand 下划线
- `.ig-link` — TopBar / 面包屑链接
- `.ig-input` / `.ig-select` — 表单焦点环，hover 时边色变深
- `.hotspot-pin` / `.focus-handle` / `.callout-pin` — 画布拖拽手柄的 hover scale 与 active 高亮
- `@keyframes ig-pulse` / `ig-spin` — 已沿用

### 1.2 组件侧改造

- `Button.tsx` — 不再使用 Chakra `_hover` / `_active` props；改为 `className="btn btn-{variant}"` + `data-disabled` / `data-loading`
- `ProjectListPage.tsx` — 行 Link 改 `tile tile-button`，新增/删除 pill 走 `dashed border` 以获得 hover 反馈
- `AtlasToolbar.tsx` / `CatalogToolbar.tsx` — 工具按钮改 `icon-btn`
- `StructurePanel.tsx` / `CatalogCanvas.tsx` — 分类与项目行改 `tile tile-button`，新增分类按钮使用 dashed border
- `CatalogStageTabs.tsx` — 阶段 Tab 改 `tab-btn`

### 1.3 设计意图

- 不在组件内写 `onMouseEnter` / `onMouseLeave`，避免 React 不可控重渲染
- 通过 attribute selector 让 CSS 表达状态机，组件只声明意图
- 所有可交互元素都带 `data-interactive="true"`，键盘用户得到一致的 `:focus-visible` 反馈

---

## 2. Project Settings 页面

### 2.1 入口

- 新路由: `/projects/:projectId/settings`
- 编辑器 TopBar 右上角新增 "Settings" 按钮 (Atlas / Catalog 都可触发)
- 设置页右上角保留 Atlas Editor / Catalog Editor 互跳按钮

### 2.2 三大区块 (Card + SectionHeader)

| 区块 | 内容 | 写入接口 |
| --- | --- | --- |
| 01 基础信息 | 标题 / 版本 / 语言 (RHF + locale datalist) | `PATCH /projects/:id/metadata` |
| 02 资源 | 图片 / 视频 / HTML 包 三种 kind 的上传 + 列表 + 删除 | `POST/DELETE /projects/:id/assets/{kind}` |
| 03 HTML 场景 | 创建 / 编辑 / 删除 `HtmlScenePackage` 列表 | `PUT /projects/:id/scenes` |
| 04 生命周期 | 删除项目（二次确认） | `DELETE /projects/:id` |

### 2.3 关键文件

```
src/admin/src/
  pages/ProjectSettingsPage.tsx           ← 页面壳
  features/projects/
    api.ts                                 ← useUpdateProjectMetadata / useDeleteProject / useUploadAsset / useDeleteAsset / useUpdateProjectScenes
    settings/
      MetadataForm.tsx                     ← 基础信息
      AssetsPanel.tsx                      ← 资源上传列表
      HtmlScenePanel.tsx                   ← 场景管理（见 §3）
      DangerZone.tsx                       ← 二次确认删除
```

### 2.4 资源上传约定

- `POST /projects/:id/assets/image` 接受任意 image mime，asset id 默认从文件名推断
- `POST /projects/:id/assets/video` 接受 mp4/webm/mov
- `POST /projects/:id/assets/html-bundle` 接受 zip，zip 必须含根目录 `index.html`（服务端校验）
- 列表行展示 asset id / 大小 / mime / 删除按钮 (icon-btn hover 态)
- 删除走 `window.confirm` 二段确认

---

## 3. HTML Scene 体验形式

### 3.1 数据模型回顾

`IndustryCategory.experience` 是判别联合:

```ts
type CategoryExperienceBinding =
  | { kind: 'panorama' }
  | { kind: 'html-scene'; sceneId: string; viewId: string }
```

过去只有一个空 Select 占位（"HTML Scene（开发中）"）。现在两端都补齐。

### 3.2 Atlas 侧 / Catalog 侧改造

- `AtlasInspector.CategoryInspector` 新增 **体验形式 FieldGroup** (`Box` 图标)
  - 类型 Select: panorama / html-scene
  - html-scene 模式下展开: 场景 Select + 视图 Select
  - 视图 Select 的 options 来自当前所选 scene.views，类别有 HTML/PANO chip
- `CatalogInspector.CategoryInspector` 同样补齐
- `StructurePanel` 分类行: 显示 `HTML` / `PANO` / `empty` chip

### 3.3 HtmlScenePanel (Settings → 03)

- 每个 scene 卡片含:
  - 标题 (内联 input)
  - 协议指纹 (read-only mono): `interactive-guide:scene-bridge@1.0.0`
  - HTML 包上传 (`<input type="file" accept=".zip">`)，上传后该 scene 的 `assetId` 自动绑定
  - 包列表: "打开" (新窗口) + "删除包" 按钮
  - 视图列表 (Views): 每个 view 含 id / title / 激活消息类型 / 已绑定 categoryIds chip
  - chip 颜色: 选中 = brand，未选 = paper-raised
- 新增 scene 即时通过 `useUpdateProjectScenes` 提交

### 3.4 知识持久化修复

- 之前 `handleSave` 不会提交 `knowledge`，导致所有分类重命名 / 体验切换 / 增删项目 都是"假保存"
- 现在 `AtlasEditor` / `CatalogEditor` 都新增 `pendingKnowledge` 状态，`handleSave` 按顺序提交 knowledge → panorama → config
- 工具栏 dirty 摘要已支持三段 (knowledge / panorama / config)

---

## 4. 画布直接操作 Hotspot / Focus Rect / Callout

### 4.1 现状 (Phase 9 之前)

- Hotspot 只能拖动中心
- Focus Rect 只能通过 inspector 数字表单微调
- Callout 只能通过 inspector 改 target.x / target.y

这些操作都很"程序员式"，不直观。

### 4.2 新增的统一手柄体系 (`AtlasCanvas.tsx`)

| HandleKind | 渲染 | 拖拽语义 |
| --- | --- | --- |
| `hotspot` | 中心实心圆 + pulse | 移动整个 hotspot |
| `item-marker` | 小圆 dot | 移动 item 在全景上的 marker |
| `focus-center` | 半透明矩形 + 中心白点 | 平移整个 focusRect |
| `focus-corner-{nw,ne,sw,se}` | 四个角方块 | 通过 `resizeFromCorner` 调整宽高与位置 |
| `callout-target` | accent 绿点 + SVG 引线 | 移动 callout.target |

### 4.3 `resizeFromCorner` 关键算法

- 输入: 旧 rect、鼠标 dx/dy、当前 corner
- 行为: 固定对角，按 delta 重新计算 x/y/width/height
- 边界: width / height 不低于最小值 (1% of 1.0)，不越界 [0, 1]
- 结果: 通过 `onPatchPanorama` 走与表单相同的写入路径

### 4.4 操作反馈 (`LiveCoordinateReadout`)

- 新增 `activeHandle` prop
- 拖拽时左下角坐标读数旁出现橙色 label (e.g. "focus NW")
- 配合坐标 / zoom 一起显示，让操作员随时知道自己在编辑哪个对象

### 4.5 与现有 inspector 的协作

- 画布上拖完手柄，inspector 数值会同步
- inspector 改数值，画布手柄也会同步
- 两者走同一个 `setDraft` 路径，不存在状态分裂

---

## 5. 验证

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| 根 typecheck | `npm run typecheck` | ✅ 0 错 |
| Admin typecheck | `cd src/admin && npx tsc --noEmit` | ✅ 0 错 |
| Admin production build | `cd src/admin && npm run build` | ✅ 9.57s |
| Admin vitest | `cd src/admin && npx vitest run` | ✅ 4 文件 / 27 用例 |
| 后端连通性 | `curl http://localhost:8788/api/projects` | ✅ 200 |
| 路由可达 | `curl -o /dev/null -w "%{http_code}" http://localhost:5173/projects/demo/settings` | ✅ 200 (Vite SPA fallback) |

> 注: `tests/admin/atlas-editor.test.ts` 与 `tests/admin/catalog-editor.test.ts` 在 Phase 7 legacy 清理时已经处于"导入不存在路径"的破损状态，与本轮改动无关；本轮未做修改以保持 scope 清晰。

---

## 6. 涉及的文件清单

```
M  src/admin/src/App.tsx
A  src/admin/src/pages/ProjectSettingsPage.tsx
A  src/admin/src/features/projects/settings/MetadataForm.tsx
A  src/admin/src/features/projects/settings/AssetsPanel.tsx
A  src/admin/src/features/projects/settings/HtmlScenePanel.tsx
A  src/admin/src/features/projects/settings/DangerZone.tsx
M  src/admin/src/features/projects/api.ts
M  src/admin/src/features/atlas-editor/components/AtlasEditor.tsx
M  src/admin/src/features/atlas-editor/components/AtlasInspector.tsx
M  src/admin/src/features/atlas-editor/components/AtlasToolbar.tsx
M  src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx
M  src/admin/src/features/atlas-editor/components/StructurePanel.tsx
M  src/admin/src/features/atlas-editor/components/LiveCoordinateReadout.tsx
M  src/admin/src/features/catalog-editor/components/CatalogEditor.tsx
M  src/admin/src/features/catalog-editor/components/CatalogInspector.tsx
M  src/admin/src/features/catalog-editor/components/CatalogToolbar.tsx
M  src/admin/src/pages/AtlasEditorPage.tsx
M  src/admin/src/pages/CatalogEditorPage.tsx
M  src/admin/src/index.css
```

后端未改动 — `PATCH /metadata` / `PUT /scenes` / `POST /assets/{kind}` 端点在 Phase 6 已就位。
