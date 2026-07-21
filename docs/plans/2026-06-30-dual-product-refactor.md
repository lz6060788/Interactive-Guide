# 双产品架构重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> 上游方案：`docs/plans/2026-06-29-双产品架构重构方案.md`
> 日期：2026-06-30
> 范围：Phase 0~8 全部
> 决策记录：跳过 open-spec/doc-evolution；当前分支按 Phase 提交；先冻结再迁移后删除旧主干

## Goal

将 Interactive Guide 从"通用 Node/Edge AIGC 导览系统"重构为"产业链互动内容编辑与双产品（Atlas/Catalog）编译系统"。完成时，单一 `project.json` 是知识、全景图、场景、项目参数的唯一事实源；一次发布原子产出两份独立 HTML；旧 AIGC/Node/Edge 主干整体退出。

## Architecture

- **Domain Core**（`src/domain/`，无 React/Express 依赖）：`GuideProject 2.0` 类型 + Zod schema + 严格三段产业链校验 + 资产/全景/场景/路由/产品/integrations 子模型。
- **Products**（`src/products/atlas/`、`src/products/catalog/`）：每套产品独立 contract / compiler / runtime，运行时互不依赖、共享 platform primitives（`src/platform/`）。
- **Config**（`src/config/`）：`PROJECT_DEFAULTS`（业务默认值）+ `editor-theme`（视觉 token）单一入口。
- **Server**（`src/server/`）：项目 CRUD + revision 乐观锁 + 资产上传 + 草稿预览 + 原子 release，不含 AI。
- **Admin**（`src/admin/`）：共享 ProjectContext / 知识编辑器 / 资源库 / 场景管理器；两套独立编辑器 `AtlasEditor`/`CatalogEditor` 围绕画布直接操控。
- **Skill**（`skills/guide-project-bootstrap/`）：项目级 Agent Skill，确定性脚本负责 IO + 校验，Agent 只负责材料理解与歧义解释。

## Tech Stack

TypeScript 5.9 / Node.js 22 / React 19 / Vite 6 / Express 5 / Zod 4 / adm-zip（HTML bundle 解压）/ 内置 Node test runner + supertest。

---

## 全局约定

- 严格三段产业链：`upstream → midstream → downstream`，label 固定 `上游 / 中游 / 下游`，不得新增/删除/改序。
- 坐标空间：`normalized`（`[0,1]`），不得使用绝对像素保存空间配置。
- 资源：编辑态只保存 `assetId`；`sourcePath` 必须是项目目录内相对路径；HTML bundle 必须声明 `entryPath`。
- 默认值：`PROJECT_DEFAULTS` 是唯一来源，组件不得散落魔法值。
- 旧术语禁止出现在新主干：`KnowledgeNode / KnowledgeEdge / PublishManifest / surfaceLayers / rootNodeId / resolution: '375*808' / panoramaEditorDocument / 商业航天 / 上游自动 HTML / rocket.html / targetOrigin:'*'`。

---

# Phase 0：冻结事实样本与验收基线

**目标**：在重构期间防止"看起来差不多但体验退化"，把样例项目固化成机器可读 fixture。

**Files**:
- Create: `tests/fixtures/guide_surface_validation_001.manifest.json`
- Create: `tests/fixtures/guide_surface_validation_001.atlas.json`
- Create: `tests/fixtures/guide_surface_validation_001.catalog.json`
- Create: `docs/development/dual-product-baseline-2026-06-30.md`

### Task 0.1：抽取样例全景图与场景资源清单

**Files**: docs/development/dual-product-baseline-2026-06-30.md（新建）

**Step 1**：列出 `data/workspace/guide_surface_validation_001/` 下所有资源
- 全景图：`nodes/images/`（具体文件名）
- HTML bundle：`nodes/rocket.html` + `nodes/lib/`
- 视频转场：`edges/edge-root-to-rocket.mp4`、`edges/rocket.mp4`

**Step 2**：记录 34 个三级知识项、16 个已空间标注项、2 个 scene view 的对应关系表

**Step 3**：写出该 markdown 文件，作为验收基线

### Task 0.2：抽取旧 manifest 内容作为 fixture

**Files**: tests/fixtures/guide_surface_validation_001.manifest.json（新建）

**Step 1**：读取 `data/workspace/guide_surface_validation_001/manifest.json` 的全部内容
**Step 2**：以"知识 + 空间标注"两张表形式写到 fixture（不包含运行时引用，避免新主干读取）
**Step 3**：保留 sha256 / 文件大小，验证基线完整

### Task 0.3：抽取 Atlas 与 Catalog 预期交互的快照描述

**Files**: tests/fixtures/guide_surface_validation_001.atlas.json、catalog.json

**Step 1**：手工列出 Atlas 期望：默认 viewport、激活的 category hotspot、点击 rocket.html 的体验路由、callout 文案。
**Step 2**：手工列出 Catalog 期望：上中下游分类、激活的二级分类、上游的 HTML 场景 view、focusRect 位置、视口动画时长。
**Step 3**：两个 JSON 文件不要求实现，作为 Phase 3 / Phase 4 的视觉回归基线。

### Task 0.4：建立 acceptance baseline 文档

**Files**: docs/development/dual-product-baseline-2026-06-30.md（扩展）

**Step 1**：汇总 Task 0.1-0.3 内容
**Step 2**：列出两套产品共同必须支持的浏览器（Chrome 120+ / Safari 17+ / Firefox 120+）和目标尺寸（375×808 主，1440×900 校验）
**Step 3**：提交：`chore(phase-0): freeze dual-product baseline fixture and acceptance matrix`

