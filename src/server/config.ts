// ============================================================
// Interactive Guide - Server Configuration
// ============================================================
// Environment-based config with Zod validation.
// All AI provider settings come from .env — never hardcoded.
// Follows the flip-book env pattern: SCREAMING_SNAKE_CASE keys.

import 'dotenv/config'
import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════════════

function envBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true
      if (['false', '0', 'no', 'off', ''].includes(normalized)) return false
    }
    return value
  }, z.boolean().default(defaultValue))
}

// ═══════════════════════════════════════════════════════════════════
// Server Config
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Vision / LLM Provider Config (OpenAI-compatible)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Image Generation Config (DashScope)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Video Config (Routing + Aishi / WanXiang / MiniMax)
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Object Storage Config (S3-compatible / OSS)
// ═══════════════════════════════════════════════════════════════════

const configSchema = z.object({
  PORT: z.coerce.number().default(8788),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  SERVER_BASE_URL: z.string().default('http://localhost:8788'),

  // Vision / LLM Provider (OpenAI-compatible)
  VISION_API_KEY: z.string().default(''),
  VISION_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/compatible-mode/v1'),
  VISION_MODEL: z.string().default('kimi-k2.6'),
  VISION_TIMEOUT_MS: z.coerce.number().default(60000),
  VISION_TEMPERATURE: z.coerce.number().default(0.6),

  // Image Generation Config
  IMAGE_PROVIDER: z.enum(['dashscope', 'openai']).default('dashscope'),
  IMAGE_API_KEY: z.string().default(''),
  IMAGE_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'),
  IMAGE_MODEL: z.string().default('qwen-image-2.0-pro'),
  IMAGE_TIMEOUT_MS: z.coerce.number().default(120000),

  // Video Generation Routing
  VIDEO_PROVIDER: z.enum(['aishi', 'minimax', 'wanxiang']).default('aishi'),
  VIDEO_TIMEOUT_MS: z.coerce.number().default(600000),
  VIDEO_POLL_INTERVAL_MS: z.coerce.number().default(15000),

  // Video Generation Provider (DashScope async, legacy transition model)
  VIDEO_API_KEY: z.string().default(''),
  VIDEO_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'),
  VIDEO_TASK_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/api/v1/tasks'),
  VIDEO_MODEL: z.string().default('pixverse/pixverse-v6-kf2v'),
  VIDEO_RESOLUTION: z.string().default('540P'),
  VIDEO_DURATION_SECONDS: z.coerce.number().default(3),

  // Video Generation Provider (WanXiang 2.7 start/end frame model)
  WANXIANG_VIDEO_API_KEY: z.string().default(''),
  WANXIANG_VIDEO_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'),
  WANXIANG_VIDEO_TASK_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/api/v1/tasks'),
  WANXIANG_VIDEO_MODEL: z.string().default('wan2.7-i2v-2026-04-25'),
  WANXIANG_VIDEO_RESOLUTION: z.enum(['720P', '1080P']).default('720P'),
  WANXIANG_VIDEO_DURATION_SECONDS: z.coerce.number().default(5),
  WANXIANG_VIDEO_PROMPT_EXTEND: envBoolean(true),
  WANXIANG_VIDEO_WATERMARK: envBoolean(false),

  // Video Generation Provider (MiniMax start/end frame model)
  MINIMAX_VIDEO_API_KEY: z.string().default(''),
  MINIMAX_VIDEO_BASE_URL: z.string().default('https://api.minimaxi.com/v1/video_generation'),
  MINIMAX_VIDEO_QUERY_URL: z.string().default('https://api.minimaxi.com/v1/query/video_generation'),
  MINIMAX_VIDEO_FILE_BASE_URL: z.string().default('https://api.minimaxi.com/v1/files/retrieve'),
  MINIMAX_VIDEO_MODEL: z.string().default('MiniMax-Hailuo-02'),
  MINIMAX_VIDEO_RESOLUTION: z.string().default('768P'),
  MINIMAX_VIDEO_DURATION_SECONDS: z.coerce.number().default(6),
  MINIMAX_VIDEO_PROMPT_OPTIMIZER: envBoolean(true),
  MINIMAX_VIDEO_WATERMARK: envBoolean(false),
  MINIMAX_VIDEO_CALLBACK_URL: z.string().default(''),

  // Object Storage (S3-compatible / OSS)
  OBJECT_STORAGE_PROTOCOL: z.string().default('https'),
  OBJECT_STORAGE_ENDPOINT: z.string().default(''),
  OBJECT_STORAGE_BUCKET: z.string().default(''),
  OBJECT_STORAGE_ACCESS_KEY: z.string().default(''),
  OBJECT_STORAGE_SECRET_KEY: z.string().default(''),
  OBJECT_STORAGE_REGION: z.string().default('oss-cn-hangzhou'),
  OBJECT_STORAGE_PREFIX: z.string().default(''),
  OBJECT_STORAGE_ADDRESSING_STYLE: z.enum(['virtual', 'path']).default('virtual'),
  OBJECT_STORAGE_SIGNED_URL_EXPIRES_SECONDS: z.coerce.number().default(86400),
  OBJECT_STORAGE_PUBLIC_BASE_URL: z.string().default(''),

  // Default resolution
  DEFAULT_RESOLUTION: z.enum(['16:9', '9:16', '375*808']).default('16:9'),
})

export type AppConfig = z.infer<typeof configSchema>

let _config: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (_config) return _config
  _config = configSchema.parse(process.env)
  return _config
}
