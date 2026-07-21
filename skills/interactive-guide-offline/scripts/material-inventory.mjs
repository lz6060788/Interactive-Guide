#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function usage() {
  return `Usage:
  node scripts/material-inventory.mjs --input <inventory.json>

Validates that declared authoring materials are real local files and reports SHA-256 values.`
}

function inputPath(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return null
  const index = argv.indexOf('--input')
  if (index < 0 || !argv[index + 1]) throw new Error('--input is required')
  return path.resolve(argv[index + 1])
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function inspectFile(value, label, baseDir, issues, required = false) {
  if (!value) {
    if (required) issues.push({ path: label, message: 'is required' })
    return null
  }
  if (typeof value !== 'string' || /^https?:\/\//i.test(value)) {
    issues.push({ path: label, message: 'must be a local file path' })
    return null
  }
  const absolutePath = path.resolve(baseDir, value)
  if (!fs.existsSync(absolutePath)) {
    issues.push({ path: label, message: `file does not exist: ${absolutePath}` })
    return null
  }
  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) {
    issues.push({ path: label, message: 'must point to a file' })
    return null
  }
  return { path: absolutePath, size: stat.size, sha256: sha256(absolutePath) }
}

function inspectList(value, label, baseDir, issues) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    issues.push({ path: label, message: 'must be an array of local file paths' })
    return []
  }
  return value
    .map((entry, index) => inspectFile(entry, `${label}[${index}]`, baseDir, issues))
    .filter(Boolean)
}

function validateProject(project, issues) {
  if (!project || typeof project !== 'object') {
    issues.push({ path: 'project', message: 'is required' })
    return
  }
  if (typeof project.id !== 'string' || !/^[a-z0-9-]+$/.test(project.id)) {
    issues.push({ path: 'project.id', message: 'must be a non-empty kebab-case id' })
  }
  if (!project.title || typeof project.title !== 'object') {
    issues.push({ path: 'project.title', message: 'must contain localized titles' })
  } else {
    for (const locale of ['zh-CN', 'en-US']) {
      if (typeof project.title[locale] !== 'string' || !project.title[locale].trim()) {
        issues.push({ path: `project.title.${locale}`, message: 'is required' })
      }
    }
  }
  if (project.defaultLocale !== 'zh-CN' && project.defaultLocale !== 'en-US') {
    issues.push({ path: 'project.defaultLocale', message: 'must be zh-CN or en-US' })
  }
}

function main() {
  const resolvedInput = inputPath(process.argv.slice(2))
  if (!resolvedInput) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  const inventory = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'))
  const baseDir = path.dirname(resolvedInput)
  const issues = []
  validateProject(inventory.project, issues)
  const files = {
    knowledgeDocuments: inspectList(
      inventory.knowledgeDocuments,
      'knowledgeDocuments',
      baseDir,
      issues,
    ),
    panoramaImage: inspectFile(inventory.panoramaImage, 'panoramaImage', baseDir, issues, true),
    hotspotPositionMap: inspectFile(
      inventory.hotspotPositionMap,
      'hotspotPositionMap',
      baseDir,
      issues,
    ),
    calloutPositionMap: inspectFile(
      inventory.calloutPositionMap,
      'calloutPositionMap',
      baseDir,
      issues,
    ),
    shareCopy: inspectFile(inventory.shareCopy, 'shareCopy', baseDir, issues),
    analyticsConfig: inspectFile(inventory.analyticsConfig, 'analyticsConfig', baseDir, issues),
    htmlSceneBundles: inspectList(inventory.htmlSceneBundles, 'htmlSceneBundles', baseDir, issues),
    transitionVideos: inspectList(inventory.transitionVideos, 'transitionVideos', baseDir, issues),
  }
  if (files.knowledgeDocuments.length === 0) {
    issues.push({
      path: 'knowledgeDocuments',
      message: 'at least one knowledge document is required',
    })
  }
  const manualReview = []
  if (!files.hotspotPositionMap) manualReview.push('Atlas hotspot positions')
  if (!files.calloutPositionMap) manualReview.push('Atlas callouts and Catalog focus rectangles')
  if (!files.shareCopy) manualReview.push('share copy (if sharing is enabled)')
  if (!files.analyticsConfig) manualReview.push('analytics settings (if analytics is enabled)')
  const output = {
    ok: issues.length === 0,
    inventoryPath: resolvedInput,
    project: inventory.project ?? null,
    files,
    manualReview,
    issues,
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  if (!output.ok) process.exitCode = 2
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