**验收**：`rg "商业航天|rocket.html|surfaceLayers|panoramaEditorDocument" tests/fixtures/` 返回空（fixture 不含旧术语）；acceptance 文档可在编辑器重构期间作为对照。

---

# Phase 1：Domain Core（GuideProject 2.0 + 校验 + 默认值）

**目标**：建立无 UI 依赖的项目领域模型与严格校验，使新主干不再依赖任何旧类型。

**Files**:
- Create: `src/config/project-defaults.ts`
- Create: `src/config/editor-theme.ts`
- Create: `src/domain/project-types.ts`
- Create: `src/domain/project-schema.ts`
- Create: `src/domain/project-validator.ts`
- Create: `src/domain/project-normalizer.ts`
- Create: `src/domain/asset-types.ts`
- Create: `src/domain/scene-protocol.ts`
- Create: `src/domain/experience-navigation.ts`
- Create: `src/domain/draft-vs-release.ts`
- Create: `tests/domain/project-schema.test.ts`
- Create: `tests/domain/project-validator.test.ts`
- Create: `tests/domain/project-normalizer.test.ts`
- Create: `tests/domain/experience-navigation.test.ts`
- Create: `tests/domain/draft-vs-release.test.ts`

### Task 1.1：PROJECT_DEFAULTS 集中配置

**Files**: src/config/project-defaults.ts（新建）

**Step 1：写测试**
```ts
// tests/config/project-defaults.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { PROJECT_DEFAULTS } from '../../src/config/project-defaults.js'

test('PROJECT_DEFAULTS.viewport is 375x808', () => {
  assert.equal(PROJECT_DEFAULTS.viewport.width, 375)
  assert.equal(PROJECT_DEFAULTS.viewport.height, 808)
})

test('PROJECT_DEFAULTS.panorama.minZoom/maxZoom/categoryZoom are sensible', () => {
  assert.equal(PROJECT_DEFAULTS.panorama.minZoom, 1)
  assert.equal(PROJECT_DEFAULTS.panorama.maxZoom, 4)
  assert.equal(PROJECT_DEFAULTS.panorama.categoryZoom, 3.6)
})

test('PROJECT_DEFAULTS.products carries both atlas and catalog hint texts', () => {
  assert.match(PROJECT_DEFAULTS.products.atlas.hintText, /拖动|缩放|探索/)
  assert.match(PROJECT_DEFAULTS.products.catalog.hintText, /点击|滑动|简介/)
})
```

**Step 2：跑测试，确认 FAIL**
```bash
npm run test -- tests/config/project-defaults.test.ts
```

**Step 3：实现 `src/config/project-defaults.ts`**
```ts
export const PROJECT_DEFAULTS = {
  viewport: { width: 375, height: 808 },
  panorama: {
    minZoom: 1,
    maxZoom: 4,
    categoryZoom: 3.6,
    focusRect: { width: 0.22, height: 0.18, radius: 12, maskOpacity: 0.48 },
  },
  products: {
    atlas: { hintText: '拖动或缩放探索全景图' },
    catalog: { hintText: '点击或滑动文字查看简介', viewportAnimationMs: 360 },
  },
} as const
```

**Step 4：跑测试，确认 PASS**

**Step 5：提交**：`feat(config): introduce PROJECT_DEFAULTS as single source of business defaults`

### Task 1.2：editor-theme 视觉 token 独立

**Files**: src/config/editor-theme.ts（新建）

类似 Task 1.1，但只保存视觉 token（颜色/间距/字号/圆角），不含任何业务文案与项目语义。

### Task 1.3：GuideProject 顶层类型

**Files**: src/domain/project-types.ts（新建）

```ts
export interface GuideProject {
  schemaVersion: '2.0.0'
  id: string
  title: string
  version: string
  locale: string
  knowledge: IndustryChain
  assets: AssetRegistry
  panorama: PanoramaModel
  scenes: HtmlScenePackage[]
  navigation: ExperienceNavigation
  products: { atlas: AtlasProductConfig; catalog: CatalogProductConfig }
  integrations: ProjectIntegrations
  metadata: ProjectMetadata
}
```

**禁止字段**：`nodes / edges / rootNodeId / resolution / visualStyle / transitionStyle / panoramaEditorDocument / surfaceHierarchyCatalog`。

### Task 1.4：产业链结构类型

**Files**: src/domain/project-types.ts（扩展）

```ts
export type IndustryStageKey = 'upstream' | 'midstream' | 'downstream'
export interface IndustryChain { stages: [IndustryStage, IndustryStage, IndustryStage]; items: Record<string, IndustryItem> }
export interface IndustryStage { key: IndustryStageKey; label: string; order: 1|2|3; categories: IndustryCategory[] }
export interface IndustryCategory { id: string; title: string; order: number; description?: string; itemIds: string[]; experience: CategoryExperienceBinding }
export interface IndustryItem { id: string; categoryId: string; title: string; description: string; order: number; tags?: string[] }
export type CategoryExperienceBinding = { kind: 'panorama' } | { kind: 'html-scene'; sceneId: string; viewId: string }
```

### Task 1.5：资产 / 全景 / 场景 / 路由 / 产品配置 / 集成类型

继续在 `src/domain/project-types.ts` 实现 `AssetDefinition`、`AssetRegistry`、`PanoramaModel`、`Viewport`、`NormalizedPoint`、`NormalizedRect`、`CategorySpatialLayout`、`ItemSpatialLayout`、`HtmlScenePackage`、`HtmlSceneView`、`ExperienceLocation`、`ExperienceRoute`、`ExperienceNavigation`、`AtlasProductConfig`、`CatalogProductConfig`、`ProductViewportConfig`、`AtlasTheme`、`CatalogTheme`、`ProductChromeConfig`、`ProjectIntegrations`、`ProjectMetadata`。

