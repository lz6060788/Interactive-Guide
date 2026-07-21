# Interactive Guide Skill 开发设计文档

## 1. 概述

### 1.1 Skill 定位

**Skill 名称**: `interactive-guide`

**定位**: 一个完全独立的 Claude Code skill，将"文档/文章"一键转化为可交互导览的独立 HTML 页面。无需依赖 Interactive Guide 项目代码，通过内置脚本直接调用 AI API 完成从内容提取到最终产物的全链路。

**核心能力**:
- 接收用户提供的文档/文章内容（粘贴文本 / 文件路径 / URL）
- 通过 LLM 自动提取知识结构（节点、边、热点）
- 支持多 Provider 配置（DashScope / OpenAI / 自定义）
- 六阶段逐步确认工作流
- 产出可直接在浏览器中运行的独立 HTML 页面

**与原项目的关系**: 完全独立。skill 将原项目的核心管线逻辑（prompt 模板、API 调用、运行时播放器）重新实现为可执行脚本和模板资源，不依赖原项目运行。

**使用触发词**: 当用户说"生成互动导览"、"把文章做成可交互的"、"create interactive guide"、"导览生成"时触发。

### 1.2 设计原则

- **完全独立**: 不依赖 Interactive Guide 项目，所有逻辑内置于 skill
- **逐步确认**: 每个阶段完成后暂停，用户确认后才进入下一阶段
- **可选重生成**: 对不满意的部分支持单节点/单边/整阶段重跑
- **多 Provider**: 支持 DashScope、OpenAI 及自定义 OpenAI 兼容 provider
- **零依赖部署**: 最终产物为单目录，浏览器直接打开 index.html 即可运行

---

## 2. Skill 文件结构

```
interactive-guide/
├── SKILL.md                         # 核心指令：触发条件 + 六阶段工作流 + 脚本调用方式
├── scripts/
│   ├── pipeline.py                  # 主管线：串联六阶段，管理状态文件
│   ├── content-extract.py           # 阶段1：文档→KnowledgePackage（调用 vision LLM）
│   ├── graph-plan.py                # 阶段2：验证/调整知识图谱结构
│   ├── gen-nodes.py                 # 阶段3：节点图片生成（调用 image API）
│   ├── gen-hotspots.py              # 阶段4：热点推荐（调用 vision API）
│   ├── gen-edges.py                 # 阶段5：边转场视频生成（调用 video API）
│   ├── publish.py                   # 阶段6：打包为独立 HTML
│   ├── api-clients.py               # 统一 API 客户端（DashScope/OpenAI/自定义）
│   └── config.py                    # 环境配置与 provider 路由
├── references/
│   ├── schema.md                    # KnowledgePackage/PublishManifest schema 参考
│   ├── prompts.md                   # 各阶段 prompt 模板（内容提取、图片生成、热点、转场）
│   ├── styles.md                    # 内置视觉风格参考（morandi-journal 等）
│   └── providers.md                 # 各 provider 的 API 接口文档与配置示例
├── assets/
│   ├── runtime/
│   │   ├── player-core.js           # 预构建的 PlayerCore IIFE bundle
│   │   └── runtime-styles.css       # 运行时样式（暗色主题、热点动画等）
│   └── templates/
│       ├── index.html               # 独立 HTML 页面模板（Jinja2）
│       └── manifest.json            # manifest 结构模板
└── .env.example                     # API key 配置示例
```

### 2.1 设计原则

- `SKILL.md` 只包含流程指引和脚本调用，不包含大段 prompt（prompt 放 `references/prompts.md`）
- `scripts/` 全部用 Python，依赖 `openai`（兼容 DashScope）、`requests`、`Pillow`、`jinja2`
- `assets/runtime/` 包含预构建的播放器，避免每次从源码构建
- `assets/templates/` 是 Jinja2 模板，publish 阶段填充数据
- 每个脚本可独立运行（便于调试），也可被 `pipeline.py` 串联调用

### 2.2 状态管理

运行过程中在用户指定的输出目录下维护状态：

