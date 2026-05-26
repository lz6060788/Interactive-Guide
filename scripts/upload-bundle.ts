// ============================================================
// Standalone Bundle Uploader
// ============================================================
// Uploads a runtime bundle directory to S3-compatible object storage.
// Usage:
//   node upload-bundle.mjs <bundle-dir>
//   node upload-bundle.mjs ./data/runtime-bundles/guide_xxx-yyy
//
// Config via env vars (or .env in cwd):
//   OBJECT_STORAGE_ENDPOINT, OBJECT_STORAGE_BUCKET,
//   OBJECT_STORAGE_ACCESS_KEY, OBJECT_STORAGE_SECRET_KEY,
//   OBJECT_STORAGE_REGION, OBJECT_STORAGE_PROTOCOL,
//   OBJECT_STORAGE_PREFIX, BUNDLE_PUBLIC_BASE_URL

import fs from 'node:fs'
import path from 'node:path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// ─── Config ─────────────────────────────────────────────────

interface Config {
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
  region: string
  protocol: string
  prefix: string
  publicBaseUrl: string
  OBJECT_STORAGE_ADDRESSING_STYLE: string
}

function loadConfig(): Config {
  // Try loading .env from cwd
  const dotenvPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(dotenvPath)) {
    const lines = fs.readFileSync(dotenvPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  }

  const env = process.env
  return {
    endpoint: env.OBJECT_STORAGE_ENDPOINT ?? '',
    bucket: env.OBJECT_STORAGE_BUCKET ?? '',
    accessKey: env.OBJECT_STORAGE_ACCESS_KEY ?? '',
    secretKey: env.OBJECT_STORAGE_SECRET_KEY ?? '',
    region: env.OBJECT_STORAGE_REGION ?? 'oss-cn-hangzhou',
    protocol: env.OBJECT_STORAGE_PROTOCOL ?? 'https',
    prefix: (env.OBJECT_STORAGE_PREFIX ?? '').replace(/^\/+|\/+$/g, ''),
    publicBaseUrl: (env.BUNDLE_PUBLIC_BASE_URL ?? '').replace(/\/+$/, ''),
    OBJECT_STORAGE_ADDRESSING_STYLE: env.OBJECT_STORAGE_ADDRESSING_STYLE ?? 'path',
  }
}

function validateConfig(config: Config): void {
  const missing: string[] = []
  if (!config.endpoint) missing.push('OBJECT_STORAGE_ENDPOINT')
  if (!config.bucket) missing.push('OBJECT_STORAGE_BUCKET')
  if (!config.accessKey) missing.push('OBJECT_STORAGE_ACCESS_KEY')
  if (!config.secretKey) missing.push('OBJECT_STORAGE_SECRET_KEY')
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }
}

// ─── S3 Client ──────────────────────────────────────────────

function createClient(config: Config): S3Client {
  let endpoint = config.endpoint
  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = `${config.protocol}://${endpoint}`
  }

  return new S3Client({
    endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: config.OBJECT_STORAGE_ADDRESSING_STYLE === 'path',
  })
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  }
  return map[ext] ?? 'application/octet-stream'
}

// ─── File Walk ──────────────────────────────────────────────

function walkDir(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath))
    } else if (entry.isFile()) {
      results.push(fullPath)
    }
  }
  return results
}

// ─── Public URL ─────────────────────────────────────────────

function resolvePublicBaseUrl(config: Config): string {
  if (config.publicBaseUrl) return config.publicBaseUrl

  const raw = config.endpoint
  if (!raw) return ''

  const endpoint = raw.startsWith('http') ? raw : `${config.protocol}://${raw}`
  const { host, protocol } = new URL(endpoint)
  if (!config.bucket) return ''

  return `${protocol}//${config.bucket}.${host}`
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node upload-bundle.mjs <bundle-dir>')
    console.log('')
    console.log('Uploads all files in a runtime bundle directory to S3-compatible OSS.')
    console.log('Configure via env vars or .env file:')
    console.log('  OBJECT_STORAGE_ENDPOINT, OBJECT_STORAGE_BUCKET,')
    console.log('  OBJECT_STORAGE_ACCESS_KEY, OBJECT_STORAGE_SECRET_KEY,')
    console.log('  OBJECT_STORAGE_REGION, BUNDLE_PUBLIC_BASE_URL')
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1)
  }

  const bundleDir = path.resolve(args[0])

  if (!fs.existsSync(bundleDir)) {
    console.error(`Error: bundle directory not found: ${bundleDir}`)
    process.exit(1)
  }

  const bundleJsonPath = path.join(bundleDir, 'bundle.json')
  if (!fs.existsSync(bundleJsonPath)) {
    console.error(`Error: bundle.json not found in: ${bundleDir}`)
    process.exit(1)
  }

  const config = loadConfig()
  validateConfig(config)

  const bundleMeta = JSON.parse(fs.readFileSync(bundleJsonPath, 'utf-8'))
  const { guideId, version, bundleId } = bundleMeta
  const publicBaseUrl = resolvePublicBaseUrl(config)
  const keyPrefix = `interactive-guide/${guideId}/${version}`

  console.log(`Bundle:    ${bundleId}`)
  console.log(`Guide:     ${guideId} v${version}`)
  console.log(`Endpoint:  ${config.endpoint}`)
  console.log(`Bucket:    ${config.bucket}`)
  console.log(`Key prefix: ${keyPrefix}`)
  console.log(`Public URL: ${publicBaseUrl || '(presigned)'}`)
  console.log('')

  const client = createClient(config)
  const files = walkDir(bundleDir)

  let uploaded = 0
  let failed = 0

  for (const localPath of files) {
    const relativePath = path.relative(bundleDir, localPath).split(path.sep).join('/')
    const key = `${keyPrefix}/${relativePath}`
    const contentType = getContentType(localPath)

    try {
      const fileBuffer = fs.readFileSync(localPath)
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
      }))
      uploaded++
      const size = (fileBuffer.length / 1024).toFixed(1)
      console.log(`  [OK] ${relativePath} (${size} KB)`)
    } catch (err) {
      failed++
      console.error(`  [FAIL] ${relativePath}: ${err instanceof Error ? err.message : err}`)
    }
  }

  console.log('')
  console.log(`Done: ${uploaded} uploaded, ${failed} failed`)

  if (publicBaseUrl) {
    console.log(`Entry: ${publicBaseUrl}/${keyPrefix}/index.html`)
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
