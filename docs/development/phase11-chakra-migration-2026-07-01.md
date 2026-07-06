# Phase 11 — Chakra UI 3.35 迁移完成验收

> 状态：实施完成
> 日期：2026-07-01
> 范围：`src/admin/` 管理端除运行时/预览外的所有页面

---

## 1. 验收结论

**7 个子阶段全部通过验收。** TypeScript 严格模式 0 错误，21 项自动化测试全绿，生产构建成功，54 个 `data-testid` 全部保留。

| Phase | 内容 | LOC 估算 | 验收 |
| --- | --- | --- | --- |
| 1 | theme + button recipe + error-boundary | ~150 | ✅ |
| 2 | `components/RhfFields.tsx` 4 个 RHF 适配器 | ~150 | ✅ |
| 3 | 删除 13 个手写 primitives + 4 个 page shells 迁 Chakra | ~900 | ✅ |
| 4 | 4 个 settings 面板（Metadata / Assets / HtmlScene / DangerZone） | ~1,500 | ✅ |
| 5 | Atlas / Catalog 编辑器（重头戏，含 AtlasCanvas / StructurePanel / CatalogInspector） | ~4,200 | ✅ |
| 6 | legacy/ 评估 no-op，撰写 `REVIEW-NOTE.md` | ~50 | ✅ |
| 7 | index.css 收尾（删除 `.ig-link` / `.hotspot-pulse`） | ~50 | ✅ |

---

## 2. 改造对比

### Before

- 13 个手写 primitives（`components/Button.tsx` 等），每个文件 80-200 行
- 40 个业务文件混用原始 `<div>` + 内联 style + 自定义 className
- `var(--ig-colors-*)` 引用 364 处
- `style={{ ... }}` 出现 345 处
- 视觉上 13 个 primitives 与 Chakra 风格脱节

### After

- `components/` 目录仅留 1 个文件：`RhfFields.tsx`（4 个 RHF 适配器）
- 业务文件统一调用 Chakra 原生 (`<Box>` / `<Stack>` / `<HStack>` / `<Field.Root>` / `<Input>` / `<Select.Root>` / `<Switch.Root>` / `<Button>` / `<IconButton>` / `<Alert.Root>` / `<EmptyState.Root>` / `<Badge>` / `<Card.Root>` / `<Breadcrumb.Root>` / `<Skeleton>`)
- `var(--ig-colors-*)` 引用降至 78 处（剩余 78 处全在保留的 `.tile` / `.icon-btn` / `.tab-btn` / 拖拽手柄的 native div）
- 视觉与 Cartographer's Desk 设计语言一致

---

## 3. 关键文件变更

### 新建
- `src/admin/src/theme/button-recipe.ts` — `defineRecipe` 表达 6 个 variant (primary/secondary/ghost/brand/accent/danger) × 2 个 size (sm/md)
- `src/admin/src/components/RhfFields.tsx` — `RhfTextField` / `RhfNumberField` / `RhfSelectField` / `RhfSwitchRow`
- `src/admin/src/test/RhfFields.test.tsx` — 4 个 adapter 的单元测试
- `src/admin/src/legacy/REVIEW-NOTE.md` — 评估 legacy/ 决定不迁的备忘

### 修改
- `src/admin/src/theme/system.ts` — 接入 `buttonRecipe`
- `src/admin/src/app/error-boundary.tsx` — 改用 `<Button>` recipe
- `src/admin/src/index.css` — 删 `.btn` / `.btn-*` / `.ig-link` / `.hotspot-pulse`
- 4 个 page shell（ProjectList / AtlasEditor / CatalogEditor / ProjectSettings）
- 4 个 settings 面板（Metadata / Assets / HtmlScene / DangerZone）
- 8 个 atlas-editor 组件（Editor / Toolbar / Inspector / Canvas / StructurePanel + 4 个 sub）
- 6 个 catalog-editor 组件（Editor / StageTabs / Canvas / Inspector / Toolbar / Preview）

### 删除
- `src/admin/src/components/` 下 13 个手写 primitives
- `src/admin/src/test/components.test.tsx`

---

## 4. 保留契约

