# 响应式运行时视口实施计划

## 目标

让新生成的 Atlas 与 Catalog 独立 HTML 产物填满实际浏览器视口或 iframe 容器，
同时保持编辑器中的 `375 × 808` 默认设计基准不变。

## 阶段 1：共享产品壳

- 调整独立 HTML 根节点样式，使 `html/body/#app` 完整填满宿主并隐藏页面滚动。
- 移除 `createShellFrame` 的 manifest viewport 参数和手机模拟外观。
- Atlas/Catalog entry 统一使用响应式共享产品壳。

## 阶段 2：Atlas

- AtlasRuntime mount 改为 `100% × 100%`。
- Camera 增加容器布局刷新 API。
- AtlasRuntime 监听宿主 resize，重新 clamp camera 并刷新 panorama、marker、callout。
- destroy 时释放 observer 或 resize/orientationchange 监听器。
- 以既有 cover projection 和 camera clamp 保证图片边界不进入视口。

## 阶段 3：Catalog

- CatalogRuntime mount 改为 `100% × 100%`。
- CatalogScene 使用完整容器宽高作为画布，不再以 `min(width,height)` 创建内部正方形。
- 背景使用 cover 几何，camera、focusRect、marker 和 connector 共用同一几何结果。
- 监听容器 resize 并重新渲染全部几何层。

## 阶段 4：验证与交付

- 更新共享壳、Atlas camera/runtime、Catalog runtime 的测试。
- 运行类型检查、相关测试、完整测试和 ES5 语法校验。
- 更新阶段开发文档和索引。
- 重启 8788 服务时只结束该端口 PID。
- 为 demo 重新生成 Atlas/Catalog preview，并记录新的预览地址。
