import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { afterEach, test } from 'node:test'

const repositoryRoot = process.cwd()
const skillScripts = path.join(repositoryRoot, 'skills', 'interactive-guide-offline', 'scripts')
const packagedRuntimeDependencies = [
  'adm-zip',
  'cors',
  'dotenv',
  'express',
  'uuid',
  'zod',
  '@babel/core',
  '@babel/preset-env',
  'acorn',
  'esbuild',
]
const temporaryRoots: string[] = []

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop()
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true })
  }
})

function temporaryRoot(label: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`))
  temporaryRoots.push(root)
  return root
}

function runNode(
  script: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.once('error', reject)
    child.once('exit', code => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  return address.port
}

async function close(server: http.Server): Promise<void> {
  await new Promise(resolve => server.close(() => resolve()))
}

test('material inventory verifies real bilingual inputs and reports manual calibration', async () => {
  const root = temporaryRoot('guide-materials')
  fs.writeFileSync(path.join(root, 'knowledge.md'), '# Knowledge\n')
  fs.writeFileSync(path.join(root, 'panorama.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  fs.writeFileSync(path.join(root, 'dram.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const inventoryPath = path.join(root, 'inventory.json')
  fs.writeFileSync(
    inventoryPath,
    JSON.stringify({
      productTypes: ['atlas', 'gallery'],
      project: {
        id: 'memory-chip-industry-chain',
        title: { 'zh-CN': '存储芯片产业链', 'en-US': 'Memory Chip Industry Chain' },
        defaultLocale: 'zh-CN',
      },
      knowledgeDocuments: ['knowledge.md'],
      panoramaImage: 'panorama.png',
      galleryItemImages: [{ itemId: 'dram', path: 'dram.png' }],
    }),
  )

  const result = await runNode(path.join(skillScripts, 'material-inventory.mjs'), [
    '--input',
    inventoryPath,
  ])
  assert.equal(result.code, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.ok, true)
  assert.deepEqual(output.productTypes, ['atlas', 'gallery'])
  assert.equal(output.files.knowledgeDocuments.length, 1)
  assert.match(output.files.panoramaImage.sha256, /^[a-f0-9]{64}$/)
  assert.match(output.files.galleryItemImages[0].sha256, /^[a-f0-9]{64}$/)
  assert(output.manualReview.includes('Atlas hotspot positions'))
  assert(output.manualReview.includes('Gallery item-to-image mapping completeness'))
})

test('gallery-only material inventory does not require a panorama image', async () => {
  const root = temporaryRoot('guide-gallery-materials')
  fs.writeFileSync(path.join(root, 'knowledge.md'), '# Knowledge\n')
  fs.writeFileSync(path.join(root, 'dram.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const inventoryPath = path.join(root, 'inventory.json')
  fs.writeFileSync(
    inventoryPath,
    JSON.stringify({
      productTypes: ['gallery'],
      project: {
        id: 'memory-chip-industry-chain',
        title: { 'zh-CN': '存储芯片产业链', 'en-US': 'Memory Chip Industry Chain' },
        defaultLocale: 'zh-CN',
      },
      knowledgeDocuments: ['knowledge.md'],
      galleryItemImages: [{ itemId: 'dram', path: 'dram.png' }],
    }),
  )

  const result = await runNode(path.join(skillScripts, 'material-inventory.mjs'), [
    '--input',
    inventoryPath,
  ])
  assert.equal(result.code, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.ok, true)
  assert.equal(output.files.panoramaImage, null)
  assert(!output.manualReview.includes('Atlas hotspot positions'))
  assert(!output.manualReview.includes('Atlas callouts and Catalog focus rectangles'))
})

test('workbench client uses revisions and exports selected preview ZIPs without overwriting', async () => {
  let revision = 4
  let galleryEnabled = true
  let updateHeader = ''
  let updateBody: unknown
  const project = () => ({
    id: 'demo',
    metadata: { revision },
    knowledge: { stages: [], items: {} },
    products: { gallery: { enabled: galleryEnabled } },
  })
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const sendJson = (status: number, value: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(value))
    }
    if (request.method === 'GET' && url.pathname === '/api/projects/demo') {
      sendJson(200, { data: project() })
      return
    }
    if (request.method === 'PUT' && url.pathname === '/api/projects/demo/knowledge') {
      updateHeader = String(request.headers['x-expected-revision'] ?? '')
      let body = ''
      request.setEncoding('utf8')
      request.on('data', chunk => {
        body += chunk
      })
      request.on('end', () => {
        updateBody = JSON.parse(body)
        revision += 1
        sendJson(200, { data: project() })
      })
      return
    }
    const previewMatch = /^\/api\/projects\/demo\/previews\/(atlas|catalog|gallery)$/.exec(
      url.pathname,
    )
    if (request.method === 'POST' && previewMatch) {
      const product = previewMatch[1]
      sendJson(200, {
        data: {
          product,
          buildId: `${product}-1-${revision}`,
          sourceRevision: revision,
          downloadUrl: `/api/download/${product}.zip`,
        },
      })
      return
    }
    const downloadMatch = /^\/api\/download\/(atlas|catalog|gallery)\.zip$/.exec(url.pathname)
    if (request.method === 'GET' && downloadMatch) {
      const product = downloadMatch[1]
      response.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="demo-${product}-0.1.0.zip"`,
      })
      response.end(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      return
    }
    sendJson(404, { error: 'not found' })
  })
  const port = await listen(server)
  try {
    const root = temporaryRoot('guide-client')
    const knowledgePath = path.join(root, 'knowledge.json')
    fs.writeFileSync(knowledgePath, JSON.stringify({ stages: [], items: {} }))
    const client = path.join(skillScripts, 'workbench-client.mjs')
    const baseArgs = ['--base-url', `http://127.0.0.1:${port}`, '--project-id', 'demo']
    const updated = await runNode(client, [
      'update',
      ...baseArgs,
      '--section',
      'knowledge',
      '--input',
      knowledgePath,
    ])
    assert.equal(updated.code, 0, updated.stderr)
    assert.equal(updateHeader, '4')
    assert.deepEqual(updateBody, { stages: [], items: {} })
    assert.equal(JSON.parse(updated.stdout).project.metadata.revision, 5)

    const outputDir = path.join(root, 'outputs')
    const exported = await runNode(client, [
      'export',
      ...baseArgs,
      '--output-dir',
      outputDir,
      '--products',
      'all',
    ])
    assert.equal(exported.code, 0, exported.stderr)
    const exportResult = JSON.parse(exported.stdout)
    assert.deepEqual(exportResult.products, ['atlas', 'catalog', 'gallery'])
    assert.equal(exportResult.files.length, 3)
    assert(
      exportResult.files.every((file: { sha256: string }) => /^[a-f0-9]{64}$/.test(file.sha256)),
    )
    assert.equal(fs.readdirSync(outputDir).filter(name => name.endsWith('.zip')).length, 3)

    const collision = await runNode(client, [
      'export',
      ...baseArgs,
      '--output-dir',
      outputDir,
      '--products',
      'all',
    ])
    assert.equal(collision.code, 1)
    assert.match(collision.stderr, /refusing to overwrite existing file/)

    galleryEnabled = false
    const disabledGallery = await runNode(client, [
      'export',
      ...baseArgs,
      '--output-dir',
      path.join(root, 'disabled-gallery'),
      '--products',
      'gallery',
    ])
    assert.equal(disabledGallery.code, 1)
    assert.match(disabledGallery.stderr, /gallery was selected.*enabled is false/)
  } finally {
    await close(server)
  }
})

