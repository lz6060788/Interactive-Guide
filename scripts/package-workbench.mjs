#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import { WORKBENCH_BUILD_DIRECTORIES } from './workbench-build-layout.mjs'

const PACKAGE_FORMAT_VERSION = 1
const MINIMUM_NODE_VERSION = '>=20.0.0'
// Raw DOS timestamp for 2000-01-01 00:00:00. Using Header.time would
// reinterpret a Date in the host timezone and make ZIP bytes vary by TZ.
const ARCHIVE_DOS_TIME = 0x28210000
const RUNTIME_DEPENDENCIES = [
  '@babel/core',
  '@babel/preset-env',
  'acorn',
  'adm-zip',
  'cors',
  'dotenv',
  'esbuild',
  'express',
  'uuid',
  'zod',
]
const PAYLOAD_DIRECTORIES = [
  ...WORKBENCH_BUILD_DIRECTORIES,
  'src/config',
  'src/domain',
  'src/platform',
  'src/product-shell',
  'src/products',
  'vendor/king-fisher',
]
const FORBIDDEN_BUILD_ENTRY_PATTERNS = [
  /^dist\/server\/ai(?:\/|$)/,
  /^dist\/server\/routes\/generates(?:\.|$)/,
  /^dist\/server\/services\/prompt-builder(?:\.|$)/,
]

/**
 * Build a platform-specific, content-addressed Workbench archive without
 * downloading anything. The caller must have already run build:workbench:clean.
 */
export function packageWorkbench(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot())
  const outputDir = path.resolve(options.outputDir ?? path.join(repoRoot, 'dist', 'packages'))
  const rootPackage = readJson(path.join(repoRoot, 'package.json'))
  const version = requireSafeSegment(rootPackage.version, 'package version')
  const platform = requireSafeSegment(process.platform, 'platform')
  const arch = requireSafeSegment(process.arch, 'architecture')
  const packageRootName = `interactive-guide-workbench-v${version}-${platform}-${arch}`

  assertSafeOutputDirectory(repoRoot, outputDir)
  assertRequiredInputs(repoRoot)
  assertPayloadRootsContained(repoRoot)
  assertNoForbiddenBuildEntries(repoRoot)
  fs.mkdirSync(outputDir, { recursive: true })
  const stagingParent = fs.mkdtempSync(path.join(outputDir, '.workbench-package-'))
  const stagingRoot = resolveInside(stagingParent, packageRootName)

  try {
    fs.mkdirSync(stagingRoot)
    copyWorkbenchPayload(repoRoot, stagingRoot)
    const bundledDependencies = copyRuntimeDependencyClosure(repoRoot, stagingRoot)
    writePortableMetadata(stagingRoot, version)

    const payloadFiles = collectFiles(stagingRoot)
    const manifest = {
      formatVersion: PACKAGE_FORMAT_VERSION,
      name: 'interactive-guide-workbench',
      version,
      compatibility: {
        platform,
        architecture: arch,
        node: MINIMUM_NODE_VERSION,
      },
      entrypoints: {
        cli: 'bin/guide-workbench.mjs',
        admin: 'dist/admin/index.html',
      },
      bundledDependencies,
      payload: {
        algorithm: 'sha256',
        files: payloadFiles,
      },
    }
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
    const manifestSha256 = sha256(manifestBytes)
    fs.writeFileSync(path.join(stagingRoot, 'workbench-manifest.json'), manifestBytes, {
      flag: 'wx',
    })
    fs.writeFileSync(
      path.join(stagingRoot, 'workbench-manifest.json.sha256'),
      `${manifestSha256}  workbench-manifest.json\n`,
      { flag: 'wx' },
    )

    const temporaryArchive = resolveInside(stagingParent, `${packageRootName}.zip`)
    writeDeterministicZip(stagingRoot, packageRootName, temporaryArchive)
    const archiveSha256 = hashFile(temporaryArchive)
    const archiveStem = `${packageRootName}-${archiveSha256.slice(0, 12)}`
    const archivePath = resolveInside(outputDir, `${archiveStem}.zip`)
    const checksumPath = resolveInside(outputDir, `${archiveStem}.zip.sha256`)

    publishContentAddressedFile(temporaryArchive, archivePath, archiveSha256)
    publishChecksum(checksumPath, archiveSha256, path.basename(archivePath))

    return {
      archivePath,
      checksumPath,
      archiveSha256,
      manifestSha256,
      packageRoot: packageRootName,
      version,
      platform,
      architecture: arch,
      fileCount: payloadFiles.length + 2,
      dependencyCount: bundledDependencies.length,
    }
  } finally {
    fs.rmSync(stagingParent, { recursive: true, force: true })
  }
}