### Task 1.6：Zod schema 严格校验

**Files**: src/domain/project-schema.ts（新建）

**Step 1：测试**
```ts
// tests/domain/project-schema.test.ts
test('schema rejects projects with non-3 stages', () => {
  const bad = { ...validProject(), knowledge: { stages: [validStage('upstream')], items: {} } }
  const r = GuideProjectSchema.safeParse(bad)
  assert.equal(r.success, false)
})
```

**Step 2：实现** `GuideProjectSchema` 严格 Zod schema：
- `stages.length === 3` 且 key 顺序固定
- 任意 product 字段缺失 → 失败
- `assetId` 引用类型 → 引用完整性独立校验（Task 1.8）

### Task 1.7：domain validator（业务规则）

**Files**: src/domain/project-validator.ts（新建）

规则：
1. category/item ID 项目内唯一
2. item 必须且只能属于一个 category
3. order 连续无重复
4. label 首期固定 `上游/中游/下游`，自定义 label 在 Draft 阶段允许但 release 阶段必须固定
5. 坐标范围 `[0,1]`
6. assetId 类型与真实文件一致（动态校验，由 Task 2 配合）

### Task 1.8：引用完整性校验

**Files**: src/domain/project-validator.ts（扩展）

实现 `validateReferences(project)`：
- panorama.assetId 存在于 assetRegistry
- category.experience.kind === 'html-scene' 时 sceneId + viewId 存在
- navigation.routes 中 from/to 引用的 sceneId/categoryId/itemId 都存在
- route.transition.assetId 存在且 kind === 'video'

### Task 1.9：normalizer 归一化

**Files**: src/domain/project-normalizer.ts（新建）

将 PROJECT_DEFAULTS 应用到缺失的可选字段、补齐 order 连续、把 categoryId 解析为稳定引用；产物叫 `NormalizedProject`。

### Task 1.10：draft vs release 校验分层

**Files**: src/domain/draft-vs-release.ts（新建）

- DraftProject：允许 label 自定义、允许空坐标、允许缺视频
- ReleaseProject：必须全部规范通过，发布前调用

### Task 1.11：scene-protocol 与 experience-navigation 拆分

**Files**: src/domain/scene-protocol.ts、experience-navigation.ts（新建）

scene-protocol 定义 `interactive-guide:scene-bridge` v1.0.0 信封与 version 校验。
experience-navigation 定义 route 匹配算法（O(N) 线性匹配 first match，禁止 wildcard）。

**验收**：
- `rg "KnowledgeNode|KnowledgeEdge|PublishManifest|surfaceHierarchyCatalog|panoramaEditorDocument" src/domain/` 返回空
- `npm run typecheck` 通过
- `npm run test -- tests/domain tests/config` 全部通过
- `npm run lint` 通过

**提交**：`feat(domain): GuideProject 2.0 schema + validator + normalizer + scene protocol`

---

# Phase 2：项目存储、API 与 bootstrap Skill

**目标**：两套编辑器可以并行读写同一项目；Agent 能从基础材料生成通过 DraftProject 校验的项目。

**Files**:
- Create: `src/server/storage/project-repository.ts`
- Create: `src/server/storage/asset-repository.ts`
- Create: `src/server/storage/release-repository.ts`
- Create: `src/server/services/project-service.ts`
- Create: `src/server/services/asset-service.ts`
- Create: `src/server/services/release-service.ts`
- Create: `src/server/services/bootstrap-script.ts`（被 Skill 调用）
- Create: `src/server/services/bootstrap-validator.ts`
- Create: `src/server/routes/projects.ts`
- Create: `src/server/routes/assets.ts`
- Create: `src/server/routes/previews.ts`
- Create: `src/server/routes/releases.ts`
- Create: `src/server/middleware/revision-conflict.ts`
- Create: `tests/server/storage/project-repository.test.ts`
- Create: `tests/server/services/project-service.test.ts`
- Create: `tests/server/routes/projects.test.ts`
- Create: `tests/server/routes/assets.test.ts`
- Create: `tests/server/middleware/revision-conflict.test.ts`
- Create: `skills/guide-project-bootstrap/SKILL.md`
- Create: `skills/guide-project-bootstrap/scripts/bootstrap-project.ts`
- Create: `skills/guide-project-bootstrap/scripts/validate-project.ts`
- Create: `skills/guide-project-bootstrap/references/input-contract.md`
- Create: `skills/guide-project-bootstrap/references/project-schema.md`

### Task 2.1：ProjectRepository 文件结构

**Files**: src/server/storage/project-repository.ts

数据目录：
```
data/projects/{projectId}/
├─ project.json
└─ assets/
   ├─ images/
   ├─ videos/
   └─ scenes/{assetId}/...
```

实现：
- `load(projectId)` → GuideProject | null
- `save(project, expectedRevision)` → 新 revision 或抛 409
- `list()` → 项目元数据数组
- `delete(projectId)`
- in-memory cache + 启动时从磁盘加载

### Task 2.2：AssetRepository

**Files**: src/server/storage/asset-repository.ts

- `register(projectId, definition)` → 校验 `sourcePath` 存在、计算 sha256
- `get(projectId, assetId)` → AssetDefinition
- `delete(projectId, assetId)`
- `resolveRelative(projectId, assetId)` → 项目内相对路径

### Task 2.3：Revision 乐观锁中间件

