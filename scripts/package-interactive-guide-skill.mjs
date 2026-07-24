#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { buildSync } from 'esbuild'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillName = 'interactive-guide-offline'
const skillSource = path.join(repositoryRoot, 'skills', skillName)
const runtimePackages = [
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

function usage() {
  return `Usage:
  node scripts/package-interactive-guide-skill.mjs [--output-dir <directory>] [--skip-build]

Builds the existing workbench, combines its runtime closure with the orchestration Skill,
and writes one installable ZIP plus a .sha256 file. Runtime dependencies are declared
in workbench/package.json and must be installed by the user after extraction.`
}

function parseArgs(argv) {
  const result = { skipBuild: false }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') return { help: true }
    if (token === '--skip-build') {
      result.skipBuild = true
      continue
    }
    if (token === '--output-dir') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--output-dir requires a value')
      result.outputDir = path.resolve(value)
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${token}`)
  }
  return result
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`)
}

function buildWorkbench() {
  const npmCli = process.env.npm_execpath
  if (npmCli && fs.existsSync(npmCli)) {
    run(process.execPath, [npmCli, 'run', 'build:server'])
    run(process.execPath, [npmCli, 'run', 'build:admin'])
    return
  }
  run('npm', ['run', 'build:server'], { shell: process.platform === 'win32' })
  run('npm', ['run', 'build:admin'], { shell: process.platform === 'win32' })
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is missing: ${filePath}`)
  }
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function moduleSpecifiers(source) {
  const values = []
  const pattern = /\b(?:from|import)\s*(?:\(\s*)?['"](\.{1,2}\/[^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) values.push(match[1])
  return values
}

function copyCompiledServerClosure(workbenchRoot) {
  const entry = path.join(repositoryRoot, 'dist', 'server', 'index.js')
  ensureFile(entry, 'compiled server entry')
  const queue = [entry]
  const visited = new Set()
  while (queue.length > 0) {
    const sourcePath = path.resolve(queue.pop())
    if (visited.has(sourcePath)) continue
    visited.add(sourcePath)
    if (!sourcePath.startsWith(`${path.join(repositoryRoot, 'dist')}${path.sep}`)) {
      throw new Error(`compiled import escaped dist: ${sourcePath}`)
    }
    ensureFile(sourcePath, 'compiled dependency')
    copyFile(sourcePath, path.join(workbenchRoot, path.relative(repositoryRoot, sourcePath)))
    const source = fs.readFileSync(sourcePath, 'utf8')
    for (const specifier of moduleSpecifiers(source)) {
      const resolved = path.resolve(path.dirname(sourcePath), specifier)
      queue.push(path.extname(resolved) ? resolved : `${resolved}.js`)
    }
  }
  return visited
}

function copyAdminBuild(workbenchRoot) {
  const source = path.join(repositoryRoot, 'dist', 'admin')
  ensureFile(path.join(source, 'index.html'), 'admin build')
  fs.cpSync(source, path.join(workbenchRoot, 'dist', 'admin'), { recursive: true })
}

function browserRuntimeInputs() {
  const entryPoints = [
    path.join(repositoryRoot, 'src', 'product-shell', 'browser', 'atlas-entry.ts'),
    path.join(repositoryRoot, 'src', 'product-shell', 'browser', 'catalog-entry.ts'),
    path.join(repositoryRoot, 'src', 'product-shell', 'browser', 'gallery-entry.ts'),
  ]
  const inputs = new Set()
  for (const entryPoint of entryPoints) {
    const result = buildSync({
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      target: 'es2017',
      metafile: true,
      logLevel: 'silent',
    })
    for (const input of Object.keys(result.metafile?.inputs ?? {})) {
      const absolute = path.resolve(repositoryRoot, input)
      if (absolute.startsWith(`${repositoryRoot}${path.sep}`)) inputs.add(absolute)
    }
  }
  return inputs
}

function copyBrowserRuntimeSources(workbenchRoot) {
  const inputs = browserRuntimeInputs()
  for (const sourcePath of inputs) {
    copyFile(sourcePath, path.join(workbenchRoot, path.relative(repositoryRoot, sourcePath)))
  }
  const vendorFiles = [
    path.join('vendor', 'king-fisher', 'bridge-0.6.0.umd.js'),
    path.join('vendor', 'king-fisher', 'falcon-0.5.26-zcp-692-snapshot.umd.js'),
  ]
  for (const relative of vendorFiles) {
    const source = path.join(repositoryRoot, relative)
    ensureFile(source, 'KingFisher runtime dependency')
    copyFile(source, path.join(workbenchRoot, relative))
  }
  return inputs
}

function packagePathParts(name) {
  return name.startsWith('@') ? name.split('/') : [name]
}

function findInstalledPackage(name, fromDirectory) {
  let current = path.resolve(fromDirectory)
  const parts = packagePathParts(name)
  while (true) {
    const candidate = path.join(current, 'node_modules', ...parts)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function collectRuntimePackageRoots() {
  const roots = new Map()
  const queue = runtimePackages.map(name => ({
    name,
    fromDirectory: repositoryRoot,
    optional: false,
  }))
  while (queue.length > 0) {
    const request = queue.shift()
    const packageRoot = findInstalledPackage(request.name, request.fromDirectory)
    if (!packageRoot) {
      if (request.optional) continue
      throw new Error(`required runtime package is not installed: ${request.name}`)
    }
    const realRoot = fs.realpathSync(packageRoot)
    if (roots.has(realRoot)) continue
    const manifest = JSON.parse(fs.readFileSync(path.join(realRoot, 'package.json'), 'utf8'))
    roots.set(realRoot, { name: manifest.name, version: manifest.version })
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      queue.push({ name, fromDirectory: realRoot, optional: false })
    }
    for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
      queue.push({ name, fromDirectory: realRoot, optional: true })
    }
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      const optional = manifest.peerDependenciesMeta?.[name]?.optional === true
      queue.push({ name, fromDirectory: realRoot, optional })
    }
  }
  return roots
}

function copySkillSource(stagingSkillRoot) {
  fs.cpSync(skillSource, stagingSkillRoot, {
    recursive: true,
    filter: source => path.basename(source) !== 'workbench',
  })
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function sourceCommit() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

function writeDependencyManifests(workbenchRoot, projectPackage, packages) {
  const dependencyVersions = Object.fromEntries(
    runtimePackages.map(name => {
      const installed = findInstalledPackage(name, repositoryRoot)
      const manifest = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'))
      return [name, manifest.version]
    }),
  )
  const workbenchPackage = {
    name: 'interactive-guide-offline-workbench',
    private: true,
    type: 'module',
    version: projectPackage.version,
    dependencies: dependencyVersions,
  }
  fs.writeFileSync(
    path.join(workbenchRoot, 'package.json'),
    `${JSON.stringify(workbenchPackage, null, 2)}\n`,
  )

  const installedLockPath = path.join(repositoryRoot, 'node_modules', '.package-lock.json')
  ensureFile(installedLockPath, 'installed dependency lock')
  const installedLock = JSON.parse(fs.readFileSync(installedLockPath, 'utf8'))
  if (installedLock.lockfileVersion !== 3 || !installedLock.packages) {
    throw new Error('installed dependency lock must use npm lockfileVersion 3')
  }
  const runtimePackagePaths = new Set(
    [...packages.keys()].map(packageRoot =>
      path.relative(repositoryRoot, packageRoot).replaceAll('\\', '/'),
    ),
  )
  for (const packagePath of runtimePackagePaths) {
    if (!installedLock.packages[packagePath]) {
      throw new Error(`installed dependency lock is missing ${packagePath}`)
    }
  }
  const lockedPackages = {
    '': {
      name: workbenchPackage.name,
      version: workbenchPackage.version,
      dependencies: dependencyVersions,
    },
  }
  for (const packagePath of Object.keys(installedLock.packages).sort()) {
    const definition = structuredClone(installedLock.packages[packagePath])
    if (runtimePackagePaths.has(packagePath)) {
      delete definition.dev
      delete definition.devOptional
    }
    lockedPackages[packagePath] = definition
  }
  const workbenchLock = {
    name: workbenchPackage.name,
    version: workbenchPackage.version,
    lockfileVersion: 3,
    requires: true,
    packages: lockedPackages,
  }
  fs.writeFileSync(
    path.join(workbenchRoot, 'package-lock.json'),
    `${JSON.stringify(workbenchLock, null, 2)}\n`,
  )
}

function writeWorkbenchManifest(workbenchRoot, compiledFiles, runtimeSources, packages) {
  const projectPackage = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
  )
  writeDependencyManifests(workbenchRoot, projectPackage, packages)
  const criticalRelativePaths = [
    path.join('dist', 'server', 'index.js'),
    path.join('dist', 'admin', 'index.html'),
    'package.json',
    'package-lock.json',
    path.join('src', 'product-shell', 'browser', 'atlas-entry.ts'),
    path.join('src', 'product-shell', 'browser', 'catalog-entry.ts'),
    path.join('src', 'product-shell', 'browser', 'gallery-entry.ts'),
    path.join('vendor', 'king-fisher', 'bridge-0.6.0.umd.js'),
    path.join('vendor', 'king-fisher', 'falcon-0.5.26-zcp-692-snapshot.umd.js'),
  ]
  const manifest = {
    schemaVersion: 2,
    name: 'interactive-guide-offline-workbench',
    workbenchVersion: projectPackage.version,
    sourceCommit: sourceCommit(),
    platform: process.platform,
    arch: process.arch,
    nodeMajor: Number(process.versions.node.split('.')[0]),
    entrypoints: {
      server: 'dist/server/index.js',
      admin: 'dist/admin/index.html',
    },
    supportedProducts: ['atlas', 'catalog', 'gallery'],
    dependencyInstall: {
      packageManager: 'npm',
      command: 'npm ci --omit=dev',
      workingDirectory: 'workbench',
      bundledNodeModules: false,
    },
    closure: {
      compiledFiles: compiledFiles.size,
      browserRuntimeSources: runtimeSources.size,
      resolvedNodePackages: packages.size,
      directRuntimePackages: runtimePackages,
    },
    criticalFiles: Object.fromEntries(
      criticalRelativePaths.map(relative => [
        relative.replaceAll('\\', '/'),
        sha256File(path.join(workbenchRoot, relative)),
      ]),
    ),
  }
  fs.writeFileSync(
    path.join(workbenchRoot, 'workbench-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}

function walkFiles(root) {
  const files = []
  const visit = directory => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) files.push(absolute)
    }
  }
  visit(root)
  return files
}

function createZip(stagingSkillRoot, temporaryZip) {
  const zip = new AdmZip()
  const fixedTime = new Date('2020-01-01T00:00:00.000Z')
  for (const filePath of walkFiles(stagingSkillRoot)) {
    const relative = path.relative(stagingSkillRoot, filePath).replaceAll('\\', '/')
    const zipPath = `${skillName}/${relative}`
    const executable = relative.startsWith('scripts/') && relative.endsWith('.mjs')
    zip.addFile(zipPath, fs.readFileSync(filePath), '', executable ? 0o100755 : 0o100644)
    const entry = zip.getEntry(zipPath)
    if (entry) entry.header.time = fixedTime
  }
  zip.writeZip(temporaryZip)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }
  if (!args.skipBuild) buildWorkbench()
  ensureFile(path.join(skillSource, 'SKILL.md'), 'Skill source')

  const stagingParent = fs.mkdtempSync(path.join(os.tmpdir(), 'interactive-guide-skill-'))
  const stagingSkillRoot = path.join(stagingParent, skillName)
  const outputDir = args.outputDir ?? path.join(repositoryRoot, 'dist', 'packages')
  fs.mkdirSync(outputDir, { recursive: true })
  try {
    copySkillSource(stagingSkillRoot)
    const workbenchRoot = path.join(stagingSkillRoot, 'workbench')
    const compiledFiles = copyCompiledServerClosure(workbenchRoot)
    copyAdminBuild(workbenchRoot)
    const runtimeSources = copyBrowserRuntimeSources(workbenchRoot)
    const packages = collectRuntimePackageRoots()
    const manifest = writeWorkbenchManifest(workbenchRoot, compiledFiles, runtimeSources, packages)

    const temporaryZip = path.join(stagingParent, `${skillName}.zip`)
    createZip(stagingSkillRoot, temporaryZip)
    const hash = sha256File(temporaryZip)
    const filename = `${skillName}-v${manifest.workbenchVersion}-${process.platform}-${process.arch}-${hash.slice(0, 12)}.zip`
    const destination = path.join(outputDir, filename)
    if (fs.existsSync(destination)) {
      if (sha256File(destination) !== hash) throw new Error(`artifact collision: ${destination}`)
    } else {
      fs.copyFileSync(temporaryZip, destination, fs.constants.COPYFILE_EXCL)
    }
    fs.writeFileSync(`${destination}.sha256`, `${hash}  ${filename}\n`)
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        artifact: destination,
        sha256File: `${destination}.sha256`,
        sha256: hash,
        size: fs.statSync(destination).size,
        manifest,
      })}\n`,
    )
  } finally {
    fs.rmSync(stagingParent, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  )
  process.exitCode = 1
}
