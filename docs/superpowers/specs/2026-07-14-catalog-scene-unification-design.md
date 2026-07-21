# Catalog 场景统一与旧版视觉还原设计

## 目标

Catalog 以旧版产物
`C:\Users\91252\Downloads\guide_surface_validation_001-panorama-1781614822903 - 副本\guide_surface_validation_001-panorama-1781614822903 - 副本`
和用户提供截图为唯一视觉、交互基准。此次重构同时覆盖：

- Catalog 编辑画布；
- 编辑器内实时预览；
- 发布后的 Catalog runtime。

三者必须复用同一套场景渲染结构和选择状态，禁止分别实现后再做样式对齐。

## 范围与非范围

### 本次范围

- 1:1 的 Catalog 全景场景；
- 固定的上游、中游、下游一级 tabs；
- 当前一级下的二级分类 tabs；
- 当前二级分类的三级说明列表、marker 和聚焦效果；
- item `marker` 与 `focusRect` 的直接拖拽编辑；
- 镂空清晰区、外部暗色模糊遮罩和无边框聚焦矩形；
- 底部提示文案与右下“打开 Atlas”入口；
- 现有 HTML Scene 路由、项目级 Atlas URL 和 F10 跳转能力的保留。

### 明确不在范围内

- Catalog 转场视频；
- Atlas 的 hotspot、callout 或任何 Atlas 编辑行为；
- Callout 精细连接参数；
- AIGC、股票跳转、旧通用图数据模型；
- 通过硬编码项目实例内容实现视觉还原。

## 数据模型

不新增像素坐标。三级节点继续使用归一化坐标：

```ts
panorama.items[itemId] = {
  marker: { x: number; y: number },
  focusRect: {
    x: number; y: number; width: number; height: number;
    radius?: number; maskOpacity?: number;
  },
}
```

`x`、`y`、`width`、`height` 均处于 `[0,1]`，编辑层将鼠标位置换算为该坐标空间。所有更新遵守已有 revision 保存链路。

选择状态统一为：

```ts
{ stageKey, categoryId, itemId }
```

切换一级或二级分类时，自动选中目标分类按 `itemIds` 顺序的第一个有效三级节点；无三级节点时显示该分类空态，且不渲染聚焦遮罩。

## 架构

新增共享的 `CatalogScene` 场景内核，取代当前 Catalog runtime 的“两列全景 + 列表”结构。

```text
CatalogScene
├─ PanoramaLayer              原始全景图
├─ FocusBlurLayer             同几何的模糊副本 + SVG mask 镂空
├─ MarkerLayer                当前二级分类全部三级 marker
├─ NavigationLayer
│  ├─ StageTabs               固定上/中/下游
│  └─ CategoryTabs            当前一级的二级分类
├─ DetailListLayer            当前二级分类三级说明
├─ HintLayer                  底部提示文案
└─ AtlasLaunchLayer           右下 F10 Atlas 入口（有 URL 时）
```

`CatalogRuntime` 只负责加载 manifest、维护选择、发出产品语义事件与挂载 `CatalogScene`。编辑画布和预览以同一内核渲染：

- `runtime` 模式：仅保留用户交互；
- `editor` 模式：在选中三级节点上叠加拖拽控制层与辅助标识；
- `preview` 模式：与发布 runtime 相同，不出现编辑控制层。

共享场景不得依赖 F10、路由或编辑器 store；这些能力通过回调注入。

## 视觉与交互

### 场景布局

- 外层以 1:1 逻辑视口渲染，编辑器根据可用空间等比缩放；
- 全景图覆盖整个逻辑视口；
- 一级 tabs 位于顶部并等分三段，激活态为浅色实底；
- 二级 tabs 位于一级 tabs 下方，只显示当前一级分类；
- 右侧说明列表只显示当前二级分类的三级节点，当前项高亮；
- 底部提示文案、右下 Atlas 入口保留旧版层级和位置。

### 聚焦与 marker

- 聚焦区域本身清晰、无描边；
- 外部由暗色覆盖和轻度模糊副本构成，使用 SVG mask 在聚焦区挖孔；
- 所有当前二级分类 marker 都可见；当前三级 marker 使用红色激活形态；
- 点击 marker 或右侧三级项都会切换到该三级节点，并同步遮罩、说明和高亮。

### 编辑操作