function waitForLauncher(child: ReturnType<typeof spawn>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => reject(new Error(`launcher timeout: ${stderr}`)), 15000)
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', chunk => {
      stderr += chunk
    })
    child.stdout?.on('data', chunk => {
      stdout += chunk
      const newline = stdout.indexOf('\n')
      if (newline < 0) return
      clearTimeout(timer)
      resolve(JSON.parse(stdout.slice(0, newline)))
    })
    child.once('error', reject)
    child.once('exit', code => reject(new Error(`launcher exited with ${code}: ${stderr}`)))
  })
}

test('launcher reports the user installation command when dependencies are missing', async () => {
  const root = temporaryRoot('guide-launcher-missing-dependencies')
  const skillRoot = path.join(root, 'interactive-guide-offline')
  const scriptsRoot = path.join(skillRoot, 'scripts')
  const workbenchRoot = path.join(skillRoot, 'workbench')
  const serverRoot = path.join(workbenchRoot, 'dist', 'server')
  const adminRoot = path.join(workbenchRoot, 'dist', 'admin')
  fs.mkdirSync(scriptsRoot, { recursive: true })
  fs.mkdirSync(serverRoot, { recursive: true })
  fs.mkdirSync(adminRoot, { recursive: true })
  fs.copyFileSync(path.join(skillScripts, 'launcher.mjs'), path.join(scriptsRoot, 'launcher.mjs'))
  fs.writeFileSync(
    path.join(workbenchRoot, 'package.json'),
    JSON.stringify({
      type: 'module',
      dependencies: Object.fromEntries(
        packagedRuntimeDependencies.map(dependency => [dependency, '0.0.0-test']),
      ),
    }),
  )
  fs.writeFileSync(path.join(serverRoot, 'index.js'), '')
  fs.writeFileSync(path.join(adminRoot, 'index.html'), '<!doctype html>')

  const result = await runNode(path.join(scriptsRoot, 'launcher.mjs'), [
    '--workspace',
    path.join(root, 'workspace'),
  ])
  assert.equal(result.code, 1)
  assert.match(result.stderr, /workbench dependencies are not installed/)
  assert.match(result.stderr, /npm ci --omit=dev/)
  assert.match(result.stderr, new RegExp(workbenchRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('launcher serves the admin SPA, proxies API, and stops its own backend', async () => {
  const root = temporaryRoot('guide-launcher')
  const skillRoot = path.join(root, 'interactive-guide-offline')
  const scriptsRoot = path.join(skillRoot, 'scripts')
  const workbenchRoot = path.join(skillRoot, 'workbench')
  const serverRoot = path.join(workbenchRoot, 'dist', 'server')
  const adminRoot = path.join(workbenchRoot, 'dist', 'admin')
  fs.mkdirSync(scriptsRoot, { recursive: true })
  fs.mkdirSync(serverRoot, { recursive: true })
  fs.mkdirSync(adminRoot, { recursive: true })
  fs.copyFileSync(path.join(skillScripts, 'launcher.mjs'), path.join(scriptsRoot, 'launcher.mjs'))
  fs.writeFileSync(
    path.join(workbenchRoot, 'package.json'),
    JSON.stringify({
      type: 'module',
      dependencies: Object.fromEntries(
        packagedRuntimeDependencies.map(dependency => [dependency, '0.0.0-test']),
      ),
    }),
  )
  for (const dependency of packagedRuntimeDependencies) {
    const packageRoot = path.join(workbenchRoot, 'node_modules', ...dependency.split('/'))
    fs.mkdirSync(packageRoot, { recursive: true })
    fs.writeFileSync(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({ name: dependency, version: '0.0.0-test' }),
    )
  }
  fs.writeFileSync(
    path.join(adminRoot, 'index.html'),
    '<!doctype html><title>Offline Workbench</title>',
  )
  fs.writeFileSync(
    path.join(serverRoot, 'index.js'),
    `import http from 'node:http'
const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'application/json')
  if (request.url === '/api/health') response.end(JSON.stringify({ status: 'ok' }))
  else if (request.url === '/api/echo') response.end(JSON.stringify({ proxied: true }))
  else { response.statusCode = 404; response.end(JSON.stringify({ error: 'not found' })) }
})
server.listen(Number(process.env.PORT), '127.0.0.1')
const stop = () => server.close(() => process.exit(0))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
`,
  )
  const workspace = path.join(root, 'workspace')
  const child = spawn(
    process.execPath,
    [path.join(scriptsRoot, 'launcher.mjs'), '--workspace', workspace],
    { cwd: skillRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  )
  try {
    const output = await waitForLauncher(child)
    assert.equal(output.ok, true)
    const uiUrl = String(output.uiUrl)
    assert.match(uiUrl, /^http:\/\/127\.0\.0\.1:/)
    const api = await fetch(new URL('/api/echo', uiUrl))
    assert.deepEqual(await api.json(), { proxied: true })
    const spa = await fetch(new URL('/projects/demo/atlas', uiUrl))
    assert.equal(spa.status, 200)
    assert.match(await spa.text(), /Offline Workbench/)
  } finally {
    if (child.exitCode === null) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('launcher did not stop')), 15000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        child.kill('SIGTERM')
      })
    }
  }
})
