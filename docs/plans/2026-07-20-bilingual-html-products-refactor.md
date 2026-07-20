# Atlas / Catalog 双语 HTML 产物改造方案

> 日期：2026-07-20
> 状态：首阶段开发完成
> 目标版本：GuideProject 3.0.0、Atlas/Catalog Manifest 2.0.0、SceneBridge 1.0.0（兼容扩展）
> 适用范围：工作台、领域模型、Atlas/Catalog 编译器与运行时、草稿预览、原子发布

## Overview

### 1. 背景

当前系统以单个 `project.json` 为事实源，一次发布原子生成两份独立 HTML 产物：

```text
release/{projectId}/{version}/
├── atlas/
│   ├── index.html
│   ├── app.js
│   └── manifest.json
└── catalog/
    ├── index.html
    ├── app.js
    └── manifest.json
```

现有 `GuideProject 2.0` 和两类 Manifest 虽然都包含单一 `locale`，但项目标题、阶段标签、分类标题、条目标题与描述、场景标题、产品提示语、分享文案均为单值字符串。HTML Shell 还固定输出 `<html lang="zh-CN">`，宿主工具栏、说明弹窗、Atlas 卡片、Catalog 跳转按钮中也存在中文硬编码。因此，当前产物只能表达一种语言，不能在同一份 Atlas 或 Catalog 中切换中英文。

### 2. 改造目标

- 单个 `project.json` 同时保存中文 `zh-CN` 和英文 `en-US` 内容，继续作为唯一事实源。
- 一次发布仍只生成 Atlas、Catalog 两份独立 HTML；每份产物同时包含中英文，不拆成四份产物。
- 两份产物均可按 URL 参数加载中文或英文；语言切换允许刷新当前页面或进入另一入口页面，不要求保留运行时交互状态。
- 两个平台可分别固定投放中文 URL 与英文 URL；Catalog 跳转 Atlas、分享和 HTML Scene 必须继续传递当前语言。
- 工作台可按语言录入和预览内容；发布校验以精确字段路径报告缺失译文。
- 草稿允许英文尚未完成；当项目启用英文发布时，发布校验必须阻止缺失翻译进入正式产物。
- 保持严格三阶段顺序、标准化坐标、revision 乐观锁、静态自包含和双产品原子发布等既有约束。

### 3. 非目标

- 本次不把工作台自身的操作界面整体国际化；工作台 UI 可继续使用中文，但必须能编辑中英文业务内容。
- 不提供机器翻译、AI 补全或伪造英文占位内容，所有译文由操作员提供。
- 不为中英文复制两套知识树、坐标、路由或场景绑定。
- 不自动翻译图片、视频或第三方 HTML Scene 内部的文字。
- 不提供图片或视频的中英文资源变体；当前媒体资源均不包含文字，所有语言共用同一份资产。
- 不改变 Atlas 与 Catalog 的产品边界，也不改变发布目录的双产品结构。

## Architecture

### 4. 核心决策

#### 4.1 一份双语产物，而不是按语言拆包

推荐结构：

```text
project.json（中英文 + 共享结构/空间数据）
             │
       原子双产品编译
        ┌────┴────┐
        ▼         ▼
  atlas/       catalog/
  双语 HTML     双语 HTML
```

原因：

- 与现有“一次发布、两个产品”的架构一致。
- 语言切换仍使用同一份产物，可通过更新 `lang` 参数并刷新页面完成，离线 ZIP 与静态托管仍可用。
- Atlas 与 Catalog 共享同一语言解析规则，Catalog 跳转 Atlas 时只需传递 `lang`。
- 发布仍是一个原子操作，不引入四套目录的组合一致性问题。

#### 4.2 内容、结构与空间数据分离

- 多语言内容：标题、描述、提示语、分享文案、场景显示名。
- 语言无关结构：`id`、`categoryId`、`itemIds`、`order`、三阶段 `key`、experience binding、navigation route。
- 语言无关空间数据：viewport、marker、hotspot、focusRect、zoom 阈值。
- 语言无关技术配置：asset id、SceneBridge message type、analytics 标识、主题和交互参数。

切换语言只改变显示文本，不复制或改变业务结构和媒体资源。

