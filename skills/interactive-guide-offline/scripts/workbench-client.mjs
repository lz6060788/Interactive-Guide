#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const SECTION_PATHS = {
  metadata: 'metadata',
  localization: 'localization',
  knowledge: 'knowledge',
  panorama: 'panorama',
  scenes: 'scenes',
  navigation: 'navigation',
  atlas: 'products/atlas',
  catalog: 'products/catalog',
  integrations: 'integrations',
}

function usage() {
  return `Usage:
  node scripts/workbench-client.mjs list --base-url <url>
  node scripts/workbench-client.mjs get --base-url <url> --project-id <id>
  node scripts/workbench-client.mjs create --base-url <url> --input <create.json>
  node scripts/workbench-client.mjs update --base-url <url> --project-id <id> --section <section> --input <section.json> [--expected-revision <n>]
  node scripts/workbench-client.mjs upload --base-url <url> --project-id <id> --kind <image|video|html-bundle> --asset-id <id> --file <path> [--content-type <mime>] [--expected-revision <n>]
  node scripts/workbench-client.mjs preview --base-url <url> --project-id <id> --product <atlas|catalog>
  node scripts/workbench-client.mjs export --base-url <url> --project-id <id> --output-dir <directory> [--product <both|atlas|catalog>]

Sections: metadata, localization, knowledge, panorama, scenes, navigation, atlas, catalog, integrations.
The base URL must resolve to localhost or a loopback IP address.`
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return { help: true }
  const command = argv[0]
  if (command.startsWith('--')) throw new Error('a command is required')
  const values = { command }
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`)
    values[key] = value
    index += 1
  }
  return values
}

function requireArg(args, name) {
  const value = args[name]
  if (typeof value !== 'string' || !value) throw new Error(`--${name} is required`)
  return value
}

function baseUrlFrom(args) {
  const value = new URL(requireArg(args, 'base-url'))
  const loopback =
    value.hostname === 'localhost' || value.hostname === '127.0.0.1' || value.hostname === '[::1]'
  if (!loopback || (value.protocol !== 'http:' && value.protocol !== 'https:')) {
    throw new Error('--base-url must use HTTP(S) on localhost or a loopback IP')
  }
  value.pathname = value.pathname.replace(/\/$/, '')
  value.search = ''
  value.hash = ''
  return value
}

function apiUrl(baseUrl, apiPath) {
  return new URL(`/api${apiPath}`, baseUrl)
}

async function readResponse(response) {
  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { raw: text }
    }
  }
  if (!response.ok) {
    const message = payload?.error ?? payload?.raw ?? `HTTP ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

async function requestJson(baseUrl, apiPath, options = {}) {
  const headers = { accept: 'application/json', ...(options.headers ?? {}) }
  let body = options.body
  if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(body)
  }
  const response = await fetch(apiUrl(baseUrl, apiPath), {
    method: options.method ?? 'GET',
    headers,
    body,
  })
  return await readResponse(response)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
}

async function getProject(baseUrl, projectId) {
  return await requestJson(baseUrl, `/projects/${encodeURIComponent(projectId)}`)
}

function parseRevision(value, fallback) {
  if (value === undefined) return fallback
  const revision = Number(value)
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error('--expected-revision must be a non-negative integer')
  }
  return revision
}

async function resolveRevision(baseUrl, projectId, requested) {
  const current = await getProject(baseUrl, projectId)
  const revision = current?.data?.metadata?.revision
  if (!Number.isInteger(revision)) throw new Error('project response has no metadata.revision')
  return { current, revision: parseRevision(requested, revision) }
}

async function createProject(baseUrl, args) {
  const input = readJson(requireArg(args, 'input'))
  const created = await requestJson(baseUrl, '/projects', { method: 'POST', body: input })
  return { ok: true, command: 'create', project: created.data }
}

async function updateProject(baseUrl, args) {
  const projectId = requireArg(args, 'project-id')
  const section = requireArg(args, 'section')
  const route = SECTION_PATHS[section]
  if (!route) throw new Error(`unknown section: ${section}`)
  const body = readJson(requireArg(args, 'input'))
  const { revision } = await resolveRevision(baseUrl, projectId, args['expected-revision'])
  const requestBody =
    section === 'metadata' || section === 'localization'
      ? { ...body, expectedRevision: revision }
      : body
  await requestJson(baseUrl, `/projects/${encodeURIComponent(projectId)}/${route}`, {
    method: section === 'metadata' ? 'PATCH' : 'PUT',
    headers: { 'x-expected-revision': String(revision) },
    body: requestBody,
  })
  const latest = await getProject(baseUrl, projectId)
  return {
    ok: true,
    command: 'update',
    section,
    expectedRevision: revision,
    project: latest.data,
  }
}

function inferredContentType(kind, filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const common = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.zip': 'application/zip',
  }
  return (
    common[extension] ?? (kind === 'html-bundle' ? 'application/zip' : 'application/octet-stream')
  )
}