function copyWorkbenchPayload(repoRoot, stagingRoot) {
  for (const directory of PAYLOAD_DIRECTORIES) {
    const source = path.join(repoRoot, directory)
    const target = resolveInside(stagingRoot, directory)
    copyTree(source, target)
  }
}

function copyRuntimeDependencyClosure(repoRoot, stagingRoot) {
  const queue = RUNTIME_DEPENDENCIES.map(name => ({ name, fromRoot: repoRoot, optional: false }))
  const packages = new Map()

  while (queue.length > 0) {
    const request = queue.shift()
    const packageRoot = locateInstalledPackage(repoRoot, request.fromRoot, request.name)
    if (!packageRoot) {
      if (request.optional) continue
      throw new Error(`required offline dependency is not installed: ${request.name}`)
    }
    const realRoot = fs.realpathSync(packageRoot)
    if (packages.has(realRoot)) continue

    const metadata = readJson(path.join(realRoot, 'package.json'))
    if (metadata.name !== request.name) {
      throw new Error(`resolved dependency ${request.name} has unexpected name ${metadata.name}`)
    }
    const relativeRoot = normalizeRelative(assertRelative(repoRoot, realRoot, request.name))
    if (!relativeRoot.startsWith('node_modules/')) {
      throw new Error(`dependency ${request.name} resolved outside node_modules`)
    }
    packages.set(realRoot, {
      name: metadata.name,
      version: metadata.version,
      path: relativeRoot,
    })

    for (const name of Object.keys(metadata.dependencies ?? {}).sort()) {
      queue.push({ name, fromRoot: realRoot, optional: false })
    }
    for (const name of Object.keys(metadata.optionalDependencies ?? {}).sort()) {
      queue.push({ name, fromRoot: realRoot, optional: true })
    }
    for (const name of Object.keys(metadata.peerDependencies ?? {}).sort()) {
      const optional = metadata.peerDependenciesMeta?.[name]?.optional === true
      queue.push({ name, fromRoot: realRoot, optional })
    }
  }

  const sorted = [...packages.entries()].sort((left, right) =>
    compareText(left[1].path, right[1].path),
  )
  for (const [source, metadata] of sorted) {
    copyTree(source, resolveInside(stagingRoot, metadata.path), {
      skipTopLevelNodeModules: true,
    })
  }
  return sorted.map(([, metadata]) => metadata)
}

