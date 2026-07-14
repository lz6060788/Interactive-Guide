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

- 不显示一、二级导航按钮、右侧运行时列表、暗化遮罩、虚线连接和 Atlas 跳转按钮。
- 使用完整全景图的 contain 投影，当前选中二级分类的全部三级节点 marker 同时可见；点击 marker 切换当前三级节点。
- 显示当前有效背景镜头的 1:1 取景框。它的中心与 `zoom` 映射到原图区域；拖动框更新分类 `viewport`，或更新当前三级节点的 `viewportOverride`（存在覆盖时）。
- 显示当前三级节点的 `focusRect`。拖动和四角缩放仅修改该节点的 `focusRect`，其位置始终基于全图归一化坐标。
- 保留 Inspector 中的共享背景/独立背景、中心 x/y、zoom 与提升为分类共享背景操作。编辑画布仅提供直接操作，不引入第二份数据。

## 运行时预览行为

- 继续使用 `CatalogScene`，保持旧版成品结构：有效背景镜头、模糊暗化层、清晰 focusRect、右侧条目和虚线连接。
- 点击右侧条目仅更新选择；路由、错误边界或编辑画布不参与其选择逻辑。

## 验收

- 点击运行时右侧条目后不再出现 `LinkWithRef` 上下文错误；若出现业务异常，错误边界可显示其原始信息。
- 编辑态能同时看见当前分类所有三级项目，能分别调整背景取景框、marker 与 focusRect。
- 编辑态无一、二级按钮；运行时预览保留其发布态导航和列表。
- 编辑后的四类坐标写回同一份 `panorama` 数据，切至预览后立即呈现相同配置。
