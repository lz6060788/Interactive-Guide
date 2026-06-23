# Interactive Guide 知识输入 Schema 设计

## 1. 文档目标

- 这份文档用于描述当前项目已经落地的知识输入 schema，而不是早期设想中的理想模型。
- 文档范围覆盖：
  - 知识包输入结构 `KnowledgePackage`
  - 节点与边的管理端编排结构
  - 构建与发布时依赖的关键字段
- 本文内容以当前代码实现为准，和 `src/shared/types.ts`、`src/shared/validators.ts` 保持一致。

## 2. 当前设计结论

### 2.1 采用轻量结构化节点模型

当前节点不再使用“内容块数组”作为主输入，而是采用：

- 一个兼容旧链路的 `keyContent: string`
- 一组面向知识导览的轻量结构化字段

也就是说，节点是“内容层 + 视觉层”的组合：

- 内容层：
  - `summary`
  - `keyPoints`
  - `sourceText`
  - `topicType`
- 视觉层：
  - `visualIntent`
  - `hotspotHints`
  - `keyContent`

### 2.2 `keyContent` 不再承担全部职责

- 在旧链路中，`keyContent` 同时承担原文提炼、图片提示和视觉设定的职责，容易造成内容丢失。
- 当前实现保留 `keyContent`，但它主要用于兼容旧生图链路和补充少量视觉提示。
- 页面真正的知识主线应优先来自 `summary / keyPoints / sourceText`。

### 2.3 schema 同时服务三层

当前 schema 同时服务于：

- 原始知识输入
- 管理端编排与人工修订
- 构建产物生成与发布

因此节点和边对象允许携带资源状态字段，不再额外拆一套完全独立的“纯输入模型”。

## 3. 顶层结构

```ts
interface KnowledgePackage {
  id: string
  title: string
  version: string
  locale?: string
  description?: string
  resolution: PackageResolution
  visualStyle?: string
  transitionStyle?: string
  style?: string
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  metadata?: PackageMetadata
}

interface PackageResolution {
  width: number
  height: number
}
```

## 4. 顶层字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 知识包唯一标识 |
| `title` | 是 | 知识包标题 |
| `version` | 是 | 知识包版本号 |
| `locale` | 否 | 内容语言，如 `zh-CN` |
| `description` | 否 | 知识包说明 |
| `resolution` | 是 | 全包统一宽高，约束图片和视频资源尺寸 |
| `visualStyle` | 否 | 总体视觉风格描述 |
| `transitionStyle` | 否 | 节点间过渡风格描述 |
| `style` | 否 | 风格 key，例如 `morandi-journal` |
| `nodes` | 是 | 节点集合 |
| `edges` | 是 | 边集合 |
| `metadata` | 否 | 创建与更新时间 |

## 5. 根节点约定

- 根节点 id 固定为 `root`
- 不单独设置 `entryNodeId`
- 这样便于管理端、构建系统和运行时共享统一入口约定

## 6. 节点定义

```ts
type NodeTopicType =
  | 'general'
  | 'news-report'
  | 'common-knowledge'
  | 'content-analysis'
  | (string & {})

interface NodeHotspot {
  edgeId: string
  targetNodeId: string
  label: string
  x: number
  y: number
  normalizedX: number
  normalizedY: number
  radius?: number
  status?: ResourceStatus
}

interface KnowledgeNode {
  id: string
  title: string
  keyContent: string
  sourceText?: string
  summary?: string
  keyPoints?: string[]
  topicType?: NodeTopicType
  visualIntent?: string
  hotspotHints?: string[]
  presentationIntent?: string
  imageUrl?: string
  imageStatus?: ResourceStatus
  hotspots?: NodeHotspot[]
  status?: NodeStatus
  extensions?: Record<string, unknown>
}
```

## 7. 节点字段分层理解

### 7.1 必填字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 节点唯一标识 |
| `title` | 是 | 节点标题 |
| `keyContent` | 是 | 兼容旧链路的基础视觉描述，当前仍为必填 |

### 7.2 内容层字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `summary` | 否 | 1-2 句说明该页讲什么 |
| `keyPoints` | 否 | 3-5 个必须保留的知识点 |
| `sourceText` | 否 | 原文核心段落或等义表达 |
| `topicType` | 否 | 内容类型，用于选择页面模板和 prompt 策略 |