#### 4.3 采用字段级 `LocalizedText`

不建议保留“中文主字段 + 独立英文覆盖树”，因为它会造成两种数据访问方式、默认语言改动困难，以及字段新增时漏接翻译。改造后所有可本地化字段统一使用同一种类型：

```ts
type LocaleCode = string
type LocalizedText = Partial<Record<LocaleCode, string>>

interface LocalizationConfig {
  defaultLocale: LocaleCode
  supportedLocales: LocaleCode[]
}
```

草稿态允许 `LocalizedText` 缺少非默认语言；正式发布对所有 `supportedLocales` 做完整性校验。运行时不对缺失字段做逐字段兜底，也不生成占位内容。

该变更会把现有 `string` 字段改为对象，属于破坏性领域契约变更，因此建议升级为 `GuideProject 3.0.0`，不要在 `2.0.0` 下静默扩展。

### 5. GuideProject 3.0 数据模型

#### 5.1 顶层配置

```json
{
  "schemaVersion": "3.0.0",
  "id": "memory-chip-industry-chain",
  "title": {
    "zh-CN": "存储芯片产业链",
    "en-US": "Memory Chip Industry Chain"
  },
  "version": "1.0.0",
  "localization": {
    "defaultLocale": "zh-CN",
    "supportedLocales": ["zh-CN", "en-US"]
  }
}
```

约束：

- 首期工作台只开放 `zh-CN`、`en-US`，底层类型保留以后增加 BCP-47 locale 的能力。
- `defaultLocale` 必须出现在 `supportedLocales` 中。
- `supportedLocales` 去重且顺序稳定；编译结果沿用该顺序。
- 新建项目默认只启用 `zh-CN`。操作员完成英文录入后再启用 `en-US`，避免迁移后立即阻塞已有项目发布。

#### 5.2 需要本地化的项目字段

| 区域 | 字段 | 处理方式 |
|---|---|---|
| 项目 | `title` | 改为 `LocalizedText` |
| 阶段 | `knowledge.stages[].label` | 改为 `LocalizedText`，发布时仍校验固定中英文标签 |
| 分类 | `title`、`description` | 改为 `LocalizedText` |
| 条目 | `title`、`description` | 改为 `LocalizedText` |
| HTML Scene | package/view `title` | 改为 `LocalizedText` |
| Atlas/Catalog | `hintText` | 改为 `LocalizedText` |
| 分享 | `title`、`description` | 改为 `LocalizedText` |

以下字段不本地化：

- `id`、`key`、`order`、`categoryId`、`itemIds`。
- SceneBridge 的 `type` 与 payload key。
- analytics 的 `appKey`、`pageType`、事件名和默认来源标识，避免切换语言后产生两套统计口径；事件属性中新增 `locale`。
- 布局、主题、交互、坐标和路由。

固定阶段标签为：

| key | zh-CN | en-US |
|---|---|---|
| `upstream` | 上游 | Upstream |
| `midstream` | 中游 | Midstream |
| `downstream` | 下游 | Downstream |

#### 5.3 媒体资源

图片和视频不进入多语言模型。当前 panorama、share image 和 transition video 均不包含文字，中英文共用现有 `assetId` 与 asset closure：

- 不增加 `LocalizedAssetBinding`、`assetIdsByLocale` 等字段。
- 不复制图片或视频，不增加媒体翻译完整度校验。
- 编译器继续按现有引用关系收集一次资产，ZIP 自包含规则保持不变。
- 如果未来出现带文字媒体，应作为新的独立需求重新评审，不能在本次开发中提前扩展。

### 6. Atlas / Catalog Manifest 2.0

两类 Manifest 都携带完整语言配置和字段级多语言文本：

```json
{
  "schemaVersion": "2.0.0",
  "product": "atlas",
  "projectTitle": {
    "zh-CN": "存储芯片产业链",
    "en-US": "Memory Chip Industry Chain"
  },
  "localization": {
    "defaultLocale": "zh-CN",
    "supportedLocales": ["zh-CN", "en-US"]
  },
  "categories": [
    {
      "id": "wafer-materials",
      "title": {
        "zh-CN": "晶圆制造材料",
        "en-US": "Wafer Fabrication Materials"
      }
    }
  ]
}
```