```
output/{guide-id}/
├── state.json              # 当前进度（哪个阶段已完成）
├── guide.json              # KnowledgePackage 完整数据
├── nodes/{nodeId}/
│   ├── image.png           # 节点图片
│   └── hotspot.json        # 热点坐标
├── edges/{edgeId}/
│   ├── transition.mp4      # 转场视频（如有）
│   └── plan.json           # 转场策略
├── manifest.json           # 最终 manifest
└── index.html              # 最终可运行产物
```

---

## 3. 六阶段工作流设计

Skill 通过 SKILL.md 指导 Claude 按以下六个阶段逐步执行，每个阶段结束后暂停与用户确认。

### 3.1 阶段 1：内容提取 (Content Extract)

**输入**: 用户提供的文档/文章（粘贴文本、文件路径、或 URL）

**执行**: 调用 `scripts/content-extract.py`
- 将原文发送给 vision LLM
- 使用 `references/prompts.md` 中的内容提取 prompt
- LLM 返回结构化 JSON：包元信息 + 节点列表 + 边列表 + 每个节点的 summary/keyPoints/sourceText/visualIntent/hotspotHints

**用户确认点**: 向用户展示提取结果：
- 包标题、描述、推荐的视觉风格
- 节点列表（每个节点的标题和摘要）
- 边关系列表（从哪到哪）
- 用户可以：修改节点内容、增删节点、调整边关系、改变风格

**产出**: `guide.json`（KnowledgePackage）写入输出目录

### 3.2 阶段 2：知识图谱验证 (Graph Validate)

**输入**: 用户确认后的 `guide.json`

**执行**: 调用 `scripts/graph-plan.py`
- 校验结构完整性（必填字段、ID 唯一性、边引用有效性）
- 检查根节点是否存在
- 计算图谱统计信息（节点数、边数、最大深度、是否连通）
- 输出验证报告

**用户确认点**: 展示验证结果和图谱概览。如有问题，返回修改。用户确认图谱结构无误后继续。

### 3.3 阶段 3：节点图片生成 (Gen Nodes)

**输入**: 验证通过的 `guide.json` + 用户配置的模型参数

**执行**: 调用 `scripts/gen-nodes.py`
- 按 BFS 顺序从 root 开始
- 对每个节点：组装 prompt → 调用 image API → 保存图片
- 使用 SHA256 缓存避免重复生成

**用户确认点**: 展示每个节点的生成结果
- 显示图片预览（缩略图）+ 使用的 prompt
- 用户可以：对某个节点"重新生成"、修改 prompt、跳过已满意的节点
- 用户确认所有节点后继续

### 3.4 阶段 4：热点推荐 (Gen Hotspots)

**输入**: 已有节点图片 + guide.json

**执行**: 调用 `scripts/gen-hotspots.py`
- 对每个有热点的节点：发送图片给 vision 模型
- 推荐归一化坐标 (0-1)
- 保底使用手动坐标

**用户确认点**: 展示热点推荐结果
- 在节点图片上叠加热点标记可视化
- 用户可以：拖拽调整坐标（通过数值输入）、修改标签、确认/重新推荐

### 3.5 阶段 5：边转场生成 (Gen Edges)

**输入**: 节点图片 + guide.json + 用户选择

**执行**: 调用 `scripts/gen-edges.py`
- **关键交互**: 用户选择哪些边需要视频转场，哪些使用 CSS 内置转场（pan/flip/zoom）或无转场
- 对需要视频的边：视觉规划 → prompt 组装 → 视频 API 调用 → 下载
- 对 CSS 转场的边：配置转场参数（方向、时长等）
- 使用 SHA256 缓存

**用户确认点**:
- 先展示边列表，用户逐条选择转场类型（video / builtin-pan / builtin-flip / builtin-zoom / none）
- 对视频边：生成后可预览，允许重新生成
- 对内置转场边：确认参数配置

### 3.6 阶段 6：发布打包 (Publish)

**输入**: 所有已生成的资源

**执行**: 调用 `scripts/publish.py`
- 构建 PublishManifest
- 使用 Jinja2 模板生成 index.html
- 复制所有资源到输出目录
- 输出最终产物

