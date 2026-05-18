// ============================================================
// Interactive Guide - WanXiang Video Provider
// ============================================================

import type { AppConfig } from '../../../config.js'
import type {
  VideoGenerationProvider,
  VideoGenerationRequest,
  VideoTaskResult,
  VideoPollResult,
  VideoTaskStatus,
} from './video-provider-interface.js'

export class WanXiangVideoProvider implements VideoGenerationProvider {
  readonly name = 'wanxiang' as const
  readonly model: string
  readonly timeoutMs: number
  readonly pollIntervalMs: number

  constructor(private readonly config: AppConfig) {
    this.model = config.WANXIANG_VIDEO_MODEL
    this.timeoutMs = config.VIDEO_TIMEOUT_MS
    this.pollIntervalMs = config.VIDEO_POLL_INTERVAL_MS
  }

  buildCacheIdentity(): Record<string, unknown> {
    return {
      provider: this.name,
      model: this.config.WANXIANG_VIDEO_MODEL,
      baseUrl: this.config.WANXIANG_VIDEO_BASE_URL,
      taskBaseUrl: this.config.WANXIANG_VIDEO_TASK_BASE_URL,
      resolution: this.config.WANXIANG_VIDEO_RESOLUTION,
      duration: this.config.WANXIANG_VIDEO_DURATION_SECONDS,
      promptExtend: this.config.WANXIANG_VIDEO_PROMPT_EXTEND,
      watermark: this.config.WANXIANG_VIDEO_WATERMARK,
    }
  }

  async submitTask(request: VideoGenerationRequest): Promise<VideoTaskResult> {
    if (!this.config.WANXIANG_VIDEO_API_KEY) {
      throw new Error('WANXIANG_VIDEO_API_KEY is not configured — cannot generate transition videos')
    }

    const requestBody = {
      model: this.config.WANXIANG_VIDEO_MODEL,
      input: {
        prompt: request.prompt,
        media: [
          { type: 'first_frame', url: request.firstFrameUrl },
          { type: 'last_frame', url: request.lastFrameUrl },
        ],
      },
      parameters: {
        resolution: this.config.WANXIANG_VIDEO_RESOLUTION,
        duration: this.config.WANXIANG_VIDEO_DURATION_SECONDS,
        prompt_extend: this.config.WANXIANG_VIDEO_PROMPT_EXTEND,
        watermark: this.config.WANXIANG_VIDEO_WATERMARK,
      },
    }

    const response = await fetch(this.config.WANXIANG_VIDEO_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.WANXIANG_VIDEO_API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Video task submit error ${response.status}: ${errText}`)
    }

    const payload = await response.json() as {
      output?: { task_id?: string }
      code?: string
      message?: string
    }

    const taskId = payload.output?.task_id
    if (!taskId) {
      throw new Error(`Video task submit failed: ${payload.code ?? 'unknown'} - ${payload.message ?? 'no task_id returned'}`)
    }

    return { taskId }
  }

  async pollTask(taskId: string): Promise<VideoPollResult> {
    const response = await fetch(`${this.config.WANXIANG_VIDEO_TASK_BASE_URL}/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.WANXIANG_VIDEO_API_KEY}`,
      },
      signal: AbortSignal.timeout(this.pollIntervalMs + 5000),
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
        errorMessage: `Video task ${status}: ${payload.output?.code ?? ''} ${payload.output?.message ?? ''}`.trim(),
      }
    }

    return { status }
  }
}