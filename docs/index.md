## Docs Index

Last sync: `22c6a5a` | 2026-06-23

### Modules

| Module | Code Path | Architecture | Design | Features | Status |
|--------|-----------|-------------|--------|----------|--------|
| server | `src/server/` | [总览](architecture/项目技术架构与核心逻辑总览.md) | [后端设计](architecture/后端详细设计方案.md) | [构建任务流](architecture/构建任务流与目录结构设计.md) | ✅ |
| runtime | `src/runtime/` | [渲染架构](architecture/运行时渲染架构与扩展设计.md) | [区域视窗](architecture/局部子图节点与区域视窗架构设计.md) | [填充模式](architecture/画面比例与图片填充模式渲染逻辑-2026-05-21.md) | ✅ |
| panorama | `src/panorama-runtime/` | [总图漫游](architecture/总图漫游与独立节点架构设计.md) | — | [HTML产物](features/独立全景HTML产物方案设计.md) | ✅ |
| admin | `src/admin/` | — | — | [UI流程](features/管理端UI与操作流程设计.md), [组件状态](features/管理端工作台组件拆分与状态设计.md) | ✅ |
| shared | `src/shared/` | [数据契约](architecture/发布Manifest与运行时数据契约设计.md) | [Schema](features/知识输入Schema设计.md) | [生图规范](features/生图内容描述规范.md), [HTML协议](features/HTML节点通信协议与接入指南.md) | ✅ |

### Development

| Doc | Description |
|-----|-------------|
| [开发计划](development/开发计划.md) | Phase roadmap |
| [特性清单](development/项目能力与特性清单.md) | Feature checklist |
| [实现指导](development/项目设计与实现指导.md) | Implementation guidance |
| [测试方案](development/后端验收标准与测试方案.md) | Test standards |
| [调试指南](development/rocket开发调试指南.md) | Debugging reference |

### Postmortems

| Doc | Date |
|-----|------|
| [宏观经济学导览生成复盘](postmortems/宏观经济学导览生成复盘与知识沉淀-2026-05-11.md) | 2026-05-11 |
| [边转场视频与预览链路修复](postmortems/边转场视频与预览链路修复-2026-05-11.md) | 2026-05-11 |

### Plans

| Doc | Date |
|-----|------|
| [双产品架构重构方案](plans/2026-06-29-双产品架构重构方案.md) | 2026-06-29 |
| [builtin-transitions-design](plans/2026-05-18-builtin-transitions-design.md) | 2026-05-18 |
| [builtin-transitions-implementation](plans/2026-05-18-builtin-transitions-implementation.md) | 2026-05-18 |
| [modal-refactoring-plan](plans/2026-05-18-modal-refactoring-plan.md) | 2026-05-18 |
| [refactoring](plans/2026-05-18-refactoring.md) | 2026-05-18 |
| [builtin-transition-flicker-followup](plans/2026-05-19-builtin-transition-flicker-followup.md) | 2026-05-19 |
| [interactive-guide-skill-design](plans/2026-05-19-interactive-guide-skill-design.md) | 2026-05-19 |
| [gyro-pan-integration](plans/2026-05-22-gyro-pan-integration.md) | 2026-05-22 |

### External API Docs

| Provider | File |
|----------|------|
| MiniMax | [api/minimax.md](api/minimax.md) |
| Wanxiang | [api/wanxiang.md](api/wanxiang.md) |

### Domain Knowledge

| Topic | File |
|-------|------|
| 商业航天产业链 | [domain/商业航天产业链.md](domain/商业航天产业链.md) |
| Macroeconomics | [domain/Macroeconomics/](domain/Macroeconomics/) (9 docs) |

---

Status legend: ✅ current · ⚠️ needs review · ❌ outdated
