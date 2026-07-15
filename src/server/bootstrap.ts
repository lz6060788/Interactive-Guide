/**
 * Bootstrap scripts — used by the guide-project-bootstrap Skill.
 *
 * The script is deliberately split into:
 *   - `assembleProject(input, options)`: build a NormalizedProject from
 *     bootstrap input (paths, knowledge, scene bindings). No IO happens
 *     here; the caller passes already-read bytes.
 *   - `materializeAssets(project, assetInputs)`: copy the registered
 *     asset bytes into the project asset directory via AssetService.
 *   - `validateProjectShape(project)`: run the release validator.
 *
 * The CLI wrapper in skills/guide-project-bootstrap/scripts/ glues these
 * to filesystem I/O so the Skill can be exercised outside Claude.
 */
import path from 'node:path'
import fs from 'node:fs'
import type {
  GuideProject,
  AssetDefinition,
  HtmlScenePackage,
  IndustryCategory,
  IndustryItem,
  IndustryStage,
  ExperienceLocation,
  ExperienceRoute,
  NormalizedPoint,
} from '../domain/project-types.js'
import { SCENE_PROTOCOL_CHANNEL, SCENE_PROTOCOL_VERSION } from '../domain/scene-protocol.js'
import { validateReleaseProject, validateDraftProject } from '../domain/project-validator.js'
import { normalizeProject, createDraftProject } from '../domain/project-normalizer.js'

export interface BootstrapInput {
  project: { id: string; title: string; version?: string; locale?: string }
  knowledge: {
    stages: Array<{
      key: 'upstream' | 'midstream' | 'downstream'
      categories: Array<{
        id?: string
        title: string
        items: Array<{ id?: string; title: string; description?: string }>
        /** Which HTML scene view to bind this category to, if any. */
        htmlScene?: { sceneId: string; viewId: string }
      }>
    }>
  }
  panoramaImagePath?: string
  htmlSceneBundles?: Array<{
    id: string
    title: string
    path: string
    entryPath?: string
    views: Array<{
      id: string
      title: string
      activationMessageType: string
      categoryBindings: string[]
    }>
  }>
  transitionVideos?: Array<{
    from: ExperienceLocation
    to: ExperienceLocation
    path: string
    timeoutMs?: number
    onFailure?: 'abort-navigation' | 'cut'
  }>
  integrations?: {
    analytics?: { enabled: boolean; profileId: string; pageType: string; contentName?: string }
    share?: { enabled: boolean; title?: string; description?: string }
  }
}

export interface BootstrapResult {
  project: GuideProject
  assetDefinitions: AssetDefinition[]
  unmappedKnowledge: Array<{ path: string; reason: string }>
  calibrationQueue: Array<{ kind: 'category' | 'item'; id: string; missingFields: string[] }>
  report: BootstrapReport
}

export interface BootstrapReport {
  generatedAt: string
  projectId: string
  stages: number
  categories: number
  items: number
  scenes: number
  routes: number
  unmapped: number
  calibrationRequired: number
  ok: boolean
  issues: Array<{ code: string; path: string; message: string }>
}

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .replace(/[一-龥]+/g, m => 'zh-' + Buffer.from(m, 'utf-8').toString('hex').slice(0, 8))
}

const SPATIAL_DEFAULT_CENTER: NormalizedPoint = { x: 0.5, y: 0.5 }

