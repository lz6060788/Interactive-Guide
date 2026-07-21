# Catalog 与 Atlas 运行时动效修复设计

## 范围

本轮只处理三个运行时差异：Catalog marker 中心圆变形、Catalog 背景与聚焦框动画视差、Atlas 底部卡片切换瞬时滚动。

## Catalog marker 圆形约束

- marker 按钮清除浏览器默认外观与 padding，并使用 `border-box`。
- 中心圆点恢复旧版的 `min-width/min-height`、`flex: 0 0 auto` 和 `aspect-ratio: 1/1`。
- 激活与非激活尺寸仍分别为 `11px` 和 `9px`。

## Catalog 场景动画同步

- 背景原图层、模糊层和聚焦框共用同一个 `requestAnimationFrame` 时间线。
- 动画统一使用 520ms 与 `cubic-bezier(0.22, 1, 0.36, 1)` 对应的 easing。
- 每帧先计算唯一的实时 scene geometry，再同时更新背景图层和聚焦框内部背景；两层不得分别依赖 CSS transition 与 JavaScript 插值。
- 聚焦框边界和虚线连接继续在同一帧更新。
- 初次渲染直接落在目标位置，不播放入场动画。

## Atlas 卡片平滑滚动

- 保留当前卡片精确居中目标值和边界钳制。
- 程序化切换卡片时使用 `scrollTo({ behavior: 'smooth' })`。
- 保留旧版 420ms 滚动同步锁，避免平滑滚动过程中反向触发卡片选择。
- 用户主动拖动列表时仍由现有最近卡片逻辑接管。

## 验收

- Catalog 激活 marker 的内外两层在各浏览器中均保持正圆。
- 切换具有不同 viewport 的三级节点时，聚焦框内清晰图像与背景同一位置逐帧一致。
- 聚焦框和虚线仍平滑移动，无瞬移或断连。
- Atlas 点击 hotspot、callout 或卡片引起的程序化居中滚动具有平滑动画。

## 实施结果（2026-07-15）

- Catalog marker 按钮已清除浏览器默认 padding，并为内外圆增加不可压缩的正方形尺寸约束。
- Catalog 原图、模糊背景、marker、聚焦框内部图像和虚线连接现由同一个 520ms rAF 时间线更新；中间帧测试验证了背景与聚焦框的坐标关系逐帧一致。
- Atlas 卡片居中滚动已从 `auto` 恢复为旧版 `smooth`，420ms 同步锁保持不变。
- 完整测试 187/187 通过，TypeScript、Server/Admin 构建均通过；ESLint 为 0 错误、11 个既有警告。
- Atlas revision 21 预览：`http://localhost:8788/api/projects/memory-chip-industry-chain/previews/atlas/builds/atlas-1784122799304-21/index.html`。
- Catalog revision 21 预览：`http://localhost:8788/api/projects/memory-chip-industry-chain/previews/catalog/builds/catalog-1784122801185-21/index.html`。
- 两份预览入口和脚本均返回 HTTP 200，脚本通过 ES5 语法校验；两份 HTML 标题与共用资料来源文案也已同步验证。