编译器职责：

- 只投影产品实际需要的双语字段，不把编辑态状态写入 Manifest。
- 维持已有分类、条目、场景、路由的稳定排序。
- 按现有共享引用收集资产，不生成远程 URL、绝对路径或 `/api/` 地址。
- 对 `LocalizedText` 做稳定 key 排序，保证同一项目重复编译结果可比较。
- Atlas 与 Catalog 分别生成自己的 Manifest，但语言配置必须一致。

`release.json` 的 `schemaVersion` 可继续保持 `1.0.0`，因为 release envelope 和两个产品入口未改变；只需在产品 Manifest 层升级版本。

### 7. 运行时语言解析

统一在 platform 层增加无状态的 `resolveRuntimeLocale`，Atlas、Catalog、共享工具栏和 Scene Host 在页面启动时使用同一解析规则。初始语言优先级：

1. URL 查询参数 `?lang=zh-CN` 或 `?lang=en-US`。
2. 浏览器首选语言中第一个被项目支持的 locale。
3. 项目显式配置的 `defaultLocale`。

若 URL 指定了不支持的语言，回到项目 `defaultLocale`，并保留可诊断日志；字段本身缺少当前语言译文则视为构建缺陷，不在运行时逐字段回退。

页面按解析出的语言启动时必须：

- 更新 `document.documentElement.lang` 和 `document.title`。
- 以当前语言渲染 Atlas hotspot、callout、详情抽屉、面包屑、提示语和 aria label。
- 以当前语言渲染 Catalog 阶段、分类、条目详情、提示语和 aria label。
- 以当前语言渲染宿主工具栏、说明弹窗、返回/分享按钮等系统文案。
- 使用当前语言的分享 title/description，并在统计事件属性中附带 `locale`。

本次不要求运行时热切换和状态保持。若提供语言按钮，按钮通过更新 `lang` 参数刷新当前页面；两个投放平台也可直接固定使用各自的语言 URL。

共享系统文案不进入 `project.json`，而是在 platform 层维护受类型约束的字典，例如：

```ts
const RUNTIME_MESSAGES = {
  'zh-CN': { back: '返回', share: '分享', info: '提示信息' },
  'en-US': { back: 'Back', share: 'Share', info: 'Information' },
} as const
```

字典的 key 集合必须通过测试保持中英文完全一致。

### 8. HTML Shell

- 构建时用 `defaultLocale` 写入 `<html lang>` 和默认语言项目标题。
- 启动后由 `resolveRuntimeLocale` 根据实际选语更新 `lang` 与 `<title>`。
- 字体栈同时覆盖中文与拉丁字形，避免英文仍被中文字体优先渲染。
- 对写入 `<title>` 的默认语言文本继续做 HTML 转义。
- `index.html`、`app.js`、`manifest.json` 仍保持静态、自包含和 ES5 classic script 约束。

### 9. 语言切换入口

- 两个平台可分别投放 `index.html?lang=zh-CN` 与 `index.html?lang=en-US`，这是首选使用方式。
- 如需在产物内展示语言按钮，Atlas 与 Catalog 共用 `中 / EN` 控件；点击后更新 URL 并刷新页面，不要求热替换 DOM。
- 仅启用一种语言时不显示语言按钮；Scene overlay 复用宿主工具栏时显示同一语言状态。
- Catalog 打开独立 Atlas 时，在 `atlasLaunchUrl` 上合并当前 `lang` 参数，不覆盖原有 query/hash。
- 分享当前页面时保留 `lang`，确保接收者打开后看到分享者所用语言。

### 10. HTML Scene 协议

宿主无法自动翻译第三方 HTML Scene。为使“双语产物”语义完整，Scene 必须显式声明以下模式之一：

```ts
type SceneLocalizationCapability =
  | { mode: 'language-neutral' }
  | { mode: 'scene-bridge'; supportedLocales: LocaleCode[] }
```

SceneBridge 保持 `1.0.0`，对 `host:init` 做向后兼容的 payload 扩展：

