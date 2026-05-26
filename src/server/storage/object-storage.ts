import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { loadConfig } from '../config.js'

interface UploadResult {
  key: string
  url: string
}

let client: S3Client | null = null

export function isObjectStorageConfigured(): boolean {
  const config = loadConfig()
  return Boolean(
    config.OBJECT_STORAGE_BUCKET &&
    config.OBJECT_STORAGE_ACCESS_KEY &&
    config.OBJECT_STORAGE_SECRET_KEY,
  )
}

function getEndpoint(): string | undefined {
  const config = loadConfig()
  const raw = config.OBJECT_STORAGE_ENDPOINT.trim()
  if (!raw) return undefined
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  return `${config.OBJECT_STORAGE_PROTOCOL}://${raw}`
}

function getClient(): S3Client {
  if (client) return client

  const config = loadConfig()
  client = new S3Client({
    endpoint: getEndpoint(),
    region: config.OBJECT_STORAGE_REGION,
    credentials: {
      accessKeyId: config.OBJECT_STORAGE_ACCESS_KEY,
      secretAccessKey: config.OBJECT_STORAGE_SECRET_KEY,
    },
    forcePathStyle: config.OBJECT_STORAGE_ADDRESSING_STYLE === 'path',
  })
  return client
}

export function getContentType(filePath: string): string {
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

function buildPublicUrl(key: string): string {
  const config = loadConfig()
  const publicBase = config.OBJECT_STORAGE_PUBLIC_BASE_URL.trim().replace(/\/+$/, '')
  return publicBase ? `${publicBase}/${key}` : ''
}

export function buildNodeImageObjectKey(generateId: string, nodeId: string, localPath: string): string {
  const config = loadConfig()
  const fileBuffer = fs.readFileSync(localPath)
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').slice(0, 12)
  const filename = `${nodeId}-${hash}${path.extname(localPath).toLowerCase() || '.png'}`
  const base = `interactive-guide/generates/${generateId}/nodes/${filename}`
  const prefix = config.OBJECT_STORAGE_PREFIX.trim().replace(/^\/+|\/+$/g, '')
  return prefix ? `${prefix}/${base}` : base
}

export async function uploadFile(localPath: string, key: string): Promise<UploadResult> {
  if (!isObjectStorageConfigured()) {
    throw new Error('Object storage is not configured')
  }

  const config = loadConfig()
  const fileBuffer = fs.readFileSync(localPath)
  const contentType = getContentType(localPath)

  await getClient().send(new PutObjectCommand({
    Bucket: config.OBJECT_STORAGE_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  }))

  const url = await resolveObjectUrl(key)
  return { key, url }
}

export async function resolveObjectUrl(key: string): Promise<string> {
  if (!isObjectStorageConfigured()) {
    throw new Error('Object storage is not configured')
  }

  const config = loadConfig()
  const publicUrl = buildPublicUrl(key)
  if (publicUrl) return publicUrl

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: config.OBJECT_STORAGE_BUCKET,
      Key: key,
    }),
    { expiresIn: config.OBJECT_STORAGE_SIGNED_URL_EXPIRES_SECONDS },
  )
}
