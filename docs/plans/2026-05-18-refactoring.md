# 重构：代码拆分与高内聚低耦合

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将大文件拆分为职责单一的小文件，提升代码可维护性和可测试性。

**Architecture:**
- `generate-service.ts` → `pipeline.ts` + `prompt-builder.ts` + `runtime-bundle.ts`（入口文件变薄）
- `video-provider.ts` → `ai/video/providers/` 目录（4个文件），video-provider.ts 变入口
- `config.ts` → 加区域注释分组
- `routes/guides.ts` → `hydrateGuideEdgeTransitions` 移入独立工具文件

**Tech Stack:** TypeScript, Node.js ESM, Express

---

## Task 1: 重构 generate-service.ts

### 1.1 创建 services/prompt-builder.ts

**文件:** 创建 `src/server/services/prompt-builder.ts`

将 `generate-service.ts` 中以下内容移入：
- `STYLE_DEFS` 常量（~75行）
- `getNodeSummary()`、`getNodeKeyPoints()`、`getNodeHotspotHints()`、`getNodeVisualIntent()`
- `getTopicGuidance()`、`getCanvasGuidance()`
- `buildImagePrompt()` 完整实现
- `buildTransitionPrompt()`、`resolveTransitionDescriptionMode()`、`getManualTransitionDescription()`、`buildManualTransitionPlan()`、`planTransitionVisuals()`、`buildHotspotPositionCue()`、`normalizeTransitionStyle()`
- `escapeHtml()`

新增 export：
```typescript
export class PromptBuilder {
  buildImagePrompt(node: KnowledgeNode, guide: KnowledgePackage): string
  buildTransitionPrompt(edge: KnowledgeEdge, fromNode?: KnowledgeNode, toNode?: KnowledgeNode, guide?: KnowledgePackage, visualPlan?: TransitionVisualPlan): string
  getNodeSummary(node: KnowledgeNode): string
  getNodeKeyPoints(node: KnowledgeNode): string[]
  async planTransitionVisuals(generateId: string, edge: KnowledgeEdge, fromNode: KnowledgeNode | undefined, toNode: KnowledgeNode | undefined, guide: KnowledgePackage, repo: Repository): Promise<TransitionVisualPlan>
}
```

### 1.2 创建 services/runtime-bundle.ts

**文件:** 创建 `src/server/services/runtime-bundle.ts`

将 `generate-service.ts` 中以下内容移入：
- `buildRuntimeIndexHtml()`、`buildRuntimeStyles()`、`buildRuntimeScript()`
- `buildRuntimeBundleManifest()` 方法体
- `escapeHtml()`

新增 export：
```typescript
export class RuntimeBundleGenerator {
  constructor(private repo: Repository) {}
  async buildRuntimeBundle(guideId: string): Promise<RuntimeBundlePayload>
  private buildRuntimeBundleManifest(guide: KnowledgePackage, manifest: PublishManifest): PublishManifest
  private buildRuntimeIndexHtml(title: string): string
  private buildRuntimeStyles(): string
  private buildRuntimeScript(): string
  private escapeHtml(value: string): string
}
```

### 1.3 创建 services/pipeline.ts

**文件:** 创建 `src/server/services/pipeline.ts`

将 `generate-service.ts` 中以下内容移入：
- `startGenerate()`、`cancelGenerate()`、`getRecord()`、`listGenerates()`、`getLogs()`
- `regenerateNode()`、`regenerateEdge()`、`regenerateHotspots()`
- `runGenerate()` 及其 6 个 stage 方法（prepareGenerate、generateNodes、generateHotspots、generateEdges）
- `publishFromGenerate()`、`syncAssetsToWorkspace()`
- `appendLog()` 私有方法

同时引入 `PromptBuilder` 和 `RuntimeBundleGenerator`：
```typescript
export class BuildPipeline {
  constructor(
    private repo: Repository,
    private visionModule: typeof vision,
    private imageModule: typeof image,
    private videoModule: typeof video,
    private mediaModule: typeof media,
    private promptBuilder: PromptBuilder,
    private bundleGenerator: RuntimeBundleGenerator,
  ) {}
}
```

