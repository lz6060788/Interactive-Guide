# Catalog 背景镜头、聚焦投影与预览校正设计

## 目标

修正 Catalog 当前将“全图背景”“三级节点聚焦框”和“编辑画布”混为一层的问题。以旧版 Catalog 产物为基准，发布态、编辑态和运行时预览必须呈现同一套相机投影、聚焦遮罩、虚线连接和 Atlas 跳转入口。

## 既有数据与归属

不新增平行的背景数据模型，复用已有归一化镜头数据：

```ts
panorama.categories[categoryId].viewport = {
  centerX: number,
  centerY: number,
  zoom: number,
}

panorama.items[itemId] = {
  marker: { x: number, y: number },
  viewportOverride?: { centerX: number, centerY: number, zoom: number },
  focusRect: { x: number, y: number, width: number, height: number },
}
```

- 二级分类的 `viewport` 是该分类的共享背景镜头。
- 三级节点默认继承分类镜头；存在 `viewportOverride` 时使用该节点自己的背景镜头。
- `focusRect` 始终独立于背景镜头，表示放大后的背景画面上的清晰高亮区域。
- `marker` 继续表示三级节点在原始全景图上的标记位置，不替代背景镜头中心。

## 场景投影

`CatalogScene` 新增独立的 Camera/Projection 层，输入为原图尺寸、逻辑画布尺寸和有效 viewport，输出同一份 `SceneGeometry` 给全部层使用：

```text
effective viewport = item.viewportOverride ?? category.viewport
scene scale        = base cover scale × viewport.zoom
scene origin       = 画布中心 - (viewport.center × scaled scene size)
projected rect     = scene origin + focusRect × scaled scene size
projected marker   = scene origin + marker × scaled scene size
```

背景原图、模糊副本、清晰聚焦窗口、marker、编辑控件和虚线连接均只能使用 `SceneGeometry`。禁止各层用独立 `background-size` 或百分比反向计算，以消除聚焦框内容与背景区域不一致的问题。

## 交互与编辑器

中间区保留 1:1 画布，并新增 `编辑 / 运行时预览` 切换：

- 编辑模式：显示背景镜头中心标记、可拖拽的背景镜头、`focusRect` 四角控制点和 marker。
- 运行时预览：复用 `CatalogScene` 的 runtime 模式，不显示任何编辑辅助线或控制点。
- 右侧 Inspector：三级节点显示“继承分类背景 / 使用独立背景”开关；独立背景打开后显示中心 x/y 与 zoom 输入。
- 二级分类 Inspector：显示共享背景镜头中心 x/y 与 zoom 输入。
- 快捷操作：
  - 当前节点使用分类共享背景（删除 `viewportOverride`）；
  - 将当前有效背景镜头设为分类共享背景；
  - 复制当前分类共享背景到当前节点作为独立覆盖。
- 在画布中拖动背景镜头中心仅修改当前有效编辑目标：继承态写分类 viewport，覆盖态写 item viewportOverride。缩放仅修改相同目标的 zoom。

## 发布视觉与连接

- 背景始终以有效 viewport 放大、平移后显示，不能退化为整图填满画布。
- `focusRect` 对应区域清晰，外侧为原图同几何位置的模糊/暗化副本，发布态不显示焦点边框。
- 使用 SVG overlay 从投影后的聚焦框右侧连接到当前右栏条目分割线；线为白色虚线，随选择、相机、焦点框和列表布局重算。
- `atlasLaunchUrl` 非空时右下角固定显示 Atlas/F10 跳转图标；该按钮独立于列表、遮罩和编辑模式，不得因重渲染丢失。

## 边界与错误处理

- 无独立 viewport 时严格继承分类 viewport；无分类 viewport 时使用现有安全默认镜头并在编辑器标记为未校准。
- zoom 限制在项目 `cameraBounds` 内；中心点以场景边界钳制，避免出现无图黑边。
- 没有 `focusRect` 的三级节点不得进入发布 Catalog manifest，编辑器仍可提示需要配置。
- 本阶段不改 Atlas、HTML Scene 通信、Catalog 转场视频或 F10 URL 配置协议。

## 验收与测试

- 分类共享镜头下的多个三级节点背景完全一致；开启其中一项覆盖后，其他项不受影响。
- 在任意 zoom、中心点和 focusRect 下，聚焦框的清晰内容与背景中同一原图区域一致。
- 选中项变化时虚线终点落在对应右栏条目的分割线，且不穿透顶部导航、底部提示或 Atlas 按钮。
- 编辑 / 预览切换共享选择和相机数据；预览不显示编辑控件。
- Atlas URL 配置后，编辑态、预览态和发布态均可见右下跳转图标并触发既有 `atlaslaunch` / F10 流程。
- 覆盖数据继承、投影计算、虚线几何和预览模式分别具备单元或 DOM 测试；全量测试、类型检查、Admin 构建通过。
