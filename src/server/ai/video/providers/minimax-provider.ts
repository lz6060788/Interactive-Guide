// ============================================================
// Interactive Guide - MiniMax Video Provider
// ============================================================

import type { AppConfig } from '../../../config.js'
import type {
  VideoGenerationProvider,
  VideoGenerationRequest,
  VideoTaskResult,
  VideoPollResult,
  VideoTaskStatus,
} from './video-provider-interface.js'

export class MiniMaxVideoProvider implements VideoGenerationProvider {
  readonly name = 'minimax' as const
  readonly model: string
  readonly timeoutMs: number
  readonly pollIntervalMs: number

  constructor(private readonly config: AppConfig) {
    this.model = config.MINIMAX_VIDEO_MODEL
    this.timeoutMs = config.VIDEO_TIMEOUT_MS
    this.pollIntervalMs = config.VIDEO_POLL_INTERVAL_MS
  }

  buildCacheIdentity(): Record<string, unknown> {
    return {
      provider: this.name,
      model: this.config.MINIMAX_VIDEO_MODEL,
      baseUrl: this.config.MINIMAX_VIDEO_BASE_URL,
      queryUrl: this.config.MINIMAX_VIDEO_QUERY_URL,
      fileBaseUrl: this.config.MINIMAX_VIDEO_FILE_BASE_URL,
      resolution: this.config.MINIMAX_VIDEO_RESOLUTION,
      duration: this.config.MINIMAX_VIDEO_DURATION_SECONDS,
      promptOptimizer: this.config.MINIMAX_VIDEO_PROMPT_OPTIMIZER,
      watermark: this.config.MINIMAX_VIDEO_WATERMARK,
      callbackUrl: this.config.MINIMAX_VIDEO_CALLBACK_URL,
    }
  }

  async submitTask(request: VideoGenerationRequest): Promise<VideoTaskResult> {
    if (!this.config.MINIMAX_VIDEO_API_KEY) {
      throw new Error('MINIMAX_VIDEO_API_KEY is not configured — cannot generate transition videos')
    }

    const requestBody = {
      model: this.config.MINIMAX_VIDEO_MODEL,
      prompt: request.prompt,
      first_frame_image: request.firstFrameUrl,
      last_frame_image: request.lastFrameUrl,
      prompt_optimizer: this.config.MINIMAX_VIDEO_PROMPT_OPTIMIZER,
      duration: this.config.MINIMAX_VIDEO_DURATION_SECONDS,
      resolution: this.config.MINIMAX_VIDEO_RESOLUTION,
      aigc_watermark: this.config.MINIMAX_VIDEO_WATERMARK,
      ...(this.config.MINIMAX_VIDEO_CALLBACK_URL
        ? { callback_url: this.config.MINIMAX_VIDEO_CALLBACK_URL }
        : {}),
    }

    const response = await fetch(this.config.MINIMAX_VIDEO_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.MINIMAX_VIDEO_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Video task submit error ${response.status}: ${errText}`)
    }

    const payload = await response.json() as {
      task_id?: string
      base_resp?: {
        status_code?: number
        status_msg?: string
      }
    }

    if ((payload.base_resp?.status_code ?? 0) !== 0) {
      throw new Error(`Video task submit failed: ${payload.base_resp?.status_code ?? 'unknown'} - ${payload.base_resp?.status_msg ?? 'unknown error'}`)
    }

    if (!payload.task_id) {
      throw new Error('Video task submit failed: no task_id returned')
    }

    return { taskId: payload.task_id }
  }

  async pollTask(taskId: string): Promise<VideoPollResult> {
    const queryUrl = new URL(this.config.MINIMAX_VIDEO_QUERY_URL)
    queryUrl.searchParams.set('task_id', taskId)

    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.MINIMAX_VIDEO_API_KEY}`,
      },
      signal: AbortSignal.timeout(this.pollIntervalMs + 5000),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Video task poll error ${response.status}: ${errText}`)
    }

    const payload = await response.json() as {
      status?: 'Preparing' | 'Queueing' | 'Processing' | 'Success' | 'Fail'
      file_id?: string
      base_resp?: {
        status_code?: number
        status_msg?: string
      }
    }

    if ((payload.base_resp?.status_code ?? 0) !== 0) {
      throw new Error(`Video task poll failed: ${payload.base_resp?.status_code ?? 'unknown'} - ${payload.base_resp?.status_msg ?? 'unknown error'}`)
    }

    const status = mapMiniMaxStatus(payload.status)
    if (status === 'SUCCEEDED') {
      if (!payload.file_id) {
        throw new Error(`Video task ${taskId} succeeded but returned no file_id`)
      }

      const videoUrl = await this.retrieveDownloadUrl(payload.file_id)
      return { status, videoUrl }
    }

    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      return {
        status,
        errorMessage: `Video task ${status}: ${payload.base_resp?.status_msg ?? 'unknown error'}`,
      }
    }

    return { status }
  }

  private async retrieveDownloadUrl(fileId: string): Promise<string> {
    const retrieveUrl = new URL(this.config.MINIMAX_VIDEO_FILE_BASE_URL)
    retrieveUrl.searchParams.set('file_id', fileId)

    const response = await fetch(retrieveUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.MINIMAX_VIDEO_API_KEY}`,
      },
      signal: AbortSignal.timeout(this.pollIntervalMs + 5000),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Video file retrieve error ${response.status}: ${errText}`)
    }

    const payload = await response.json() as {
      file?: {
        download_url?: string
      }
      base_resp?: {
        status_code?: number
        status_msg?: string
      }
    }

    if ((payload.base_resp?.status_code ?? 0) !== 0) {
      throw new Error(`Video file retrieve failed: ${payload.base_resp?.status_code ?? 'unknown'} - ${payload.base_resp?.status_msg ?? 'unknown error'}`)
    }

    if (!payload.file?.download_url) {
      throw new Error(`Video file retrieve failed: no download_url returned for file ${fileId}`)
    }

    return payload.file.download_url
  }
}

export function mapMiniMaxStatus(status?: string): VideoTaskStatus {
  switch (status) {
    case 'Preparing':
    case 'Queueing':
      return 'PENDING'
    case 'Processing':
      return 'RUNNING'
    case 'Success':
      return 'SUCCEEDED'
    case 'Fail':
      return 'FAILED'
    default:
      return 'UNKNOWN'
  }
}