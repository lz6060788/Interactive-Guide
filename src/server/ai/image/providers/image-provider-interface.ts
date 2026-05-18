// ============================================================
// Interactive Guide - Image Provider Interface
// ============================================================
// Platform-agnostic interface and factory for image generation.

import type { AppConfig } from '../../../config.js'

export type ImageProviderName = 'dashscope' | 'openai'

export interface RawImageResult {
  buffer: Buffer
  modelInputUrl?: string
}

export interface ImageGenerationProvider {
  readonly name: ImageProviderName
  generate(prompt: string, size: string, referenceImageBuffer?: Buffer): Promise<RawImageResult>
}

// ─── Factory ────────────────────────────────────────────────

import { DashScopeImageProvider } from './dashscope-image-provider.js'
import { OpenAIImageProvider } from './openai-image-provider.js'

export function createImageProvider(config: AppConfig): ImageGenerationProvider {
  if (config.IMAGE_PROVIDER === 'openai') {
    return new OpenAIImageProvider(config)
  }
  return new DashScopeImageProvider(config)
}