function locateInstalledPackage(repoRoot, fromRoot, dependencyName) {
  let current = path.resolve(fromRoot)
  const repository = path.resolve(repoRoot)
  while (current === repository || current.startsWith(`${repository}${path.sep}`)) {
    const candidate = path.join(current, 'node_modules', ...dependencyName.split('/'))
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function writePortableMetadata(stagingRoot, version) {
  const binDir = resolveInside(stagingRoot, 'bin')
  fs.mkdirSync(binDir)
  const wrapper = `#!/usr/bin/env node
import { runWorkbenchCli } from '../dist/server/workbench-cli.js'

await runWorkbenchCli(process.argv.slice(2))
`
  fs.writeFileSync(path.join(binDir, 'guide-workbench.mjs'), wrapper, {
    flag: 'wx',
    mode: 0o755,
  })
  fs.writeFileSync(
    path.join(stagingRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: 'interactive-guide-workbench-portable',
        version,
        private: true,
        type: 'module',
        engines: { node: MINIMUM_NODE_VERSION },
        bin: { 'guide-workbench': './bin/guide-workbench.mjs' },
      },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  )
  fs.writeFileSync(
    path.join(stagingRoot, 'README.txt'),
    [
      'Interactive Guide Workbench (offline portable package)',
      '',
      'Requirements:',
      `- Node.js ${MINIMUM_NODE_VERSION}`,
      `- ${process.platform}/${process.arch} (the bundled esbuild executable is platform-specific)`,
      '',
      'Verify the installation:',
      '  node bin/guide-workbench.mjs handshake --json',
      '',
      'Start the Workbench:',
      '  node bin/guide-workbench.mjs start --workspace ./workspace --port auto --json',
      '',
      'No npm install or network connection is required.',
      '',
    ].join('\n'),
    { flag: 'wx' },
  )
}

function copyTree(sourceRoot, targetRoot, options = {}) {
  const source = path.resolve(sourceRoot)
  if (!fs.existsSync(source)) throw new Error(`package input is missing: ${source}`)

  function visit(current, relative) {
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink())
      throw new Error(`symbolic links are not allowed in package input: ${current}`)
    if (stat.isDirectory()) {
      if (options.skipTopLevelNodeModules && relative === 'node_modules') return
      const target = relative ? resolveInside(targetRoot, relative) : targetRoot
      fs.mkdirSync(target, { recursive: true })
      for (const entry of fs.readdirSync(current).sort(compareText)) {
        visit(path.join(current, entry), relative ? path.join(relative, entry) : entry)
      }
      return
    }
    if (!stat.isFile()) throw new Error(`unsupported package input type: ${current}`)
    const target = resolveInside(targetRoot, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(current, target, fs.constants.COPYFILE_EXCL)
    fs.chmodSync(target, stat.mode & 0o777)
  }

  visit(source, '')
}

function collectFiles(root) {
  const files = []
  const caseFolded = new Set()

  function visit(current, relative) {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => compareText(a.name, b.name))) {
      const absolute = path.join(current, entry.name)
      const childRelative = relative ? path.join(relative, entry.name) : entry.name
      if (entry.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${absolute}`)
      if (entry.isDirectory()) {
        visit(absolute, childRelative)
      } else if (entry.isFile()) {
        const normalized = normalizeRelative(childRelative)
        const folded = normalized.toLocaleLowerCase('en-US')
        if (caseFolded.has(folded))
          throw new Error(`case-insensitive package path collision: ${normalized}`)
        caseFolded.add(folded)
        const stat = fs.statSync(absolute)
        files.push({ path: normalized, size: stat.size, sha256: hashFile(absolute) })
      } else {
        throw new Error(`unsupported package input type: ${absolute}`)
      }
    }
  }

  visit(root, '')
  return files.sort((left, right) => compareText(left.path, right.path))
}

function writeDeterministicZip(stagingRoot, packageRootName, target) {
  const zip = new AdmZip()
  for (const file of collectFiles(stagingRoot)) {
    const absolute = resolveInside(stagingRoot, file.path)
    const entryName = `${packageRootName}/${file.path}`
    const mode = file.path === 'bin/guide-workbench.mjs' ? 0o755 : 0o644
    const entry = zip.addFile(entryName, fs.readFileSync(absolute), '', mode)
    entry.header.timeval = ARCHIVE_DOS_TIME
  }
  zip.writeZip(target)
}

function publishContentAddressedFile(source, target, expectedSha256) {
  if (fs.existsSync(target)) {
    const existingSha256 = hashFile(target)
    if (existingSha256 !== expectedSha256) {
      throw new Error(`refusing to overwrite a different content-addressed archive: ${target}`)
    }
    return
  }
  fs.renameSync(source, target)
}

function publishChecksum(target, archiveSha256, archiveName) {
  const content = `${archiveSha256}  ${archiveName}\n`
  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, 'utf8') !== content) {
      throw new Error(`refusing to overwrite a mismatched checksum: ${target}`)
    }
    return
  }
  fs.writeFileSync(target, content, { flag: 'wx' })
}

function assertRequiredInputs(repoRoot) {
  const required = [
    'dist/server/workbench-cli.js',
    'dist/admin/index.html',
    'src/product-shell/browser/atlas-entry.ts',
    'src/product-shell/browser/catalog-entry.ts',
    'vendor/king-fisher/bridge-0.6.0.umd.js',
    'vendor/king-fisher/falcon-0.5.26-zcp-692-snapshot.umd.js',
    'node_modules/adm-zip/package.json',
  ]
  for (const relative of required) {
    const absolute = resolveInside(repoRoot, relative)
    if (!fs.existsSync(absolute)) throw new Error(`package input is missing: ${relative}`)
  }
}

function assertSafeOutputDirectory(repoRoot, outputDir) {
  const physicalOutput = resolvePhysicalPath(outputDir)
  const inputRoots = [...PAYLOAD_DIRECTORIES, 'node_modules'].map(relative => {
    const lexical = path.resolve(repoRoot, ...relative.split('/'))
    return { lexical, physical: resolvePhysicalPath(lexical) }
  })
  for (const inputRoot of inputRoots) {
    if (
      isSameOrInside(inputRoot.lexical, outputDir) ||
      isSameOrInside(inputRoot.physical, physicalOutput)
    ) {
      throw new Error(`package output directory cannot be inside an input tree: ${outputDir}`)
    }
  }
}

function assertPayloadRootsContained(repoRoot) {
  const physicalRepoRoot = fs.realpathSync.native(repoRoot)
  for (const relative of PAYLOAD_DIRECTORIES) {
    const source = path.resolve(repoRoot, ...relative.split('/'))
    if (!fs.existsSync(source)) continue
    const physicalSource = fs.realpathSync.native(source)
    if (!isSameOrInside(physicalRepoRoot, physicalSource)) {
      throw new Error(`package input resolves outside repository: ${relative}`)
    }
  }
}

function assertNoForbiddenBuildEntries(repoRoot) {
  const serverRoot = path.join(repoRoot, 'dist', 'server')
  if (!fs.existsSync(serverRoot)) return

  function visit(current, relative) {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => compareText(left.name, right.name))) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name
      const packagePath = `dist/server/${childRelative}`
      if (FORBIDDEN_BUILD_ENTRY_PATTERNS.some(pattern => pattern.test(packagePath))) {
        throw new Error(`forbidden stale Workbench build entry: ${packagePath}`)
      }
      if (entry.isDirectory()) visit(path.join(current, entry.name), childRelative)
    }
  }

  visit(serverRoot, '')
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function requireSafeSegment(value, label) {
  if (typeof value !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(value)) {
    throw new Error(`${label} cannot be used in a package path`)
  }
  return value
}

function assertRelative(root, candidate, label) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} escapes the package source root`)
  }
  return relative
}

function resolveInside(root, relative) {
  if (typeof relative !== 'string' || relative.length === 0 || path.isAbsolute(relative)) {
    throw new Error(`invalid package-relative path: ${String(relative)}`)
  }
  const segments = relative.replaceAll('\\', '/').split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(`invalid package-relative path: ${relative}`)
  }
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, ...segments)
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`package path escapes output root: ${relative}`)
  }
  return resolved
}

