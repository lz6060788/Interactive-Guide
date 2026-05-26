// ============================================================
// Interactive Guide - Bundle Uploader
// ============================================================
// Independent service that uploads runtime bundle artifacts
// to S3-compatible object storage.
// Reuses uploadFile() from object-storage.ts.

import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../config.js'
import {
  uploadFile,
  isObjectStorageConfigured,
} from '../storage/object-storage.js'
import type { RuntimeBundlePayload } from '../../shared/types.js'

// ─── Types ──────────────────────────────────────────────────

export interface BundleUploadResult {
  bundleId: string
  guideId: string
  version: string
  publicBaseUrl: string
  fileCount: number
  files: { key: string; url: string; localPath: string }[]
}

// ─── BundleUploader ─────────────────────────────────────────

export class BundleUploader {
  private bundlesDir: string

  constructor(bundlesDir?: string) {
    this.bundlesDir = bundlesDir ?? path.resolve(process.cwd(), 'data/runtime-bundles')
  }

  async uploadBundle(bundleId: string): Promise<BundleUploadResult> {
    if (!isObjectStorageConfigured()) {
      throw new Error('Object storage is not configured')
    }

    const bundleDir = path.join(this.bundlesDir, bundleId)
    if (!fs.existsSync(bundleDir)) {
      throw new Error(`Bundle "${bundleId}" not found at ${bundleDir}`)
    }

    // Read bundle.json to get guideId and version
    const bundleJsonPath = path.join(bundleDir, 'bundle.json')
    const bundleMeta = JSON.parse(
      fs.readFileSync(bundleJsonPath, 'utf-8'),
    ) as RuntimeBundlePayload

    const config = loadConfig()
    const publicBaseUrl = this.resolvePublicBaseUrl(config)
    const keyPrefix = `interactive-guide/${bundleMeta.guideId}/${bundleMeta.version}`

    // Walk bundle directory and collect all files
    const localFiles = this.walkDir(bundleDir)

    const files: BundleUploadResult['files'] = []
    for (const localPath of localFiles) {
      const relativePath = path.relative(bundleDir, localPath).split(path.sep).join('/')
      const key = `${keyPrefix}/${relativePath}`

      const result = await uploadFile(localPath, key)
      files.push({ key: result.key, url: result.url, localPath })
    }

    return {
      bundleId,
      guideId: bundleMeta.guideId,
      version: bundleMeta.version,
      publicBaseUrl,
      fileCount: files.length,
      files,
    }
  }

  private resolvePublicBaseUrl(config: ReturnType<typeof loadConfig>): string {
    const explicit = config.BUNDLE_PUBLIC_BASE_URL.trim().replace(/\/+$/, '')
    if (explicit) return explicit

    // Auto-derive from object storage config
    const raw = config.OBJECT_STORAGE_ENDPOINT.trim()
    if (!raw) return ''

    const endpoint = raw.startsWith('http') ? raw : `${config.OBJECT_STORAGE_PROTOCOL}://${raw}`
    const { host, protocol } = new URL(endpoint)
    const bucket = config.OBJECT_STORAGE_BUCKET.trim()
    if (!bucket) return ''

    // Virtual hosted style: https://{bucket}.{host}
    return `${protocol}//${bucket}.${host}`
  }

  private walkDir(dir: string): string[] {
    const results: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...this.walkDir(fullPath))
      } else if (entry.isFile()) {
        results.push(fullPath)
      }
    }
    return results
  }
}
