# Atlas F10 分享与 WeBlog 四事件对齐设计

## 1. 背景与目标

当前双产品运行时把项目语义事件统一转换为通用 analytics 事件，再尝试调用 `window.weblog.track`。该实现没有调用 `weblog.setConfig`，没有项目级 `appKey`，事件 ID、action、logmap 和停留时长语义也与产业链页面的正式需求不一致。当前分享主要依赖浏览器 `navigator.share`，Atlas 全景图、HTML Scene 和 Catalog 的宿主分享并未统一复用旧版 F10 分享链路。

本次重构目标是：

- 仅 Atlas 上报 WeBlog；Catalog 不加载或调用 WeBlog。
- WeBlog 只能产生页面曝光、页面停留、分享点击、分享回流四类事件。
- 项目通过 `appKey` 配置 WeBlog，并在上报前调用 `weblog.setConfig`。
- Atlas 全景图和 HTML Scene 顶部分享统一优先调用客户端 `F10Utils.shareUrlCard`。
- Catalog 右下 Atlas 入口继续调用 `F10Utils.jumpTofullScreenPage(url)`，并具备和旧版一致的延迟加载与浏览器降级能力。
- 项目配置、编辑器、manifest 和运行时使用同一份参数，不再硬编码“商业航天”等实例内容。

不在本次范围内：hotspot、callout、卡片、路由或 Atlas 跳转点击埋点；Catalog 埋点；股票跳转；旧数据兼容。

## 2. 已确认的旧版基准

旧 Atlas 产物：

`C:\Users\91252\Downloads\guide_surface_validation_001-1782466434483\guide_surface_validation_001-1782466434483`

旧 Catalog 产物：

`C:\Users\91252\Downloads\guide_surface_validation_001-panorama-1781614822903 - 副本\guide_surface_validation_001-panorama-1781614822903 - 副本`

客户端依赖基准：

- `@king-fisher/bridge` 0.6.0
- `@king-fisher/falcon` 0.5.26-zcp-692-snapshot
- `thsc-f10-utils` 1.6.3；已确认同时提供 `shareUrlCard` 和 `jumpTofullScreenPage`
- WeBlog 0.0.8：`https://s.thsi.cn/cd/weblog/0.0.8/weblog.js`

旧 Atlas 中的停留事件仍使用旧 ID、旧 action 和 1/2 计数值。本次以最新业务需求为准，不复制该旧格式。

## 3. 配置契约

### 3.1 AnalyticsConfig

`ProjectIntegrations.analytics` 调整为：

```ts
interface AnalyticsConfig {
  enabled: boolean
  provider: 'weblog'
  appKey: string
  pageType: string
  name: string
  defaultSource: string
}
```

规则：

- `enabled: true` 时其余字段全部必填且不得为空。
- 删除 `profileId`、`contentName` 和 `dimensions`。
- `appKey` 只用于 `weblog.setConfig`，同时不重复放入事件 logmap。
- `pageType` 对当前产业链项目配置为 `visindustry`。
- `name` 是项目实例属性，对当前项目配置为“存储芯片产业链”。
- `defaultSource` 是 URL 未携带有效 `source` 时的项目级值，对当前项目配置为 `industry`。
- 现有 `profileId: ce19ea099b` 迁移为 `appKey: ce19ea099b`，不保留兼容字段。

项目设置页的埋点面板同步暴露启用开关、App Key、页面类型、产业链名称和默认来源。保存仍使用 integrations revision lock。

### 3.2 ShareConfig

沿用并真正接通现有项目级配置：

```ts
interface ShareConfig {
  enabled: boolean
  title?: string
  description?: string
  imageAssetId?: string
}
```

项目设置页增加分享配置面板。标题未配置时使用真实项目标题；描述未配置时使用最终分享标题。`imageAssetId` 必须引用项目内图片资源，若配置则解析为发布产物中的实际资源 URL。

## 4. 模块边界

### 4.1 AtlasPageTracker

在 platform analytics 层新增 Atlas 专用页面追踪器。它只提供：

- `start()`：加载并配置 WeBlog、上报一次页面曝光、检查一次回流、启动可见停留计时。
- `reportShareClick()`：上报一次分享点击。
- `destroy()`：清理监听器和计时器，不补报不足 5 秒的尾数。

它不接受 category、item、scene 或 route 语义事件。原有通用 runtime analytics 到 WeBlog 的映射从产品 Shell 中移除，确保四事件白名单之外没有上报出口。