**注意：** `publishFromGenerate` 内部调用的 `buildManifest`（生成 publish manifest）保留在 pipeline 中，因为它是发布流程的一部分。workspace manifest 的生成保留，但调用 `promptBuilder.buildWorkspaceManifest()`。

### 1.4 重写 services/generate-service.ts（变薄为入口）

**文件:** 修改 `src/server/services/generate-service.ts`

内容变为：
```typescript
// 入口文件，只做 import 和 re-export，不含业务逻辑
import { BuildPipeline } from './pipeline.js'
import { PromptBuilder } from './prompt-builder.js'
import { RuntimeBundleGenerator } from './runtime-bundle.js'
// ... 现有导入

export class GenerateService {
  constructor(
    private repo: Repository,
    visionModule: typeof vision,
    imageModule: typeof image,
    videoModule: typeof video,
    mediaModule: typeof media,
  ) {
    const promptBuilder = new PromptBuilder()
    const bundleGenerator = new RuntimeBundleGenerator(repo)
    this.pipeline = new BuildPipeline(repo, visionModule, imageModule, videoModule, mediaModule, promptBuilder, bundleGenerator)
    this.logs = this.pipeline.logs  // 代理 logs 访问
  }

  startGenerate = this.pipeline.startGenerate.bind(this.pipeline)
  cancelGenerate = this.pipeline.cancelGenerate.bind(this.pipeline)
  getRecord = this.pipeline.getRecord.bind(this.pipeline)
  listGenerates = this.pipeline.listGenerates.bind(this.pipeline)
  getLogs = this.pipeline.getLogs.bind(this.pipeline)
  regenerateNode = this.pipeline.regenerateNode.bind(this.pipeline)
  regenerateEdge = this.pipeline.regenerateEdge.bind(this.pipeline)
  regenerateHotspots = this.pipeline.regenerateHotspots.bind(this.pipeline)
  packageGuide = this.pipeline.packageGuide.bind(this.pipeline)

  private pipeline: BuildPipeline
  private logs: Map<string, string[]> = new Map()
}
```

### 1.5 验证 generate-service.ts 重构

**验证命令:**
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```
预期：仅有既有错误，无新增

---

## Task 2: 重构 video-provider.ts

### 2.1 创建 ai/video/providers/video-provider-interface.ts

**文件:** 创建 `src/server/ai/video/providers/video-provider-interface.ts`

从 `video-provider.ts` 移出接口定义：
```typescript
export type VideoProviderName = 'dashscope' | 'minimax' | 'wanxiang'

export type VideoTaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'

export interface VideoGenerationRequest {
  prompt: string
  firstFrameUrl: string
  lastFrameUrl: string
}

export interface VideoTaskResult {
  taskId: string
}

export interface VideoPollResult {
  status: VideoTaskStatus
  videoUrl?: string
  errorMessage?: string
}

export interface VideoDownloadResult {
  localPath: string
  fromCache: boolean
  modelInputUrl?: string
}

export interface VideoGenerationProvider {
  name: VideoProviderName
  submitTask(req: VideoGenerationRequest): Promise<VideoTaskResult>
  pollTask(taskId: string): Promise<VideoPollResult>
  downloadVideo(videoUrl: string, localPath: string): Promise<string>
}