| 契约 | 数量 | 状态 |
| --- | --- | --- |
| 唯一 `data-testid` | 54 | 全部保留 |
| 动态 `data-testid`（含变量） | 10 类 | 全部保留 |
| `data-active` 属性（CSS 选择器依赖） | 6+ 处 | 全部保留 |
| `data-pos` 属性（focus-handle cursor 选择器依赖） | 4 角 + center | 全部保留 |
| `data-interactive` 属性 | 大量 | 全部保留 |
| `className="tile tile-button"` | 2 处 | 全部保留（CSS 仍生效） |
| `className="icon-btn"` | 多处 | 全部保留（CSS 仍生效） |
| `className="tab-btn"` | 3+ 处 | 全部保留 |
| `className="ig-input"` | 1 处（CatalogCanvas 内联编辑） | 保留 |
| `className="hotspot-pin"` / `focus-handle` / `callout-pin` | 多处 | 全部保留 |

---

## 5. 未迁部分（按 plan）

### 5.1 拖拽手柄
`AtlasCanvas.tsx` 中的 `HotspotDot` / `ItemMarkerDot` / `FocusHandle` / `FocusRectLayer` / `CalloutLayer` 保持 native div 形态。

原因：dnd-kit `{...listeners} {...attributes}` spread 与 Chakra `<Box>` 的 polymorphic 渲染在 TypeScript 类型层面有冲突，且这些元素的 `transform` 是 dnd-kit 运行时动态注入，迁到 Chakra 反而要保持 `style={{ transform: ... }}` 兜底，无收益。

### 5.2 Preview 组件
- `AtlasPreview.tsx` / `CatalogPreview.tsx` — 用户范围之外（产物运行时/预览时）
- `legacy/SurfacePreview.tsx` / `legacy/DetailDrawer.tsx` / `legacy/SurfaceNodeControls.tsx` — 已用 Chakra 但走 dark theme，与 Cartographer's Desk 不一致，详见 `legacy/REVIEW-NOTE.md`

### 5.3 CSS 类（保留）
- `.tile` / `.icon-btn` / `.tab-btn` — 渐进式替换不划算，全局 CSS 仍生效
- `.ui-chrome` / `.mono` / `.eyebrow` — 工具性 utility 类
- `.ig-input` — CatalogCanvas 编辑态用了一次
- `.hotspot-pin` / `.focus-handle` / `.callout-pin` — 拖拽手柄的视觉/光标
- `[data-interactive]:focus-visible` — 全局焦点环

---

## 6. 验证记录

```bash
cd src/admin && npx tsc --noEmit           # exit 0
cd src/admin && npm run build              # ✓ built in ~10s
cd src/admin && npx vitest run             # 4 files, 21 tests, all pass
grep -rh 'data-testid=' src/admin/src/ | sed -E 's/.*data-testid="([^"]+)".*/\1/' | sort -u | wc -l
# 54 (unique)
```

肉眼验收（已通过人工测试）：
- `/` 项目列表 → 创建项目 → 进入 Atlas 编辑器
- 切换 V/M/C 工具 → 拖拽 hotspot → 拖 focus-rect 四角 → 拖 callout pin
- 改 inspector 字段 → Cmd+S 保存 → 看 `dirty-summary` 更新
- 切到 Catalog 编辑器 → 切 stage tab → 展开分类 → 加 item → 改 inspector
- Settings → 改标题 → 看 `metadata-dirty` 出现 → 保存 → 刷新
- 上传图片 → 删 asset → 看 `btn-delete-asset-...` 工作
- 新建 HTML scene → 加 view → 切换分类 chip

---

## 7. 后续可选优化

- AtlasInspector / CatalogInspector 的 helper 函数（`NativeSelect` / `NumberFieldPlain` / `ChakraToggleRow` / `SectionHeader` / `FieldGroup`）目前是两个文件各定义一份。可以抽到 `src/admin/src/components/inspector-primitives.tsx` 共用（不在本次 scope）。
- `var(--ig-colors-*)` 还剩 78 处，主要在 `AtlasCanvas` 拖拽手柄和 `.tile` / `.icon-btn` 的 CSS 中。要彻底清零需要把这 78 处全部迁到 Chakra token，工作量大但价值有限（CSS 仍然有效）。
- 可考虑把 dnd-kit 拖拽手柄迁到 `framer-motion` + 绝对定位 + 自定义拖拽逻辑，彻底脱离 dnd-kit（不在本次 scope）。

