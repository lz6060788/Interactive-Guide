# Interactive Guide - Agent Context

## Project Overview

Interactive Guide is a **dual-product interactive content system** for industry-chain operations teams.
A single `project.json` is the source of truth for knowledge, panorama, scenes, and project config; one release atomically produces two independent HTML bundles — **Atlas** (free-exploration panorama) and **Catalog** (structured three-stage list).

## Architecture

```
src/
├── domain/        # GuideProject 2.0 types, Zod schema, validators, normalizer
├── config/        # PROJECT_DEFAULTS, editor-theme visual tokens
├── platform/      # SceneBridge v1.0.0, transition video, analytics adapter, share, asset loader
├── products/
│   ├── atlas/     # Atlas product: contract, compiler, runtime (free-exploration)
│   └── catalog/   # Catalog product: contract, compiler, runtime (structured knowledge)
├── server/        # Express 5 API: project CRUD + revision locking + asset upload + atomic release
├── admin/         # React admin: project editor + atlas/catalog editors + WYSIWYG previews
└── skills/        # Agent Skill: guide-project-bootstrap (deterministic project creation)
data/
└── projects/      # Per-project directory: project.json + assets/{images,videos,scenes}
docs/              # All design documents
```

## Service Ports

- **Backend**: `http://localhost:8788`
- **Admin frontend**: `http://localhost:5173` (Vite default)

## Key Design Decisions

- **Dual-product architecture**: One project → two independent HTML bundles. No AI; no synthetic data.
- **Domain Core is the single source of truth**: GuideProject 2.0 schema with `products.atlas` and `products.catalog` sub-configs.
- **Atlas = free-exploration panorama**: Hotspots activate categories; items get callout markers. WYSIWYG matches runtime.
- **Catalog = structured three-stage list**: Strict `upstream → midstream → downstream`. Items get `focusRect` overlays.
- **Strict three-stage industry chain**: Stages fixed, label fixed, ordering fixed. Schema enforces.
- **Normalized `[0,1]` coordinate space**: No absolute pixel configs anywhere — markers, hotspots, focusRect.
- **Revision-locked optimistic concurrency**: Every PATCH carries `x-expected-revision`; conflicts return 409.
- **Atomic dual-product release**: Both products built into a tmp dir, validated, then renamed into place.
- **SceneBridge v1.0.0 protocol**: postMessage envelopes between host and HTML scene iframe; `targetOrigin` derived, never `*`.

## Coding Rules

- **No AI, no synthetic data**: All AI modules were removed in Phase 7. If a runtime needs data, the operator must provide it.
- **No hardcoded fallback or placeholder**: Fail fast with a real error.
- **All env vars come from .env files**: PORT, DATA_DIR, CORS_ORIGIN only — no AI keys anymore.
- **Process management**: 重启服务时，只关闭目标端口占用的进程，绝不能误杀其他 node 进程。使用 `netstat -ano | findstr :PORT` 查找 PID 后精确 kill。

## Project Docs

```
docs/
├── architecture/          # 系统架构与核心设计
├── features/              # 功能特性设计
├── development/           # 开发计划、验收、调试
├── postmortems/           # 复盘与知识沉淀
├── domain/                # 领域知识
├── plans/                 # 临时设计计划
└── index.md               # 模块 + 文档索引
```

## Recent Refactor (2026-06-30)

The codebase went through an 8-phase refactor from a generic Node/Edge AIGC navigation system to the dual-product architecture above. See `docs/plans/2026-06-30-dual-product-refactor.md` for the full plan.