**用户确认点**:
- 展示产物目录结构
- 告知用户用浏览器打开 index.html 即可使用

---

## 4. 模型配置与 Provider 设计

### 4.1 三层 AI 能力

skill 需要三类 AI 能力，各自可独立配置 provider：

| 能力 | 用途 | 默认 Provider | 关键参数 |
|------|------|--------------|---------|
| **Vision/LLM** | 内容提取、热点推荐、转场规划 | DashScope (kimi-k2.6) | model、api_key、base_url |
| **Image** | 节点图片生成 | DashScope (qwen-image-2.0-pro) | model、api_key、size |
| **Video** | 边转场视频 | MiniMax (MiniMax-Hailuo-02) | model、api_key、provider |

### 4.2 配置方式

**方式 A - 环境变量（.env 文件）**:

```env
# Vision
VISION_PROVIDER=dashscope
VISION_API_KEY=sk-xxx
VISION_MODEL=kimi-k2.6
VISION_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Image
IMAGE_PROVIDER=dashscope
IMAGE_API_KEY=sk-xxx
IMAGE_MODEL=qwen-image-2.0-pro

# Video
VIDEO_PROVIDER=minimax
VIDEO_API_KEY=sk-xxx
VIDEO_MODEL=MiniMax-Hailuo-02
```

**方式 B - 运行时指定（对话中）**:
用户可在对话开始时说"使用 OpenAI 的 gpt-4o 做内容提取，用 DashScope 生图"，skill 将其解析为配置覆盖。

**优先级**: 运行时指定 > .env 文件 > 默认值

### 4.3 Provider 抽象层

`scripts/api-clients.py` 实现统一接口：

```python
class VisionProvider(ABC):
    @abstractmethod
    def chat(self, messages, model=None, temperature=0.7) -> str: ...

class ImageProvider(ABC):
    @abstractmethod
    def generate(self, prompt, width, height) -> bytes: ...

class VideoProvider(ABC):
    @abstractmethod
    def submit(self, prompt, first_frame_url, last_frame_url) -> str: ...
    @abstractmethod
    def poll(self, task_id) -> dict: ...
```

每个 provider 实现对应 API：
- `DashScopeVisionProvider` - OpenAI 兼容 chat completion
- `OpenAIVisionProvider` - OpenAI chat completion
- `DashScopeImageProvider` - DashScope multimodal generation
- `OpenAIImageProvider` - DALL-E / gpt-image-1
- `MiniMaxVideoProvider` - MiniMax Hailuo-02
- `AishiVideoProvider` - DashScope async video
- `WanXiangVideoProvider` - 通义万相 2.7

### 4.4 默认配置

skill 内置最常用的默认值：
- Vision: DashScope + kimi-k2.6（成本低、中文好）
- Image: DashScope + qwen-image-2.0-pro
- Video: MiniMax + MiniMax-Hailuo-02

用户只需提供 API key 即可使用默认配置。如需切换，在对话中说明即可。

---

## 5. 运行时播放器设计

### 5.1 核心方案：单文件自包含 HTML

最终产物是一个 `index.html`，内嵌所有运行时逻辑：

```
index.html (单文件)
├── <style>    运行时样式（暗色主题、热点动画、转场效果）
├── <body>     播放器容器、导航栏、热点层
├── <script>   PlayerCore 逻辑 + DOM 渲染 + manifest 内联
└── assets/
    ├── nodes/{nodeId}.png
    └── edges/{edgeId}.mp4 (如有)
```

### 5.2 PlayerCore 内嵌逻辑

从原项目 `player-core.ts` 提取核心逻辑，转换为纯 JS 内嵌：

**状态管理**:
- `manifest` - 加载的 manifest 数据
- `currentNodeId` - 当前展示的节点
- `history[]` - 导航历史栈（支持返回）
- `transitioning` - 是否正在转场

**核心功能**:
- `loadManifest()` - 加载内联 manifest
- `navigateTo(nodeId, edgeId)` - 跳转到目标节点
- `handleHotspotClick(hotspot)` - 热点点击处理
- `handleBack()` - 返回上一节点
- `renderNode(node)` - 渲染节点图片 + 热点覆盖层
- `playTransition(edge)` - 播放视频或 CSS 转场