**Files**: src/server/middleware/revision-conflict.ts

PUT/PATCH 路由要求请求体带 `expectedRevision`：
- 缺失 → 400
- 不匹配 → 409 + 包含当前 revision

### Task 2.4：ProjectService

**Files**: src/server/services/project-service.ts

- `create(input)` → 新建 projectId + revision 1
- `get(projectId)`
- `updateMetadata(projectId, patch, expectedRevision)`
- `updateKnowledge(projectId, knowledge, expectedRevision)`
- `updatePanorama(projectId, panorama, expectedRevision)`
- `updateScenes(projectId, scenes, expectedRevision)`
- `updateNavigation(projectId, navigation, expectedRevision)`
- `updateAtlasConfig(projectId, config, expectedRevision)`
- `updateCatalogConfig(projectId, config, expectedRevision)`
- `updateIntegrations(projectId, integrations, expectedRevision)`
- `delete(projectId)`
- 每次更新单调递增 revision

### Task 2.5：AssetService（含 HTML bundle 解压）

**Files**: src/server/services/asset-service.ts

- 图片：拷贝到 `assets/images/`，sha256 + mime
- 视频：拷贝到 `assets/videos/`
- HTML bundle：解压 zip 到 `assets/scenes/{assetId}/`，安全校验
  - 路径穿越检测（拒绝 `..`、绝对路径）
  - `entryPath` 必须存在
  - 单文件大小限制（默认 10MB）、文件总数限制（默认 200）
  - 必须包含 `index.html` 或显式 entryPath

### Task 2.6：projects 路由

**Files**: src/server/routes/projects.ts

按方案 §9.3 实现所有路由：
```
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
DELETE /api/projects/:id
PATCH  /api/projects/:id/metadata
PUT    /api/projects/:id/knowledge
PUT    /api/projects/:id/panorama
PUT    /api/projects/:id/scenes
PUT    /api/projects/:id/navigation
PUT    /api/projects/:id/products/atlas
PUT    /api/projects/:id/products/catalog
PUT    /api/projects/:id/integrations
```

所有 PUT/PATCH 请求携带 `expectedRevision`。

### Task 2.7：assets 路由

**Files**: src/server/routes/assets.ts

```
POST   /api/projects/:id/assets/image
POST   /api/projects/:id/assets/video
POST   /api/projects/:id/assets/html-bundle
DELETE /api/projects/:id/assets/:assetId
```

### Task 2.8：bootstrap-script（确定性）

**Files**: src/server/services/bootstrap-script.ts + skills/.../scripts/bootstrap-project.ts

**输入**：`GuideProjectBootstrapInput`（来自 Skill）
**流程**：
1. 复制全景图到 `assets/images/{sha256}.{ext}`
2. 复制 HTML bundle（解压到 `assets/scenes/{assetId}/`）
3. 复制转场视频
4. 生成稳定 ID：`categoryId = {stage}-{slug}`、`itemId = {stage}-{category}-{slug}`
5. 写入 `project.json`，revision = 1
6. 输出 `bootstrap-report.json`（包含映射、置信度、未校准项）

`bootstrap-project.ts` 调用同一服务，可在 CLI 直接执行：
```bash
node --import tsx skills/guide-project-bootstrap/scripts/bootstrap-project.ts \
  --input ./bootstrap-input.json --output data/projects
```

### Task 2.9：bootstrap-validator（硬校验）

**Files**: src/server/services/bootstrap-validator.ts + skills/.../scripts/validate-project.ts

对已生成 `project.json` 调用 `validateReleaseProject`，打印问题列表；CLI:
```bash
node --import tsx skills/guide-project-bootstrap/scripts/validate-project.ts \
  --project data/projects/{id}
```

### Task 2.10：Skill 文档

**Files**: skills/guide-project-bootstrap/SKILL.md

按方案 §8.7 写：
- 触发场景
- 输入 JSON schema
- 工作流（识别 → 映射 → 复制 → 校验 → 报告）
- Agent/脚本边界
- 错误处理：缺少坐标必须输出 `calibrationStatus: 'required'`，禁止伪造

### Task 2.11：previews 与 releases 路由占位

**Files**: src/server/routes/previews.ts, releases.ts

首期返回 501；Phase 6 补完实现。这两个路由的形状必须在 Phase 2 就定下来。

### Task 2.12：服务端入口接线

**Files**: src/server/index.ts（修改）

接入新 routes，移除旧 `createGeneratesRouter`、`createGuidesRouter`（保留为兼容别名？**不，按决策不保留兼容层**，直接删）；保留 `healthRouter`。

**验收**：
- `npm run test -- tests/server` 全部通过
- `npm run lint` 通过
- 用 guide_surface_validation_001 输入运行 bootstrap 脚本，生成的新 project.json 通过 `validateReleaseProject` 的 Draft 级别（允许缺坐标）
- 两个并行 PUT 同一 project，第二个返回 409

**提交**：`feat(server): project storage + revision API + asset upload + bootstrap skill`

---

# Phase 3：Atlas 产品迁移

**目标**：AtlasEditor 与 AtlasRuntime 不再依赖 PublishManifest / node/edge，分类视口、hotspot、callout 均可在画布直接完成。

