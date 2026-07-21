---
name: build-pipeline-failures
description: Common build pipeline failure modes, recovery strategies, and diagnostic steps
metadata:
  type: project
---

# Build Pipeline Failure Patterns

## Pipeline Stages

Six stages: validate → prepare → gen_nodes → gen_hotspots → gen_edges → publish.
Failures at each stage have different recovery paths.

**Why:** The build is AI-dependent (image/video generation), long-running, and must produce a complete manifest. Partial builds waste API quota.

**How to apply:** When debugging a build failure, check the generate record `{status, stageStatus}` first, then inspect per-node/edge records.

## Known Failure Modes

### 1. Image generation fails (gen_nodes stage)
- **Symptoms:** `NodeBuildRecord.imageStatus === 'failed'`, error message from AI provider
- **Root causes:** API rate limit, quota exhausted, prompt rejected by safety filter, model unavailable
- **Recovery:** Use `POST /api/generates/:id/regenerate-node/:nodeId` to retry single node. AI module (`src/server/ai/image.ts`) uses `withRetry` from `src/server/ai/retry.ts` with exponential backoff.
- **Do NOT:** Generate fake/placeholder images. The project rule is fail-fast, no synthetic data.

### 2. Video generation fails (gen_edges stage)
- **Symptoms:** `EdgeBuildRecord.videoStatus === 'failed'`, task status polling returns error
- **Root causes:** Async video task timeout (can take minutes), prompt too complex, frame images unavailable
- **Recovery:** Regenerate single edge via `POST /api/generates/:id/regenerate-edge/:edgeId`. Check that node images exist first.
- **First frame / last frame requirement:** Videos need `fromNode` and `toNode` images exposed as URLs. If those images failed, the edge cannot build.

### 3. Hotspot recommendation fails (gen_hotspots stage)
- **Symptoms:** Console error `[RegenHotspots] Vision failed for "nodeId": ...`
- **Behavior:** NON-BLOCKING. Falls back to manual hotspot positions. Build continues.
- **Recovery:** Use `POST /api/generates/:id/regenerate-hotspots/:nodeId` to retry vision recommendation.
- **Vision failures are expected** — the vision model may not understand every node image. Manual hotspots are the fallback.

### 4. Manifest validation fails (publish stage)
- **Symptoms:** `validatePublishManifest` throws, build record shows status `failed` at publish stage
- **Root causes:** Missing required fields in node/edge output, type mismatch, corrupted JSON
- **Recovery:** Check the manifest JSON at `publish/{guideId}/{version}/manifest.json`. Run validation manually.

### 5. Cache key mismatch (cached results don't apply)
- **Symptoms:** AI generation re-runs despite unchanged inputs
- **Root causes:** `buildCacheKey` input changed (prompt, resolution, style). Cache at `src/server/ai/cache.ts`.
- **Diagnostic:** Check `{result}.fromCache` boolean on generation results.

## Build Record Investigation

Key files to check when debugging:
- `data/generates/{generateId}/build.json` — top-level build record
- `data/generates/{generateId}/nodes/{nodeId}/record.json` — per-node status
- `data/generates/{generateId}/nodes/{nodeId}/planner.json` — AI planner output
- `data/generates/{generateId}/edges/{edgeId}/record.json` — per-edge status
- `data/generates/{generateId}/edges/{edgeId}/transition.json` — transition prompt & strategy

## Resume / Partial Rebuild

- A failed build CAN be resumed — only nodes/edges with status `failed` or `idle` are re-processed
- Regeneration operations (`regenerateNode`, `regenerateEdge`, `regenerateHotspots`) operate on a single item
- The `regenerator.ts` module was extracted from `pipeline.ts` for this purpose

## Environment Failures

- All AI env vars come from `.env` files. Check `DASHSCOPE_API_KEY`, model names, provider URLs.
- `loadConfig()` in `src/server/config.ts` reads env vars at startup. Missing vars → startup error.