**CSS 内置转场**:
- Pan: 平移滑动效果（left/right/up/down）
- Flip: 翻转效果（horizontal/vertical）
- Zoom: 缩放效果（in/out）
- 使用 CSS `@keyframes` + `transform` 实现，不依赖外部库

### 5.3 热点渲染

- 热点显示为发光圆点（pulsing animation）
- `normalizedX/Y` 映射到容器百分比定位
- 悬停显示 `label` tooltip
- 点击触发导航

### 5.4 面包屑导航

- 顶部显示导航路径：`首页 > GDP核算 > 生产法`
- 支持点击任意层级返回
- 基于 `history[]` 栈构建

### 5.5 实现方式

skill 的 `assets/runtime/` 目录包含：
- `player-core.js` - 播放器核心逻辑（预构建的 IIFE）
- `runtime-styles.css` - 完整运行时样式

`scripts/publish.py` 在打包阶段：
1. 读取 `index.html` Jinja2 模板
2. 将 `player-core.js` 内容内联到 `<script>` 标签
3. 将 `runtime-styles.css` 内联到 `<style>` 标签
4. 将 `manifest.json` 内联为 JS 变量
5. 相对路径引用 `assets/` 目录

---

## 6. 内容提取与知识图谱生成

这是 skill 最核心的环节——将用户的文档/文章转换为结构化的 KnowledgePackage。

### 6.1 输入形式

支持三种输入方式：
- **直接粘贴**: 用户在对话中粘贴文章全文
- **文件路径**: 用户提供本地文件路径（.txt / .md / .pdf），skill 读取内容
- **URL**: 用户提供网页链接，skill 抓取正文（使用 readability 算法提取）

### 6.2 提取流程

`scripts/content-extract.py` 的处理逻辑：

**Step 1 - 内容分析**: 将原文发送给 vision LLM，prompt 要求分析：
- 文章主题和范围
- 可拆分的知识模块（5-15 个节点为佳）
- 模块之间的层级和关联关系
- 适合的视觉风格和 topicType

**Step 2 - 结构生成**: LLM 返回结构化 JSON：

```json
{
  "packageMeta": {
    "id": "auto-generated-slug",
    "title": "文章主题",
    "description": "一句话描述",
    "visualStyle": "推荐的视觉风格描述",
    "transitionStyle": "转场风格描述",
    "style": "morandi-journal"
  },
  "nodes": [
    {
      "id": "root",
      "title": "总览标题",
      "summary": "1-2句核心概括",
      "keyPoints": ["要点1", "要点2", "要点3"],
      "sourceText": "原文依据段落",
      "topicType": "common-knowledge",
      "visualIntent": "竖屏高信息密度总览信息图...",
      "hotspotHints": ["入口1描述", "入口2描述"],
      "keyContent": "兼容用视觉描述"
    }
  ],
  "edges": [
    {
      "id": "root-to-node1",
      "fromNodeId": "root",
      "toNodeId": "node1",
      "relationLabel": "关系描述"
    }
  ]
}
```

**Step 3 - 质量检查**: 对生成结果做自动校验：
- 根节点必须存在
- 边的 fromNodeId/toNodeId 必须引用有效节点
- 节点数建议 5-15 个（过少信息不足，过多生成成本高）
- 每个节点至少有 3 个 keyPoints

### 6.3 Prompt 设计策略

内容提取 prompt 参考原项目的 prompt-builder.ts，但适配"从原文提取"的场景：

```
你是一个知识结构分析专家。给定一篇文章，请将其拆解为一个可交互导览的知识图谱。

要求：
1. 创建一个 root 节点作为总览入口
2. 识别 4-12 个核心知识模块，每个模块作为一个节点
3. 确定节点之间的层级和关联关系
4. 每个节点必须包含：summary、keyPoints、sourceText、visualIntent、hotspotHints
5. 根节点的 hotspots 指向第一层子节点
6. topicType 从 [general, news-report, common-knowledge, content-analysis] 中选择
7. 竖屏移动端优先，内容密度优先于留白美感

视觉风格可选：
- morandi-journal: 莫兰迪色调的期刊风格，柔和高级
- pop-laboratory: 波普实验室风格，鲜明对比
- ink-landscape: 水墨山水风格，东方意境

输出格式：严格 JSON，不包含其他文字。
```

