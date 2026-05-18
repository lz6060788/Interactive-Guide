// ============================================================
// Interactive Guide - Video Provider Interface
// ============================================================
// Shared types and factory for all video generation providers.

import type { AppConfig } from '../../../config.js'

export type VideoProviderName = 'aishi' | 'minimax' | 'wanxiang'
export type VideoTaskStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'

export interface VideoGenerationRequest {
  prompt: string
  firstFrameUrl: string
  lastFrameUrl: string
}

export interface VideoTaskResult {
  taskId: string
}

export interface VideoPollResult {
  status: VideoTaskStatus
  videoUrl?: string
  errorMessage?: string
}

export interface VideoDownloadResult {
  localPath: string
  fromCache: boolean
  modelInputUrl?: string
}

export interface VideoGenerationProvider {
  readonly name: VideoProviderName
  readonly model: string
  readonly timeoutMs: number
  readonly pollIntervalMs: number

  buildCacheIdentity(): Record<string, unknown>
  submitTask(request: VideoGenerationRequest): Promise<VideoTaskResult>
  pollTask(taskId: string): Promise<VideoPollResult>
}

// ─── Factory ──────────────────────────────────────────────────────────────────

import { AishiVideoProvider } from './aishi-provider.js'
import { MiniMaxVideoProvider } from './minimax-provider.js'
import { WanXiangVideoProvider } from './wanxiang-provider.js'

export function createVideoProvider(config: AppConfig): VideoGenerationProvider {
  if (config.VIDEO_PROVIDER === 'minimax') {
    return new MiniMaxVideoProvider(config)
  }

  if (config.VIDEO_PROVIDER === 'wanxiang') {
    return new WanXiangVideoProvider(config)
  }

  return new AishiVideoProvider(config)
}