- `host:init` payload 增加当前 `locale` 与 `supportedLocales`。
- 支持双语的 Scene 可根据初始化 locale 渲染自身 DOM 和 `<html lang>`。
- 页面切换语言时允许整体刷新，iframe 会重新初始化，因此本次不新增 `host:locale-change` event。
- 现有 Scene 可忽略新增字段并继续工作；语言中立场景无需额外资源变体。
- SceneBridge 的 `targetOrigin` 推导和禁止 `*` 的安全规则保持不变。

## Flow

### 11. 工作台编辑流程

工作台增加“内容编辑语言”，它属于编辑器 UI 状态，不改变知识树选择：

```text
选择项目语言（中文 / English）
          │
          ▼
同一 category/item id 的对应语言字段
          │
          ├── 保存：沿用当前逻辑分区 PUT + expected revision
          └── 预览：构建同一双语 Manifest，以 ?lang 指定初始语言
```

交互要求：

- Atlas Editor、Catalog Editor、项目设置页共享当前内容编辑语言。
- 切换编辑语言不丢弃未保存内容；若当前表单 dirty，先把本地 draft 按 locale 分槽保存，再切换显示。
- 左侧结构树、Inspector 标题/描述、项目标题、hintText、Scene 标题和分享文案均编辑当前语言值。
- 不复制分类/条目；新增、删除、排序和空间标注始终作用于同一个稳定 id。
- 每个分类和条目显示翻译状态：完成、缺少英文、缺少中文。
- 项目页显示总体完整度，例如 `English 54/63`，并可定位缺失字段。
- 草稿保存允许译文为空；不得自动写入中文、机器翻译或“待翻译”等占位符。
- 工作台界面语言与内容编辑语言解耦，本次工作台界面仍为中文。

建议新增独立接口：

```text
PUT /api/projects/:id/localization
body: { defaultLocale, supportedLocales }
```

知识、产品配置、Scene 和 integrations 中的本地化文本仍沿用各自现有逻辑分区更新接口及 revision 锁，不建立绕过并发控制的“翻译全量覆盖”接口。

### 12. 草稿预览流程

1. 编辑器保存当前 revision。
2. DraftBuildService 按现有流程构建一份 Atlas 或 Catalog 双语预览。
3. 预览 URL 使用 `index.html?lang=en-US` 指定初始语言。
4. 预览可通过切换 `lang` 参数并刷新页面检查文本溢出、布局和场景联动。
5. 下载 ZIP 与浏览器预览使用同一 Manifest 和运行时，不维护另一套预览实现。

### 13. 正式发布流程

```text
读取 project.json
      │
      ▼
GuideProject 3.0 shape 校验
      │
      ▼
双语完整度 + Scene 能力校验
      │
      ▼
临时目录依次构建 Atlas / Catalog
      │
      ▼
静态自包含 + ES5 + Manifest 双语一致性校验
      │
      ▼
原子 rename 为正式 release
```

任一语言、任一产品或任一可达 Scene 校验失败，整个发布失败，旧 release 保持不变。

### 14. 发布校验规则

新增错误码建议：

| 错误码 | 含义 |
|---|---|
| `LOCALE_DEFAULT_NOT_SUPPORTED` | defaultLocale 不在 supportedLocales |
| `LOCALE_DUPLICATED` | supportedLocales 存在重复项 |
| `TRANSLATION_MISSING` | 已启用语言缺少必填译文 |
| `TRANSLATION_BLANK` | 译文仅含空白字符 |
| `STAGE_LABEL_INVALID` | 固定三阶段的中英文标签不符合约定 |
| `SCENE_LOCALE_UNSUPPORTED` | 可达 Scene 不支持项目启用语言 |
| `MANIFEST_LOCALE_MISMATCH` | Atlas 与 Catalog 的语言配置不一致 |

必填翻译范围：项目标题、阶段标签、分类标题、条目标题、条目描述。分类描述、hintText、Scene 显示名、分享文案按原字段是否启用决定：字段存在或功能启用时，所有启用语言必须完整。

### 15. 兼容与迁移

#### 15.1 项目数据迁移

提供确定性迁移脚本 `2.0.0 -> 3.0.0`：

