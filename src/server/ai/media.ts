// ============================================================
// Interactive Guide - Media URL Exposure
// ============================================================
// Video generation APIs require HTTP-accessible URLs for first_frame / last_frame.
// This module copies local node images to a publicly accessible HTTP path.
// Express serves them via /api/media/_build/{buildId}/nodes/{nodeId}.png

import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../config.js'
import {
  buildNodeImageObjectKey,
  isObjectStorageConfigured,
  resolveObjectUrl,
  uploadFile,
} from '../storage/object-storage.js'

const DATA_DIR = path.resolve('data')

export interface ExposeResult {
  url: string
  localPath: string
}

interface NodeRecordShape {
  buildId?: string
  nodeId?: string
  status?: string
  plannerStatus?: string
  imageStatus?: string
  imagePath?: string
  modelInputUrl?: string
  objectStorageKey?: string
  objectStorageUrl?: string
  [key: string]: unknown
}

/**
 * Expose a node image as an HTTP URL for the video API.
 * When object storage is configured, upload the node image and reuse the OSS key.
 * Otherwise fall back to a local HTTP path.
 */
export async function exposeNodeImage(generateId: string, nodeId: string): Promise<ExposeResult> {
  const config = loadConfig()

  const srcPath = path.join(DATA_DIR, 'generates', generateId, 'nodes', nodeId, 'image.png')
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Node image not found: ${srcPath}`)
  }

  const recordPath = path.join(DATA_DIR, 'generates', generateId, 'nodes', nodeId, 'node-record.json')
  const record = readNodeRecord(recordPath)

  if (isObjectStorageConfigured()) {
    if (record.objectStorageKey) {
      const url = await resolveObjectUrl(record.objectStorageKey)
      persistNodeRecord(recordPath, { ...record, objectStorageUrl: url })
      return { url, localPath: srcPath }
    }

    const key = buildNodeImageObjectKey(generateId, nodeId, srcPath)
    const uploaded = await uploadFile(srcPath, key)
    persistNodeRecord(recordPath, {
      ...record,
      objectStorageKey: uploaded.key,
      objectStorageUrl: uploaded.url,
    })
    return { url: uploaded.url, localPath: srcPath }
  }

  if (fs.existsSync(recordPath)) {
    try {
      if (record.modelInputUrl) {
        return { url: record.modelInputUrl, localPath: srcPath }
      }
    } catch {
      // Fall back to local HTTP exposure below.
    }
  }

  // Copy to a publish-accessible path
  const destDir = path.join(DATA_DIR, 'publish', '_build', generateId, 'nodes')
  fs.mkdirSync(destDir, { recursive: true })
  const destPath = path.join(destDir, `${nodeId}.png`)
  fs.copyFileSync(srcPath, destPath)

  const url = `${config.SERVER_BASE_URL}/api/media/_build/${generateId}/nodes/${nodeId}.png`
  return { url, localPath: destPath }
}

function readNodeRecord(recordPath: string): NodeRecordShape {
  if (!fs.existsSync(recordPath)) return {}
  try {
    return JSON.parse(fs.readFileSync(recordPath, 'utf-8')) as NodeRecordShape
  } catch {
    return {}
  }
}

function persistNodeRecord(recordPath: string, record: NodeRecordShape) {
  fs.mkdirSync(path.dirname(recordPath), { recursive: true })
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2))
}
