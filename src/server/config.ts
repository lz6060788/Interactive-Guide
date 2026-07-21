import 'dotenv/config'
import { z } from 'zod'

const configSchema = z.object({
  PORT: z.coerce.number().default(8788),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATA_DIR: z.string().default('./data'),
})

export type AppConfig = z.infer<typeof configSchema>

export function parseConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(environment)
}

let _config: AppConfig | null = null

export function loadConfig(): AppConfig {
  if (_config) return _config
  _config = parseConfig()
  return _config
}