### 7.3 视觉层字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `visualIntent` | 否 | 这页适合怎样的图示表达 |
| `hotspotHints` | 否 | 适合承载子节点热点的语义区域 |
| `keyContent` | 是 | 用于兼容旧链路的补充视觉描述 |
| `presentationIntent` | 否 | 旧字段，管理端仍兼容显示 |

### 7.4 资源与状态字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `imageUrl` | 否 | 节点主图地址 |
| `imageStatus` | 否 | 节点图片资源状态 |
| `hotspots` | 否 | 节点通向子节点的热点信息 |
| `status` | 否 | 节点整体状态 |
| `extensions` | 否 | 扩展字段容器 |

## 8. 为什么选择轻量结构化字段

### 8.1 不再使用 `NodeContentBlock[]`

早期设想中的 `NodeContentBlock[]` 更灵活，但当前实际落地中有两个问题：

- 对运营录入和 AI 转换来说，内容块设计过重，组装成本较高
- 对当前图片生成链路来说，最关键的不是块级富结构，而是“哪些内容必须保留”

因此当前实现改为：

- 保留 `keyContent: string`
- 增加少量高价值字段，而不是引入重型 CMS 结构

### 8.2 为什么不是只保留 `keyContent`

因为只保留 `keyContent` 会导致：

- 原文定义和结论被压缩成视觉隐喻
- 多个节点容易长成同一类图片
- 很难按 `新闻播报 / 常识介绍 / 内容解读` 生成不同页面骨架

轻量结构化字段的价值在于：

- 内容保真
- 任务可控
- prompt 可编排
- 后续可扩展到图文混排页面

## 9. 热点定义

```ts
interface NodeHotspot {
  edgeId: string
  targetNodeId: string
  label: string
  x: number
  y: number
  normalizedX: number
  normalizedY: number
  radius?: number
  status?: ResourceStatus
}
```

### 9.1 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `edgeId` | 是 | 对应边 id |
| `targetNodeId` | 是 | 目标节点 id |
| `label` | 是 | 这块热点在画面中的语义名称 |
| `x` / `y` | 是 | 原始坐标 |
| `normalizedX` / `normalizedY` | 是 | 归一化坐标 |
| `radius` | 否 | 热点半径 |
| `status` | 否 | 热点状态 |

### 9.2 `hotspotHints` 与 `hotspots` 的区别

- `hotspotHints` 是内容转换阶段的建议字段，描述“哪些区域适合放热点”
- `hotspots` 是图片生成和人工校准后的实际结果，包含真实坐标

二者关系大致是：

```text
原始文档
-> summary / keyPoints / sourceText
-> hotspotHints
-> 节点生图
-> 模型推荐热点
-> 人工校准后写入 hotspots
```

## 10. 边定义

```ts
interface KnowledgeEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationLabel?: string
  videoUrl?: string
  videoStatus?: ResourceStatus
  status?: EdgeStatus
  extensions?: Record<string, unknown>
}
```

## 11. 边字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 边唯一标识 |
| `fromNodeId` | 是 | 起点节点 |
| `toNodeId` | 是 | 终点节点 |
| `relationLabel` | 否 | 关系文案 |
| `videoUrl` | 否 | 边视频资源地址 |
| `videoStatus` | 否 | 边视频资源状态 |
| `status` | 否 | 边整体状态 |
| `extensions` | 否 | 扩展字段容器 |

## 12. 状态类型

```ts
type ResourceStatus = 'idle' | 'running' | 'success' | 'failed'
type NodeStatus = 'draft' | 'ready' | 'archived'
type EdgeStatus = 'draft' | 'ready' | 'archived'
```

这些状态直接服务于管理端画布、详情抽屉和构建状态展示。

## 13. 发布层结构

当前发布产物不是直接暴露全部 `KnowledgeNode`，而是映射为更轻的运行时 manifest：

```ts
interface PublishNode {
  id: string
  title: string
  summary?: string
  keyPoints?: string[]
  topicType?: NodeTopicType
  sourceText?: string
  imageUrl: string
  hotspots: PublishHotspot[]
}

interface PublishManifest {
  packageId: string
  version: string
  title: string
  rootNodeId: 'root'
  resolution: PackageResolution
  visualStyle?: string
  transitionStyle?: string
  nodes: PublishNode[]
  edges: PublishEdge[]
  nodeMap: Record<string, PublishNode>
  edgeMap: Record<string, PublishEdge>
  metadata: {
    generatedAt: string
    manifestVersion: string
  }
}
```

