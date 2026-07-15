#!/usr/bin/env -S npx tsx
/**
 * Atomically bootstrap a complete GuideProject into the local data directory.
 *
 * Usage:
 *   tsx bootstrap-project.ts <input.json> [--data-dir ./data] [--server http://localhost:8788]
 *
 * Relative asset paths are resolved from the input file. The complete project
 * is assembled, materialized, release-validated and compiled in a staging data
 * directory before one final rename makes it visible to the running service.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { assembleProject, type BootstrapInput } from '../../../src/server/bootstrap.js'
import { normalizeProject } from '../../../src/domain/project-normalizer.js'
import { validateReleaseProject } from '../../../src/domain/project-validator.js'
import { compileAtlas } from '../../../src/products/atlas/compiler/atlas-compiler.js'
import { compileCatalog } from '../../../src/products/catalog/compiler/catalog-compiler.js'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'
import { AssetRepository } from '../../../src/server/storage/asset-repository.js'
import { ProjectService } from '../../../src/server/services/project-service.js'
import { AssetService } from '../../../src/server/services/asset-service.js'

interface CliOptions {
  inputPath: string
  dataDir: string
  serverUrl: string
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  const input = readInput(options.inputPath)
  const result = assembleProject(input)

  if (result.unmappedKnowledge.length > 0) {
    throw new Error(
      `bootstrap has ${result.unmappedKnowledge.length} unmapped knowledge entries: ` +
        result.unmappedKnowledge.map(entry => `${entry.path}: ${entry.reason}`).join('; '),
    )
  }
  if (result.calibrationQueue.length > 0) {
    throw new Error(
      `bootstrap has ${result.calibrationQueue.length} uncalibrated spatial entries: ` +
        result.calibrationQueue.map(entry => `${entry.kind}.${entry.id}`).join(', '),
    )
  }

  fs.mkdirSync(options.dataDir, { recursive: true })
  const finalProjectsRoot = path.join(options.dataDir, 'projects')
  const finalProjectDir = path.join(finalProjectsRoot, result.project.id)
  if (fs.existsSync(finalProjectDir)) {
    throw new Error(`project "${result.project.id}" already exists at ${finalProjectDir}`)
  }

  const stageDataDir = fs.mkdtempSync(path.join(options.dataDir, '.bootstrap-'))
  try {
    const staged = materializeProject(input, result.project, stageDataDir)
    const validation = validateReleaseProject(staged)
    if (!validation.ok) {
      throw new Error(
        `release validation failed: ${validation.issues
          .map(issue => `${issue.path}: ${issue.message}`)
          .join('; ')}`,
      )
    }

    const assetClosure = (_projectId: string, sourcePath: string) =>
      `./assets/${sourcePath.replace(/^\/+/, '')}`
    const atlas = compileAtlas(staged, assetClosure)
    const catalog = compileCatalog(staged, assetClosure)

    const stagedProjectDir = path.join(stageDataDir, 'projects', staged.id)
    fs.mkdirSync(finalProjectsRoot, { recursive: true })
    fs.renameSync(stagedProjectDir, finalProjectDir)

    await warmRunningServer(options.serverUrl, staged.id)

    process.stdout.write(
      JSON.stringify(
        {
          ...result.report,
          ok: true,
          calibrationRequired: 0,
          projectDir: finalProjectDir,
          compiled: {
            atlas: {
              categories: atlas.manifest.categories.length,
              items: atlas.manifest.items.length,
              assets: atlas.assets.length,
            },
            catalog: {
              stages: catalog.manifest.stages.length,
              categories: catalog.manifest.stages.reduce(
                (count, stage) => count + stage.categories.length,
                0,
              ),
              items: catalog.manifest.items.length,
              assets: catalog.assets.length,
            },
          },
        },
        null,
        2,
      ) + '\n',
    )
  } finally {
    fs.rmSync(stageDataDir, { recursive: true, force: true })
  }
}

function materializeProject(
  input: BootstrapInput,
  assembled: ReturnType<typeof assembleProject>['project'],
  dataDir: string,
) {
  const projects = new ProjectRepository({ dataDir })
  const projectService = new ProjectService(projects)
  const assetService = new AssetService(projects, new AssetRepository(projects, { dataDir }))
  let draft = projectService.create({
    id: assembled.id,
    title: assembled.title,
    locale: assembled.locale,
  })

  if (input.panoramaImagePath) {
    const filePath = input.panoramaImagePath
    assetService.registerImage(
      assembled.id,
      {
        id: 'asset-panorama',
        bytes: fs.readFileSync(filePath),
        mimeType: imageMime(filePath),
        extension: path.extname(filePath) || '.jpg',
      },
      { expectedRevision: draft.metadata.revision },
    )
    draft = projects.get(assembled.id)
  }

  for (const bundle of input.htmlSceneBundles ?? []) {
    assetService.registerHtmlBundle(
      assembled.id,
      { id: `asset-${bundle.id}`, bytes: fs.readFileSync(bundle.path) },
      { expectedRevision: draft.metadata.revision },
    )
    draft = projects.get(assembled.id)
  }

  for (const [index, video] of (input.transitionVideos ?? []).entries()) {
    assetService.registerVideo(
      assembled.id,
      {
        id: `asset-video-${index}`,
        bytes: fs.readFileSync(video.path),
        mimeType: videoMime(video.path),
        extension: path.extname(video.path) || '.mp4',
      },
      { expectedRevision: draft.metadata.revision },
    )
    draft = projects.get(assembled.id)
  }

  const normalized = normalizeProject({
    ...assembled,
    assets: draft.assets,
    metadata: draft.metadata,
  })
  const saved = projects.save(normalized, { expectedRevision: draft.metadata.revision })
  if (saved.conflict) {
    throw new Error(`staging revision conflict: current revision is ${saved.currentRevision}`)
  }
  return saved.project
}

function readInput(inputPath: string): BootstrapInput {
  const absoluteInputPath = path.resolve(inputPath)
  const inputDir = path.dirname(absoluteInputPath)
  const input = JSON.parse(fs.readFileSync(absoluteInputPath, 'utf-8')) as BootstrapInput
  const resolveSource = (sourcePath: string) =>
    path.isAbsolute(sourcePath) ? sourcePath : path.resolve(inputDir, sourcePath)

  return {
    ...input,
    ...(input.panoramaImagePath
      ? { panoramaImagePath: resolveSource(input.panoramaImagePath) }
      : {}),
    ...(input.htmlSceneBundles
      ? {
          htmlSceneBundles: input.htmlSceneBundles.map(bundle => ({
            ...bundle,
            path: resolveSource(bundle.path),
          })),
        }
      : {}),
    ...(input.transitionVideos
      ? {
          transitionVideos: input.transitionVideos.map(video => ({
            ...video,
            path: resolveSource(video.path),
          })),
        }
      : {}),
  }
}

function parseOptions(args: string[]): CliOptions {
  if (args.length === 0) {
    process.stderr.write(
      'usage: bootstrap-project.ts <input.json> [--data-dir ./data] [--server URL]\n',
    )
    process.exit(2)
  }
  const optionValue = (name: string, fallback: string) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : fallback
  }
  return {
    inputPath: path.resolve(args[0]),
    dataDir: path.resolve(optionValue('--data-dir', process.env.DATA_DIR || 'data')),
    serverUrl: optionValue('--server', 'http://localhost:8788'),
  }
}

function imageMime(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.jpeg' || extension === '.jpg') return 'image/jpeg'
  throw new Error(`unsupported panorama image extension: ${extension || '(none)'}`)
}

function videoMime(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.webm') return 'video/webm'
  if (extension === '.mov') return 'video/quicktime'
  if (extension === '.mp4') return 'video/mp4'
  throw new Error(`unsupported transition video extension: ${extension || '(none)'}`)
}

async function warmRunningServer(serverUrl: string, projectId: string): Promise<void> {
  try {
    const response = await fetch(`${serverUrl}/api/projects/${encodeURIComponent(projectId)}`)
    if (!response.ok) {
      process.stderr.write(
        `warning: project created, but running server returned ${response.status} while warming cache\n`,
      )
    }
  } catch (error) {
    process.stderr.write(
      `warning: project created, but running server cache was not warmed: ${(error as Error).message}\n`,
    )
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`bootstrap failed: ${(error as Error).stack ?? String(error)}\n`)
  process.exit(1)
})