WeBlog 加载流程：

1. 优先使用宿主已经注入的 `window.weblog`。
2. 不存在时只创建一个共享 Promise，动态加载 WeBlog 0.0.8。
3. SDK 可用后调用 `weblog.setConfig({ appKey, debug: false })`。
4. 只有 `weblog.report` 存在时发送事件；SDK 加载或调用失败不得阻塞页面与分享。

### 4.2 F10HostAdapter

在 platform 层建立共享宿主适配器，负责：

- 解析 `window.F10Utils` 或兼容别名 `window._f`。
- 必要时按顺序准备 `@king-fisher/bridge`、`@king-fisher/falcon` 和 `thsc-f10-utils`。
- `shareUrlCard(payload)`。
- `jumpTofullScreenPage(url)`。
- 客户端能力不存在或调用失败时执行浏览器降级。

用户提供的两个 King Fisher UMD 包按确认版本纳入仓库并进入构建产物，不能依赖下载目录。第三方代码保持隔离，不进入领域层或产品运行时。F10Utils 采用按需异步加载，不阻塞 Atlas/Catalog 首屏。

## 5. 四类埋点契约

### 5.1 页面曝光

Atlas manifest 加载且 runtime 挂载成功后上报一次：

```js
{
  id: 'ths_f10_f10detail',
  action: 'show',
  logmap: {
    stock: '',
    marketId: '',
    pageType,
    name,
    source,
    modId: ''
  }
}
```

不得再发送相同 ID 的 `action: click`。

### 5.2 分享点击

用户点击顶部分享按钮、正式发起分享动作之前上报：

```js
{
  id: 'ths_f10_f10detail_module_share',
  action: 'click',
  logmap: {
    stock: '',
    marketId: '',
    pageType,
    name
  }
}
```

用户随后取消客户端分享也不撤销该事件。同一次按钮点击不得由 Atlas runtime 和 HTML Scene host 重复上报。

### 5.3 分享回流

分享 URL 使用 `URL` API写入 `from=share`，保留既有 query 和 hash。Atlas 启动时检测当前 URL；仅当 `from=share` 时上报一次：

```js
{
  id: 'ths_f10_f10detail_module_backflow',
  action: 'click',
  logmap: {
    stock: '',
    marketId: '',
    pageType,
    name
  }
}
```

普通打开、Catalog 跳转 Atlas 或没有回流标记的地址不报。

### 5.4 页面停留时长

只累计 `document.visibilityState !== 'hidden'` 的时间。累计可见时长每跨过一个新的 5 秒节点立即上报一次：

```js
{
  id: 'ths_f10_f10detail_page_stayTime',
  action: 'show',
  logmap: {
    pageType,
    name,
    source,
    value: 1 // 后续依次为 2、3……
  }
}
```

`value` 是数字类型的完整 5 秒区间序号，即 `Math.floor(累计可见毫秒 / 5000)`。页面隐藏时暂停，恢复可见后继续累计。停留 4 秒不报；8 秒只报 `1`；11 秒依次报 `1`、`2`。`visibilitychange` 和 `pagehide` 只负责结算已经跨过但尚未发送的完整节点，不补报尾数。

### 5.5 source 解析

每次事件发送时从当前 URL 查询参数读取 `source`，去除首尾空白；存在非空值则使用，否则使用项目 `defaultSource`。该规则适用于页面曝光和停留事件。分享与回流事件按业务契约不携带 source。

## 6. 分享链路

Atlas 全景图顶部分享与 HTML Scene 顶部分享统一调用产品 Shell 注入的同一个分享控制器：

1. 调用 `AtlasPageTracker.reportShareClick()`。
2. 生成带 `from=share` 的当前页 URL。
3. 由 `integrations.share` 和项目标题生成分享 payload：`title`、`text`、`content`、`description`、`url`、`shareUrl`；配置图片时附带 F10 支持的图片字段。
4. Falcon/F10 环境优先调用 `F10Utils.shareUrlCard(payload)`。
5. F10 能力不可用或调用抛错时，由调用层 `catch` 调用 `navigator.share`。
6. `navigator.share` 不支持或再次抛错时复制分享 URL。

`share.enabled !== true` 时不执行分享动作；顶部分享按钮的显示状态与该配置保持一致。