async function uploadAsset(baseUrl, args) {
  const projectId = requireArg(args, 'project-id')
  const kind = requireArg(args, 'kind')
  if (!['image', 'video', 'html-bundle'].includes(kind))
    throw new Error(`unknown asset kind: ${kind}`)
  const assetId = requireArg(args, 'asset-id')
  const filePath = path.resolve(requireArg(args, 'file'))
  const bytes = fs.readFileSync(filePath)
  const { revision } = await resolveRevision(baseUrl, projectId, args['expected-revision'])
  const query = new URLSearchParams({
    id: assetId,
    expectedRevision: String(revision),
    filename: path.basename(filePath),
  })
  await requestJson(
    baseUrl,
    `/projects/${encodeURIComponent(projectId)}/assets/${kind}?${query.toString()}`,
    {
      method: 'POST',
      headers: {
        'content-type': args['content-type'] ?? inferredContentType(kind, filePath),
        'x-expected-revision': String(revision),
      },
      body: bytes,
    },
  )
  const latest = await getProject(baseUrl, projectId)
  return {
    ok: true,
    command: 'upload',
    assetId,
    kind,
    expectedRevision: revision,
    project: latest.data,
  }
}

function assertProduct(value) {
  if (value !== 'atlas' && value !== 'catalog')
    throw new Error('--product must be atlas or catalog')
  return value
}

async function buildPreview(baseUrl, projectId, product) {
  const response = await requestJson(
    baseUrl,
    `/projects/${encodeURIComponent(projectId)}/previews/${product}`,
    { method: 'POST' },
  )
  return response.data
}

function filenameFromDisposition(value, fallback) {
  const match = /filename\*?=(?:UTF-8''|\")?([^\";]+)/i.exec(value ?? '')
  const decoded = match ? decodeURIComponent(match[1].trim()) : fallback
  const safe = path.basename(decoded).replace(/[^A-Za-z0-9._-]+/g, '-')
  return safe.toLowerCase().endsWith('.zip') ? safe : `${safe || fallback}.zip`
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

async function downloadZip(baseUrl, downloadUrl, outputDir, fallbackName) {
  const response = await fetch(new URL(downloadUrl, baseUrl), {
    headers: { accept: 'application/zip' },
  })
  if (!response.ok) return await readResponse(response)
  const contentType = response.headers.get('content-type') ?? ''
  if (!/(zip|octet-stream)/i.test(contentType)) {
    throw new Error(`download did not return a ZIP content type: ${contentType || '(missing)'}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('downloaded file does not have a ZIP signature')
  }
  fs.mkdirSync(outputDir, { recursive: true })
  const filename = filenameFromDisposition(
    response.headers.get('content-disposition'),
    fallbackName,
  )
  const destination = path.join(outputDir, filename)
  if (fs.existsSync(destination))
    throw new Error(`refusing to overwrite existing file: ${destination}`)
  const temporary = path.join(
    outputDir,
    `.${filename}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.part`,
  )
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx' })
    fs.linkSync(temporary, destination)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
  return { path: destination, size: bytes.length, sha256: sha256(bytes) }
}

async function exportProducts(baseUrl, args) {
  const projectId = requireArg(args, 'project-id')
  const outputDir = path.resolve(requireArg(args, 'output-dir'))
  const requested = args.product ?? 'both'
  if (!['both', 'atlas', 'catalog'].includes(requested)) {
    throw new Error('--product must be both, atlas, or catalog')
  }
  const project = await getProject(baseUrl, projectId)
  const sourceRevision = project?.data?.metadata?.revision
  const products = requested === 'both' ? ['atlas', 'catalog'] : [requested]
  const builds = []
  for (const product of products) builds.push(await buildPreview(baseUrl, projectId, product))
  for (const build of builds) {
    if (build.sourceRevision !== sourceRevision) {
      throw new Error(
        `project revision changed while building ${build.product}; inspect and export again`,
      )
    }
  }
  const files = []
  for (const build of builds) {
    files.push({
      product: build.product,
      ...(await downloadZip(
        baseUrl,
        build.downloadUrl,
        outputDir,
        `${projectId}-${build.product}.zip`,
      )),
    })
  }
  return { ok: true, command: 'export', projectId, sourceRevision, files }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  const baseUrl = baseUrlFrom(args)
  let output
  switch (args.command) {
    case 'list':
      output = { ok: true, command: 'list', ...(await requestJson(baseUrl, '/projects')) }
      break
    case 'get':
      output = {
        ok: true,
        command: 'get',
        ...(await getProject(baseUrl, requireArg(args, 'project-id'))),
      }
      break
    case 'create':
      output = await createProject(baseUrl, args)
      break
    case 'update':
      output = await updateProject(baseUrl, args)
      break
    case 'upload':
      output = await uploadAsset(baseUrl, args)
      break
    case 'preview': {
      const projectId = requireArg(args, 'project-id')
      output = {
        ok: true,
        command: 'preview',
        preview: await buildPreview(baseUrl, projectId, assertProduct(requireArg(args, 'product'))),
      }
      break
    }
    case 'export':
      output = await exportProducts(baseUrl, args)
      break
    default:
      throw new Error(`unknown command: ${args.command}`)
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

main().catch(error => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      status: error?.status,
      response: error?.payload,
    })}\n`,
  )
  process.exitCode = 1
})