### 6.4 用户确认界面

提取完成后，Claude 向用户展示：

```markdown
## 知识图谱已生成

**包信息**
- 标题: 宏观经济学导览
- 节点数: 8 | 边数: 7
- 推荐风格: morandi-journal (莫兰迪期刊风格)

**节点结构**:
- [root] 宏观经济学总览
  ├─ [node1] GDP与国民经济核算
  ├─ [node2] 总需求与总供给
  └─ [node3] 货币政策与财政政策
      ├─ [node4] 货币政策工具
      └─ [node5] 财政政策工具

**每个节点详情** (可展开查看 summary/keyPoints/sourceText)

请确认：
1. 节点结构是否合理？需要增加/删除/合并节点吗？
2. 边关系是否准确？
3. 视觉风格是否合适？
```

用户可直接回复修改意见，Claude 解析后更新 `guide.json`。

---

## 7. 边转场选择与生成设计

### 7.1 边转场类型

skill 支持五种转场类型：

| 类型 | 值 | 说明 | 成本 |
|------|------|------|------|
| AI 视频转场 | `video` | 用视频模型生成两个节点间的视觉过渡 | 高（API 调用费 + 等待时间） |
| CSS 平移 | `builtin-pan` | 从热点方向平滑平移到目标节点 | 零 |
| CSS 翻转 | `builtin-flip` | 卡片翻转效果 | 零 |
| CSS 缩放 | `builtin-zoom` | 从热点位置放大过渡到目标节点 | 零 |
| 无转场 | `none` | 直接切换，无动画 | 零 |

### 7.2 边选择交互

在阶段 5 开始时，Claude 展示所有边并让用户逐条选择：

```markdown
## 边转场配置

共 7 条边，请为每条边选择转场类型：

| # | 边 | 路径 | 推荐 | 你的选择 |
|---|------|------|------|---------|
| 1 | root→node1 | "GDP核算" | builtin-zoom | ? |
| 2 | root→node2 | "总供需" | builtin-zoom | ? |
| 3 | root→node3 | "宏观政策" | builtin-zoom | ? |
| 4 | node3→node4 | "货币政策" | builtin-pan | ? |
| 5 | node3→node5 | "财政政策" | builtin-pan | ? |
| 6 | node1→node6 | "支出法" | none | ? |
| 7 | node2→node7 | "均衡分析" | video | ? |

推荐逻辑：
- 从 root 出发的边 → builtin-zoom（从总览放大进入子主题）
- 同层级边 → builtin-pan（平移浏览）
- 语义跳跃大的边 → video（需要视觉桥接）
- 叶子节点边 → none（无进一步导航）

你可以：
- 回复 "全部 builtin-zoom" 批量设置
- 回复 "1-3 zoom, 4-5 pan, 6 none, 7 video" 逐条指定
- 回复 "推荐方案" 使用默认推荐
- 回复某个编号修改单条："把 7 改为 builtin-flip"
```

### 7.3 Video 边的生成流程

用户确认后，仅对选择 `video` 类型的边执行视频生成：

1. **视觉规划**: vision 模型分析首尾帧，输出 TransitionVisualPlan（4 阶段描述）
2. **Prompt 组装**: 结合转场规划 + 热点位置 + 风格约束
3. **API 调用**: 异步提交视频任务
4. **轮询等待**: 每 15 秒检查状态，最多等待 10 分钟
5. **下载保存**: 视频保存到 `edges/{edgeId}/transition.mp4`

每条视频边生成后立即展示结果，用户可选择预览或重新生成。

### 7.4 Builtin 边的配置

对 `builtin-pan/flip/zoom` 类型，配置参数：

```json
{
  "transitionType": "builtin",
  "builtinTransition": {
    "type": "pan",
    "config": {
      "direction": "left",
      "duration": 800,
      "easing": "ease-in-out"
    }
  }
}
```

