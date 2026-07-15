# Atlas 内容配置、埋点与 Catalog F10 跳转设计

## 概述

本文定义一轮小范围功能收口，服务于双产物架构中的 Atlas 与 Catalog。

范围仅包含：

- 移除项目、编译产物、运行时与编辑器中的 item tags 遗留；
- 在 Atlas 编辑器中配置底部卡片所使用的标题、说明与排序；
- 暴露并接通项目级埋点配置；
- 为 Catalog 配置线上 Atlas 完整 URL，并通过 F10 打开。

明确不在本轮范围内：Callout 连接参数、Catalog 转场视频、Catalog 整体 UI 还原、股票跳转、旧 HTML bridge、AIGC 与通用节点/边模型。

## 架构与数据模型

### Item 内容

`IndustryItem` 保留以下 Atlas 卡片内容：

- `title`
- `description`
- `order`

删除可选 `tags` 字段，并同步删除 Atlas/Catalog manifest 的 tags 投影和所有 runtime 标签渲染。旧项目 JSON 中的未知 `tags` 在下一次读取、保存或发布时不再进入规范化模型；本轮不提供兼容迁移。

`description` 允许为空字符串，但运行时不得补入项目无关的占位文案。空值按空内容渲染。

### Catalog 打开 Atlas

在 `CatalogProductConfig` 中新增：

```ts
atlasLaunchUrl?: string
```

它是每个项目唯一的、由运营直接填写的完整线上 Atlas URL。该字段仅属于 Catalog 产品配置，编译到 Catalog manifest；Atlas manifest 不包含它。

Catalog runtime 不依赖 F10 全局对象，只发出 `atlaslaunch` 产品语义事件。浏览器宿主监听该事件并负责环境相关动作：

1. 若 F10 `F10Utils.jumpTofullScreenPage(url)` 可用，调用它；
2. 否则以新窗口打开同一 URL；
3. 空 URL 时不渲染入口，且不触发跳转。

这使后续 Catalog UI 整体重建时可以复用同一行为，不把宿主平台逻辑塞进产品 runtime。

### 埋点

复用既有 `ProjectIntegrations.analytics`，不新增第二套配置。项目设置页暴露：

- enabled
- provider
- profileId
- pageType
- contentName
- defaultSource
- dimensions

发布态 Atlas/Catalog 入口以 manifest 的 integrations 初始化 `AnalyticsAdapter`，将 runtime 的 expose、click、share、stay 事件转换为 provider 事件。初始化事件由宿主在 runtime mount 成功后发出。事件参数以项目 integrations 为基线，并附加 product、目标类型、目标 ID、停留时间或分享渠道等运行时维度。

## 编辑器与运行时流程

### Atlas Item Inspector

Item Inspector 接收 `onPatchKnowledge`，而不再只接收 `onPatchPanorama`。面板新增：

- 标题输入；
- 说明多行输入；
- 排序数值输入。

Marker、Callout 与 zoom 阈值维持原有编辑与保存链，不改变其数据结构。知识内容变更与空间变更共用 Atlas Editor 当前的 revision 串行保存机制。

### 项目设置

项目设置页新增“埋点”独立区块：

- “埋点”：编辑 `integrations.analytics`；

`products.catalog.atlasLaunchUrl` 由 Catalog 编辑器的项目级配置面板编辑，和其它 Catalog 产品配置使用同一 revision 保存链路。

两个配置入口分别走已有的 integrations / catalog 配置更新 API，并遵守 `x-expected-revision` 乐观锁。

### Catalog F10 入口

Catalog runtime 在 `atlasLaunchUrl` 非空时渲染一个带稳定 test id 的右下入口。该入口不改变现有 Catalog 列表或全景行为，仅发射 `atlaslaunch`。产品 shell 负责 F10 调用和浏览器降级打开。

## 错误处理

- `atlasLaunchUrl` 为空：隐藏入口；
- `atlasLaunchUrl` 非法：编辑器显示校验错误，发布级校验阻止发布；
- F10 不存在或调用抛错：使用浏览器新窗口降级；不加载或硬编码旧产物的外部 F10 CDN；
- analytics provider 失败：不得阻塞产品交互；
- 未配置 analytics：不创建 adapter，不请求外部脚本。

## 验收与测试

1. Atlas 编辑器修改 item 标题、说明和排序后，预览与发布态底部卡片一致；空说明不显示“暂无说明”。
2. `tags` 不再出现在领域类型、Zod schema、manifest、编译器、运行时和编辑器测试中。
3. 项目设置可保存并回读全部 analytics 字段；Atlas/Catalog runtime 的初始化、点击、分享、停留和 Atlas 跳转事件能进入 AnalyticsAdapter。
4. Catalog 编辑器可保存完整 Atlas URL；入口始终显示，有 URL 时发出 `atlaslaunch`，无 URL 时保持原版静态按钮且不跳转。
5. 有 F10 mock 时调用 `jumpTofullScreenPage(url)`；无 F10 时调用新窗口降级；两种情况均不影响 Catalog 其他交互。
6. 现有 Atlas hotspot、Callout、HTML Scene 和 Catalog route 行为回归通过；不新增 Catalog 转场视频相关测试。

## 实施边界

本设计不以旧通用图运行时为兼容目标。F10 只是 Catalog 宿主的跳转适配；HTML Scene 仍使用 SceneBridge v1.0.0，且不恢复旧 `targetOrigin: "*"` 或股票路由协议。

## 实施记录（2026-07-14）

- 已删除 `IndustryItem`、两份 manifest、编译器与 Atlas 卡片运行时中的 `tags`；空说明不再显示硬编码占位文案。
- Atlas Item Inspector 已提供标题、说明和排序编辑，空间定位与 Callout 参数保持原有结构。
- 已在项目设置页新增 WeBlog 埋点配置，并在两份发布态入口接通初始化、运行时语义事件及 HTML 场景顶部分享。
- Catalog 已在配置 URL 后渲染右下“打开全景图”入口；产品 shell 优先调用已注入的 `F10Utils` 或 `_f`，否则以新窗口打开同一 URL。
- 自动测试覆盖 URL schema/manifest 投影/运行时入口、F10 优先与降级行为，以及埋点参数投影。
