// ============================================================
// Interactive Guide - Build Pipeline
// ============================================================
// Orchestrates the six-stage build pipeline: validate → prepare → gen_nodes → gen_hotspots → gen_edges → publish.
// Also handles node/edge/hotspot regeneration.
// Extracted from generate-service.ts for better cohesion.

import type { Repository } from '../storage/repository.js'
import type {
  KnowledgePackage,
  KnowledgeNode,
  PackageBuildRecord,
  NodeBuildRecord,
  EdgeBuildRecord,
  PublishManifest,
} from '../../shared/types.js'
import { validateKnowledgePackage, validatePublishManifest } from '../../shared/validators.js'
import { generateGenerateId, nowISO, getResolutionDimensions } from '../../shared/utils.js'
import { AppError } from '../middleware/app-error.js'
import { PromptBuilder } from './prompt-builder.js'
import { RuntimeBundleGenerator } from './runtime-bundle.js'
import {
  type ManifestBuilderContext,
  buildManifest,
  syncAssetsToWorkspace,
} from './manifest-builder.js'
import {
  type RegeneratorDeps,
  regenerateHotspots as regenerateHotspotsFn,
  runRegenerateNode as runRegenerateNodeFn,
  runRegenerateEdge as runRegenerateEdgeFn,
} from './regenerator.js'

import type * as vision from '../ai/vision.js'
import type * as image from '../ai/image.js'
import type * as video from '../ai/video.js'
import type * as media from '../ai/media.js'

const GENERATES_DIR = 'generates'

// ─── BuildPipeline ─────────────────────────────────────────────

export class BuildPipeline {
  private logs: Map<string, string[]> = new Map()

  constructor(
    private repo: Repository,
    private visionModule: typeof vision,
    private imageModule: typeof image,
    private videoModule: typeof video,
    private mediaModule: typeof media,
    private promptBuilder: PromptBuilder,
    private bundleGenerator: RuntimeBundleGenerator,
  ) {}

  private get manifestCtx(): ManifestBuilderContext {
    return { repo: this.repo, promptBuilder: this.promptBuilder }
  }

  private get regeneratorDeps(): RegeneratorDeps {
    return {
      repo: this.repo,
      visionModule: this.visionModule,
      imageModule: this.imageModule,
      videoModule: this.videoModule,
      mediaModule: this.mediaModule,
      promptBuilder: this.promptBuilder,
      manifestCtx: this.manifestCtx,
      log: (generateId: string, message: string) => this.appendLog(generateId, message),
    }
  }

  // ─── Public API ─────────────────────────────────────────────

  startGenerate(guideId: string): PackageBuildRecord {
    this.repo.refresh()
    const guides = this.repo.loadAllGuides()
    const guide = guides.get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)

    const generateId = generateGenerateId()
    const now = nowISO()

    const record: PackageBuildRecord = {
      buildId: generateId,
      packageId: guideId,
      packageVersion: guide.version,
      status: 'pending',
      currentStage: 'validate',
      createdAt: now,
      updatedAt: now,
      summary: {
        nodeTotal: guide.nodes.length,
        nodeSuccess: 0,
        hotspotTotal: guide.nodes.reduce((sum, n) => sum + (n.hotspots?.length ?? 0), 0),
        hotspotReady: 0,
        edgeTotal: guide.edges.length,
        edgeSuccess: 0,
      },
    }

    this.repo.saveGenerateRecord(record)
    this.logs.set(generateId, [])
    this.appendLog(generateId, `[Generate] Started for guide "${guideId}"`)

    this.runGenerate(generateId, guide).catch(err => {
      this.appendLog(generateId, `[Generate] Unhandled fatal error: ${err.message}`)
      console.error(`[Generate] ${generateId} unhandled fatal error:`, err)
      const record = this.repo.loadGenerateRecord(generateId)
      if (record && record.status !== 'failed') {
        record.status = 'failed'
        record.finishedAt = nowISO()
        record.updatedAt = nowISO()
        this.repo.saveGenerateRecord(record)
      }
    })

