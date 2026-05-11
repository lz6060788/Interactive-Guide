// ============================================================
// Interactive Guide - Image Generation Service
// ============================================================
// Supports DashScope image generation API.
// Follows flip-book's generateDashScopeImageVariant pattern.
// Image generation is synchronous (returns result directly).

import fs from 'node:fs'
import crypto from 'node:crypto'
import { loadConfig } from '../config.js'
import { buildCacheKey, getCachedImage, persistImageToCache } from './cache.js'

const DASHSCOPE_SIZE_MAP: Record<string, string> = {}

function normalizeDashScopeSize(size: string): string {
  if (DASHSCOPE_SIZE_MAP[size]) return DASHSCOPE_SIZE_MAP[size]
  // "1440x810" -> "1440*810"
  return size.replace('x', '*')
}

function isDashScopeProvider(baseUrl: string, model: string): boolean {
  return baseUrl.includes('dashscope.aliyuncs.com') || model.toLowerCase().startsWith('qwen')
}

// ─── DashScope Image Generation ──────────────────────────────

interface RawImageResult {
  buffer: Buffer
  modelInputUrl?: string
}

async function generateDashScopeImage(
  prompt: string,
  size: string,
  referenceImageBuffer?: Buffer,
): Promise<RawImageResult> {
  const config = loadConfig()
  const normalizedSize = normalizeDashScopeSize(size)

  // DashScope multimodal generation format: { "image": "<url>" } + { "text": "<prompt>" }
  const content: Array<Record<string, string>> = []
  if (referenceImageBuffer) {
    const base64 = referenceImageBuffer.toString('base64')
    content.push({ image: `data:image/png;base64,${base64}` })
  }
  content.push({ text: prompt })

  const requestBody = {
    model: config.IMAGE_MODEL,
    input: {
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    },
    parameters: {
      size: normalizedSize,
      n: 1,
    },
  }

  const response = await fetch(config.IMAGE_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.IMAGE_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(config.IMAGE_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`DashScope image API error ${response.status}: ${errText}`)
  }

  const payload = await response.json() as {
    output?: {
      choices?: Array<{
        message?: {
          content?: Array<{
            image?: string
            image_url?: string
            url?: string
          }>
        }
      }>
    }
  }

  const imageContent = payload.output?.choices?.[0]?.message?.content?.[0]
  if (!imageContent) throw new Error('Image API returned no content')

  const imageUrl = imageContent.image ?? imageContent.image_url ?? imageContent.url
  if (imageUrl) {
    // Download remote image
    const imgResp = await fetch(imageUrl)
    if (!imgResp.ok) throw new Error(`Failed to download image: ${imgResp.status}`)
    return {
      buffer: Buffer.from(await imgResp.arrayBuffer()),
      modelInputUrl: imageUrl,
    }
  }

  throw new Error('Image API returned unexpected format')
}

// ─── OpenAI-compatible Image Generation ──────────────────────

async function generateOpenAiImage(prompt: string, size: string): Promise<RawImageResult> {
  const config = loadConfig()

  const requestBody = {
    model: config.IMAGE_MODEL,
    prompt,
    size,
    n: 1,
    response_format: 'b64_json',
  }

  const response = await fetch(`${config.IMAGE_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.IMAGE_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(config.IMAGE_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Image API error ${response.status}: ${errText}`)
  }

  const payload = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string }>
  }

  const item = payload.data?.[0]
  if (!item) throw new Error('Image API returned no data')

  if (item.b64_json) {
    return { buffer: Buffer.from(item.b64_json, 'base64') }
  }
  if (item.url) {
    const imgResp = await fetch(item.url)
    if (!imgResp.ok) throw new Error(`Failed to download image: ${imgResp.status}`)
    return {
      buffer: Buffer.from(await imgResp.arrayBuffer()),
      modelInputUrl: item.url,
    }
  }

  throw new Error('Image API returned no image data')
}

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

  // Generate image
  let imageResult: RawImageResult
  if (isDashScopeProvider(config.IMAGE_BASE_URL, config.IMAGE_MODEL)) {
    imageResult = await generateDashScopeImage(prompt, size, referenceImageBuffer)
  } else {
    imageResult = await generateOpenAiImage(prompt, size)
  }

  // Persist to cache
  const localPath = persistImageToCache(cacheKey, imageResult.buffer, {
    nodeId, prompt, size, model: config.IMAGE_MODEL, provider: isDashScopeProvider(config.IMAGE_BASE_URL, config.IMAGE_MODEL) ? 'dashscope' : 'openai',
    modelInputUrl: imageResult.modelInputUrl,
  })

  return {
    localPath,
    fromCache: false,
    modelInputUrl: imageResult.modelInputUrl,
  }
}