- 选中三级节点后，编辑画布显示不可发布的选中框与四角控制点；
- 拖动选中框主体移动 `focusRect`；拖动控制点缩放 `focusRect`；
- 拖动 marker 修改 `marker`；
- 每次拖拽都限制在全景 `[0,1]` 边界，聚焦框保留最小有效尺寸；
- Inspector 保留坐标、尺寸、圆角和遮罩透明度的精确数值编辑；
- 发布态与预览态不显示编辑边框、控制点或其他调试 UI。

## 流程与错误处理

1. 场景初始化时按固定 stage 顺序选择首个有分类的一级，再选择首个二级和首个三级；若当前选择仍有效则保留。
2. 用户切换一级或二级分类时，选择自动落到该二级的首个三级；切换三级时只更新 item。
3. 编辑拖拽写入项目草稿；保存时复用知识树和 panorama 的 revision 更新接口。
4. 无全景图时显示明确配置空态；无分类或无三级节点时显示明确内容空态，不生成伪 marker、伪列表或伪聚焦框。
5. `atlasLaunchUrl` 为空时隐藏 Atlas 入口；非空时维持现有 `atlaslaunch` 事件和 F10/new-window 降级行为。
6. HTML Scene 路由继续由现有 SceneBridge 与宿主 overlay 承担，不将 iframe 逻辑放入场景渲染层。

## 验收与测试

- 1:1 编辑画布、预览和发布 runtime 使用同一场景 DOM/状态模型；
- 一级、二级切换均自动选中首个三级节点；
- 当前二级外的三级节点不会出现在右侧说明列表；
- 点击 marker、说明项和编程选择均同步 marker、列表和镂空聚焦；
- 拖动 marker、移动和缩放 `focusRect` 后写回正确的归一化数据，并遵守边界；
- 运行时不显示聚焦边框，编辑模式才显示控制层；
- 暗色模糊遮罩、顶部 tabs、底部提示及 Atlas 入口存在且层级正确；
- 无数据空态、HTML Scene 路由、Atlas F10 跳转和既有发布校验不回归；
- Catalog 不新增任何转场视频逻辑或测试。

## 实施记录

### 阶段一：共享发布态场景（已完成）

- 新增 `CatalogScene`，由 `CatalogRuntime` 挂载，替换原有两列全景/列表结构；
- 已实现一级 tabs、当前一级二级 tabs、当前二级三级说明、marker、无边框清晰聚焦区及外部暗化模糊层；
- 已保留底部提示和项目级 Atlas URL 对应的 `atlaslaunch` 入口；
- Catalog runtime 单元测试通过。

### 阶段二：编辑画布与空间数据保存（已完成）

- 新增 `CatalogEditorCanvas`：在编辑器中以固定 1:1 逻辑画布挂载同一 `CatalogScene`，不再把旧的实时预览框作为主要编辑区。
- 选中三级节点后可直接拖动 marker、移动聚焦框或拖动四角控制点缩放聚焦框；编辑控件只在 editor 模式显示，不会进入发布产物。
- Inspector 增加 marker 与 `focusRect` 的精确坐标/尺寸输入，画布操作和数值编辑均写入 `panorama.items[itemId]` 的归一化坐标。
- 新建三级节点会同时创建默认空间布局；删除三级节点或二级分类会同步清除无主空间数据，避免发布后出现残留 marker。
- 切换一级或二级分类时，编辑器与运行时统一自动选择该分类的首个有效三级节点；工具栏已纳入 panorama 草稿的待保存状态。
- 编译器按二级分类 `order` 输出，并保留每个分类的 `itemIds` 作者顺序；因此场景自动选中的“第一个三级节点”与编辑器中的排序一致。
- 已移除旧的 `CatalogPreview`、`CatalogStageTabs`、双列 `List` 与 `FocusOverlay` 实现，避免编辑器、预览和发布产物回退到不同 DOM 结构；Catalog 默认不再叠加通用产品标题栏。
- 已验证根目录 TypeScript 类型检查、ESLint（0 error，17 条既有 warning）、Catalog runtime 单测、全部 166 项根目录测试和 Admin Vite 生产构建。`build:server` 仍受既有 `tsconfig.server.json` 将 `rootDir` 限定在 `src/server` 的配置错误影响，和本阶段变更无关。
- 自动化浏览器组件因本机初始化路径错误未能建立会话，尚未完成截图级人工视觉验收；下一阶段应在可用浏览器中以用户提供截图逐项校对比例、间距、字体和遮罩层级。
