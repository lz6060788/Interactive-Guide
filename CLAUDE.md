# Interactive Guide - Project Context

## Project Overview

Interactive Guide is a **pre-generated interactive exploration system** for operations teams.
It takes structured knowledge data (tree/graph of nodes with edges), pre-generates node images and edge transition videos at build time, and delivers a lightweight runtime player for end-user exploration.

**Reference Project**: `D:\workspace\git\flip-book` — this project evolved from flip-book. Key technologies and patterns are inherited from it.

## Technology Stack

- **Backend**: Express 5 + TypeScript + Zod + tsx (Node.js ESM)
- **Frontend**: React 19 + Vite + TypeScript
- **State**: In-memory Maps persisted to JSON files (no database for Phase 1)
- **AI Providers** (via DashScope): vision model, image generation model, video generation model
- **All AI-related env vars MUST be extracted to .env files**, never hardcoded

## Architecture

```
src/
├── shared/          # Shared types, validators, utilities
├── server/          # Backend: Express API + build pipeline
│   ├── routes/      # Express routers (guides, generates, health)
│   ├── services/    # Business logic (guide-service, generate-service)
│   ├── storage/     # Repository pattern (repository.ts, fs-repository.ts)
│   ├── middleware/   # Error handling (app-error, error-handler)
│   └── ai/          # AI capabilities (vision, image, video, media, cache)
├── admin/           # Admin frontend: React workbench
└── runtime/         # Runtime player: manifest loader, renderer
data/
├── guides/          # Knowledge package source data
├── generates/       # Generate intermediate results
└── publish/         # Published manifests and assets
docs/                # All design documents
```

## Service Ports

- **Backend**: `http://localhost:8788`
- **Admin frontend**: `http://localhost:5173` (Vite default)

## Development Phases

1. Phase 0: Project skeleton + directory structure
2. Phase 1: Shared types, schema contracts, validators
3. Phase 2: Build pipeline (package -> nodes -> hotspots -> edges -> manifest)
4. Phase 3: Runtime player (manifest loader, node display, hotspot click, video transition)
5. Phase 4: Admin workbench (package list, React Flow canvas, detail drawer, preview, hotspot calibration)
6. Phase 5: Build background enhancement (retry, resume, logs)
7. Phase 6: Automation (auto hotspot recommendation, caching, versioning)

## Key Design Decisions

- **Build-time compilation model**: Heavy logic runs at build time, runtime is lightweight
- **Node + Edge model**: Nodes are visual pages, edges represent transitions between pages
- **Hotspot coordinates are first-class build outputs**: Not runtime config
- **Root node id is always 'root'**: Fixed convention across all layers
- **PublishManifest is the critical runtime contract**: Frontend only depends on manifest.json + assets/
- **No database in Phase 1**: File-system driven task model

## Coding Rules

- **No hardcoded fallback or placeholder**: If an AI API call fails, it must throw a clear error. Never silently fall back to placeholder images, synthetic data, or dummy responses. Let the build fail fast so the operator can diagnose the root cause.
- **No synthetic data**: Do not generate fake planner output, dummy images (e.g. base64 1×1 PNG), or mock video artifacts. The build pipeline either succeeds with real AI output or fails with a real error.
- **All AI-related env vars must come from .env files**: Never hardcode API keys, model names, or provider URLs.
- **Process management**: 重启服务时，只关闭目标端口占用的进程，绝不能误杀其他 node 进程。使用 `netstat -ano | findstr :PORT` 查找 PID 后精确 kill。例如重启后端：`netstat -ano | findstr :8788` → `taskkill /PID <PID> /F`。

## Environment Variables

All AI/ML provider configs must come from environment variables. The flip-book project uses these env var patterns — follow the same convention. Extract all API keys, model names, and provider URLs to `.env` files.

## Project Docs

- `docs/开发计划.md`: 当前开发阶段、已完成能力与后续重点
- `docs/项目技术架构与核心逻辑总览.md`: 项目全局技术架构、核心逻辑链路、模块分层与应用场景总览
- `docs/运行时渲染架构与扩展设计.md`: 运行时三层结构、`PlayerHost/PlayerCore` 职责边界、iframe `postMessage` 协议与独立运行时集成约束
- `docs/宏观经济学导览生成复盘与知识沉淀-2026-05-11.md`: 内容驱动导览出图改造复盘
- `docs/边转场视频与预览链路修复-2026-05-11.md`: 边视频、对象存储暴露、预览播放与状态回写修复
- `docs/生图内容描述规范.md`: 场景图与知识信息图的提示词规范
- `docs/知识输入Schema设计.md`: 当前知识输入 schema 与字段约定