1. 将原 `locale` 作为 `localization.defaultLocale`。
2. 初始 `supportedLocales` 包含原 locale、`zh-CN` 与 `en-US`，便于工作台直接补录译文。
3. 将所有原字符串转换为 `{ [原 locale]: 原值 }`。
4. 保持所有 id、排序、坐标、asset id、路由和 revision 不变。
5. 输出 dry-run 报告和迁移前备份，不生成任何英文内容。
6. 操作员补齐英文后再发布；发布校验会阻止任何启用语言的缺失译文。

数据仓库读取时不应长期同时兼容两套 shape；迁移窗口结束后只写 3.0，避免双写和隐式转换掩盖脏数据。

#### 15.2 已发布产物

- 已发布的旧 Atlas/Catalog 目录保持原样可访问。
- 新运行时只消费 Manifest 2.0；旧 runtime 继续消费旧 Manifest，不做跨版本混用。
- 发布版本号由操作员提升，避免覆盖业务上仍需保留的单语版本。

#### 15.3 SceneBridge 兼容

- Host 与 SceneBridge 版本继续保持 1.0.0。
- `host:init` 新增字段是可选兼容扩展；旧 Scene 忽略即可，新 Scene 可读取当前语言。
- 本次不新增语言变更事件，切换 URL 或刷新页面后重新初始化 Scene。

### 16. 代码改造范围

| 层 | 主要文件/目录 | 改造内容 |
|---|---|---|
| Domain | `src/domain/project-types.ts` | LocalizedText、LocalizationConfig、Scene 能力、3.0 类型 |
| Domain | `src/domain/project-schema.ts` | shape 与跨字段 locale 校验 |
| Domain | `src/domain/project-validator.ts` | 草稿/发布翻译完整度与 Scene 校验 |
| Domain | `src/domain/project-normalizer.ts` | 新建项目与默认语言配置，不生成译文 |
| Config | `src/config/project-defaults.ts` | 中英文默认系统提示语，或改由 runtime 字典提供 |
| Contracts | `src/products/*/contract/` | Manifest 2.0 多语言字段 |
| Compilers | `src/products/*/compiler/` | 多语言投影、稳定排序、共享资产闭包 |
| Runtime | `src/products/*/runtime/` | 启动时按 locale 渲染全部可见文本 |
| Platform | `src/platform/chrome/` | 工具栏/说明弹窗中英文字典 |
| Platform | `src/platform/scene-bridge/` | 1.1 locale payload/event |
| Product Shell | `src/server/services/product-shell.ts` | 动态默认 lang/title 与字体栈 |
| Server | `src/server/routes/projects.ts` | localization 配置接口 |
| Server | `src/server/services/static-validator.ts` | Manifest 版本、语言一致性与资产检查 |
| Admin | `src/admin/src/features/*-editor/` | 编辑语言、翻译状态、双语表单和预览 |
| Admin | `src/admin/src/features/projects/settings/` | 默认/启用语言、双语项目与分享信息 |
| Tests | `tests/`、`src/admin/src/test/` | schema、编译、运行时、发布、编辑器测试 |
| Fixtures | `data/projects/` 或 `tests/fixtures/` | 至少一份完整中英文验收项目 |

### 17. 分阶段实施建议

#### Phase 0：契约冻结与字段盘点

- 建立当前中文 fixture 和双语期望 fixture。
- 盘点所有运行时可见中文硬编码和可达 HTML Scene，并确认媒体资源不包含文字。
- 冻结 GuideProject 3.0、Manifest 2.0、SceneBridge 1.1 契约。

#### Phase 1：领域模型与迁移

- 实现 LocalizedText、localization config、schema 和 validator。
- 实现 2.0 -> 3.0 dry-run/迁移工具。
- 保证迁移不修改结构、坐标、资产和 revision 语义。

#### Phase 2：工作台双语录入

- 加入内容编辑语言、翻译状态和缺失项导航。
- 改造 metadata、知识、产品配置、Scene、分享表单。
- 保持现有分区保存与 revision 冲突处理。

#### Phase 3：双产品编译与运行时

- 升级两类 Manifest 和编译器。
- 实现 resolveRuntimeLocale、共享字典和可选语言控件。
- Atlas、Catalog 全部显示点位在页面启动时按 locale 渲染。
- 串联 document title、html lang、分享、analytics locale 和 Catalog -> Atlas。