### 13.1 发布层保留了什么

- `summary`
- `keyPoints`
- `topicType`
- `sourceText`
- `imageUrl`
- `hotspots`

这意味着运行时已经不再是“只拿一张图 + 一个标题”，而是具备了图文并茂的基础数据条件。

## 14. 校验规则

### 14.1 顶层校验

- `id`、`title`、`version` 必须为非空字符串
- `resolution.width` 和 `resolution.height` 必须为正整数
- `nodes` 必须为非空数组
- 必须存在 `id === "root"` 的节点

### 14.2 节点校验

- `node.id` 必须全局唯一
- `title` 必须为非空字符串
- `keyContent` 必须为非空字符串
- `summary`、`sourceText`、`topicType`、`visualIntent` 若存在必须为字符串
- `keyPoints`、`hotspotHints` 若存在必须为字符串数组
- `hotspots` 中的 `label`、`edgeId`、`targetNodeId` 必须存在

### 14.3 边校验

- `edge.id` 必须全局唯一
- `fromNodeId` 和 `toNodeId` 必须存在于节点集合中
- 不允许自循环边

## 15. 推荐输入与转换策略

### 15.1 推荐输入格式

- 第一阶段继续优先使用 JSON
- 因为 JSON 更适合做 schema 校验、服务端处理和前端调试

### 15.2 推荐转换顺序

原始内容转节点字段时，建议遵循：

```text
原始文档
-> 判断 topicType
-> 提炼 summary
-> 提炼 keyPoints
-> 保留 sourceText
-> 生成 visualIntent
-> 推导 hotspotHints
-> 最后补兼容用 keyContent
```

### 15.3 `keyContent` 的当前定位

- 兼容旧字段
- 补少量具象视觉锚点
- 不再承担全部知识表达职责

## 16. 示例

```json
{
  "id": "macroeconomics-guide",
  "title": "宏观经济学互动导览",
  "version": "1.0.0",
  "locale": "zh-CN",
  "resolution": {
    "width": 390,
    "height": 844
  },
  "style": "morandi-journal",
  "nodes": [
    {
      "id": "root",
      "title": "宏观经济学总览",
      "summary": "宏观经济学可以概括为度量、均衡与调控三大维度，分别回答经济总量如何衡量、市场如何达到均衡、政策如何稳定经济。",
      "keyPoints": [
        "度量维度关注 GDP 与国民经济核算",
        "均衡维度关注总需求与总供给的交汇",
        "调控维度关注货币政策与财政政策",
        "三大维度共同构成宏观经济分析框架"
      ],
      "sourceText": "宏观经济学主要研究国民经济总量、总体运行与政策调控，可从经济核算、总需求总供给分析、宏观政策工具三方面理解。",
      "topicType": "common-knowledge",
      "visualIntent": "采用竖屏高信息密度总览信息图，上部概括主题，中部并列三大维度，下部保留延展入口。",
      "hotspotHints": [
        "GDP与国民经济核算入口区",
        "总需求与总供给分析入口区",
        "宏观经济政策工具入口区"
      ],
      "keyContent": "以内容导向的信息图呈现宏观经济学三大维度，少量使用数据墙、曲线和政策工具等辅助意象，不要用单一大场景覆盖全部内容。",
      "hotspots": [
        {
          "edgeId": "root-to-node1",
          "targetNodeId": "node1",
          "label": "GDP与国民经济核算入口区",
          "x": 0,
          "y": 0,
          "normalizedX": 0.18,
          "normalizedY": 0.32,
          "radius": 18,
          "status": "success"
        }
      ]
    }
  ],
  "edges": [
    {
      "id": "root-to-node1",
      "fromNodeId": "root",
      "toNodeId": "node1",
      "relationLabel": "经济核算的账本"
    }
  ]
}
```

## 17. 当前边界与后续建议

### 17.1 当前边界

- 当前 schema 已能支撑“内容优先的信息图导览”
- 但它还不是完整 CMS，也还没有引入重型富文本块结构

### 17.2 后续建议

- 如果后续确实需要复杂图文编排，再考虑在 `extensions` 或新版本 schema 中增加块级结构
- 在那之前，优先把 `summary / keyPoints / sourceText / topicType / visualIntent / hotspotHints` 这一层用稳定
- 所有新的内容转换工作，默认应遵循 `docs/生图内容描述规范.md` 的双模式规则
