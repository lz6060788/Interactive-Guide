// ============================================================
// Interactive Guide - SHA256 Cache Layer
// ============================================================
// Follows flip-book pattern: content-addressable caching
// with file-system persistence for AI-generated assets.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const CACHE_DIR = path.resolve('data', '.cache')

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

export function buildCacheKey(parts: Record<string, unknown>): string {
  return sha256(JSON.stringify(parts))
}

// ─── Image Cache ──────────────────────────────────────────────

export function resolveImageCachePath(cacheKey: string): string {
  return path.join(CACHE_DIR, 'media', 'images', `${cacheKey}.png`)
}

export function resolveImageRecordPath(cacheKey: string): string {
  return path.join(CACHE_DIR, 'records', 'image', `${cacheKey}.json`)
}

export function getCachedImage(cacheKey: string): { localPath: string; record: any } | null {
  const recordPath = resolveImageRecordPath(cacheKey)
  const imagePath = resolveImageCachePath(cacheKey)
  if (fs.existsSync(recordPath) && fs.existsSync(imagePath)) {
    return { localPath: imagePath, record: JSON.parse(fs.readFileSync(recordPath, 'utf-8')) }
  }
  return null
}

export function persistImageToCache(cacheKey: string, imageBuffer: Buffer, meta: Record<string, unknown>): string {
  const imagePath = resolveImageCachePath(cacheKey)
  const recordPath = resolveImageRecordPath(cacheKey)
  fs.mkdirSync(path.dirname(imagePath), { recursive: true })
  fs.mkdirSync(path.dirname(recordPath), { recursive: true })
  fs.writeFileSync(imagePath, imageBuffer)
  fs.writeFileSync(recordPath, JSON.stringify({ ...meta, cacheKey, localPath: imagePath, createdAt: new Date().toISOString() }, null, 2))
  return imagePath
}

// ─── Video Cache ──────────────────────────────────────────────

export function resolveVideoCachePath(cacheKey: string): string {
  return path.join(CACHE_DIR, 'media', 'videos', `${cacheKey}.mp4`)
}

export function resolveVideoRecordPath(cacheKey: string): string {
  return path.join(CACHE_DIR, 'records', 'video', `${cacheKey}.json`)
}

export function getCachedVideo(cacheKey: string): { localPath: string; record: any } | null {
  const recordPath = resolveVideoRecordPath(cacheKey)
  const videoPath = resolveVideoCachePath(cacheKey)
  if (fs.existsSync(recordPath) && fs.existsSync(videoPath)) {
    return { localPath: videoPath, record: JSON.parse(fs.readFileSync(recordPath, 'utf-8')) }
  }
  return null
}

export function persistVideoToCache(cacheKey: string, videoBuffer: Buffer, meta: Record<string, unknown>): string {
  const videoPath = resolveVideoCachePath(cacheKey)
  const recordPath = resolveVideoRecordPath(cacheKey)
  fs.mkdirSync(path.dirname(videoPath), { recursive: true })
  fs.mkdirSync(path.dirname(recordPath), { recursive: true })
  fs.writeFileSync(videoPath, videoBuffer)
  fs.writeFileSync(recordPath, JSON.stringify({ ...meta, cacheKey, localPath: videoPath, createdAt: new Date().toISOString() }, null, 2))
  return videoPath
}

// ─── Planner Cache ────────────────────────────────────────────

export function resolvePlannerRecordPath(cacheKey: string): string {
  return path.join(CACHE_DIR, 'records', 'planner', `${cacheKey}.json`)
}

export function getCachedPlannerResult(cacheKey: string): any | null {
  const recordPath = resolvePlannerRecordPath(cacheKey)
  if (fs.existsSync(recordPath)) {
    return JSON.parse(fs.readFileSync(recordPath, 'utf-8'))
  }
  return null
}

export function persistPlannerResult(cacheKey: string, result: unknown): void {
  const recordPath = resolvePlannerRecordPath(cacheKey)
  fs.mkdirSync(path.dirname(recordPath), { recursive: true })
  fs.writeFileSync(recordPath, JSON.stringify(result, null, 2))
}