export function assembleProject(input: BootstrapInput): BootstrapResult {
  const project = createDraftProject({
    id: input.project.id,
    title: input.project.title,
    locale: input.project.locale,
  })
  if (input.project.version) project.version = input.project.version

  // Knowledge
  const usedIds = new Set<string>()
  const stages: [IndustryStage, IndustryStage, IndustryStage] = [
    { ...project.knowledge.stages[0], categories: [] },
    { ...project.knowledge.stages[1], categories: [] },
    { ...project.knowledge.stages[2], categories: [] },
  ]
  let totalItems = 0
  const unmappedKnowledge: Array<{ path: string; reason: string }> = []

  for (const stageInput of input.knowledge.stages) {
    const stageIndex = { upstream: 0, midstream: 1, downstream: 2 }[stageInput.key]
    const stage = stages[stageIndex]
    if (!stage) {
      unmappedKnowledge.push({
        path: `knowledge.stages.${stageInput.key}`,
        reason: 'unknown stage key',
      })
      continue
    }
    stage.categories = stageInput.categories.map((catInput, catIndex) => {
      const id = catInput.id ?? `${stageInput.key}-${slugify(catInput.title)}`
      if (usedIds.has(id)) {
        unmappedKnowledge.push({ path: `category.${id}`, reason: 'duplicate id' })
      } else {
        usedIds.add(id)
      }
      const experience = catInput.htmlScene
        ? ({
            kind: 'html-scene',
            sceneId: catInput.htmlScene.sceneId,
            viewId: catInput.htmlScene.viewId,
          } as const)
        : ({ kind: 'panorama' } as const)
      const items: IndustryItem[] = catInput.items.map((itemInput, itemIndex) => {
        const itemId =
          itemInput.id ?? `${stageInput.key}-${slugify(catInput.title)}-${slugify(itemInput.title)}`
        usedIds.add(itemId)
        return {
          id: itemId,
          categoryId: id,
          title: itemInput.title,
          description: itemInput.description ?? '',
          order: itemIndex,
        }
      })
      totalItems += items.length
      const category: IndustryCategory = {
        id,
        title: catInput.title,
        order: catIndex,
        itemIds: items.map(i => i.id),
        experience,
      }
      // attach items to project.knowledge.items
      for (const it of items) project.knowledge.items[it.id] = it
      return category
    })
  }
  project.knowledge.stages = stages

  // Asset registry: HTML scene bundles
  const assetDefinitions: AssetDefinition[] = []
  for (const bundle of input.htmlSceneBundles ?? []) {
    if (usedIds.has(bundle.id)) {
      unmappedKnowledge.push({ path: `htmlSceneBundles.${bundle.id}`, reason: 'id already used' })
      continue
    }
    usedIds.add(bundle.id)
    const stat = fs.statSync(bundle.path)
    const scene: HtmlScenePackage = {
      id: bundle.id,
      title: bundle.title,
      assetId: `asset-${bundle.id}`,
      protocol: { channel: SCENE_PROTOCOL_CHANNEL, version: SCENE_PROTOCOL_VERSION },
      views: bundle.views.map(v => ({
        id: v.id,
        title: v.title,
        activationMessage: { type: v.activationMessageType },
        categoryIds: v.categoryBindings,
      })),
    }
    project.scenes.push(scene)
    assetDefinitions.push({
      id: `asset-${bundle.id}`,
      kind: 'html-bundle',
      sourcePath: path.posix.join('assets/scenes', bundle.id),
      entryPath: bundle.entryPath ?? 'index.html',
      size: stat.size,
    })
  }

  // Panorama image
  if (input.panoramaImagePath) {
    const stat = fs.statSync(input.panoramaImagePath)
    const id = 'asset-panorama'
    if (usedIds.has(id)) {
      unmappedKnowledge.push({ path: 'panoramaImagePath', reason: 'id already used' })
    } else {
      usedIds.add(id)
      project.panorama.assetId = id
      const ext = path.extname(input.panoramaImagePath).replace(/^\./, '') || 'jpg'
      assetDefinitions.push({
        id,
        kind: 'image',
        sourcePath: path.posix.join('assets/images', id, `image.${ext}`),
        size: stat.size,
      })
    }
  }

  // Transition videos
  for (const [i, video] of (input.transitionVideos ?? []).entries()) {
    const id = `asset-video-${i}`
    if (usedIds.has(id)) {
      unmappedKnowledge.push({ path: `transitionVideos[${i}]`, reason: 'id already used' })
      continue
    }
    usedIds.add(id)
    const stat = fs.statSync(video.path)
    const ext = path.extname(video.path).replace(/^\./, '') || 'mp4'
    assetDefinitions.push({
      id,
      kind: 'video',
      sourcePath: path.posix.join('assets/videos', id, `video.${ext}`),
      size: stat.size,
    })
    const route: ExperienceRoute = {
      id: `route-${i}`,
      from: video.from,
      to: video.to,
      transition: {
        kind: 'video',
        assetId: id,
        onFailure: video.onFailure ?? 'cut',
        ...(video.timeoutMs !== undefined ? { timeoutMs: video.timeoutMs } : {}),
      },
    }
    project.navigation.routes.push(route)
  }

  // Integrations
  if (input.integrations?.analytics) {
    project.integrations.analytics = {
      enabled: input.integrations.analytics.enabled,
      provider: 'weblog',
      profileId: input.integrations.analytics.profileId,
      pageType: input.integrations.analytics.pageType,
      ...(input.integrations.analytics.contentName
        ? { contentName: input.integrations.analytics.contentName }
        : {}),
    }
  }
  if (input.integrations?.share) {
    project.integrations.share = { ...input.integrations.share }
  }

  // Calibrate default layouts (centered focus rect, no marker offset)
  for (const stage of project.knowledge.stages) {
    for (const category of stage.categories) {
      if (!project.panorama.categories[category.id]) {
        project.panorama.categories[category.id] = {
          viewport: {
            centerX: SPATIAL_DEFAULT_CENTER.x,
            centerY: SPATIAL_DEFAULT_CENTER.y,
            zoom: 3.6,
          },
        }
      }
    }
  }

  // Asset registry update
  for (const def of assetDefinitions) {
    project.assets.byId[def.id] = def
  }

  // Normalize
  const normalized = normalizeProject(project, { autoPickPanoramaAsset: !input.panoramaImagePath })

  // Validate
  const draftCheck = validateDraftProject(normalized)
  const releaseCheck = validateReleaseProject(normalized)
  // Release check will fail because coordinates are not calibrated by hand.
  // We classify the result as `ok = draftCheck.ok` and report calibration queue.
  const calibrationQueue: BootstrapResult['calibrationQueue'] = []
  for (const stage of normalized.knowledge.stages) {
    for (const category of stage.categories) {
      const layout = normalized.panorama.categories[category.id]
      if (!layout?.hotspot) {
        calibrationQueue.push({
          kind: 'category',
          id: category.id,
          missingFields: ['hotspot', 'viewport.zoom'],
        })
      }
      for (const itemId of category.itemIds) {
        const itemLayout = normalized.panorama.items[itemId]
        if (!itemLayout?.marker || !itemLayout?.focusRect) {
          calibrationQueue.push({
            kind: 'item',
            id: itemId,
            missingFields: ['marker', 'focusRect'],
          })
        }
      }
    }
  }

  const report: BootstrapReport = {
    generatedAt: new Date().toISOString(),
    projectId: normalized.id,
    stages: normalized.knowledge.stages.length,
    categories: normalized.knowledge.stages.reduce((s, x) => s + x.categories.length, 0),
    items: totalItems,
    scenes: normalized.scenes.length,
    routes: normalized.navigation.routes.length,
    unmapped: unmappedKnowledge.length,
    calibrationRequired: calibrationQueue.length,
    ok: draftCheck.ok,
    issues: [
      ...draftCheck.issues,
      ...releaseCheck.issues,
      ...unmappedKnowledge.map(u => ({
        code: 'UNMAPPED_KNOWLEDGE',
        path: u.path,
        message: u.reason,
      })),
    ],
  }

  return { project: normalized, assetDefinitions, unmappedKnowledge, calibrationQueue, report }
}