Claude 根据边的关系自动推荐方向和参数，用户可覆盖。

---

## 8. 选择性重生成设计

### 8.1 交互方式

在每个阶段的确认环节，用户可通过以下指令触发重生成：

```markdown
# 重新生成 node3 的图片
重生成 node3

# 重新生成 node3 并自定义 prompt
重生成 node3，prompt 改为："以流程图展示货币政策的传导机制..."

# 重新生成所有失败的节点
重生成全部失败

# 重新生成 edge-7 的视频
重生成 edge-7
```

### 8.2 重生成流程

**节点图片重生成** (`gen-nodes.py --regenerate nodeId`):
1. 读取当前 `guide.json` 中该节点的数据
2. 可选：使用用户提供的自定义 prompt，否则重新构建 prompt
3. 调用 image API 生成
4. 覆盖 `nodes/{nodeId}/image.png`
5. 该节点的热点坐标会失效（图片变了），标记需要重新推荐热点
6. 如果该节点涉及 video 类型的边，标记视频需要重新生成

**热点重推荐** (`gen-hotspots.py --regenerate nodeId`):
1. 读取新的节点图片
2. 调用 vision 模型重新推荐
3. 覆盖 `nodes/{nodeId}/hotspot.json`

**边视频重生成** (`gen-edges.py --regenerate edgeId`):
1. 读取首尾节点最新图片
2. 重新执行视觉规划 → prompt → 视频生成
3. 覆盖 `edges/{edgeId}/transition.mp4`

### 8.3 级联影响提示

重生成时，skill 自动检测并提示级联影响：

```markdown
重生成 node3 的图片将导致：
- node3 的热点坐标需要重新推荐（图片已变）
- edge node3→node4 的视频需要重新生成（首帧已变）
- edge node3→node5 的视频需要重新生成（首帧已变）

是否继续？
```

### 8.4 缓存策略

- 图片使用 SHA256(prompt + size + model) 缓存
- 如果 prompt 不变且缓存命中，直接使用缓存
- 用户强制重生成时跳过缓存
- 缓存目录：`output/{guide-id}/.cache/`

---

## 9. SKILL.md 设计与对话编排

### 9.1 SKILL.md 结构

**Frontmatter**:

```yaml
---
name: interactive-guide
description: |
  Generate interactive guide from documents or articles. Produces a standalone
  HTML page with node-based knowledge exploration, AI-generated images, and
  transition videos. Use when user says "generate interactive guide",
  "create interactive exploration", "make article interactive",
  "生成互动导览", "把文章做成可交互的", "导览生成".
  Supports multi-provider AI configuration (DashScope/OpenAI/Custom).
---
```

**Body 主要章节**:

1. **Prerequisites Check** - 检查环境和配置
2. **Conversation Flow** - 对话流程控制
3. **Stage Instructions** - 每个阶段的具体指令
4. **Output Format** - 向用户展示结果的格式规范
5. **Error Handling** - 错误处理指引

### 9.2 对话流程控制

```
用户触发 skill
  ↓
[配置检查] → 确认 API key 和模型配置
  ↓
[接收内容] → 读取用户提供的文档/文章
  ↓
[阶段1: 内容提取] → 调用 content-extract.py → 展示结果 → 用户确认
  ↓
[阶段2: 图谱验证] → 调用 graph-plan.py → 展示结果 → 用户确认
  ↓
[阶段3: 节点图片] → 调用 gen-nodes.py → 逐个展示 → 用户确认/重生成
  ↓
[阶段4: 热点推荐] → 调用 gen-hotspots.py → 可视化展示 → 用户确认/调整
  ↓
[阶段5: 边转场] → 用户选择边类型 → 调用 gen-edges.py → 用户确认/重生成
  ↓
[阶段6: 发布] → 调用 publish.py → 输出产物路径
```

### 9.3 Claude 行为指引

- **每次只调用一个脚本**，等待结果后再与用户交互
- **脚本输出为 JSON**，Claude 解析后格式化展示给用户
- **不要自行修改 guide.json**，所有修改通过脚本进行
- **展示图片时使用 Read 工具**直接读取 PNG 文件（Claude 支持图片预览）
- **错误时给出明确原因**，不静默失败
- **保持对话精简**，阶段结果用结构化摘要展示，不贴大段 JSON