**Files**:
- Create: `src/products/atlas/contract/atlas-manifest.ts`
- Create: `src/products/atlas/compiler/atlas-compiler.ts`
- Create: `src/products/atlas/runtime/atlas-runtime.ts`
- Create: `src/products/atlas/runtime/camera.ts`
- Create: `src/products/atlas/runtime/marker-renderer.ts`
- Create: `src/products/atlas/runtime/callout-renderer.ts`
- Create: `src/products/atlas/runtime/scene-launcher.ts`
- Create: `src/admin/src/editors/atlas/AtlasEditor.tsx`
- Create: `src/admin/src/editors/atlas/AtlasCanvas.tsx`
- Create: `src/admin/src/editors/atlas/AtlasToolbar.tsx`
- Create: `src/admin/src/editors/atlas/AtlasInspector.tsx`
- Create: `src/admin/src/editors/atlas/AtlasPreview.tsx`
- Create: `tests/products/atlas/atlas-compiler.test.ts`
- Create: `tests/products/atlas/atlas-runtime.test.ts`
- Create: `tests/admin/atlas-editor.test.tsx`

### Task 3.1：AtlasManifest 契约

**Files**: src/products/atlas/contract/atlas-manifest.ts

只包含 AtlasRuntime 需要的数据：项目基本信息、知识索引（仅引用，不重复正文）、全景相对 URL、camera bounds、category viewport、item marker/callout、scene 绑定、Atlas 可达 ExperienceRoute、Atlas theme/chrome/interaction、analytics/share。

**禁止**：editor draft state、catalog 列表、nodeMap/edgeMap、AIGC 状态、workspace URL。

### Task 3.2：AtlasCompiler

**Files**: src/products/atlas/compiler/atlas-compiler.ts

`compileAtlas(normalizedProject, assetClosure): AtlasManifest + assetList`

规则：
- 不修改知识正文
- 所有 URL 改为包内相对路径
- 资源闭包计算：panorama image + scene bundle（如果 route 到 scene）+ 所有 transition video
- 缺失资源 → 抛错，不允许 placeholder
- 同一输入生成结构稳定的 manifest（key 排序固定）

### Task 3.3：AtlasRuntime 主类

**Files**: src/products/atlas/runtime/atlas-runtime.ts

入口接收 `AtlasManifest + 资源加载器`，提供：
- `mount(container)`、`destroy()`
- 事件：`viewportchange`、`hotspotclick`、`sceneenter`、`routechange`、`analytics:expose/click/stay/share`

### Task 3.4：Camera 模块

**Files**: src/products/atlas/runtime/camera.ts

从旧 `surface-camera.ts` 迁移并改造：使用 PanoramaModel 的归一化坐标，支持滚轮/拖拽/双指缩放；提供 `recordCurrentViewport()` → Viewport；自动夹紧到 cameraBounds。

### Task 3.5：Marker & Callout 渲染

**Files**: src/products/atlas/runtime/marker-renderer.ts, callout-renderer.ts

不渲染 hotspot CSS 字符串（已禁），改用 theme token。

### Task 3.6：SceneLauncher

**Files**: src/products/atlas/runtime/scene-launcher.ts

通过共享 platform/SceneBridge 激活 HTML scene view；targetOrigin 同源推导，跨域由 manifest 提供 allowlist。

### Task 3.7：AtlasEditor 主页面

**Files**: src/admin/src/editors/atlas/AtlasEditor.tsx

- 路由：`/projects/:projectId/atlas-editor`
- 共享 ProjectContext
- 三栏布局：结构与资源 / 主画布 / 属性

### Task 3.8：AtlasCanvas

**Files**: src/admin/src/editors/atlas/AtlasCanvas.tsx

- 渲染真实全景图 + 分类 marker
- 拖拽、滚轮、缩放操作 viewport
- 工具模式：V (select) / M (marker) / C (callout)
- 方向键微调 1px，Shift+方向键 10px
- minimap、当前 zoom、鼠标坐标、安全边界提示

### Task 3.9：AtlasToolbar & Inspector

**Files**: src/admin/src/editors/atlas/AtlasToolbar.tsx, AtlasInspector.tsx

Toolbar：撤销/重做、保存、预览、配套发布、工具切换
Inspector：当前选中对象的快捷属性（坐标折叠到高级）

### Task 3.10：AtlasPreview

**Files**: src/admin/src/editors/atlas/AtlasPreview.tsx

直接 mount AtlasRuntime（真实预览），不是 iframe。

### Task 3.11：迁移删除旧 surface 残留

删除：`SurfaceNodeDesigner.tsx`、`SurfaceNodeControls.tsx`、`surface-node-utils.ts`、`SurfacePreview.tsx`、`region-viewport.ts`（在 runtime 中也删除）；player-host 中删除 `SurfaceCard / SurfaceHotspot / SurfaceFocusLayer / SurfaceStockItem` 类型与渲染逻辑。

**验收**：
- Atlas 草稿预览不低于旧 surface runtime 关键交互
- 分类视口 / hotspot / callout 在画布直接完成，无需输入坐标
- `npm run test -- tests/products/atlas tests/admin/atlas-editor` 通过
- `rg "SurfaceCard|SurfaceHotSpot|rootNodeId" src/products/atlas src/runtime` 返回空

**提交**：`feat(atlas): AtlasEditor + AtlasRuntime migrated to PanoramaModel`

---

# Phase 4：Catalog 产品迁移

**Files**:
- Create: `src/products/catalog/contract/catalog-manifest.ts`
- Create: `src/products/catalog/compiler/catalog-compiler.ts`
- Create: `src/products/catalog/runtime/catalog-runtime.ts`
- Create: `src/products/catalog/runtime/list.ts`
- Create: `src/products/catalog/runtime/focus-overlay.ts`
- Create: `src/products/catalog/runtime/scene-launcher.ts`
- Create: `src/admin/src/editors/catalog/CatalogEditor.tsx`
- Create: `src/admin/src/editors/catalog/CatalogCanvas.tsx`
- Create: `src/admin/src/editors/catalog/CatalogStructure.tsx`
- Create: `src/admin/src/editors/catalog/CatalogInspector.tsx`
- Create: `src/admin/src/editors/catalog/CatalogPreview.tsx`
- Create: `src/admin/src/editors/catalog/calibration-mode.ts`
- Create: `tests/products/catalog/catalog-compiler.test.ts`
- Create: `tests/products/catalog/catalog-runtime.test.ts`
- Create: `tests/admin/catalog-editor.test.tsx`

