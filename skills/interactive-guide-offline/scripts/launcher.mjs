#!/usr/bin/env node

import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const skillRoot = path.resolve(scriptDir, '..')
const workbenchRoot = path.join(skillRoot, 'workbench')
const serverEntry = path.join(workbenchRoot, 'dist', 'server', 'index.js')
const adminRoot = path.join(workbenchRoot, 'dist', 'admin')

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function usage() {
  return `Usage:
  node scripts/launcher.mjs --workspace <directory> [--port <ui-port>] [--backend-port <api-port>]

Starts the bundled workbench on 127.0.0.1. The workspace contains project data.
Ports default to automatically selected free loopback ports.`
}

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') return { help: true }
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`)
    values[key] = value
    index += 1
  }
  return values
}

function parsePort(value, label) {
  if (value === undefined) return undefined
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`)
  }
  return port
}

function assertDependenciesInstalled() {
  const manifestPath = path.join(workbenchRoot, 'package.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`workbench dependency manifest is missing: ${manifestPath}`)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const dependencies = Object.keys(manifest.dependencies ?? {})
  if (dependencies.length === 0) {
    throw new Error(`workbench dependency manifest declares no dependencies: ${manifestPath}`)
  }
  const missing = dependencies.filter(name => {
    const packagePath = path.join(workbenchRoot, 'node_modules', ...name.split('/'), 'package.json')
    return !fs.existsSync(packagePath)
  })
  if (missing.length === 0) return
  throw new Error(
    `workbench dependencies are not installed (${missing.join(', ')}); run "npm ci --omit=dev" in "${workbenchRoot}" and retry`,
  )
}

async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(error => (error ? reject(error) : resolve(port)))
    })
  })
}

function forwardChildOutput(stream, prefix) {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', chunk => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line) process.stderr.write(`[${prefix}] ${line}\n`)
    }
  })
  stream.on('end', () => {
    if (pending) process.stderr.write(`[${prefix}] ${pending}\n`)
  })
}

async function waitForBackend(port, child, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let lastError = 'not ready'
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`workbench backend exited before readiness (code ${child.exitCode})`)
    }
    try {
      const status = await new Promise((resolve, reject) => {
        const request = http.get(
          { hostname: '127.0.0.1', port, path: '/api/health', timeout: 1000 },
          response => {
            response.resume()
            response.on('end', () => resolve(response.statusCode ?? 0))
          },
        )
        request.on('timeout', () => request.destroy(new Error('health request timed out')))
        request.on('error', reject)
      })
      if (status === 200) return
      lastError = `health returned ${status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`workbench backend did not become ready: ${lastError}`)
}

function proxyApi(request, response, backendPort) {
  const headers = { ...request.headers, host: `127.0.0.1:${backendPort}` }
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: backendPort,
      method: request.method,
      path: request.url,
      headers,
    },
    upstreamResponse => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    },
  )
  upstream.on('error', error => {
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    }
    response.end(JSON.stringify({ error: `workbench backend unavailable: ${error.message}` }))
  })
  request.pipe(upstream)
}

function resolveStaticFile(requestUrl) {
  const url = new URL(requestUrl ?? '/', 'http://127.0.0.1')
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  const relative = pathname.replace(/^\/+/, '') || 'index.html'
  const candidate = path.resolve(adminRoot, relative)
  const root = path.resolve(adminRoot)
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  return path.join(root, 'index.html')
}

function serveAdmin(request, response) {
  const filePath = resolveStaticFile(request.url)
  if (!filePath || !fs.existsSync(filePath)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }
  const stat = fs.statSync(filePath)
  response.writeHead(200, {
    'content-type':
      MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': path.basename(filePath) === 'index.html' ? 'no-store' : 'public, max-age=3600',
  })
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  fs.createReadStream(filePath).pipe(response)
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (!args.workspace) throw new Error('--workspace is required')
  if (!fs.existsSync(serverEntry) || !fs.existsSync(path.join(adminRoot, 'index.html'))) {
    throw new Error('bundled workbench is missing; assemble the installable Skill artifact first')
  }
  assertDependenciesInstalled()

  const workspace = path.resolve(args.workspace)
  fs.mkdirSync(workspace, { recursive: true })
  const uiPort = parsePort(args.port, '--port') ?? (await findFreePort())
  let backendPort = parsePort(args['backend-port'], '--backend-port') ?? (await findFreePort())
  while (backendPort === uiPort) backendPort = await findFreePort()
  const uiUrl = `http://127.0.0.1:${uiPort}`

  const child = spawn(process.execPath, [serverEntry], {
    cwd: workbenchRoot,
    env: {
      ...process.env,
      PORT: String(backendPort),
      CORS_ORIGIN: uiUrl,
      DATA_DIR: workspace,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  forwardChildOutput(child.stdout, 'workbench')
  forwardChildOutput(child.stderr, 'workbench')

  let shuttingDown = false
  let facade
  const shutdown = async (reason, exitCode = 0) => {
    if (shuttingDown) return
    shuttingDown = true
    process.stderr.write(`[launcher] stopping: ${reason}\n`)
    if (facade?.listening) {
      await new Promise(resolve => facade.close(() => resolve()))
    }
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM')
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 11000)),
      ])
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    process.exit(exitCode)
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  child.once('error', error => void shutdown(`backend spawn failed: ${error.message}`, 1))

  try {
    await waitForBackend(backendPort, child)
    facade = http.createServer((request, response) => {
      if ((request.url ?? '').startsWith('/api')) proxyApi(request, response, backendPort)
      else serveAdmin(request, response)
    })
    await listen(facade, uiPort)
  } catch (error) {
    await shutdown(error instanceof Error ? error.message : String(error), 1)
    return
  }

  child.once('exit', (code, signal) => {
    if (!shuttingDown) void shutdown(`backend exited (${signal ?? code ?? 'unknown'})`, 1)
  })
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      uiUrl,
      apiUrl: uiUrl,
      workspace,
      launcherPid: process.pid,
      backendPid: child.pid,
      backendPort,
    })}\n`,
  )
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
