// ============================================================
// Interactive Guide - Image Generation Service
// ============================================================
// Facade exporting types, factory, and the core generation function.

import crypto from 'node:crypto'
import { loadConfig } from '../config.js'
import { buildCacheKey, getCachedImage, persistImageToCache } from './cache.js'
import { withRetry } from './retry.js'
import { createImageProvider, type ImageProviderName, type ImageGenerationProvider } from './image/providers/image-provider-interface.js'

export { type ImageProviderName, type ImageGenerationProvider, createImageProvider }
export type { RawImageResult } from './image/providers/image-provider-interface.js'

// ─── Public API ──────────────────────────────────────────────

export interface GenerateImageResult {
  localPath: string
  fromCache: boolean
  modelInputUrl?: string
}

export async function generateNodeImage(
  nodeId: string,
  prompt: string,
  width: number,
  height: number,
  referenceImageBuffer?: Buffer,
): Promise<GenerateImageResult> {
  const config = loadConfig()

  if (!config.IMAGE_API_KEY) {
    throw new Error('IMAGE_API_KEY is not configured — cannot generate node images')
  }

  const size = `${width}x${height}`

  // Include reference image hash in cache key to avoid conflicts
  const refHash = referenceImageBuffer
    ? crypto.createHash('sha256').update(referenceImageBuffer).digest('hex').slice(0, 16)
    : undefined

  // Check cache
  const cacheKey = buildCacheKey({
    type: 'image',
    cacheVersion: 'v2-model-input-url',
    nodeId,
    prompt,
    size,
    model: config.IMAGE_MODEL,
    baseUrl: config.IMAGE_BASE_URL,
    refHash,
  })

  const cached = getCachedImage(cacheKey)
  if (cached) {
    return {
      localPath: cached.localPath,
      fromCache: true,
      modelInputUrl: cached.record?.modelInputUrl,
    }
  }

  // Generate image via provider (with retry on transient failures)
  const provider = createImageProvider(config)
  const imageResult = await withRetry(
    `image-generate-${nodeId}`,
    () => provider.generate(prompt, size, referenceImageBuffer),
  )

  // Persist to cache
  const localPath = persistImageToCache(cacheKey, imageResult.buffer, {
    nodeId, prompt, size, model: config.IMAGE_MODEL, provider: provider.name,
    modelInputUrl: imageResult.modelInputUrl,
  })

  return {
    localPath,
    fromCache: false,
    modelInputUrl: imageResult.modelInputUrl,
  }
}