### Task 4.1：CatalogManifest 契约

只含 CatalogRuntime 需要的数据：固定三段 + 完整分类/项、category viewport、item marker/focusRect、scene view 绑定、route、theme、analytics/share。

### Task 4.2：CatalogCompiler

`compileCatalog(normalizedProject, assetClosure)`：与 AtlasCompiler 共享 normalizer 与闭包算法。

### Task 4.3：CatalogRuntime

**Files**: src/products/catalog/runtime/catalog-runtime.ts

提供三段标签、二级分类、三级列表、focusRect 覆盖、滚动激活、scene launcher、视口动画（来自 `catalog.viewportAnimationMs`）。

### Task 4.4：list / focus-overlay 渲染

**Files**: src/products/catalog/runtime/list.ts, focus-overlay.ts

list：滚动同步、center-nearest 激活、marker 高亮联动。
focus-overlay：从旧 `panorama-player-host-focus-overlay.ts` 迁移，使用 PanoramaModel 坐标。

### Task 4.5：CatalogEditor 三栏

**Files**: src/admin/src/editors/catalog/CatalogEditor.tsx

三栏：结构树 / 主画布 / 属性。结构树选中联动画布，画布联动列表选中。

### Task 4.6：连续校准模式

**Files**: src/admin/src/editors/catalog/calibration-mode.ts

完成一项后自动进入下一项；快捷键：J/K 上下项、`R` 记录当前视口、`F` 自动适配 focusRect、`D` 复制上一项视口、`X` 清除覆盖。

### Task 4.7：marker/focusRect 工具

- marker：单击定位、拖拽、Shift+方向键微调
- focusRect：框选、四角缩放、移动
- 工具模式：V/M/F

### Task 4.8：scene/panorama 同画布切换预览

在 CatalogCanvas 内既能预览 panorama，也能内嵌预览 HTML scene view，不跳转页面。

### Task 4.9：迁移删除旧 panorama 残留

删除：`panorama-editor/PanoramaEditorPage.tsx`、`PanoramaCanvas.tsx`、`PanoramaInspectorPanel.tsx`、`PanoramaPreviewPane.tsx`、`PanoramaRuntimeHostView.tsx`、`PanoramaRuntimePreviewModal.tsx`、`PanoramaStructurePanel.tsx`、`buildPanoramaEditorDocument.ts`、所有引用 `panoramaEditorDocument / PanoramaEditorDraftState` 的代码；runtime 端删除 `panorama-types.ts / panorama-validators.ts` 引用。

**验收**：
- 固定三段标签 + 二级分类 + 三级列表 + focusRect + HTML 场景均正常
- 连续校准 10 个 item 不离开主画布
- `npm run test -- tests/products/catalog tests/admin/catalog-editor` 通过
- `rg "panoramaEditorDocument|PanoramaEditorDraftState" src/products/catalog src/admin` 返回空

**提交**：`feat(catalog): CatalogEditor + CatalogRuntime migrated to shared PanoramaModel`

---

# Phase 5：共享场景、转场、埋点与分享

**Files**:
- Create: `src/platform/scene-bridge/scene-bridge.ts`
- Create: `src/platform/scene-bridge/message-envelope.ts`
- Create: `src/platform/transition-video/transition-video-controller.ts`
- Create: `src/platform/transition-video/transition-policy.ts`
- Create: `src/platform/analytics/analytics-adapter.ts`
- Create: `src/platform/analytics/weblog-adapter.ts`
- Create: `src/platform/sharing/share-config.ts`
- Create: `src/platform/asset-loader/asset-loader.ts`
- Create: `tests/platform/scene-bridge.test.ts`
- Create: `tests/platform/transition-video-controller.test.ts`
- Create: `tests/platform/analytics-adapter.test.ts`
- Create: `tests/platform/asset-loader.test.ts`

### Task 5.1：SceneBridge v1.0.0 信封

**Files**: src/platform/scene-bridge/

实现激活消息、item focus 命令、事件响应、信封 version 校验；`targetOrigin` 同源推导，跨域由 manifest 提供 allowlist（禁止 `*`）。

### Task 5.2：TransitionVideoController

**Files**: src/platform/transition-video/

从旧 `transition-video-controller.ts` 迁移；新增 `transition.policy`：`abort-navigation` / `cut`；超时由 route 配置。

### Task 5.3：ExperienceRoute 匹配

实现 linear scan；scene view → scene view / panorama → scene / scene → panorama / category → category 都支持。

### Task 5.4：AnalyticsAdapter

事件：expose / click / stay / share / return。带 `product: 'atlas' | 'catalog'` 维度；`contentName` 来自 `project.title` 或 `integrations.analytics.contentName`。

### Task 5.5：WeBlogAdapter

按 `provider: 'weblog'`，使用 `integrations.analytics.profileId` 定位部署配置；脚本地址由部署注入。

### Task 5.6：ShareConfig

按 `integrations.share` 写入 og 标签；image 来源由 `imageAssetId` 解析。

### Task 5.7：AssetLoader

包内相对路径资源加载；HTML scene 资源按 `html-bundle` 注册。

