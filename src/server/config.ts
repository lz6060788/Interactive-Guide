// ============================================================
// Interactive Guide - Server Configuration
// ============================================================
// Environment-based config with Zod validation.
// All AI provider settings come from .env — never hardcoded.
// Follows the flip-book env pattern: SCREAMING_SNAKE_CASE keys.

import 'dotenv/config'
import { z } from 'zod'

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

  // Image Generation Provider (DashScope)
  IMAGE_API_KEY: z.string().default(''),
  IMAGE_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'),
  IMAGE_MODEL: z.string().default('qwen-image-2.0-pro'),
  IMAGE_TIMEOUT_MS: z.coerce.number().default(120000),

  // Video Generation Provider (DashScope async)
  VIDEO_API_KEY: z.string().default(''),
  VIDEO_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'),
  VIDEO_TASK_BASE_URL: z.string().default('https://dashscope.aliyuncs.com/api/v1/tasks'),
  VIDEO_MODEL: z.string().default('pixverse/pixverse-v6-kf2v'),
  VIDEO_TIMEOUT_MS: z.coerce.number().default(600000),
  VIDEO_POLL_INTERVAL_MS: z.coerce.number().default(15000),
  VIDEO_RESOLUTION: z.string().default('540P'),
  VIDEO_DURATION_SECONDS: z.coerce.number().default(3),

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
  DEFAULT_WIDTH: z.coerce.number().default(1440),
  DEFAULT_HEIGHT: z.coerce.number().default(810),
})

export type AppConfig = z.infer<typeof configSchema>

let _config: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (_config) return _config
  _config = configSchema.parse(process.env)
  return _config
}
