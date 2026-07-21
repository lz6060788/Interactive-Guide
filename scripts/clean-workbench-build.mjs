#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WORKBENCH_CLEAN_DIRECTORIES } from './workbench-build-layout.mjs'

export function cleanWorkbenchBuild(repoRoot = defaultRepoRoot()) {
  const root = path.resolve(repoRoot)
  const distRoot = path.join(root, 'dist')
  if (!fs.existsSync(distRoot)) return

  assertDirectoryIsNotLink(distRoot, 'dist')
  const physicalRoot = fs.realpathSync.native(root)
  const physicalDistRoot = fs.realpathSync.native(distRoot)
  if (!isSameOrInside(physicalRoot, physicalDistRoot)) {
    throw new Error(`refusing to clean dist outside repository: ${physicalDistRoot}`)
  }

  for (const relative of WORKBENCH_CLEAN_DIRECTORIES) {
    const target = path.resolve(root, ...relative.split('/'))
    if (!target.startsWith(`${distRoot}${path.sep}`)) {
      throw new Error(`refusing to clean outside dist: ${relative}`)
    }
    if (!fs.existsSync(target)) continue
    assertDirectoryIsNotLink(target, relative)
    const physicalTarget = fs.realpathSync.native(target)
    if (!isSameOrInside(physicalDistRoot, physicalTarget)) {
      throw new Error(`refusing to clean build directory outside dist: ${physicalTarget}`)
    }
    assertTreeHasNoLinks(target, relative)
    fs.rmSync(target, { recursive: true, force: true })
  }
}

function assertDirectoryIsNotLink(target, label) {
  const stat = fs.lstatSync(target)
  if (stat.isSymbolicLink()) throw new Error(`refusing to clean linked build directory: ${label}`)
  if (!stat.isDirectory()) throw new Error(`expected build directory: ${label}`)
}

function assertTreeHasNoLinks(current, label) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const child = path.join(current, entry.name)
    const childLabel = `${label}/${entry.name}`
    const stat = fs.lstatSync(child)
    if (stat.isSymbolicLink()) {
      throw new Error(`refusing to clean linked build entry: ${childLabel}`)
    }
    if (stat.isDirectory()) assertTreeHasNoLinks(child, childLabel)
  }
}

function isSameOrInside(root, candidate) {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  return (
    resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  )
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
    cleanWorkbenchBuild()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
