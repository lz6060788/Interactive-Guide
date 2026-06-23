// ============================================================
// Interactive Guide - Video Generation Service (Async)
// ============================================================
// Video generation remains an async task, but the provider
// can now be selected by configuration. This module keeps the
// shared pipeline: cache -> submit -> poll -> download -> persist.

import { loadConfig } from '../config.js'
import { buildCacheKey, getCachedVideo, persistVideoToCache } from './cache.js'
import { withRetry } from './retry.js'
import { createVideoProvider, type VideoGenerationRequest, type VideoTaskStatus } from './video-provider.js'

// ─── Full Async Pipeline ─────────────────────────────────────
// Submit task, poll until done, download video, persist to cache.
// This can take several minutes — caller must handle the async nature.

export interface GenerateVideoResult {
  localPath: string
  fromCache: boolean
  taskId?: string
}

export async function generateTransitionVideo(
  edgeId: string,
  fromNodeId: string,
  toNodeId: string,
  prompt: string,
  firstFrameUrl: string,
  lastFrameUrl: string,
  onStatusChange?: (status: VideoTaskStatus, taskId: string) => void,
): Promise<GenerateVideoResult> {
  const config = loadConfig()
  const provider = createVideoProvider(config)

  const cacheKey = buildCacheKey({
    type: 'video',
    edgeId,
    fromNodeId,
    toNodeId,
    prompt,
    ...provider.buildCacheIdentity(),
  })

  const cached = getCachedVideo(cacheKey)
  if (cached) {
    console.log(`[Video] Cache hit for edge ${edgeId} via ${provider.name}`)
    return { localPath: cached.localPath, fromCache: true }
  }

  const request: VideoGenerationRequest = {
    prompt,
    firstFrameUrl,
    lastFrameUrl,
  }

  const { taskId } = await withRetry(
    `video-submit-${edgeId}`,
    () => provider.submitTask(request),
  )
  console.log(`[Video] Task submitted via ${provider.name}: ${taskId}`)
  console.log(`[Video] Polling task ${taskId} for edge ${edgeId}...`)

  const startedAt = Date.now()
  while (Date.now() - startedAt < provider.timeoutMs) {
    const result = await withRetry(
      `video-poll-${taskId}`,
      () => provider.pollTask(taskId),
    )

    if (onStatusChange) onStatusChange(result.status, taskId)

    if (result.status === 'SUCCEEDED' && result.videoUrl) {
      console.log(`[Video] Task ${taskId} succeeded, downloading...`)
      const videoBuffer = await downloadVideo(result.videoUrl)

      const localPath = persistVideoToCache(cacheKey, videoBuffer, {
        edgeId,
        fromNodeId,
        toNodeId,
        prompt,
        provider: provider.name,
        model: provider.model,
        taskId,
        remoteUrl: result.videoUrl,
      })

      console.log(`[Video] Edge ${edgeId} video saved to ${localPath}`)
      return { localPath, fromCache: false, taskId }
    }

    if (result.status === 'FAILED' || result.status === 'CANCELED') {
      throw new Error(result.errorMessage ?? `Video task ${result.status}`)
    }

    await delay(provider.pollIntervalMs)
  }

  throw new Error(`Video task ${taskId} timed out after ${provider.timeoutMs}ms`)
}

// ─── Helpers ─────────────────────────────────────────────────

async function downloadVideo(url: string): Promise<Buffer> {
  const response = await withRetry(
    `video-download`,
    () => fetch(url, { signal: AbortSignal.timeout(60_000) }),
  )
  if (!response.ok) {
    throw Object.assign(new Error(`Failed to download video: ${response.status}`), { status: response.status })
  }
  return Buffer.from(await response.arrayBuffer())
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
