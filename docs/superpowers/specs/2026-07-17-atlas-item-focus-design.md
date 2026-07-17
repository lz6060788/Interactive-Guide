# Atlas 三级节点聚焦语义修复设计

## 问题

Atlas 点击 hotspot、callout 或底部卡片选择三级节点时，镜头曾优先采用 `ItemSpatialLayout.viewportOverride`。该字段实际用于 Catalog 的三级背景镜头构图，允许中心偏离三级 marker；在 2:1 全景图、竖屏 cover 投影和较高 zoom 下，偏差会被放大，导致选中的 callout 出现在屏幕边缘甚至屏幕外。

“封装设备”的 marker.x 为 `0.170414`，Catalog 背景镜头 centerX 为 `0.227629`。按截图纵横比和原 zoom 投影后，marker 约落在屏幕 `x = -38px`，与截图左侧露出的半个激活圆点一致。

## 目标行为

- Atlas 选择三级节点时，镜头目标中心始终取该节点的 `marker.x/marker.y`。
- Atlas 聚焦 zoom 直接复用该节点的有效“Callout 显示阈值”。
- 有效阈值的解析顺序与显示逻辑保持一致：
  1. `item.callout.minZoom`
  2. `manifest.config.theme.calloutMinZoom`
  3. 默认值 `2`
- Catalog 继续独立使用 `viewportOverride` 编排背景镜头，Atlas 不再消费或输出该字段。

## 统一选择入口

以下入口全部调用同一个 Atlas item 聚焦函数：

- 点击 category hotspot 后默认选择首个三级节点。
- 点击三级 callout。
- 点击底部卡片。
- 打开目标为 panorama item 的体验路由。

聚焦函数只负责生成：

```ts
{
  centerX: item.marker.x,
  centerY: item.marker.y,
  zoom: resolveEffectiveCalloutMinZoom(item),
}
```

高亮状态、抽屉状态和卡片平滑滚动继续沿用现有逻辑。

## 数据与编辑器边界

- Atlas manifest 的 `AtlasItemEntry` 删除 `viewportOverride`，Atlas compiler 不再从项目数据复制该字段。
- `panorama.items[itemId].viewportOverride` 保留为 Catalog 背景镜头配置，不改变 Catalog compiler、编辑器或运行时。
- Atlas 分类 Inspector 中独立的 `callout zoom` 配置入口删除，避免继续配置不再生效的第二套聚焦倍率。
- 项目域中遗留的 `CategorySpatialLayout.activationZoom` 不再进入 Atlas manifest；本轮从类型、schema、normalizer、bootstrap 和现有项目数据中删除，避免形成无效配置。

## 相机边界

现有 `clampPanoramaCamera` 继续禁止镜头超出图片边界。marker 距离原图边缘过近、且 Callout 显示阈值较小时，数学上的屏幕正中心可能无法达到；此时相机会停在最接近中心的合法位置。marker 必须仍位于屏幕范围内，不允许通过露出黑边换取强制居中。

## 验收

- “封装设备”卡片聚焦后不再使用 Catalog 的背景中心，marker/callout 保持在屏幕内。
- hotspot 默认首项、callout、底部卡片和 panorama item 路由得到相同的 marker 中心与 zoom。
- 节点级 Callout 显示阈值优先于全局阈值；两者都不存在时使用 `2`。
- Atlas manifest 不包含 item `viewportOverride` 或 category `activationZoom`。
- Catalog 的 `viewportOverride` 行为、背景动画和聚焦区域不变。
- 全量测试、类型检查、Server/Admin 构建和 ES5 产物校验通过。
