#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function runPackager(outputDir) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, 'scripts', 'package-interactive-guide-skill.mjs'),
      '--output-dir',
      outputDir,
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024,
    },
  )
  if (result.status !== 0) {
    throw new Error(`packager failed:\n${result.stdout}\n${result.stderr}`)
  }
  const payload = result.stdout
    .split(/\r?\n/)
    .reverse()
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .find(value => value?.artifact)
  if (!payload) throw new Error(`packager returned no artifact JSON:\n${result.stdout}`)
  return payload
}

function installWorkbenchDependencies(workbenchRoot) {
  const npmArgs = ['ci', '--omit=dev', '--no-audit', '--no-fund']
  const npmCli = process.env.npm_execpath
  const command = npmCli && fs.existsSync(npmCli) ? process.execPath : 'npm'
  const args = command === process.execPath ? [npmCli, ...npmArgs] : npmArgs
  const result = spawnSync(command, args, {
    cwd: workbenchRoot,
    encoding: 'utf8',
    windowsHide: true,
    shell: command === 'npm' && process.platform === 'win32',
    maxBuffer: 50 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(`dependency installation failed:\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout.trim()
}

function verifyLauncherRequiresInstallation(launcherPath, skillRoot, workspace) {
  const result = spawnSync(process.execPath, [launcherPath, '--workspace', workspace], {
    cwd: skillRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status === 0 || !/npm ci --omit=dev/.test(result.stderr)) {
    throw new Error(
      `launcher did not report the dependency installation requirement:\n${result.stdout}\n${result.stderr}`,
    )
  }
}

function waitForJsonLine(child, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => reject(new Error(`launcher timed out:\n${stderr}`)), timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.stdout.on('data', chunk => {
      stdout += chunk
      const newline = stdout.indexOf('\n')
      if (newline < 0) return
      clearTimeout(timer)
      try {
        resolve(JSON.parse(stdout.slice(0, newline)))
      } catch (error) {
        reject(new Error(`launcher emitted invalid JSON: ${error.message}`))
      }
    })
    child.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`launcher exited before readiness with ${code}:\n${stderr}`))
    })
  })
}

async function jsonRequest(baseUrl, apiPath, options = {}) {
  const headers = { accept: 'application/json', ...(options.headers ?? {}) }
  const body = options.body === undefined ? undefined : JSON.stringify(options.body)
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(new URL(`/api${apiPath}`, baseUrl), {
    method: options.method ?? 'GET',
    headers,
    body,
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${apiPath}: ${text}`)
  return payload
}

async function createSmokeProject(baseUrl) {
  let project = (
    await jsonRequest(baseUrl, '/projects', {
      method: 'POST',
      body: { id: 'offline-package-smoke', title: '离线包冒烟项目', locale: 'zh-CN' },
    })
  ).data
  project = (
    await jsonRequest(baseUrl, '/projects/offline-package-smoke/metadata', {
      method: 'PATCH',
      body: {
        title: 'Offline Package Smoke Project',
        titleLocale: 'en-US',
        expectedRevision: project.metadata.revision,
      },
    })
  ).data

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  const uploadUrl = new URL('/api/projects/offline-package-smoke/assets/image', baseUrl)
  uploadUrl.searchParams.set('id', 'asset-panorama')
  uploadUrl.searchParams.set('expectedRevision', String(project.metadata.revision))
  uploadUrl.searchParams.set('filename', 'panorama.png')
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: png,
  })
  if (!upload.ok) throw new Error(`asset upload failed: ${await upload.text()}`)
  project = (await jsonRequest(baseUrl, '/projects/offline-package-smoke')).data
  project = (
    await jsonRequest(baseUrl, '/projects/offline-package-smoke/panorama', {
      method: 'PUT',
      headers: { 'x-expected-revision': String(project.metadata.revision) },
      body: { ...project.panorama, assetId: 'asset-panorama' },
    })
  ).data

  const stages = structuredClone(project.knowledge.stages)
  stages[1].categories = [
    {
      id: 'smoke-category',
      title: { 'zh-CN': '冒烟分类', 'en-US': 'Smoke Category' },
      order: 0,
      itemIds: ['smoke-item'],
      experience: { kind: 'panorama' },
    },
  ]
  project = (
    await jsonRequest(baseUrl, '/projects/offline-package-smoke/knowledge', {
      method: 'PUT',
      headers: { 'x-expected-revision': String(project.metadata.revision) },
      body: {
        stages,
        items: {
          'smoke-item': {
            id: 'smoke-item',
            categoryId: 'smoke-category',
            title: { 'zh-CN': '冒烟节点', 'en-US': 'Smoke Item' },
            description: { 'zh-CN': '离线验证', 'en-US': 'Offline verification' },
            order: 0,
          },
        },
      },
    })
  ).data
  project = (
    await jsonRequest(baseUrl, '/projects/offline-package-smoke/products/gallery', {
      method: 'PUT',
      headers: { 'x-expected-revision': String(project.metadata.revision) },
      body: {
        ...project.products.gallery,
        enabled: true,
        itemImageAssetIds: { 'smoke-item': 'asset-panorama' },
      },
    })
  ).data

  const outputs = []
  for (const product of ['atlas', 'catalog', 'gallery']) {
    const build = (
      await jsonRequest(baseUrl, `/projects/offline-package-smoke/previews/${product}`, {
        method: 'POST',
      })
    ).data
    const response = await fetch(new URL(build.downloadUrl, baseUrl))
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!response.ok || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error(`${product} preview ZIP verification failed`)
    }
    outputs.push({
      product,
      buildId: build.buildId,
      sourceRevision: build.sourceRevision,
      size: bytes.length,
    })
  }
  return outputs
}

