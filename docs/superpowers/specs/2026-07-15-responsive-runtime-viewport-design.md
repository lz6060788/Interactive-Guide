# 响应式运行时视口设计

## 背景

当前 Atlas 与 Catalog 的独立 HTML 产物把 `products.*.viewport` 中的默认值
`375 × 808` 同时当作编辑设计尺寸和运行时 CSS 尺寸。导出的页面因此只在屏幕中央
显示一个固定区域，无法随设备或外部 iframe 容器变化。

本次修改只改变运行时尺寸模型。`375 × 808` 仍是编辑器和新项目的默认设计基准，
不再控制导出页面的实际宽高。

## 已确认的行为

### 公共页面容器

- Atlas 与 Catalog 的 `html`、`body`、`#app`、产品壳和 runtime mount 均填满当前
  浏览器视口或 iframe 内容区域。
- 导出产物不再带固定宽高、页面外边距、圆角或用于模拟手机的投影。
- 页面禁止自身滚动，所有内容裁切在产品容器内。
- iOS 13 不依赖 `100dvh`。页面以百分比高度为主，并在可见视口变化、旋转和容器
  resize 时重新测量实际尺寸。

### Atlas

- 全景图使用 cover 投影填满整个 Atlas 容器，保持图片比例，不拉伸。
- 当前 camera、hotspot、item marker 和 callout 均基于容器实时宽高投影。
- 容器尺寸变化后重新约束当前 camera，并刷新全部投影层。
- 拖动、滚轮缩放和双指缩放继续可用。
- 无论初始状态、交互后还是 resize 后，图片四边都不能进入视口内部，不允许出现
  黑边或图片边界外区域。
- 顶层工具栏、底部提示、卡片抽屉、转场视频及 HTML scene overlay 都相对同一个
  全屏产品壳定位。

### Catalog

- Catalog 页面直接填满其宿主 iframe，不在运行时内部再创建一个正方形舞台。
- 1:1 是外部 iframe 容器的强约束；外部容器为 1:1 时，Catalog 自然获得等宽高的
  实际画布。
- Catalog 的背景镜头、聚焦框、marker、虚线、顶部导航、右侧列表、底部文案和
  Atlas 打开按钮都使用 runtime mount 的完整实际宽高计算。
- 运行时不使用 `min(width, height)` 二次裁出正方形区域。
- 容器 resize 后重新计算背景镜头及所有叠加层，保持它们使用同一套几何参数。

## 架构调整

### 产品壳

`createShellFrame` 不再接收产品 manifest 的 viewport。它只负责创建填满宿主的
产品壳和 runtime mount。Atlas/Catalog entry 继续共享这一实现。

独立 HTML 模板把根节点链路设为完整宽高并隐藏溢出。运行时不得通过读取 manifest
恢复固定尺寸。

### Atlas 布局刷新

Camera 增加显式的布局刷新入口：读取挂载元素的新 `clientWidth/clientHeight`，对当前
viewport 重新执行 `clampPanoramaCamera`，然后通知 AtlasRuntime 重算 panorama layer、
marker 和 callout。

AtlasRuntime 负责监听容器尺寸。优先使用 `ResizeObserver`；不支持时使用 window resize
和 orientation change 作为 iOS 13 兼容路径。销毁 runtime 时必须解除监听。

### Catalog 几何

CatalogRuntime 的根元素使用 `width: 100%` 和 `height: 100%`。CatalogScene 的几何基准
从内部正方形改为完整容器矩形。背景图片仍保持自身比例，通过 camera viewport 决定
放大和偏移，聚焦框、marker 和虚线共享同一个计算结果。

## 边界与失败处理

- 容器宽高临时为零时不使用 `375 × 808` 伪造运行时布局；保留当前状态并等待下一次
  有效 resize。
- 图片自然尺寸仍是投影比例的来源。资源加载失败继续沿用现有显式错误流程，不增加
  占位图或合成数据。
- 已生成的 preview build 是不可变静态文件，不会自动获得修复；修改完成后必须重新
  生成 Atlas 与 Catalog 预览。

## 验收

- Atlas 在 `375 × 808`、`390 × 844`、`844 × 390`、`1440 × 900` 下填满容器。
- Atlas 在最小/最大 zoom、四个方向极限拖动及 resize 后均不出现黑边。
- Atlas 的 marker、callout、抽屉和顶层 chrome 在 resize 后保持对齐。
- Catalog 在外部 1:1 iframe 中完整填满 iframe，不存在内部二次正方形或固定
  `375 × 808` 区域。
- Catalog 在容器 resize 后背景、marker、聚焦框、虚线及右侧列表保持一致。
- 重新导出的 JavaScript 继续通过 ES5 语法校验，并满足 iOS 13 目标。

## 非目标

- 不修改编辑器中的默认 `375 × 808` 配置和编辑画布尺寸。
- 不更改知识结构、坐标数据、产品 manifest 或 HTML scene 通信协议。
- 不为不同设备生成多套 manifest 或多套 HTML。