### Task 5.8：删除股票跳转

**Files**: 全部

删除 `SurfaceStockItem / open-route / client.html` 相关代码与组件；运行时与编辑器都不应再引用。

**验收**：
- 同一 HTML scene 可被两个产品激活
- 埋点事件触发一次且参数带正确 product
- `npm run test -- tests/platform` 通过
- `rg "stocks|client.html|open-route|targetOrigin.*\*" src/platform src/products` 返回空

**提交**：`feat(platform): shared scene bridge + transition + analytics + share`

---

# Phase 6：双产物编译与原子发布

**Files**:
- Create: `src/server/services/asset-closure.ts`
- Create: `src/server/services/draft-build-service.ts`
- Create: `src/server/services/release-service.ts`（实现）
- Create: `src/server/services/static-validator.ts`
- Create: `src/server/services/object-storage-uploader.ts`（修改现有支持 release 整目录）
- Create: `tests/server/services/asset-closure.test.ts`
- Create: `tests/server/services/release-service.test.ts`
- Create: `tests/server/services/static-validator.test.ts`

### Task 6.1：AssetClosure 算法

资源闭包：panorama image + 所有可达 scene bundle 子资源 + 所有 route 视频；HTML bundle 内部通过 `index.html` 解析 `<script src>` `<link href>` `<img src>`。

### Task 6.2：URL 重写

所有 `/api/...` / workspace 路径重写为包内相对路径；HTML bundle 内部相对路径保持。

### Task 6.3：DraftBuildService

`buildDraft(projectId, product)`：调用对应 Compiler + 临时构建 runtime bundle，写到 `data/draft-builds/{projectId}/{buildId}/`；返回 entryUrl。

### Task 6.4：ReleaseService

`buildRelease(projectId)`：先 DraftBuild × 2；任一失败整体回滚；成功后：
1. 写入 `data/releases/{projectId}/{version}/release.json`
2. 写入 `atlas/index.html` `atlas/app.js` `atlas/manifest.json` `atlas/assets/...`
3. 写入 `catalog/...` 同上
4. 原子目录切换（先写 `_tmp` 后 rename）

### Task 6.5：StaticValidator

`validateSelfContained(releasePath)`：
- 不存在 `/api/` / `workspace/` 字符串
- 不存在绝对路径
- 所有 manifest 引用的资源文件存在

### Task 6.6：previews 与 releases 路由接通

把 Phase 2 的占位替换为真实实现。

### Task 6.7：对象存储适配

现有 `object-storage.ts` 改为上传整 release 目录到 `releases/{projectId}/{version}/`。

**验收**：
- 断开 Express 后，复制 `atlas/` 或 `catalog/` 目录到 `python -m http.server` 即可独立运行
- `npm run test -- tests/server/services/release-service` 通过
- 替换全景图 → 一次发布两份产物都引用新资源

**提交**：`feat(release): dual-product atomic compiler + static validation`

---

# Phase 7：删除旧主干

**Files**: 删除

### Task 7.1：删除 AIGC
- 删 `src/server/ai/**`（cache.ts / image.ts / media.ts / retry.ts / video.ts / vision.ts / providers/）

### Task 7.2：删除 Generate 业务
- 删 `src/server/services/{pipeline,regenerator,prompt-builder,generate-service,manifest-builder,guide-hydration,panorama-product-builder,panorama-runtime-bundle,runtime-bundle}.ts`
- 删 `src/server/routes/generates.ts`

### Task 7.3：删除 React Flow 编辑工作台
- 删 `src/admin/src/pages/WorkbenchPage.tsx`
- 删 `src/admin/src/components/{EdgeModal,HotspotEditorModal,NodeModal,PreviewModal}.tsx`
- 删 `src/admin/src/components/Edge/transitions/**`
- 删 `src/admin/src/layout/elk-layout.ts`

### Task 7.4：删除 region/stocks/旧 panorama 文档

- 删 `src/admin/src/components/RegionNodeDesigner.tsx`
- 删 `src/runtime/player-core/region-viewport.ts`
- 删 `tests/region-*.test.ts`

### Task 7.5：删除旧类型

从 `src/shared/types.ts` 中移除 `KnowledgeNode / KnowledgeEdge / KnowledgePackage / PackageBuildRecord / NodeBuildRecord / HotspotBuildRecord / EdgeBuildRecord / PublishNode / PublishEdge / PublishManifest / RuntimeConfig / RuntimeState / PackageListItem / FlowNodeData / FlowEdgeData / BuildSummaryPayload / PreviewSessionPayload / RuntimeBundlePayload / UpdateHotspotsPayload / TransitionVisualPlan / Guide / GenerateRecord / NodeGenerateRecord / EdgeGenerateRecord / HotspotGenerateRecord / Manifest` 等。

### Task 7.6：删除旧 runtime / panorama-runtime 残留

- 删 `src/runtime/transitions/**`（pan/flip/zoom 内置动画）
- 删 `src/runtime/player-core/{player-core,player-host-*,region-viewport,gyro-pan-controller}.ts`（除 `surface-camera.ts`、`transition-video-controller.ts`、`resource-preloader.ts` 已被迁移/被替换）
- 删 `src/panorama-runtime/**`
- 删 `src/runtime/player-core/vite.config.ts` 和 `src/panorama-runtime/player-core/vite.config.ts`
- 改 `package.json` 删除 `build:player-host / build:panorama-player-host / build:player-core` scripts

### Task 7.7：删除旧目录约定

