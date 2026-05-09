// ============================================================
// Interactive Guide - Video Generation Service (Async)
// ============================================================
// DashScope video generation is an ASYNC task:
//   1. POST to submit task -> returns task_id
//   2. GET poll task status until SUCCEEDED/FAILED
//   3. Download result video
//
// This is the critical difference from image/vision APIs.
// Follows flip-book's transitionVideo.ts pattern exactly.

import fs from 'node:fs'
import { loadConfig } from '../config.js'
import { buildCacheKey, getCachedVideo, persistVideoToCache } from './cache.js'

// ─── Task Submission ─────────────────────────────────────────
// Submits a keyframe video generation task to DashScope.
// Returns task_id immediately — video is NOT ready yet.

export interface VideoTaskResult {
  taskId: string
}

export async function submitVideoTask(
  prompt: string,
  firstFrameUrl: string,
  lastFrameUrl: string,
): Promise<VideoTaskResult> {
  const config = loadConfig()

  if (!config.VIDEO_API_KEY) {
    throw new Error('VIDEO_API_KEY is not configured — cannot generate transition videos')
  }

  const requestBody = {
    model: config.VIDEO_MODEL,
    input: {
      prompt,
      media: [
        { type: 'first_frame', url: firstFrameUrl },
        { type: 'last_frame', url: lastFrameUrl },
      ],
    },
    parameters: {
      resolution: config.VIDEO_RESOLUTION,
      duration: config.VIDEO_DURATION_SECONDS,
      audio: false,
      watermark: false,
    },
  }

  const response = await fetch(config.VIDEO_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.VIDEO_API_KEY}`,
      'X-DashScope-Async': 'enable',    // KEY: tells DashScope to run async
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(config.VIDEO_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Video task submit error ${response.status}: ${errText}`)
  }

  const payload = await response.json() as {
    output?: { task_id?: string; task_status?: string }
    code?: string
    message?: string
  }

  const taskId = payload.output?.task_id
  if (!taskId) {
    throw new Error(`Video task submit failed: ${payload.code ?? 'unknown'} - ${payload.message ?? 'no task_id returned'}`)
  }

  console.log(`[Video] Task submitted: ${taskId}`)
  return { taskId }
}

// ─── Task Status Polling ─────────────────────────────────────
// Polls the DashScope task endpoint until the video is ready.
// Returns the remote video URL when SUCCEEDED.

export type VideoTaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'

export interface VideoPollResult {
  status: VideoTaskStatus
  videoUrl?: string
  errorMessage?: string
}

export async function pollVideoTask(taskId: string): Promise<VideoPollResult> {
  const config = loadConfig()

  const response = await fetch(`${config.VIDEO_TASK_BASE_URL}/${taskId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.VIDEO_API_KEY}`,
    },
    signal: AbortSignal.timeout(config.VIDEO_POLL_INTERVAL_MS + 5000),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Video task poll error ${response.status}: ${errText}`)
  }

  const payload = await response.json() as {
    output?: {
      task_status?: string
      video_url?: string
      code?: string
      message?: string
    }
  }

  const status = (payload.output?.task_status ?? 'UNKNOWN') as VideoTaskStatus

  if (status === 'SUCCEEDED') {
    return { status, videoUrl: payload.output?.video_url }
  }

  if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
    return {
      status,
      errorMessage: `Video task ${status}: ${payload.output?.code ?? ''} ${payload.output?.message ?? ''}`,
    }
  }

  // Still running (PENDING / RUNNING)
  return { status }
}

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

  // Check cache first
  const cacheKey = buildCacheKey({
    type: 'video',
    edgeId,
    fromNodeId,
    toNodeId,
    prompt,
    model: config.VIDEO_MODEL,
    baseUrl: config.VIDEO_BASE_URL,
    resolution: config.VIDEO_RESOLUTION,
    duration: config.VIDEO_DURATION_SECONDS,
  })

  const cached = getCachedVideo(cacheKey)
  if (cached) {
    console.log(`[Video] Cache hit for edge ${edgeId}`)
    return { localPath: cached.localPath, fromCache: true }
  }

  // Step 1: Submit async task
  const { taskId } = await submitVideoTask(prompt, firstFrameUrl, lastFrameUrl)
  console.log(`[Video] Polling task ${taskId} for edge ${edgeId}...`)

  // Step 2: Poll until terminal state
  const startedAt = Date.now()
  while (Date.now() - startedAt < config.VIDEO_TIMEOUT_MS) {
    const result = await pollVideoTask(taskId)

    if (onStatusChange) onStatusChange(result.status, taskId)

    if (result.status === 'SUCCEEDED' && result.videoUrl) {
      // Step 3: Download video
      console.log(`[Video] Task ${taskId} succeeded, downloading...`)
      const videoBuffer = await downloadVideo(result.videoUrl)

      // Step 4: Persist to cache
      const localPath = persistVideoToCache(cacheKey, videoBuffer, {
        edgeId, fromNodeId, toNodeId, prompt,
        model: config.VIDEO_MODEL,
        taskId,
        remoteUrl: result.videoUrl,
      })

      console.log(`[Video] Edge ${edgeId} video saved to ${localPath}`)
      return { localPath, fromCache: false, taskId }
    }

    if (result.status === 'FAILED' || result.status === 'CANCELED') {
      throw new Error(result.errorMessage ?? `Video task ${result.status}`)
    }

    // Wait before next poll
    await delay(config.VIDEO_POLL_INTERVAL_MS)
  }

  throw new Error(`Video task ${taskId} timed out after ${config.VIDEO_TIMEOUT_MS}ms`)
}

// ─── Helpers ─────────────────────────────────────────────────

async function downloadVideo(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