export function createVideoProvider(name: VideoProviderName, config: ...): VideoGenerationProvider
```

### 2.2 创建 ai/video/providers/dashscope-provider.ts

**文件:** 创建 `src/server/ai/video/providers/dashscope-provider.ts`

移入 `DashScopeVideoProvider` 完整实现（~110行）。

### 2.3 创建 ai/video/providers/minimax-provider.ts

**文件:** 创建 `src/server/ai/video/providers/minimax-provider.ts`

移入 `MiniMaxVideoProvider` 完整实现（~170行）及 `mapMiniMaxStatus` helper。

### 2.4 创建 ai/video/providers/wanxiang-provider.ts

**文件:** 创建 `src/server/ai/video/providers/wanxiang-provider.ts`

移入 `WanXiangVideoProvider` 完整实现（~115行）。

### 2.5 重写 ai/video-provider.ts（变薄为入口）

**文件:** 修改 `src/server/ai/video-provider.ts`

只保留 `createVideoProvider` 工厂函数（从各 provider 文件 import）和 `VideoGenerationProvider` 接口 re-export。

### 2.6 验证 video-provider.ts 重构

**验证命令:**
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "video" | head -10
```
预期：无新增错误

---

## Task 3: 重构 config.ts（仅加区域注释）

### 3.1 修改 config.ts

**文件:** 修改 `src/server/config.ts`

在现有内容基础上，加区域注释标记：

```typescript
// ═══════════════════════════════════════════════════════════════════
// Vision Config
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Image Config
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Video Config (Routing + DashScope / WanXiang / MiniMax)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Object Storage Config
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════════════
```

`envBoolean` helper 移入通用工具区域注释下。

### 3.2 验证 config.ts 重构

**验证命令:**
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "config.ts" | head -5
```
预期：无新增错误

---

## Task 4: 重构 routes/guides.ts

### 4.1 创建 services/guide-hydration.ts

**文件:** 创建 `src/server/services/guide-hydration.ts`

将 `routes/guides.ts` 中的 `hydrateGuideEdgeTransitions` 函数移入，并改造为通过 Repository 读取，而非直接 `fs.readFileSync`：

```typescript
import type { Repository } from '../storage/repository.js'
import type { KnowledgePackage } from '../../shared/types.js'

export function hydrateGuideEdgeTransitions(guide: KnowledgePackage, repo: Repository): KnowledgePackage {
  const latest = findLatestGenerateForGuide(guide.id, repo)
  if (!latest) return guide

  const transitionDir = `${GENERATES_DIR}/${latest.buildId}/edges`
  // 使用 repo.fileExists / repo.readJson 替代直接 fs

  return guide
}

function findLatestGenerateForGuide(guideId: string, repo: Repository): PackageBuildRecord | null {
  // 实现查找逻辑
}
```

### 4.2 修改 routes/guides.ts

**文件:** 修改 `src/server/routes/guides.ts`

- 删除顶部的 `fs.readFileSync` 逻辑
- import `hydrateGuideEdgeTransitions` 从 `'../services/guide-hydration.js'`
- 传入 `repo`（或通过 service 间接调用）

### 4.3 验证 guides.ts 重构

**验证命令:**
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "guides" | head -10
```
预期：无新增错误

---

## 最终文件结构

```
src/server/
├── services/
│   ├── generate-service.ts    # 入口（变薄）
│   ├── pipeline.ts            # BuildPipeline 类
│   ├── prompt-builder.ts     # PromptBuilder 类
│   ├── runtime-bundle.ts     # RuntimeBundleGenerator 类
│   └── guide-hydration.ts    # hydrateGuideEdgeTransitions
├── ai/
│   ├── video.ts              # 不变
│   ├── video-provider.ts     # 入口（变薄）
│   └── video/
│       └── providers/
│           ├── video-provider-interface.ts
│           ├── dashscope-provider.ts
│           ├── minimax-provider.ts
│           └── wanxiang-provider.ts
├── config.ts                  # 加区域注释
└── routes/
    └── guides.ts             # 引用 guide-hydration.ts
```

---

## 执行顺序

1. Task 1 (`generate-service.ts` 拆分) — 涉及 3 个新文件和 1 个重写，风险最高，先做
2. Task 2 (`video-provider.ts` 拆分) — 独立，风险中等
3. Task 3 (`config.ts` 注释) — 纯注释，风险低
4. Task 4 (`routes/guides.ts` 抽取) — 独立，风险低

每个 Task 完成后执行 `npx tsc --noEmit -p tsconfig.json` 验证。