- `data/generates/`、`data/publish/`、`data/runtime-bundles/`、`data/panorama-bundles/`、`data/backups/`、`data/workspace/`
- `data/guides/`（旧根 schema 数据）
- `scripts/upload-bundle.ts`、`scripts/dist/`

### Task 7.8：清理依赖

- `package.json` 移除：`three / @aws-sdk/client-s3 / @aws-sdk/s3-request-presigner / adm-zip`（如果新主干不需要）
- 删除 `.env` 中所有 `DASHSCOPE_API_KEY / OPENAI_API_KEY / IMAGE_MODEL / VIDEO_MODEL / VISION_MODEL` 等

### Task 7.9：标记旧文档为 archived

`docs/architecture/发布Manifest与运行时数据契约设计.md`、`docs/architecture/构建任务流与目录结构设计.md`、`docs/features/生图内容描述规范.md`、`docs/postmortems/...` 等改为顶部加 `> ARCHIVED 2026-06-30 — replaced by dual-product architecture`

**验收**：
- `rg "KnowledgeNode|KnowledgeEdge|PublishManifest|surfaceLayers|panoramaEditorDocument|商业航天|rocket\.html" src/ tests/` 返回空
- `rg "src/server/ai" src/` 返回空
- 应用启动不要求任何 AI 环境变量
- `npm run typecheck` 与 `npm run lint` 通过
- `npm run test` 全部通过

**提交**：`chore(phase-7): delete legacy AIGC / Generate / Node-Edge / region mainline`

---

# Phase 8：质量门禁与正式切换

**Files**:
- Create: `.github/workflows/dual-product-ci.yml`
- Create: `tests/e2e/atlas-smoke.test.ts`
- Create: `tests/e2e/catalog-smoke.test.ts`
- Create: `tests/e2e/release-static.test.ts`
- Update: `docs/index.md`、`docs/architecture/`、`docs/development/`、`AGENTS.md`、`README.md`

### Task 8.1：补全测试

- Domain: 严格三段、唯一性、坐标范围、scene 引用、route 合法性、asset 类型
- Compiler: 双 manifest 内容互不重复、资源闭包、稳定 snapshot
- Runtime: camera / marker / callout / scene navigation / focusRect / sceneBridge 信封校验 / transition 成功/失败/超时/cut/abort / analytics 触发一次
- Editor 交互: 记录当前镜头 / marker/focusRect 点击拖拽缩放键盘微调 / Undo/Redo / 自动保存不拆拖拽 / revision 冲突显示
- Agent Skill: 三类样例（规范 JSON / Markdown / 缺坐标）通过 / 缺坐标输出 calibrationStatus required / 更新保留已有人工定位 / 非法 stage 失败
- E2E: 替换全景图 → 两份产物同时引用 / 切 HTML scene → 两套产品同 view / release 失败回滚 / 静态服务器独立运行

### Task 8.2：CI 流水线

按方案 §14.7：
```
typecheck → lint → unit → compile fixture → validate atlas manifest → validate catalog manifest → static closure → browser smoke
```

### Task 8.3：重建样例产物

用新项目数据重建 `guide_surface_validation_001` 的 atlas/ 与 catalog/ 产物。

### Task 8.4：更新文档

- `AGENTS.md` 顶部摘要改为 "双产品架构"
- `docs/index.md` 重写指向新 docs/plans/2026-06-29 + 2026-06-30
- 新增 `docs/architecture/dual-product-architecture.md`
- 标记所有旧 architecture/features 文档为 archived

### Task 8.5：验收脚本

```bash
npm run typecheck && npm run lint && npm run test
npm run build:atlas && npm run build:catalog
node --import tsx scripts/verify-static.ts --release data/releases/guide_surface_validation_001/1.0.0
python -m http.server -d data/releases/guide_surface_validation_001/1.0.0/atlas 8001 &
curl http://localhost:8001/manifest.json  # 必须返回 atlas manifest
```

### Task 8.6：方案 16 节 19 项验收逐条核对

按方案 §16 的 19 项做 checklist，每项产出证据（grep 结果 / 测试名 / 截图路径）。

**提交**：`docs: complete dual-product migration — domain, compilers, runtimes, editors, release`

---

## 跨阶段质量门禁

每个 Phase 提交前必须：
1. `npm run typecheck` 通过
2. `npm run lint` 通过
3. `npm run test` 全绿（Node test runner）
4. `rg "商业航天|rocket\.html|surfaceLayers|panoramaEditorDocument|targetOrigin.*\*" src/products src/domain src/platform` 在 Phase 2 后必须返回空
5. 不引入新依赖除非 Phase 0~8 计划中明确允许

## 风险与控制（继承自方案 §15）

- 两套编辑器覆盖：revision + 409 + 领域 patch（Task 2.3-2.4）
- HTML scene 漂移：scene view/itemFocusMap 校验（Task 1.8）
- 双运行时共享代码过度耦合：只共享 platform primitives，不共享 DOM 组件
- 资源复制导致包体增加：首期接受；后续可加 hash 去重
- 视频转场扩展成图引擎：ExperienceLocation 用有限 union，不提供通用图编辑
- Agent 错误覆盖：revision 锁 + 默认不覆盖 + calibration queue（Task 2.10）
- 旧代码删除过早：先冻结 fixture 完成新双产物再删（Phase 7）

## 关键约束提醒

- 不保留兼容层（删除时不留 `/guides` 别名）
- 不在新 schema 保留 legacy extensions
- 不允许 placeholder、dummy asset、错误后继续发布
- 单一事实源：panorama.assetId / scene assetId / route assetId 全部经 assetRegistry
- PROJECT_DEFAULTS 是唯一业务默认值入口