Catalog 默认全景场景没有顶部分享工具栏。Catalog HTML Scene 若显示共享宿主工具栏，则复用 F10 分享适配器，但不创建 AtlasPageTracker，因此不会产生 WeBlog 分享事件。

## 7. Catalog 打开 Atlas

当前项目配置更新为：

```json
{
  "products": {
    "catalog": {
      "atlasLaunchUrl": "http://o.thsi.cn/datav.narrative-vision/interactive-guide/memory-chip-industry-chain-atlas/0.1.0/index.html"
    }
  }
}
```

独立 Catalog 运行时点击右下按钮后，产品 Shell 调用共享 `F10HostAdapter.jumpTofullScreenPage(url)`。优先使用或按需加载 `F10Utils.jumpTofullScreenPage`；能力不存在或调用抛错时，由调用层 `catch` 使用 `window.top.open`，再降级为 `window.open`。编辑器内部预览继续使用新窗口，不模拟客户端宿主。

该 Atlas URL 只能保存在项目实例属性中，不能硬编码进 Catalog runtime、编辑器或 F10 适配器。

## 8. 构建与兼容性

- 新增的自有 TypeScript 代码继续通过现有 Babel 流程降级为 ES5 语法，目标运行环境仍为 iOS 13。
- King Fisher 使用其已构建 UMD web 版本，不引入 Hummer 版本。
- Atlas/Catalog 独立产物不引用开发机绝对路径。
- WeBlog 和 F10Utils 是宿主服务能力，允许按旧版方式从固定 CDN 加载；业务项目资源仍保持独立发布。
- SDK 失败只能影响上报或客户端分享/跳转，不得造成白屏或阻断编辑器预览。

## 9. 验收标准

1. 开启 Atlas 埋点时调用一次 `weblog.setConfig({ appKey: 'ce19ea099b', debug: false })`；Catalog 从不调用。
2. Atlas 的 WeBlog mock 只能收到本设计中的四种 ID/action 组合，不出现 category/item/route 等通用事件。
3. 曝光只报一次；`from=share` 回流只报一次。
4. 可见停留 4/8/11 秒分别收到 0、数字 `1`、数字 `1 + 2`；隐藏时间不计入。
5. Atlas 全景图与 HTML Scene 分享均先上报分享点击，再调用 `F10Utils.shareUrlCard`；分享 URL 包含 `from=share`。
6. F10 不存在或抛错时，分享和 Catalog 跳转均由调用层 `catch` 执行浏览器降级，页面其他交互正常。
7. Catalog 右下按钮使用项目配置的完整 Atlas URL，并调用 `F10Utils.jumpTofullScreenPage`。
8. 项目设置可保存、回读 appKey/pageType/name/defaultSource 以及分享配置。
9. Atlas 与 Catalog 的独立产物继续通过 ES5 语法校验，并能在普通浏览器预览。

## 10. 实施结果（2026-07-15）

本设计已经落地：

- 领域层和项目设置页均已切换到 `appKey/pageType/name/defaultSource`，并新增项目级分享配置入口。
- Atlas 使用专用 `AtlasPageTracker`，运行时代码中只有本设计约定的四个事件 ID；Catalog manifest 与 `app.js` 均不包含 analytics/WeBlog 代码。
- Atlas 全景图与 HTML Scene 共用 `ProductShareController` 和 `F10HostAdapter`；Catalog 右下入口也复用同一适配器调用 `jumpTofullScreenPage`。
- `@king-fisher/bridge` 0.6.0 与 `@king-fisher/falcon` 0.5.26-zcp-692-snapshot 以隔离 UMD vendor 形式进入两份独立产物，F10Utils 1.6.3 和 WeBlog 0.0.8 按需加载。
- 静态构建继续执行 ES5 语法解析校验。完整测试结果为 178/178 通过，TypeScript 类型检查和 ESLint 均无错误。

存储芯片项目 revision 13 的验收预览：

- Atlas：`http://localhost:8788/api/projects/memory-chip-industry-chain/previews/atlas/builds/atlas-1784114357897-13/index.html`
- Catalog：`http://localhost:8788/api/projects/memory-chip-industry-chain/previews/catalog/builds/catalog-1784114328229-13/index.html`

产物核对结果：Atlas 使用 `appKey: ce19ea099b`、`pageType: visindustry`、`name: 存储芯片产业链`、`defaultSource: industry`；Catalog 使用项目配置的完整 Atlas 线上地址，且两份预览入口均返回 HTTP 200。
