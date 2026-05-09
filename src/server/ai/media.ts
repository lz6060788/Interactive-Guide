// ============================================================
// Interactive Guide - Media URL Exposure
// ============================================================
// DashScope video API requires HTTP URLs for first_frame / last_frame.
// This module copies local node images to a publicly accessible HTTP path.
// Express serves them via /api/media/_build/{buildId}/nodes/{nodeId}.png

import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../config.js'

const DATA_DIR = path.resolve('data')

export interface ExposeResult {
  url: string
  localPath: string
}

/**
 * Expose a node image as an HTTP URL for the video API.
 * Copies image.png from the generate output to a temp publish path,
 * returns the HTTP URL that DashScope can access.
 */
export function exposeNodeImage(generateId: string, nodeId: string): ExposeResult {
  const config = loadConfig()

  const srcPath = path.join(DATA_DIR, 'generates', generateId, 'nodes', nodeId, 'image.png')
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Node image not found: ${srcPath}`)
  }

  // Copy to a publish-accessible path
  const destDir = path.join(DATA_DIR, 'publish', '_build', generateId, 'nodes')
  fs.mkdirSync(destDir, { recursive: true })
  const destPath = path.join(destDir, `${nodeId}.png`)
  fs.copyFileSync(srcPath, destPath)

  const url = `${config.SERVER_BASE_URL}/api/media/_build/${generateId}/nodes/${nodeId}.png`
  return { url, localPath: destPath }
}