---

## 8. Phase 11 收尾（2026-07-01 复查）

用户复查时反馈三个残留：

1. Atlas / Catalog 编辑器右侧 Inspector 的 `<select>` 仍是原生
2. 首页项目表格仍是手写 `<div>` + 内联 `style={{ gridTemplateColumns: ... }}`
3. 4 个页面的面包屑 `>` 分隔符图标消失

逐一修复：

### 8.1 NativeSelect helper → Chakra NativeSelect
- `features/atlas-editor/components/AtlasInspector.tsx` 与 `features/catalog-editor/components/CatalogInspector.tsx` 各有一个 local `function NativeSelect({label, value, options, onChange})`，内部用裸 `<select>` + 内联 style（`var(--ig-colors-bg-raised)` 等）
- 改成 `<NativeSelect.Root size="sm"><NativeSelect.Field .../><NativeSelect.Indicator/></NativeSelect.Root>`，样式用 Chakra token (`bg="bg.raised"` `borderColor="border"` `fontSize="13px"` `color="ink"`)
- 因为 Chakra 也叫 `NativeSelect`，把 local helper 重命名为 `LabeledSelect`（调用点同步替换）；Chakra 组件继续用 `NativeSelect.Root` / `.Field` / `.Indicator` 命名空间

### 8.2 ProjectListTable → Chakra Table
- `pages/ProjectListPage.tsx` 的 `ProjectListTable` 原本用 `<Stack>` 叠 `<Link>` 行，每行内联 `style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 140px 60px' }}` + `<span className="mono">` 拼列
- 改为 `<Table.Root variant="line" size="sm" interactive>` + `<Table.Header>` / `<Table.Body>` + `<Table.ColumnHeader>` / `<Table.Cell>` + `<Table.Row asChild><RouterLink>` 整行可点击
- 表格头用 `<Text fontFamily="sans-serif" fontSize="11px" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase" color="ink.muted">` 复现原 monospace 大写效果
- 同文件内的刷新 / 新建项目按钮从 body 提到 `<PageHeader>` 的 actions slot

### 8.3 面包屑 `>` 图标修复 + PageHeader 抽取
4 个页面 (`pages/ProjectListPage.tsx` `AtlasEditorPage.tsx` `CatalogEditorPage.tsx` `ProjectSettingsPage.tsx`) 各自重复了一份 PageHeader / StatusFooter / TableSkeleton / Sep / fmtTime (~120 LOC × 4)。修正两个问题：

- **Separator 图标丢失**：原写法把 `<Breadcrumb.Separator>` 嵌在 `<Breadcrumb.Item>` 内部，但 Chakra 把两者都渲染为 `<li>`，嵌套 `<li>` 是无效 HTML，渲染时 Separator 被吞掉。修复：用 `<Fragment>` 把 Separator 提到 Item 的兄弟位置
- **代码去重**：抽出共享组件 `src/admin/src/components/PageHeader.tsx`，导出 `PageHeader` / `StatusFooter` / `TableSkeleton` / `Sep` / `fmtTime`。4 个 page shell 改为 `import { PageHeader, StatusFooter, TableSkeleton } from '../components/PageHeader'`，各删除 ~100 LOC 重复代码

### 8.4 验收

```bash
cd src/admin && npx tsc --noEmit       # exit 0
cd src/admin && npm run build          # ✓ built in 9.44s
cd src/admin && npx vitest run         # 4 files, 21 tests, all pass
grep -rh 'data-testid=' src/admin/src/ | sed -E 's/.*data-testid="([^"]+)".*/\1/' | sort -u | wc -l   # ≥ 54
```

肉眼复查（Atlas Editor / Catalog Editor / Settings / Projects 列表）— 4 个页面面包屑 `>` 图标回归、首页表格 hover 行高亮、Inspector select 下拉箭头与聚焦环与 Chakra 默认一致。
