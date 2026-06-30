#!/usr/bin/env -S npx tsx
/**
 * Validate an on-disk project.json against the release tier.
 *
 * Usage:
 *   tsx validate-project.ts <projects-dir> <project-id>
 *
 * Reads `<projects-dir>/<project-id>/project.json` and runs
 * `validateReleaseProject`, printing issues as JSON. Exits 0 on success,
 * 1 on validation failure.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { validateReleaseProject, validateDraftProject } from '../../../src/domain/project-validator.js'
import type { GuideProject } from '../../../src/domain/project-types.js'

async function main(): Promise<void> {
  const [, , projectsDir, projectId, tier] = process.argv
  if (!projectsDir || !projectId) {
    process.stderr.write('usage: validate-project.ts <projects-dir> <project-id> [draft|release]\n')
    process.exit(2)
  }
  const projectPath = path.join(projectsDir, projectId, 'project.json')
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf-8')) as GuideProject
  const result = tier === 'draft' ? validateDraftProject(project) : validateReleaseProject(project)
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  if (!result.ok) process.exit(1)
}

main().catch((err: unknown) => {
  process.stderr.write(`validate failed: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})