async function stopChild(child) {
  if (child.exitCode !== null) return
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('launcher did not stop')), 15000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function main() {
  const localTemporaryRoot = path.join(repositoryRoot, 'tmp')
  fs.mkdirSync(localTemporaryRoot, { recursive: true })
  const temporaryRoot = fs.mkdtempSync(
    path.join(localTemporaryRoot, 'interactive-guide-package-verify-'),
  )
  let launcher
  try {
    const packageOutput = path.join(temporaryRoot, 'packages')
    const packaged = runPackager(packageOutput)
    const zip = new AdmZip(packaged.artifact)
    const entryNames = zip.getEntries().map(entry => entry.entryName)
    const required = [
      'interactive-guide-offline/SKILL.md',
      'interactive-guide-offline/agents/openai.yaml',
      'interactive-guide-offline/scripts/launcher.mjs',
      'interactive-guide-offline/scripts/workbench-client.mjs',
      'interactive-guide-offline/workbench/dist/server/index.js',
      'interactive-guide-offline/workbench/dist/admin/index.html',
      'interactive-guide-offline/workbench/src/product-shell/browser/gallery-entry.ts',
      'interactive-guide-offline/workbench/package.json',
      'interactive-guide-offline/workbench/package-lock.json',
      'interactive-guide-offline/workbench/workbench-manifest.json',
    ]
    for (const name of required) {
      if (!entryNames.includes(name)) throw new Error(`package is missing ${name}`)
    }
    if (entryNames.some(name => name.includes('/dist/automation/'))) {
      throw new Error('package includes superseded automation build output')
    }
    if (entryNames.some(name => name.includes('/node_modules/'))) {
      throw new Error('package must not include node_modules')
    }

    const extractedRoot = path.join(temporaryRoot, 'extracted')
    zip.extractAllTo(extractedRoot, true)
    const skillRoot = path.join(extractedRoot, 'interactive-guide-offline')
    const launcherPath = path.join(skillRoot, 'scripts', 'launcher.mjs')
    const workspace = path.join(temporaryRoot, 'workspace')
    const workbenchRoot = path.join(skillRoot, 'workbench')
    verifyLauncherRequiresInstallation(launcherPath, skillRoot, workspace)
    const dependencyInstall = installWorkbenchDependencies(workbenchRoot)
    launcher = spawn(process.execPath, [launcherPath, '--workspace', workspace], {
      cwd: skillRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const launched = await waitForJsonLine(launcher)
    if (!launched.ok || !launched.uiUrl) throw new Error('launcher readiness payload is incomplete')

    const health = await fetch(new URL('/api/health', launched.uiUrl))
    if (!health.ok) throw new Error(`packaged health check returned ${health.status}`)
    const admin = await fetch(
      new URL('/projects/offline-package-smoke/gallery-editor', launched.uiUrl),
    )
    if (!admin.ok || !/^<!doctype html>/i.test(await admin.text())) {
      throw new Error('packaged admin SPA fallback failed')
    }
    const previews = await createSmokeProject(launched.apiUrl)
    await stopChild(launcher)
    launcher = null

    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        artifactSize: packaged.size,
        artifactSha256: packaged.sha256,
        workbenchManifest: packaged.manifest,
        dependencyInstall,
        previews,
      })}\n`,
    )
  } finally {
    if (launcher) {
      try {
        await stopChild(launcher)
      } catch {
        launcher.kill('SIGKILL')
      }
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exitCode = 1
})
