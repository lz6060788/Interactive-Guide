---
name: ai-provider-issues
description: AI provider failure patterns, retry behavior, and debugging steps for DashScope API calls
metadata:
  type: project
---

# AI Provider Failure Patterns

## Provider Architecture

- All AI calls go through DashScope (OpenAI-compatible API)
- `src/server/ai/image.ts` — image generation (sync request/response)
- `src/server/ai/video.ts` — video generation (async: submit → poll → download)
- `src/server/ai/vision.ts` — vision/LLM: node planning + hotspot recommendation
- `src/server/ai/retry.ts` — `withRetry` wrapper with exponential backoff
- `src/server/ai/cache.ts` — caching layer for all AI results

**Why:** AI API calls are the most failure-prone part of the build. Understanding failure patterns saves debugging time.

**How to apply:** When an AI call fails, check: (1) was it retried? (2) is there a cached result? (3) is the prompt too long? (4) is the API quota exhausted?

## Retry Behavior

All AI calls use `withRetry` from `src/server/ai/retry.ts`:
- Exponential backoff with configurable max attempts
- Retries on transient errors (network, rate limit, server error)
- Does NOT retry on permanent errors (invalid prompt, safety rejection, auth failure)

## Known Failure Patterns

### Safety filter rejection
- **Symptom:** API returns 400 with "content filter" or "safety" in message
- **Affected:** Image generation most commonly
- **Fix:** Adjust the prompt to avoid sensitive terms. Check `prompt-builder.ts` for prompt construction.

### Rate limit / quota
- **Symptom:** API returns 429 or 503
- **Retry handles this** — exponential backoff will wait and retry
- **If persistent:** Check DashScope console for quota usage

### Model unavailable
- **Symptom:** API returns 404 or "model not found"
- **Fix:** Verify model name in `.env` matches available models. Check DashScope documentation.

### Vision model timeout
- **Symptom:** Vision call hangs or returns partial JSON
- **Behavior:** Vision failures are non-blocking in hotspot regeneration (src/server/services/regenerator.ts:90-92)
- **But:** Vision failures during transition planning DO block edge generation

### Video task timeout
- **Symptom:** Video generation submitted but polling never receives "SUCCESS"
- **Current behavior:** Async polling loop in video provider
- **Check:** `video-provider.ts` implementation for timeout/max-poll configuration

## Cache Layer

- Cache key: `buildCacheKey(inputs)` → hash-based dedup
- Cached: image results, video results, planner results, hotspot recommendations
- Cache location: `data/cache/` directory (file-system based)
- **If cache is stale:** Delete the cache directory and rebuild

## Prompt Construction

- All prompts built by `PromptBuilder` class (src/server/services/prompt-builder.ts)
- Image prompts: `buildImagePrompt(node, guide)` — includes style, resolution, content
- Transition prompts: `buildTransitionPrompt(edge, fromNode, toNode, guide, visualPlan)` — includes visual plan
- Vision prompts: for hotspot recommendation and transition planning
- **Prompt too long** → truncation or API rejection. Check prompt length before calling.