#### Phase 4：HTML Scene

- SceneBridge 1.1 和场景能力声明。
- 对现有 Scene 完成 language-neutral/双语能力标注。
- 图片和视频继续共用现有 asset id 与 asset closure，不做多语言改造。

#### Phase 5：发布门禁与回归

- 增加双语完整度、Manifest 一致性、静态产物校验。
- 完成 Atlas/Catalog、桌面/移动端、在线/ZIP 的端到端回归。
- 迁移真实项目并发布新的双语版本。

### 18. 测试与验收标准

#### 18.1 领域与编译测试

- defaultLocale 不在 supportedLocales 时 shape/业务校验失败。
- 草稿缺英文可保存；启用英文后的正式发布因缺译文失败，并给出精确字段 path。
- Atlas/Catalog Manifest 均包含相同的 `zh-CN`、`en-US` 和 defaultLocale。
- 同一输入重复编译时，除 generatedAt 外内容稳定。
- 共享资产只复制一次，Manifest 不含绝对路径、工作区路径或 `/api/`。

#### 18.2 运行时验收

- Atlas 与 Catalog 默认按项目 defaultLocale 启动。
- `?lang=en-US` 可直接以英文启动；不支持的 lang 回到显式 defaultLocale。
- 使用中文/英文投放 URL 切换后，业务文本、系统文案、`<title>`、`<html lang>` 和 aria label 必须全部使用目标语言。
- 中文与英文投放 URL 可独立直接访问，不依赖 localStorage 或前一次会话状态。
- Catalog 打开 Atlas、页面分享和 SceneBridge 均携带当前语言。
- 完整离线 ZIP 中两种语言都可用，且 `app.js` 继续通过 ES5 校验。

#### 18.3 工作台验收

- 同一实体可分别编辑中文和英文，结构、排序、坐标不重复。
- 切换编辑语言不会覆盖另一语言或丢失未保存 draft。
- 发布校验能以精确字段 path 返回缺失译文，便于定位对应字段。
- 双语预览与最终下载 ZIP 使用同一套运行时行为。
- 两个浏览器标签并发编辑时继续返回 409 revision conflict，不因翻译接口绕过乐观锁。

#### 18.4 视觉与可访问性验收

- 375×808 与 1440×900 下中英文均无关键文本遮挡或不可操作溢出。
- 英文长标题、长分类名和长描述经过换行/截断后仍可完整访问。
- 语言控件可键盘操作，具有当前状态和明确 aria label。
- 中文和英文模式的字体、行高、字间距分别可读，不因切换发生明显布局抖动。

### 19. 风险与控制

| 风险 | 控制措施 |
|---|---|
| LocalizedText 触及面广 | 明确升级主版本；先冻结契约和 fixture，再分层迁移 |
| 英文文本更长导致布局溢出 | 双尺寸视觉回归；对 tab、callout、drawer 定义明确换行/省略规则 |
| HTML Scene 不响应切换 | 能力声明 + SceneBridge 1.1；不支持者只能声明 language-neutral |
| Atlas/Catalog 语言状态不一致 | 共用 locale 解析函数；跳转与分享统一传 `lang` |
| 隐式 fallback 掩盖缺译文 | 草稿允许缺失、发布严格失败；运行时不做逐字段 fallback |
| Manifest 体积增加 | 仅投影产品需要的文本；预计主要增加文本 JSON，不复制运行时代码和结构数据 |

### 20. 完成定义

满足以下条件后，双语改造才算完成：

- 一个 GuideProject 同时保存并校验中文、英文内容。
- 一次发布仍原子生成两份、而不是四份 HTML 产物。
- Atlas 和 Catalog 的每一份产物都能离线加载中文或英文，切换时允许刷新页面。
- 所有宿主可见文案、项目知识文本、title/lang、分享、跳转、统计 locale 和可达 Scene 行为一致。
- 缺少译文时正式发布明确失败，不使用占位或隐式中文兜底；图片和视频始终共用现有语言无关资产。
- 现有结构、空间坐标、revision 锁、静态自包含、ES5 和原子发布约束全部继续成立。
