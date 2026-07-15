# Catalog 聚焦框固定圆角设计

## 目标

Catalog 发布运行时和编辑器实时预览中的清晰聚焦矩形统一使用 `12px` 圆角，与旧版产物的视觉效果保持一致。

## 实现约束

- 圆角属于 Catalog 产品视觉常量，不再从 `focusRect.radius` 计算。
- `focusRect` 的位置、宽高、遮罩透明度和切换动画保持不变。
- `focusVariant: pill` 仍使用半高胶囊圆角；其他模式固定为 `12px`。
- 编辑器实时预览继续复用 `CatalogScene`，因此自动获得相同圆角。
- 完整原图上的红色作者工具框只用于配置范围，不属于发布态视觉，本次不修改。
- 不修改项目数据、Schema、编译 manifest 或现有项目实例。

## 验收

- 默认 Catalog 运行时的 `catalog-focus-window` 为 `border-radius: 12px`。
- 编辑器实时预览与独立 Catalog 产物一致。
- 胶囊主题行为保持不变。
- 聚焦框位移动画、清晰图层对位和虚线连接不受影响。

## 实施结果（2026-07-15）

- `CatalogScene` 的普通聚焦框已统一为固定 `12px` 圆角；配置中的 `focusRect.radius` 不再影响该视觉值。
- 虚线连接起点复用旧版公式，从圆角弧线的 45° 切点向外偏移 `1.5px`，并随聚焦框动画逐帧更新。
- `pill` 主题继续使用聚焦框短边的一半作为圆角。
- Catalog 运行时测试 11/11、完整测试 186/186 和 TypeScript 类型检查均通过。
- revision 21 验收预览：`http://localhost:8788/api/projects/memory-chip-industry-chain/previews/catalog/builds/catalog-1784119383207-21/index.html`。
- 预览入口和脚本均返回 HTTP 200，脚本通过 ES5 语法解析校验。
