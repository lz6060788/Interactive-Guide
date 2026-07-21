# Catalog 编辑画布与运行时预览分离设计

## 问题

Catalog 编辑器此前直接以 `CatalogScene` 作为编辑画布。该场景是发布运行时：它会根据当前三级节点切换至局部背景镜头、显示暗化遮罩、聚焦裁切、顶部分类导航和右侧说明列表。复用它使作者无法同时查看同分类的其它三级节点，也无法在全图坐标中配置背景镜头与聚焦区域。

同时，全局 `ErrorBoundary` 位于 `BrowserRouter` 外层。子页面发生真实异常后，回退页中的 `Link` 缺少 Router 上下文，产生第二个 `LinkWithRef` 错误并覆盖原始问题。

## 目标架构

```text
ChakraProvider
  QueryClientProvider
    BrowserRouter
      ErrorBoundary
        Admin routes

Catalog editor
  AuthoringCanvas (编辑模式)
    全图底图 + 当前分类所有三级 marker
    当前有效背景镜头取景框 + 当前三级 focusRect
  CatalogScene (运行时预览模式)
    发布态局部背景 + 遮罩 + 聚焦窗口 + 右侧列表
```

`AuthoringCanvas` 和 `CatalogScene` 只共享领域数据与投影规则：`viewport`、`viewportOverride`、`marker`、`focusRect` 均为原图归一化坐标。两者不得互相复用发布态 DOM 或视觉层。

## 编辑态行为

- 编辑画布内不显示一、二级导航按钮、右侧运行时列表、暗化遮罩和虚线连接；一级阶段切换位于左侧知识结构面板，右下角保留与发布态完全相同的 Atlas 跳转按钮。
- 使用完整全景图的 contain 投影，当前选中二级分类的全部三级节点 marker 同时可见；点击 marker 切换当前三级节点。
- 显示当前有效背景镜头的 1:1 取景框。它的中心与 `zoom` 映射到原图区域；拖动框更新分类 `viewport`，或更新当前三级节点的 `viewportOverride`（存在覆盖时）。蓝框四角提供等比缩放手柄，以对角为锚点同步更新中心和 `zoom`，取景框在非正方形原图投影中也必须保持视觉上的正方形。
- 显示当前三级节点的 `focusRect`。拖动和四角缩放仅修改该节点的 `focusRect`，其位置始终基于全图归一化坐标。
- 保留 Inspector 中的共享背景/独立背景、中心 x/y、zoom 与提升为分类共享背景操作。编辑画布仅提供直接操作，不引入第二份数据。

## 运行时预览行为

- 继续使用 `CatalogScene`，保持旧版成品结构：有效背景镜头、模糊暗化层、清晰 focusRect、右侧条目和虚线连接。
- 点击右侧条目仅更新选择；路由、错误边界或编辑画布不参与其选择逻辑。

## 验收

- 点击运行时右侧条目后不再出现 `LinkWithRef` 上下文错误；若出现业务异常，错误边界可显示其原始信息。
- 编辑态能同时看见当前分类所有三级项目，能分别调整背景取景框、marker 与 focusRect。
- 编辑画布内无一、二级按钮；左侧面板提供严格的上游、中游、下游切换，运行时预览保留发布态导航和列表。
- 编辑画布、运行时预览与发布态共同使用同一个 Atlas 按钮 DOM 工厂和旧版 SVG，保持尺寸、位置及 hover、active、focus 状态一致。
- 背景镜头蓝框已增加四角等比缩放；缩放受项目 `minZoom/maxZoom`、原图边界和覆盖 1:1 画布所需的最小倍数共同约束，仅写回当前有效 `viewport`。
- 编辑后的四类坐标写回同一份 `panorama` 数据，切至预览后立即呈现相同配置。

## 实施记录

- `BrowserRouter` 已移动到 `ErrorBoundary` 外层；错误回退页的返回链接现在始终在 Router 上下文中渲染。
- 已新增 `CatalogAuthoringCanvas`。编辑模式使用完整原图的 contain 投影，显示当前分类全部三级 marker、有效背景镜头蓝色取景框与当前项目红色聚焦框；拖动分别写回 `marker`、有效 `viewport` 和 `focusRect`。
- `CatalogEditor` 的“运行时预览”继续使用 `CatalogEditorCanvas` / `CatalogScene`，并且仅在该模式渲染运行态的导航、局部背景、遮罩、列表和虚线。
- 已增加编辑器模块存在性回归覆盖；全量测试、类型检查和 Admin 构建已通过。
- 修复三级节点 Inspector 的独立背景镜头开关：统一使用已定义的 `ChakraToggleRow`，并将两个快捷操作按钮改为项目按钮系统支持的 `sm/secondary` 组合，避免选择三级节点时发生运行时引用错误。