    return record
  }

  cancelGenerate(generateId: string): void {
    const record = this.repo.loadGenerateRecord(generateId)
    if (!record) throw AppError.notFound(`Generate "${generateId}" not found`)
    if (record.status === 'success' || record.status === 'failed' || record.status === 'partial_failed') {
      throw AppError.validation('Cannot cancel a completed generate')
    }
    record.status = 'failed'
    record.finishedAt = nowISO()
    record.updatedAt = nowISO()
    this.repo.saveGenerateRecord(record)
    this.appendLog(generateId, `[Generate] Cancelled by user`)
  }

  getRecord(generateId: string): PackageBuildRecord {
    const record = this.repo.loadGenerateRecord(generateId)
    if (!record) throw AppError.notFound(`Generate "${generateId}" not found`)
    return record
  }

  listGenerates(): PackageBuildRecord[] {
    return Array.from(this.repo.loadAllGenerates().values())
  }

  getLogs(generateId: string): string[] {
    const record = this.repo.loadGenerateRecord(generateId)
    if (!record) throw AppError.notFound(`Generate "${generateId}" not found`)
    const memLogs = this.logs.get(generateId)
    if (memLogs) return memLogs
    return this.repo.readJson<string[]>(
      `${GENERATES_DIR}/${generateId}/logs.json`,
    ) ?? []
  }

  async packageGuide(guideId: string) {
    return this.bundleGenerator.buildRuntimeBundle(guideId)
  }

  regenerateNode(guideId: string, nodeId: string): void {
    this.repo.refresh()
    const guides = this.repo.loadAllGuides()
    const guide = guides.get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)

    const node = guide.nodes.find(n => n.id === nodeId)
    if (!node) throw AppError.notFound(`Node "${nodeId}" not found in guide "${guideId}"`)

    const generates = this.repo.loadAllGenerates()
    const guideGenerates = Array.from(generates.values())
      .filter(g => g.packageId === guideId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const latest = guideGenerates[0]
    if (!latest) throw AppError.validation('No existing build found — run a full build first')

    const generateId = latest.buildId

    this.appendLog(generateId, `[Regen] Regenerating node "${nodeId}"...`)

    runRegenerateNodeFn(generateId, guide, node, this.regeneratorDeps).catch(err => {
      this.appendLog(generateId, `[Regen] Node "${nodeId}" unhandled error: ${err.message}`)
      console.error(`[Regen] Node "${nodeId}" unhandled error:`, err)
    })
  }

  regenerateEdge(guideId: string, edgeId: string): { buildId: string; edgeId: string } {
    this.repo.refresh()
    const guides = this.repo.loadAllGuides()
    const guide = guides.get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)

    const edge = guide.edges.find(e => e.id === edgeId)
    if (!edge) throw AppError.notFound(`Edge "${edgeId}" not found in guide "${guideId}"`)

    const fromNode = guide.nodes.find(n => n.id === edge.fromNodeId)
    const toNode = guide.nodes.find(n => n.id === edge.toNodeId)
    if (!fromNode || !toNode) {
      throw AppError.validation(`Edge "${edgeId}" references missing node(s)`)
    }

    const generates = this.repo.loadAllGenerates()
    const guideGenerates = Array.from(generates.values())
      .filter(g => g.packageId === guideId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const latest = guideGenerates[0]
    if (!latest) throw AppError.validation('No existing build found — run a full build first')

    const generateId = latest.buildId

    this.appendLog(generateId, `[Regen] Regenerating edge "${edgeId}"...`)

    runRegenerateEdgeFn(generateId, guide, edge, fromNode, toNode, this.regeneratorDeps).catch(err => {
      this.appendLog(generateId, `[Regen] Edge "${edgeId}" unhandled error: ${err.message}`)
      console.error(`[Regen] Edge "${edgeId}" unhandled error:`, err)
    })

    return { buildId: generateId, edgeId }
  }

  async regenerateHotspots(guideId: string, nodeId: string) {
    return regenerateHotspotsFn(guideId, nodeId, this.regeneratorDeps)
  }

  // ─── Pipeline ─────────────────────────────────────────────

  private async runGenerate(generateId: string, guide: KnowledgePackage) {
    const record = this.repo.loadGenerateRecord(generateId)
    if (!record) return

    record.status = 'running'
    record.startedAt = nowISO()
    record.updatedAt = nowISO()
    this.repo.saveGenerateRecord(record)

    try {
      record.currentStage = 'validate'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] validate')
      const validation = validateKnowledgePackage(guide)
      this.repo.writeJson(
        `${GENERATES_DIR}/${generateId}/validation-report.json`,
        validation,
      )
      if (!validation.valid) {
        record.status = 'failed'
        record.finishedAt = nowISO()
        this.repo.saveGenerateRecord(record)
        this.appendLog(generateId, `[Validate] FAILED: ${validation.errors.join('; ')}`)
        return
      }
      this.appendLog(generateId, '[Validate] OK')

      record.currentStage = 'prepare'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] prepare')
      this.prepareGenerate(generateId, guide)

      record.currentStage = 'gen_nodes'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] gen_nodes')
      await this.generateNodes(generateId, guide, record)

      record.currentStage = 'gen_hotspots'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] gen_hotspots')
      await this.generateHotspots(generateId, guide, record)

      record.currentStage = 'gen_edges'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] gen_edges')
      await this.generateEdges(generateId, guide, record)

      record.currentStage = 'publish'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] publish')
      this.publishFromGenerate(generateId, guide)

      const manifestValidation = validatePublishManifest(
        this.repo.readJson<PublishManifest>(
          `publish/${guide.id}/${guide.version}/manifest.json`,
        )!,
      )
      if (!manifestValidation.valid) {
        this.appendLog(generateId, `[Manifest] Validation warnings: ${manifestValidation.errors.join('; ')}`)
      }

      record.currentStage = 'done'
      record.status =
        record.summary.nodeSuccess === record.summary.nodeTotal &&
        record.summary.edgeSuccess === record.summary.edgeTotal
          ? 'success'
          : 'partial_failed'
      record.finishedAt = nowISO()
      record.updatedAt = nowISO()
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, `[Generate] Completed: ${record.status}`)

      console.log(`[Generate] ${generateId} completed: ${record.status}`)
    } catch (e: any) {
      record.status = 'failed'
      record.finishedAt = nowISO()
      record.updatedAt = nowISO()
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, `[Generate] FAILED: ${e.message}`)
      console.error(`[Generate] ${generateId} failed:`, e.message)
    }
  }

  private prepareGenerate(generateId: string, guide: KnowledgePackage) {
    this.repo.writeJson(`${GENERATES_DIR}/${generateId}/input/guide.snapshot.json`, guide)
  }

  private async generateNodes(
    generateId: string,
    guide: KnowledgePackage,
    record: PackageBuildRecord,
  ) {
    const childMap = new Map<string, string[]>()
    for (const edge of guide.edges) {
      if (!childMap.has(edge.fromNodeId)) childMap.set(edge.fromNodeId, [])
      childMap.get(edge.fromNodeId)!.push(edge.toNodeId)
    }

    const queue: string[] = ['root']
    const orderedNodes: KnowledgeNode[] = []
    const visited = new Set<string>()
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const node = guide.nodes.find(n => n.id === id)
      if (node) orderedNodes.push(node)
      for (const childId of childMap.get(id) ?? []) {
        if (!visited.has(childId)) queue.push(childId)
      }
    }

    for (const node of orderedNodes) {
      const nodeRecord: NodeBuildRecord = {
        buildId: generateId,
        nodeId: node.id,
        status: 'running',
        plannerStatus: 'success',
        imageStatus: 'pending',
        updatedAt: nowISO(),
      }

      try {
        const nodeKind = node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')

        // HTML nodes: skip AI image generation, copy HTML file
        if (nodeKind === 'html') {
          const htmlSource = node.htmlSource!
          const guideDir = `guides/${guide.id}/current`
          const srcPath = `${guideDir}/${htmlSource}`

          if (!this.repo.fileExists(srcPath)) {
            throw new Error(`HTML source file not found: ${srcPath}`)
          }

          const destPath = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/content.html`
          this.repo.copyFile(srcPath, destPath)

          nodeRecord.imageStatus = 'success'
          nodeRecord.status = 'success'
          record.summary.nodeSuccess++

          this.appendLog(generateId, `[Node] "${node.id}" HTML file copied from ${htmlSource}`)
        } else if (nodeKind === 'surface') {
          nodeRecord.imageStatus = 'success'
          nodeRecord.status = 'success'
          record.summary.nodeSuccess++
          this.appendLog(generateId, `[Node] "${node.id}" surface node reuses configured source image`)
        } else {
          // Check for pre-existing image asset in guide directory
          const guideAssetPath = `guides/${guide.id}/current/assets/nodes/${node.id}.png`
          if (this.repo.fileExists(guideAssetPath)) {
            const buildImagePath = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
            this.repo.copyFile(guideAssetPath, buildImagePath)

            nodeRecord.imageStatus = 'success'
            nodeRecord.imagePath = buildImagePath
            nodeRecord.status = 'success'
            record.summary.nodeSuccess++

            this.appendLog(generateId, `[Node] "${node.id}" using pre-existing asset`)
          } else {
            const imagePrompt = this.promptBuilder.buildImagePrompt(node, guide)

            this.repo.writeJson(
              `${GENERATES_DIR}/${generateId}/nodes/${node.id}/planner.json`,
              {
                nodeId: node.id,
                title: node.title,
                style: guide.style ?? 'morandi-journal',
                imagePrompt,
                summary: this.promptBuilder.getNodeSummary(node),
                status: 'success',
              },
            )

            nodeRecord.imageStatus = 'running'
            this.appendLog(generateId, `[Node] Generating image for "${node.id}"...`)
            const imageResult = await this.imageModule.generateNodeImage(
              node.id,
              imagePrompt,
              getResolutionDimensions(guide.resolution).width,
              getResolutionDimensions(guide.resolution).height,
            )

            const buildImagePath = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
            this.repo.copyFile(imageResult.localPath, buildImagePath)

            nodeRecord.imageStatus = 'success'
            nodeRecord.imagePath = buildImagePath
            nodeRecord.modelInputUrl = imageResult.modelInputUrl
            nodeRecord.status = 'success'
            record.summary.nodeSuccess++

            this.appendLog(generateId, `[Node] "${node.id}" done (cached: ${imageResult.fromCache})`)
          }
        }
      } catch (e: any) {
        nodeRecord.status = 'failed'
        nodeRecord.errorMessage = e.message
        this.appendLog(generateId, `[Node] "${node.id}" FAILED: ${e.message}`)
        console.error(`[Generate] Node "${node.id}" failed:`, e.message)
      }

      nodeRecord.updatedAt = nowISO()
      this.repo.saveNodeRecord(generateId, node.id, nodeRecord)
    }

    this.repo.saveGenerateRecord(record)
  }

  private async generateHotspots(
    generateId: string,
    guide: KnowledgePackage,
    record: PackageBuildRecord,
  ) {
    for (const node of guide.nodes) {
      const nodeKind = node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')
      // HTML nodes: skip visual hotspot recommendation, use hotspotEdgeIds for validation only
      if (nodeKind === 'html') {
        if (node.hotspotEdgeIds && node.hotspotEdgeIds.length > 0) {
          this.appendLog(generateId, `[Hotspot] Node "${node.id}": HTML node, ${node.hotspotEdgeIds.length} declared edge ids (no visual hotspots)`)
        }
        continue
      }

      if (nodeKind === 'surface') {
        const manualHotspots = (node.hotspots ?? []).map(hs => ({
          edgeId: hs.edgeId,
          targetNodeId: hs.targetNodeId,
          label: hs.label,
          normalizedX: hs.normalizedX,
          normalizedY: hs.normalizedY,
          radius: hs.radius ?? 12,
          source: 'manual' as const,
        }))
        record.summary.hotspotReady += manualHotspots.length
        this.repo.writeJson(
          `${GENERATES_DIR}/${generateId}/nodes/${node.id}/hotspots.final.json`,
          manualHotspots,
        )
        this.repo.writeJson(
          `${GENERATES_DIR}/${generateId}/hotspots/${node.id}/final.json`,
          manualHotspots,
        )
        this.appendLog(generateId, `[Hotspot] Node "${node.id}": surface node, ${manualHotspots.length} hotspots (manual)`)
        continue
      }

      // Nodes without keyContent (pre-existing assets): skip vision, use manual hotspots directly
      if (!node.keyContent) {
        if (node.hotspots && node.hotspots.length > 0) {
          const manualHotspots = node.hotspots.map(hs => ({
            edgeId: hs.edgeId,
            targetNodeId: hs.targetNodeId,
            label: hs.label,
            normalizedX: hs.normalizedX,
            normalizedY: hs.normalizedY,
            radius: hs.radius ?? 12,
            source: 'manual' as 'manual' | 'vision',
          }))
          record.summary.hotspotReady += manualHotspots.length
          this.repo.writeJson(
            `${GENERATES_DIR}/${generateId}/nodes/${node.id}/hotspots.recommended.json`,
            manualHotspots,
          )
          this.repo.writeJson(
            `${GENERATES_DIR}/${generateId}/nodes/${node.id}/hotspots.final.json`,
            manualHotspots,
          )
          this.repo.writeJson(
            `${GENERATES_DIR}/${generateId}/hotspots/${node.id}/final.json`,
            manualHotspots,
          )
          this.appendLog(generateId, `[Hotspot] Node "${node.id}": pre-existing asset, ${manualHotspots.length} hotspots (manual, no vision)`)
        }
        continue
      }

      if (!node.hotspots || node.hotspots.length === 0) continue

      const manualHotspots = node.hotspots.map(hs => ({
        edgeId: hs.edgeId,
        targetNodeId: hs.targetNodeId,
        label: hs.label,
        normalizedX: hs.normalizedX,
        normalizedY: hs.normalizedY,
        radius: hs.radius ?? 12,
        source: 'manual' as 'manual' | 'vision',
      }))

      let recommended: typeof manualHotspots = manualHotspots
      try {
        const imageRelPath = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
        const imageBuffer = this.repo.readFile(imageRelPath)
        if (imageBuffer) {
          this.appendLog(generateId, `[Hotspot] Node "${node.id}": analyzing image with vision model...`)
          const visionResult = await this.visionModule.recommendHotspots(node, imageBuffer)

          if (visionResult.length > 0) {
            recommended = visionResult.map(vr => {
              const manual = manualHotspots.find(m => m.targetNodeId === vr.targetNodeId)
              return {
                edgeId: manual?.edgeId ?? '',
                targetNodeId: vr.targetNodeId,
                label: vr.label,
                normalizedX: vr.normalizedX,
                normalizedY: vr.normalizedY,
                radius: vr.radius,
                source: 'vision' as const,
              }
            })
            this.appendLog(generateId, `[Hotspot] Node "${node.id}": ${recommended.length} hotspots (vision)`)
          } else {
            this.appendLog(generateId, `[Hotspot] Node "${node.id}": vision returned empty, using manual`)
          }
        }
      } catch (e: any) {
        this.appendLog(generateId, `[Hotspot] Node "${node.id}": vision failed (${e.message}), using manual`)
      }

      if (recommended[0]?.source === 'manual') {
        this.appendLog(generateId, `[Hotspot] Node "${node.id}": ${recommended.length} hotspots (manual)`)
      }
      record.summary.hotspotReady += recommended.length

      this.repo.writeJson(
        `${GENERATES_DIR}/${generateId}/nodes/${node.id}/hotspots.recommended.json`,
        recommended,
      )
      this.repo.writeJson(
        `${GENERATES_DIR}/${generateId}/nodes/${node.id}/hotspots.final.json`,
        manualHotspots,
      )
      this.repo.writeJson(
        `${GENERATES_DIR}/${generateId}/hotspots/${node.id}/final.json`,
        manualHotspots,
      )
    }

    this.repo.saveGenerateRecord(record)
  }

  private async generateEdges(
    generateId: string,
    guide: KnowledgePackage,
    record: PackageBuildRecord,
  ) {
    for (const edge of guide.edges) {
      const edgeRecord: EdgeBuildRecord = {
        buildId: generateId,
        edgeId: edge.id,
        status: 'running',
        promptStatus: 'running',
        videoStatus: 'pending',
        updatedAt: nowISO(),
      }

      try {
        // Check for pre-existing video asset in guide directory
        const guideVideoPath = `guides/${guide.id}/current/assets/edges/${edge.id}.mp4`
        if (this.repo.fileExists(guideVideoPath)) {
          const buildVideoPath = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.mp4`
          this.repo.copyFile(guideVideoPath, buildVideoPath)

          edgeRecord.promptStatus = 'success'
          edgeRecord.videoStatus = 'success'
          edgeRecord.videoPath = buildVideoPath
          edgeRecord.status = 'success'
          record.summary.edgeSuccess++

          this.appendLog(generateId, `[Edge] "${edge.id}" using pre-existing video asset`)
        } else {
          const fromNode = guide.nodes.find(n => n.id === edge.fromNodeId)
          const toNode = guide.nodes.find(n => n.id === edge.toNodeId)
          const visualPlan = this.promptBuilder.resolveTransitionDescriptionMode(edge) === 'manual'
            ? this.promptBuilder.buildManualTransitionPlan(edge)
            : await this.promptBuilder.planTransitionVisuals(generateId, edge, fromNode, toNode, guide, this.repo)

          const transitionPrompt = this.promptBuilder.buildTransitionPrompt(edge, fromNode, toNode, guide, visualPlan)
          edgeRecord.promptStatus = 'success'
          edgeRecord.transitionStrategyMode = visualPlan.mode
          edgeRecord.transitionStrategyReason = visualPlan.reason

          this.repo.writeJson(
            `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.json`,
            {
              edgeId: edge.id,
              fromNodeId: edge.fromNodeId,
              toNodeId: edge.toNodeId,
              relationLabel: edge.relationLabel,
              descriptionMode: this.promptBuilder.resolveTransitionDescriptionMode(edge),
              manualTransitionPrompt: this.promptBuilder.getManualTransitionDescription(edge) || undefined,
              strategyMode: visualPlan.mode,
              strategyReason: visualPlan.reason,
              visualPlan,
              prompt: transitionPrompt,
              status: 'running',
            },
          )

          const firstFrame = await this.mediaModule.exposeNodeImage(
            generateId,
            this.resolveVideoFrameNodeId(guide, edge.fromNodeId),
          )
          const lastFrame = await this.mediaModule.exposeNodeImage(
            generateId,
            this.resolveVideoFrameNodeId(guide, edge.toNodeId),
          )

          edgeRecord.videoStatus = 'running'
          this.appendLog(generateId, `[Edge] Generating video "${edge.id}" (${edge.fromNodeId} → ${edge.toNodeId})...`)

          const videoResult = await this.videoModule.generateTransitionVideo(
            edge.id,
            edge.fromNodeId,
            edge.toNodeId,
            transitionPrompt,
            firstFrame.url,
            lastFrame.url,
            (status, taskId) => {
              this.appendLog(generateId, `[Edge] "${edge.id}" video task ${taskId}: ${status}`)
            },
          )

          const buildVideoPath = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.mp4`
          this.repo.copyFile(videoResult.localPath, buildVideoPath)

          edgeRecord.videoStatus = 'success'
          edgeRecord.videoPath = buildVideoPath
          edgeRecord.status = 'success'
          record.summary.edgeSuccess++

          this.appendLog(generateId, `[Edge] "${edge.id}" done (cached: ${videoResult.fromCache})`)
        }
      } catch (e: any) {
        edgeRecord.status = 'failed'
        edgeRecord.videoStatus = 'failed'
        edgeRecord.errorMessage = e.message
        this.appendLog(generateId, `[Edge] "${edge.id}" FAILED: ${e.message}`)
        console.error(`[Generate] Edge "${edge.id}" failed:`, e.message)
      }

      edgeRecord.updatedAt = nowISO()
      this.repo.saveEdgeRecord(generateId, edge.id, edgeRecord)
    }

    this.repo.saveGenerateRecord(record)
  }

  private resolveVideoFrameNodeId(guide: KnowledgePackage, nodeId: string): string {
    const node = guide.nodes.find(item => item.id === nodeId)
    if (!node) return nodeId
    return nodeId
  }

  private publishFromGenerate(generateId: string, guide: KnowledgePackage) {
    syncAssetsToWorkspace(guide, generateId, this.manifestCtx)

    const publishDir = `publish/${guide.id}/${guide.version}`
    this.repo.ensureDir(`${publishDir}/assets/nodes`)
    this.repo.ensureDir(`${publishDir}/assets/edges`)

    for (const node of guide.nodes) {
      const nodeKind = node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')
      if (nodeKind === 'html') {
        const htmlSrc = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/content.html`
        if (this.repo.fileExists(htmlSrc)) {
          this.repo.copyFile(htmlSrc, `${publishDir}/assets/nodes/${node.id}.html`)
        }
        const previewImageSrc = `workspace/${guide.id}/nodes/${node.id}.png`
        if (this.repo.fileExists(previewImageSrc)) {
          this.repo.copyFile(previewImageSrc, `${publishDir}/assets/nodes/${node.id}.png`)
        }
      } else {
        const generatedSrc = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
        const workspaceSrc = `workspace/${guide.id}/nodes/${node.id}.png`
        const src = this.repo.fileExists(generatedSrc) ? generatedSrc : workspaceSrc
        if (this.repo.fileExists(src)) {
          this.repo.copyFile(src, `${publishDir}/assets/nodes/${node.id}.png`)
        }
      }
    }

    for (const edge of guide.edges) {
      const src = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.mp4`
      if (this.repo.fileExists(src)) {
        this.repo.copyFile(src, `${publishDir}/assets/edges/${edge.id}.mp4`)
      }
    }

    const manifest = buildManifest(guide, generateId, this.manifestCtx)
    this.repo.writeJson(`${publishDir}/manifest.json`, manifest)
    this.repo.writeJson(
      `${publishDir}/summary.json`,
      this.repo.loadGenerateRecord(generateId),
    )
  }

  // ─── Logging ──────────────────────────────────────────────

  private appendLog(generateId: string, message: string) {
    const timestamp = nowISO()
    const line = `[${timestamp}] ${message}`

    if (!this.logs.has(generateId)) {
      this.logs.set(generateId, [])
    }
    this.logs.get(generateId)!.push(line)

    this.repo.writeJson(
      `${GENERATES_DIR}/${generateId}/logs.json`,
      this.logs.get(generateId),
    )
  }
}
