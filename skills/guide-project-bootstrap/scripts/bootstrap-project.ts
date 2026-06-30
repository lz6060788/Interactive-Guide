#!/usr/bin/env -S npx tsx
/**
 * Bootstrap a project from a BootstrapInput JSON file.
 *
 * Usage:
 *   tsx bootstrap-project.ts <input.json> [--server http://localhost:8788]
 *
 * Reads the input JSON, calls `assembleProject`, then pushes the project
 * + assets to the running server via HTTP. Emits the BootstrapReport to
 * stdout as JSON.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { assembleProject, type BootstrapInput } from '../../../src/server/bootstrap.js'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    process.stderr.write('usage: bootstrap-project.ts <input.json> [--server URL]\n')
    process.exit(2)
  }
  const inputPath = path.resolve(args[0])
  const serverIdx = args.indexOf('--server')
  const serverUrl = serverIdx >= 0 ? args[serverIdx + 1] : 'http://localhost:8788'

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as BootstrapInput
  const result = assembleProject(raw)

  // Push project
  const createRes = await fetch(`${serverUrl}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: result.project.id, title: result.project.title, locale: result.project.locale }),
  })
  if (!createRes.ok) {
    process.stderr.write(`failed to create project: ${createRes.status} ${await createRes.text()}\n`)
    process.exit(1)
  }
  const created = (await createRes.json()) as { data: { metadata: { revision: number } } }
  let revision = created.data.metadata.revision

  // Push assets
  for (const def of result.assetDefinitions) {
    const bytes = fs.readFileSync(def.sourcePath)
    const kind = def.kind === 'image' ? 'image' : def.kind === 'video' ? 'video' : 'html-bundle'
    const res = await fetch(
      `${serverUrl}/api/projects/${result.project.id}/assets/${kind}?id=${encodeURIComponent(def.id)}&expectedRevision=${revision}`,
      { method: 'POST', headers: { 'content-type': def.mimeType ?? 'application/octet-stream' }, body: bytes },
    )
    if (!res.ok) {
      process.stderr.write(`failed to upload asset ${def.id}: ${res.status} ${await res.text()}\n`)
      process.exit(1)
    }
    const uploaded = (await res.json()) as { data: { id: string } }
    void uploaded
    revision += 1
  }

  process.stdout.write(JSON.stringify(result.report, null, 2) + '\n')
}

main().catch((err: unknown) => {
  process.stderr.write(`bootstrap failed: ${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})