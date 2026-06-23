# Interactive Guide 发布 Manifest 与运行时数据契约设计

## 1. 文档目标

- 这份文档用于定义发布产物中最核心的 `manifest.json` 结构，以及前端运行时如何消费这份数据。
- 它重点回答四个问题：
  1. 发布包里最少要包含哪些字段。
  2. 运行时播放器如何加载节点、热点和边视频。
  3. 管理端预览弹窗应该消费什么格式的数据。
  4. 哪些信息应该保留在构建层，哪些信息应该进入发布层。

## 2. 设计原则

- 发布层只保留运行时真正需要的数据，不带入构建过程中的冗余信息。
- `manifest.json` 必须足够稳定，前端播放器不应依赖构建目录内部结构。
- 节点、热点、边三类对象必须能独立索引和快速查询。
- 第一阶段优先静态可部署，不引入运行时动态编排。

## 3. 发布包的最小结构

```text
publish/
├─ manifest.json
├─ summary.json
└─ assets/
   ├─ nodes/
   │  └─ {nodeId}.png
   └─ edges/
      └─ {edgeId}.mp4
```

- 运行时默认只依赖：
  - `manifest.json`
  - `assets/nodes/*`
  - `assets/edges/*`

## 4. Manifest 顶层结构

```ts
interface PublishManifest {
  packageId: string
  version: string
  title: string
  rootNodeId: 'root'
  resolution: {
    width: number
    height: number
  }
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

## 5. 节点契约

### 5.1 PublishNode

```ts
interface PublishNode {
  id: string
  title: string
  summary?: string
  imageUrl: string
  hotspots: PublishHotspot[]
}
```

### 5.2 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 节点 id |
| `title` | 是 | 节点标题 |
| `summary` | 否 | 运行时可选显示的简要说明 |
| `imageUrl` | 是 | 节点主图地址 |
| `hotspots` | 是 | 当前节点可点击热点集合 |

### 5.3 为什么节点里直接带热点

- 因为运行时最常见的操作是：
  - 展示当前节点
  - 渲染当前节点的所有热点
- 如果热点再独立存储，播放器还要额外做一次映射。
- 第一阶段以简单可靠为主，因此热点应直接挂在节点对象上。

## 6. 热点契约

### 6.1 PublishHotspot

```ts
interface PublishHotspot {
  edgeId: string
  targetNodeId: string
  label: string
  normalizedX: number
  normalizedY: number
  radius?: number
  markerType: 'dot'
}
```

### 6.2 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `edgeId` | 是 | 对应跳转边 id |
| `targetNodeId` | 是 | 目标节点 id |
| `label` | 是 | 当前热点在画面中的语义标识 |
| `normalizedX` | 是 | 归一化横坐标 |
| `normalizedY` | 是 | 归一化纵坐标 |
| `radius` | 否 | 点击热区半径 |
| `markerType` | 是 | 当前阶段固定为 `dot` |

### 6.3 为什么发布层优先保存归一化坐标

- 运行时播放器会出现在不同屏幕尺寸下。
- 如果只存像素坐标，热点位置会随着容器尺寸变化而偏移。
- 因此发布层只保留：
  - `normalizedX`
  - `normalizedY`
  - 可选 `radius`

## 7. 边契约

### 7.1 PublishEdge

```ts
interface PublishEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationLabel?: string
  videoUrl?: string
}
```

### 7.2 字段说明

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 边 id |
| `fromNodeId` | 是 | 起点节点 |
| `toNodeId` | 是 | 终点节点 |
| `relationLabel` | 否 | 辅助文案 |
| `videoUrl` | 否 | 转场视频地址，允许为空 |

### 7.3 为什么边仍然要单独保留

- 虽然热点里已经有 `edgeId` 和 `targetNodeId`，但边对象仍然有价值：
  - 统一保存转场视频地址
  - 为运行时保留关系文案
  - 便于后续扩展边级配置

## 8. 推荐的 Manifest 示例

```json
{
  "packageId": "ecommerce-home-guide",
  "version": "0.1.0",
  "title": "电商首页互动导览",
  "rootNodeId": "root",
  "resolution": {
    "width": 1440,
    "height": 810
  },
  "visualStyle": "高完成度、运营感强、百科式导览页面",
  "transitionStyle": "镜头推进式过渡，最终稳定收敛到目标页",
  "nodes": [
    {
      "id": "root",
      "title": "电商首页",
      "summary": "首页整体结构导览，重点介绍 Banner、商品区和优惠区。",
      "imageUrl": "./assets/nodes/root.png",
      "hotspots": [
        {
          "edgeId": "root-to-banner",
          "targetNodeId": "banner",
          "label": "首页主 Banner",
          "normalizedX": 0.2917,
          "normalizedY": 0.163,
          "radius": 20,
          "markerType": "dot"
        }
      ]
    },
    {
      "id": "banner",
      "title": "首屏活动区",
      "summary": "聚焦首页 Banner 的主活动信息和视觉承载。",
      "imageUrl": "./assets/nodes/banner.png",
      "hotspots": []
    }
  ],
  "edges": [
    {
      "id": "root-to-banner",
      "fromNodeId": "root",
      "toNodeId": "banner",
      "relationLabel": "进入活动区",
      "videoUrl": "./assets/edges/root-to-banner.mp4"
    }
  ],
  "nodeMap": {
    "root": {
      "id": "root",
      "title": "电商首页",
      "summary": "首页整体结构导览，重点介绍 Banner、商品区和优惠区。",
      "imageUrl": "./assets/nodes/root.png",
      "hotspots": [
        {
          "edgeId": "root-to-banner",
          "targetNodeId": "banner",
          "label": "首页主 Banner",
          "normalizedX": 0.2917,
          "normalizedY": 0.163,
          "radius": 20,
          "markerType": "dot"
        }
      ]
    },
    "banner": {
      "id": "banner",
      "title": "首屏活动区",
      "summary": "聚焦首页 Banner 的主活动信息和视觉承载。",
      "imageUrl": "./assets/nodes/banner.png",
      "hotspots": []
    }
  },
  "edgeMap": {
    "root-to-banner": {
      "id": "root-to-banner",
      "fromNodeId": "root",
      "toNodeId": "banner",
      "relationLabel": "进入活动区",
      "videoUrl": "./assets/edges/root-to-banner.mp4"
    }
  },
  "metadata": {
    "generatedAt": "2026-05-07T16:00:00.000Z",
    "manifestVersion": "1.0.0"
  }
}
```

## 9. 为什么同时保留数组和 Map

### 9.1 数组的价值

- 便于遍历、调试和导出查看
- 与当前发布包结构更直观一致

### 9.2 Map 的价值

- 运行时切换节点时最常见操作是按 id 查询
- 如果只有数组，前端每次跳转都要遍历
- 因此在发布层直接提供：
  - `nodeMap`
  - `edgeMap`

### 9.3 第一阶段的折中

- 这会有少量重复数据，但换来运行时更简单。
- 第一阶段优先减运行时复杂度，而不是极致节省 manifest 体积。

## 10. 运行时最小加载流

### 10.1 启动流程

```text
加载 manifest.json
-> 读取 rootNodeId
-> 从 nodeMap 取出 root 节点
-> 展示 root.imageUrl
-> 渲染 root.hotspots
```

### 10.2 点击热点流程

```text
用户点击 hotspot
-> 根据 hotspot.edgeId 查询 edgeMap
-> 根据 hotspot.targetNodeId 查询 nodeMap
-> 若 edge.videoUrl 存在则先播视频
-> 视频结束或跳过后切换到目标节点
-> 渲染目标节点图片与热点
```

### 10.3 运行时状态建议

```ts
interface RuntimeState {
  manifest: PublishManifest | null
  currentNodeId: string
  currentEdgeId?: string
  status: 'idle' | 'loading' | 'ready' | 'transitioning' | 'error'
}
```

## 11. 运行时渲染契约

### 11.1 图片渲染

- 节点图片使用 `node.imageUrl`
- 图片容器按 `manifest.resolution` 保持统一比例
- 运行时只负责适配展示，不修改原始热点数据

### 11.2 热点渲染

- 渲染时使用：
  - `normalizedX * containerWidth`
  - `normalizedY * containerHeight`
- 白点样式可以统一由播放器控制
- 热点 hover、active、disabled 态不应写入 manifest

### 11.3 视频渲染

- 若 `edge.videoUrl` 存在，则进入转场播放层
- 若为空，则直接切换目标节点
- 运行时播放器不需要知道视频如何生成，只消费最终地址

## 12. 管理端预览弹窗的输入契约

### 12.1 为什么预览弹窗应直接消费发布层契约

- 预览弹窗的目标是“模拟真实用户端”
- 因此它不应该再直接依赖管理端内部节点对象
- 最合理的方式是让预览弹窗直接消费：
  - 已发布的 `manifest.json`
  - 或待发布的预览 manifest

### 12.2 推荐输入

```ts
interface PreviewSessionPayload {
  manifest: PublishManifest
  mode: 'preview' | 'published'
}
```

- `preview`
  - 使用最新预览包
- `published`
  - 使用正式发布包

## 13. 哪些信息不应进入发布层

- 不应进入 manifest 的内容包括：
  - 构建日志
  - 模型 prompt 原文
  - 失败原因
  - 中间 planner 输出
  - 管理端编辑草稿态
  - 构建任务状态

- 这些内容都属于：
  - 构建层
  - 管理层
  - 调试层

## 14. 发布前校验建议

### 14.1 Manifest 基础校验

- `rootNodeId` 必须存在于 `nodeMap`
- `nodes` 与 `nodeMap` 的节点集合必须一致
- `edges` 与 `edgeMap` 的边集合必须一致
- 所有热点的 `targetNodeId` 必须存在
- 所有热点的 `edgeId` 必须存在

### 14.2 资源校验

- 每个节点的 `imageUrl` 都应指向真实存在资源
- 边的 `videoUrl` 若存在，应指向真实存在资源
- 所有热点的 `normalizedX / normalizedY` 应在 `0 ~ 1` 之间

## 15. 与后续实现的连接点

### 15.1 对前端播放器的意义

- 播放器只需要围绕 `PublishManifest` 实现
- 节点切换、热点渲染、视频转场都能围绕这一份契约完成

### 15.2 对管理端预览的意义

- 预览弹窗不必再维护一套独立模型
- 直接复用 `PublishManifest` 就能保证“预览即发布形态”

### 15.3 对构建系统的意义

- 构建系统只要能稳定产出 `manifest.json`，前后端就能解耦推进

## 16. 第一阶段实现建议

### 16.1 最小闭环

1. 先实现 `PublishManifest` 生成器
2. 再实现运行时播放器按 `nodeMap / edgeMap` 加载
3. 再让预览弹窗直接消费同一份 manifest

### 16.2 稍后再做的能力

- 多语言 manifest
- 多主题皮肤
- 边级更多转场参数
- 节点级音频或旁白资源

## 17. 最终建议

- 第一阶段把 `manifest.json` 视为前后端之间最关键的运行时契约。
- 只要 `PublishManifest` 稳定，播放器、预览弹窗、发布流程就能并行推进。
- 相比继续扩展构建细节，现在更重要的是让运行时真正围绕同一份发布数据工作。