### 9.4 示例对话流程

```
用户: 用这个 skill 帮我从这篇文章生成一个互动导览
Claude: [触发 skill，检查配置]
        请提供您的文章内容，可以直接粘贴文本、提供文件路径或 URL。
用户: [粘贴了一篇宏观经济学文章]
Claude: [调用 content-extract.py]
        内容提取完成！已从文章中识别出 8 个知识模块：

        **知识图谱结构**:
        📄 宏观经济学导览
        ├─ 📊 GDP与国民经济核算
        ├─ ⚖️ 总需求与总供给
        ├─ 🏛️ 货币政策与财政政策
        │   ├─ 💰 货币政策工具
        │   └─ 📋 财政政策工具
        ├─ 📈 经济增长与周期
        └─ 🌍 国际贸易与汇率

        共 8 个节点，7 条边。

        需要调整吗？可以直接说修改意见，或者说"继续"进入下一阶段。
用户: 把"经济增长与周期"拆成两个节点："经济增长理论"和"经济周期"
Claude: [调用 content-extract.py --update，拆分节点]
        已更新！现在是 9 个节点，8 条边。可以继续吗？
用户: 继续
Claude: [进入阶段2...]
```

---

## 10. 实现计划

### 10.1 技术栈

- **脚本语言**: Python 3.10+
- **依赖**: `openai`（兼容 DashScope）、`requests`、`Pillow`、`jinja2`、`python-dotenv`
- **模板引擎**: Jinja2（生成 index.html）
- **图片处理**: Pillow（热点可视化、图片缩放）
- **无服务端依赖**: 纯脚本执行，无需 Express / Node.js

### 10.2 实现阶段

**Phase 1: 基础框架** (SKILL.md + 脚手架)
- 创建 SKILL.md 和文件结构
- 实现 `config.py`（环境变量读取 + provider 配置）
- 实现 `api-clients.py`（三个 provider 接口 + DashScope/OpenAI 实现）
- 验证 API 调用可用

**Phase 2: 内容提取** (阶段1)
- 实现 `content-extract.py`
- 编写 `references/prompts.md` 中的内容提取 prompt
- 实现 LLM 输出解析和 KnowledgePackage 校验
- 测试从文章到 guide.json 的完整流程

**Phase 3: 节点图片生成** (阶段3)
- 实现 `gen-nodes.py`
- 编写图片生成 prompt 模板（含视觉风格、竖屏构图规则、topicType 模板）
- 实现 SHA256 缓存
- 测试批量节点图片生成

**Phase 4: 热点推荐** (阶段4)
- 实现 `gen-hotspots.py`
- 实现 vision 模型热点推荐
- 实现热点坐标可视化（Pillow 在图片上绘制标记）

**Phase 5: 边转场** (阶段5)
- 实现 `gen-edges.py`
- 实现转场视觉规划 prompt
- 实现 MiniMax 视频 provider
- 实现 builtin 转场参数配置

**Phase 6: 发布打包** (阶段6)
- 实现 `publish.py`
- 创建 Jinja2 模板（`index.html`）
- 内嵌 PlayerCore 播放器（`player-core.js`）
- 从原项目提取运行时样式和逻辑，转换为纯 JS

**Phase 7: SKILL.md 编排**
- 完善 SKILL.md 对话流程指引
- 实现重生成逻辑
- 实现级联影响检测
- 端到端测试

### 10.3 关键复用来源

从原 Interactive Guide 项目复用以下设计（不复制代码，重写实现）：