function normalizeRelative(value) {
  const normalized = value.replaceAll('\\', '/')
  if (
    normalized.startsWith('/') ||
    normalized.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    throw new Error(`unsafe package path: ${value}`)
  }
  return normalized
}

function isSameOrInside(root, candidate) {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  return (
    resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  )
}

function resolvePhysicalPath(candidate) {
  let existing = path.resolve(candidate)
  const missingSegments = []
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) throw new Error(`cannot resolve package path: ${candidate}`)
    missingSegments.unshift(path.basename(existing))
    existing = parent
  }
  return path.resolve(fs.realpathSync.native(existing), ...missingSegments)
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function hashFile(file) {
  const digest = crypto.createHash('sha256')
  const descriptor = fs.openSync(file, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let read = 0
    do {
      read = fs.readSync(descriptor, buffer, 0, buffer.byteLength, null)
      if (read > 0) digest.update(buffer.subarray(0, read))
    } while (read > 0)
  } finally {
    fs.closeSync(descriptor)
  }
  return digest.digest('hex')
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function defaultRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function isMainModule() {
  const entry = process.argv[1]
  return Boolean(entry) && pathToFileURL(path.resolve(entry)).href === import.meta.url
}

if (isMainModule()) {
  try {
    process.stdout.write(`${JSON.stringify(packageWorkbench())}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
