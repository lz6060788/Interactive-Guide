// ============================================================
// Interactive Guide - DashScope Image Generation Provider
// ============================================================
// Implements the DashScope image generation API.

import type { AppConfig } from '../../../config.js'
import type { ImageGenerationProvider, RawImageResult } from './image-provider-interface.js'

export class DashScopeImageProvider implements ImageGenerationProvider {
  readonly name = 'dashscope' as const

  constructor(private readonly config: AppConfig) {}

  private normalizeSize(size: string): string {
    // "1440x810" -> "1440*810"
    return size.replace('x', '*')
  }

  async generate(prompt: string, size: string, referenceImageBuffer?: Buffer): Promise<RawImageResult> {
    const normalizedSize = this.normalizeSize(size)

    // DashScope multimodal generation format: { "image": "<url>" } + { "text": "<prompt>" }
    const content: Array<Record<string, string>> = []
    if (referenceImageBuffer) {
      const base64 = referenceImageBuffer.toString('base64')
      content.push({ image: `data:image/png;base64,${base64}` })
    }
    content.push({ text: prompt })

    const requestBody = {
      model: this.config.IMAGE_MODEL,
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

    const response = await fetch(this.config.IMAGE_BASE_URL, {
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
}