| 复用内容 | 原项目来源 | skill 中的对应 |
|---------|-----------|--------------|
| KnowledgePackage schema | `src/shared/types.ts` | `references/schema.md` |
| 图片生成 prompt 策略 | `src/server/services/prompt-builder.ts` | `references/prompts.md` |
| 视觉风格模板 | `src/server/services/prompt-builder.ts` | `references/styles.md` |
| 竖屏构图规则 | `docs/生图内容描述规范.md` | `references/prompts.md` |
| 热点推荐 prompt | `src/server/ai/vision.ts` | `references/prompts.md` |
| 转场视觉规划 prompt | `src/server/ai/vision.ts` | `references/prompts.md` |
| PlayerCore 运行时 | `src/runtime/player-core/` | `assets/runtime/player-core.js` |
| 运行时样式 | runtime-bundle.ts 输出 | `assets/runtime/runtime-styles.css` |
| PublishManifest 结构 | `src/shared/types.ts` | `references/schema.md` |
| MiniMax API 调用 | `src/server/ai/video/providers/minimax-provider.ts` | `api-clients.py` |

### 10.4 测试策略

- **单元测试**: 每个 Python 脚本可独立运行测试
- **集成测试**: 使用一篇短文章跑通六阶段完整流程
- **端到端验证**: 最终生成的 index.html 在浏览器中正常运行
- **缓存测试**: 验证 SHA256 缓存命中和跳过逻辑

### 10.5 打包与分发

使用 skill-creator 的 `package_skill.py` 打包：

```bash
scripts/package_skill.py path/to/interactive-guide
```

产出 `interactive-guide.skill` 文件，用户通过 Claude Code 安装使用。

---

## 附录 A：KnowledgePackage Schema 参考

```typescript
interface KnowledgePackage {
  id: string                    // 知识包唯一标识
  title: string                 // 知识包标题
  version: string               // 版本号
  locale?: string               // 语言，如 zh-CN
  description?: string          // 描述
  resolution: { width: number; height: number }  // 画布尺寸
  visualStyle?: string          // 视觉风格描述
  transitionStyle?: string      // 转场风格描述
  style?: string                // 风格 key
  nodes: KnowledgeNode[]        // 节点集合
  edges: KnowledgeEdge[]        // 边集合
}

interface KnowledgeNode {
  id: string                    // 节点唯一标识
  title: string                 // 节点标题
  keyContent: string            // 兼容用视觉描述（必填）
  sourceText?: string           // 原文核心段落
  summary?: string              // 1-2句说明
  keyPoints?: string[]          // 3-5个关键知识点
  topicType?: string            // general/news-report/common-knowledge/content-analysis
  visualIntent?: string         // 视觉表达意图
  hotspotHints?: string[]       // 热点区域语义描述
  presentationIntent?: string   // 展示意图
  hotspots?: NodeHotspot[]      // 热点信息
}

interface NodeHotspot {
  edgeId: string                // 对应边ID
  targetNodeId: string          // 目标节点ID
  label: string                 // 热点标签
  normalizedX: number           // 归一化 X (0-1)
  normalizedY: number           // 归一化 Y (0-1)
  radius?: number               // 热点半径
}

interface KnowledgeEdge {
  id: string                    // 边唯一标识
  fromNodeId: string            // 起点节点
  toNodeId: string              // 终点节点
  relationLabel?: string        // 关系文案
  transitionType?: 'video' | 'builtin' | 'none'
  builtinTransition?: BuiltinTransitionConfig
}

interface BuiltinTransitionConfig {
  type: 'pan' | 'flip' | 'zoom'
  config: PanConfig | FlipConfig | ZoomConfig
}
```

## 附录 B：PublishManifest Schema 参考

```typescript
interface PublishManifest {
  packageId: string
  version: string
  title: string
  rootNodeId: 'root'
  resolution: { width: number; height: number }
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

interface PublishNode {
  id: string
  title: string
  summary?: string
  keyPoints?: string[]
  topicType?: string
  sourceText?: string
  imageUrl: string              // ./assets/nodes/{nodeId}.png
  hotspots: PublishHotspot[]
}

interface PublishHotspot {
  edgeId: string
  targetNodeId: string
  label: string
  normalizedX: number
  normalizedY: number
  radius?: number
}

interface PublishEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationLabel?: string
  transitionType: 'video' | 'builtin' | 'none'
  videoUrl?: string             // ./assets/edges/{edgeId}.mp4
  builtinTransition?: BuiltinTransitionConfig
}
```
