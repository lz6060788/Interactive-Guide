// ============================================================
// Interactive Guide - OpenAI Image Generation Provider
// ============================================================
// OpenAI-compatible image generation API (DALL-E, etc.).

import type { AppConfig } from '../../../config.js'
import type { ImageGenerationProvider, RawImageResult } from './image-provider-interface.js'

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = 'openai' as const

  constructor(private readonly config: AppConfig) {}

  async generate(prompt: string, size: string): Promise<RawImageResult> {
    const requestBody = {
      model: this.config.IMAGE_MODEL,
      prompt,
      size,
      n: 1,
      response_format: 'b64_json',
    }

    const response = await fetch(`${this.config.IMAGE_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.IMAGE_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.IMAGE_TIMEOUT_MS),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Image generation API error ${response.status}: ${errText}`)
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
}