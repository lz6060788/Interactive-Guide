## Docs Index

Last sync: dual-product architecture (2026-06-30)

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
| [重构计划](plans/2026-06-30-dual-product-refactor.md) | Dual-product refactor (Phases 0–8) |
| [验收基线](development/dual-product-baseline-2026-06-30.md) | Phase 0 acceptance baseline |
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
| [双产品架构重构方案](plans/2026-06-29-双产品架构重构方案.md) | 2026-06-29 |
| [双产品重构实施计划](plans/2026-06-30-dual-product-refactor.md) | 2026-06-30 |

### Domain Knowledge

| Topic | File |
|-------|------|
| 商业航天产业链 | [domain/商业航天产业链.md](domain/商业航天产业链.md) |

---

Status legend: ✅ current · ⚠️ needs review · ❌ outdated