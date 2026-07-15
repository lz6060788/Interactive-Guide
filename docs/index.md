## Docs Index

Last sync: Falcon 宿主预检 / 普通浏览器跳过 F10 / 存储芯片 revision 21 预览验收 (2026-07-15)

### Modules

| Module | Code Path | Architecture | Design | Features | Status |
|--------|-----------|--------------|--------|----------|--------|
| domain | `src/domain/` | [核心数据模型](architecture/项目技术架构与核心逻辑总览.md) | [项目Schema](features/知识输入Schema设计.md) | — | ✅ |
| server | `src/server/` | [后端架构](architecture/后端详细设计方案.md) | — | [构建任务流](architecture/构建任务流与目录结构设计.md) | ✅ |
| products/atlas | `src/products/atlas/` | [运行时](architecture/运行时渲染架构与扩展设计.md) | — | [Atlas产品](features/独立全景HTML产物方案设计.md) | ✅ |
| products/catalog | `src/products/catalog/` | — | — | [Catalog产品](features/独立全景HTML产物方案设计.md) | ✅ |
| platform | `src/platform/` | — | — | [HTML协议](features/HTML节点通信协议与接入指南.md) | ✅ |
| admin | `src/admin/` | — | — | [UI流程](features/管理端UI与操作流程设计.md) | ✅ |

### Development

| Doc | Description |
|-----|-------------|
| [Atlas F10 分享与 WeBlog 四事件设计](superpowers/specs/2026-07-15-atlas-f10-weblog-integration-design.md) | Atlas-only 四事件、Falcon 宿主预检、F10 分享/跳转与 revision 21 产物验收 (2026-07-15) |
| [存储芯片产业链项目引导报告](development/memory-chip-project-bootstrap-report.md) | 3/9/27 知识映射、9/27 空间坐标、双产品编译验证与人工校准清单 (2026-07-15) |
| [Phase 18 ES5 独立产物导出](development/phase18-es5-standalone-export-2026-07-15.md) | Atlas/Catalog 共用 ES5 IIFE 构建、静态预览、ZIP 下载和编辑器自动保存导出 (2026-07-15) |
| [Phase 17 修复](development/phase17-atlas-html-scene-route-transition-2026-07-06.md) | Atlas HTML Scene category route / transition video / preview scene iframe / navigation save + demo scene 迁移到 SceneBridge v1.0.0 + scene 复用宿主 chrome + Atlas/Catalog 共用 scene host + 平台层 SceneHostController 抽离 + draft/release 宿主页骨架落盘 + preview/release 静态文件路由闭环 + 真实 runtime 宿主接入产物链 + legacy 资产路径发布修复 (2026-07-06 / 2026-07-07) |
| [Phase 16 修复](development/phase16-five-fixes-2026-07-01.md) | 拖动缩放 / Hotspot-Callout 一致性 / 删焦点矩形 / 底部详情面板 / Zoom 阈值 (2026-07-01) |
| [Phase 15 修复](development/phase15-preview-url-hotspot-callout-2026-07-01.md) | AtlasPreview 底图 URL / Hotspot 视觉 / Callout 线+Pin 视觉对齐运行时 (2026-07-01) |
| [Phase 14 修复](development/phase14-six-detail-fixes-2026-07-01.md) | AtlasRuntime mount 竞态 / IME 输入 / 面包屑 / Hotspot 视觉 / 工具栏激活态 / 画布平移 (2026-07-01) |
| [Phase 13 修复](development/phase13-hotspot-toolbar-canvas-fixes-2026-07-01.md) | html-bundle 上传去除 / view schema 放宽 / AtlasPreview 占位 / Hotspot 复合 transform / 拖拽禁用 transition / 工具栏边界 (2026-07-01) |
| [Phase 12 修复](development/phase12-panorama-bind-htmlscene-fix-2026-07-01.md) | "设为底图" 按钮 / HTML 场景 schema 放宽 / 概念说明 (2026-07-01) |
| [Phase 11 变更](development/phase11-chakra-migration-2026-07-01.md) | Chakra UI 3.35 迁移 / 删除 13 个手写 primitives (2026-07-01) |
| [Phase 10 变更](development/phase10-hover-settings-htmlscene-canvas-2026-07-01.md) | Hover states / Settings / HTML Scene / 画布直接操作 (2026-07-01) |
| [重构计划](plans/2026-06-30-dual-product-refactor.md) | Dual-product refactor (Phases 0–8) |
| [验收基线](development/dual-product-baseline-2026-06-30.md) | Phase 0 acceptance baseline |
| [端到端验证流程](development/端到端验证流程-2026-06-30.md) | From-scratch end-to-end verification checklist |
| [实现指导](development/项目设计与实现指导.md) | Implementation guidance |
| [测试方案](development/后端验收标准与测试方案.md) | Test standards |

### Archived (replaced by dual-product architecture)

> ARCHIVED 2026-06-30 — replaced by dual-product architecture

| Doc | Note |
|-----|------|
| [发布Manifest与运行时数据契约设计](architecture/发布Manifest与运行时数据契约设计.md) | Replaced by `src/products/atlas/contract` + `src/products/catalog/contract` |
| [构建任务流与目录结构设计](architecture/构建任务流与目录结构设计.md) | Replaced by `src/server/services/release-service` |
| [局部子图节点与区域视窗架构设计](architecture/局部子图节点与区域视窗架构设计.md) | Removed in Phase 7 |
| [总图漫游与独立节点架构设计](architecture/总图漫游与独立节点架构设计.md) | Removed in Phase 7 |
| [运行时渲染架构与扩展设计](architecture/运行时渲染架构与扩展设计.md) | Migrated; see `src/products/{atlas,catalog}/runtime/` |
| [独立全景HTML产物方案设计](features/独立全景HTML产物方案设计.md) | Migrated; dual-product release covers both Atlas and Catalog |
| [管理端工作台组件拆分与状态设计](features/管理端工作台组件拆分与状态设计.md) | Replaced by `src/admin/src/editors/{atlas,catalog}` |
| [生图内容描述规范](features/生图内容描述规范.md) | AI removed in Phase 7 |

### Postmortems

| Doc | Date |
|-----|------|
| [宏观经济学导览生成复盘](postmortems/宏观经济学导览生成复盘与知识沉淀-2026-05-11.md) | 2026-05-11 |
| [边转场视频与预览链路修复](postmortems/边转场视频与预览链路修复-2026-05-11.md) | 2026-05-11 |

### Plans

| Doc | Date |
|-----|------|
| [ES5 独立产物导出实施计划](plans/2026-07-15-es5-standalone-export-implementation.md) | 2026-07-15 |
| [重构后续修复与体验恢复计划](plans/2026-07-03-post-refactor-remediation-plan.md) | 2026-07-03 |
| [双产品架构重构方案](plans/2026-06-29-双产品架构重构方案.md) | 2026-06-29 |
| [双产品重构实施计划](plans/2026-06-30-dual-product-refactor.md) | 2026-06-30 |

### Domain Knowledge

| Topic | File |
|-------|------|
| 商业航天产业链 | [domain/商业航天产业链.md](domain/商业航天产业链.md) |

---

Status legend: ✅ current · ⚠️ needs review · ❌ outdated
