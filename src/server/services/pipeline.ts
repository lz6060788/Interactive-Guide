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
  KnowledgeEdge,
  PackageBuildRecord,
  NodeBuildRecord,
  EdgeBuildRecord,
  PublishManifest,
} from '../../shared/types.js'
import { validateKnowledgePackage, validatePublishManifest } from '../../shared/validators.js'
import { generateGenerateId, nowISO } from '../../shared/utils.js'
import { AppError } from '../middleware/app-error.js'
import { PromptBuilder } from './prompt-builder.js'
import { RuntimeBundleGenerator } from './runtime-bundle.js'

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
      this.appendLog(generateId, `[Generate] Fatal error: ${err.message}`)
      console.error(`[Generate] ${generateId} fatal error:`, err)
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

    this.runRegenerateNode(generateId, guide, node).catch(err => {
      this.appendLog(generateId, `[Regen] Node "${nodeId}" fatal error: ${err.message}`)
      console.error(`[Regen] Node "${nodeId}" fatal error:`, err)
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

    this.runRegenerateEdge(generateId, guide, edge, fromNode, toNode).catch(err => {
      this.appendLog(generateId, `[Regen] Edge "${edgeId}" fatal error: ${err.message}`)
      console.error(`[Regen] Edge "${edgeId}" fatal error:`, err)
    })

    return { buildId: generateId, edgeId }
  }

  async regenerateHotspots(guideId: string, nodeId: string) {
    this.repo.refresh()
    const guides = this.repo.loadAllGuides()
    const guide = guides.get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)

    const node = guide.nodes.find(n => n.id === nodeId)
    if (!node) throw AppError.notFound(`Node "${nodeId}" not found`)
    if (!node.hotspots || node.hotspots.length === 0) return []

    const generates = this.repo.loadAllGenerates()
    const latest = Array.from(generates.values())
      .filter(g => g.packageId === guideId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (!latest) throw AppError.validation('No existing build found')

    const generateId = latest.buildId

    const manualHotspots: Array<{
      edgeId: string; targetNodeId: string; label: string
      normalizedX: number; normalizedY: number; radius: number
      source: 'vision' | 'manual'
    }> = node.hotspots.map(hs => ({
      edgeId: hs.edgeId,
      targetNodeId: hs.targetNodeId,
      label: hs.label,
      normalizedX: hs.normalizedX,
      normalizedY: hs.normalizedY,
      radius: hs.radius ?? 12,
      source: 'manual' as 'manual',
    }))

    const imageRelPath = `${GENERATES_DIR}/${generateId}/nodes/${nodeId}/image.png`
    const imageBuffer = this.repo.readFile(imageRelPath)
    if (!imageBuffer) throw AppError.validation(`Image not found for node "${nodeId}"`)

    let recommended: typeof manualHotspots = manualHotspots
    try {
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
      }
    } catch (e: any) {
      console.error(`[RegenHotspots] Vision failed for "${nodeId}":`, e.message)
    }

    this.repo.writeJson(
      `${GENERATES_DIR}/${generateId}/nodes/${nodeId}/hotspots.recommended.json`,
      recommended,
    )

    const updatedNodes = guide.nodes.map(n => {
      if (n.id !== nodeId) return n
      return {
        ...n,
        hotspots: n.hotspots?.map(hs => {
          const rec = recommended.find(r => r.targetNodeId === hs.targetNodeId)
          return rec ? { ...hs, normalizedX: rec.normalizedX, normalizedY: rec.normalizedY } : hs
        }),
      }
    })
    const updatedGuide = { ...guide, nodes: updatedNodes, metadata: { ...guide.metadata, updatedAt: nowISO() } }
    this.repo.writeJson(`guides/${guideId}/current/guide.json`, updatedGuide)

    try {
      const manifestPath = `publish/${guideId}/${guide.version}/manifest.json`
      const manifest = this.repo.readJson<any>(manifestPath)
      if (manifest && manifest.nodes) {
        const updatedHotspots = updatedNodes.find(un => un.id === nodeId)?.hotspots?.map(hs => ({
          edgeId: hs.edgeId,
          targetNodeId: hs.targetNodeId,
          label: hs.label,
          normalizedX: hs.normalizedX,
          normalizedY: hs.normalizedY,
          radius: hs.radius,
          markerType: 'dot',
        })) || []

        manifest.nodes = manifest.nodes.map((n: any) => {
          if (n.id === nodeId) return { ...n, hotspots: updatedHotspots }
          return n
        })
        if (manifest.nodeMap?.[nodeId]) {
          manifest.nodeMap[nodeId].hotspots = updatedHotspots
        }
        this.repo.writeJson(manifestPath, manifest)
      }
    } catch (e) {
      console.warn(`Failed to sync regenerated hotspots to manifest for guide ${guideId}:`, e)
    }

    return recommended
  }

  // ─── Regeneration ─────────────────────────────────────────

  private async runRegenerateNode(
    generateId: string,
    guide: KnowledgePackage,
    node: KnowledgeNode,
  ) {
    const nodeRecord: NodeBuildRecord = {
      buildId: generateId,
      nodeId: node.id,
      status: 'running',
      plannerStatus: 'success',
      imageStatus: 'running',
      updatedAt: nowISO(),
    }

    try {
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

      this.appendLog(generateId, `[Regen] Generating image for "${node.id}"...`)
      const imageResult = await this.imageModule.generateNodeImage(
        node.id,
        imagePrompt,
        guide.resolution.width,
        guide.resolution.height,
      )

      const buildImagePath = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
      this.repo.copyFile(imageResult.localPath, buildImagePath)

      const publishImagePath = `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.png`
      if (this.repo.fileExists(publishImagePath)) {
        this.repo.copyFile(imageResult.localPath, publishImagePath)
      }

      const workspaceImagePath = `workspace/${guide.id}/nodes/${node.id}.png`
      this.repo.copyFile(imageResult.localPath, workspaceImagePath)
      const workspaceManifest = this.buildWorkspaceManifest(guide)
      this.repo.writeJson(`workspace/${guide.id}/manifest.json`, workspaceManifest)

      nodeRecord.imageStatus = 'success'
      nodeRecord.imagePath = buildImagePath
      nodeRecord.modelInputUrl = imageResult.modelInputUrl
      nodeRecord.status = 'success'

      this.appendLog(generateId, `[Regen] Node "${node.id}" done (cached: ${imageResult.fromCache})`)
    } catch (e: any) {
      nodeRecord.status = 'failed'
      nodeRecord.imageStatus = 'failed'
      nodeRecord.errorMessage = e.message
      this.appendLog(generateId, `[Regen] Node "${node.id}" FAILED: ${e.message}`)
      console.error(`[Regen] Node "${node.id}" failed:`, e.message)
    }

    nodeRecord.updatedAt = nowISO()
    this.repo.saveNodeRecord(generateId, node.id, nodeRecord)
  }

  private async runRegenerateEdge(
    generateId: string,
    guide: KnowledgePackage,
    edge: KnowledgeEdge,
    fromNode: KnowledgeNode,
    toNode: KnowledgeNode,
  ) {
    const edgeRecord: EdgeBuildRecord = {
      buildId: generateId,
      edgeId: edge.id,
      status: 'running',
      promptStatus: 'running',
      videoStatus: 'pending',
      updatedAt: nowISO(),
    }

    try {
      const visualPlan = this.promptBuilder.resolveTransitionDescriptionMode(edge) === 'manual'
        ? this.promptBuilder.buildManualTransitionPlan(edge)
        : await this.promptBuilder.planTransitionVisuals(generateId, edge, fromNode, toNode, guide, this.repo)

      const transitionPrompt = this.promptBuilder.buildTransitionPrompt(edge, fromNode, toNode, guide, visualPlan)
      const transitionJsonPath = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.json`

      edgeRecord.promptStatus = 'success'
      edgeRecord.transitionStrategyMode = visualPlan.mode
      edgeRecord.transitionStrategyReason = visualPlan.reason
      edgeRecord.transitionPath = transitionJsonPath

      this.repo.writeJson(
        transitionJsonPath,
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

      const firstFrame = await this.mediaModule.exposeNodeImage(generateId, edge.fromNodeId)
      const lastFrame = await this.mediaModule.exposeNodeImage(generateId, edge.toNodeId)

      edgeRecord.videoStatus = 'running'
      this.appendLog(generateId, `[Regen] Generating video "${edge.id}" (${edge.fromNodeId} → ${edge.toNodeId})...`)

      const videoResult = await this.videoModule.generateTransitionVideo(
        edge.id,
        edge.fromNodeId,
        edge.toNodeId,
        transitionPrompt,
        firstFrame.url,
        lastFrame.url,
        (status, taskId) => {
          this.appendLog(generateId, `[Regen] "${edge.id}" video task ${taskId}: ${status}`)
        },
      )

      const buildVideoPath = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.mp4`
      const publishVideoPath = `publish/${guide.id}/${guide.version}/assets/edges/${edge.id}.mp4`

      this.repo.copyFile(videoResult.localPath, buildVideoPath)
      this.repo.copyFile(videoResult.localPath, publishVideoPath)

      edgeRecord.videoStatus = 'success'
      edgeRecord.videoPath = buildVideoPath
      edgeRecord.status = 'success'

      const updatedGuide: KnowledgePackage = {
        ...guide,
        edges: guide.edges.map(currentEdge => (
          currentEdge.id === edge.id
            ? {
              ...currentEdge,
              status: 'ready',
              videoStatus: 'success',
              videoUrl: `/api/media/${guide.id}/${guide.version}/assets/edges/${edge.id}.mp4`,
            }
            : currentEdge
        )),
        metadata: { ...guide.metadata, updatedAt: nowISO() },
      }

      this.repo.saveGuide(updatedGuide)
      const manifest = this.buildManifest(updatedGuide, generateId)
      this.repo.writeJson(`publish/${guide.id}/${guide.version}/manifest.json`, manifest)

      const workspaceVideoPath = `workspace/${guide.id}/edges/${edge.id}.mp4`
      this.repo.copyFile(videoResult.localPath, workspaceVideoPath)
      const workspaceManifest = this.buildWorkspaceManifest(updatedGuide)
      this.repo.writeJson(`workspace/${guide.id}/manifest.json`, workspaceManifest)

      this.appendLog(generateId, `[Regen] Edge "${edge.id}" done (cached: ${videoResult.fromCache})`)
    } catch (e: any) {
      const updatedGuide: KnowledgePackage = {
        ...guide,
        edges: guide.edges.map(currentEdge => (
          currentEdge.id === edge.id
            ? { ...currentEdge, videoStatus: 'failed' }
            : currentEdge
        )),
        metadata: { ...guide.metadata, updatedAt: nowISO() },
      }

      this.repo.saveGuide(updatedGuide)

      edgeRecord.status = 'failed'
      edgeRecord.videoStatus = 'failed'
      edgeRecord.errorMessage = e.message
      this.appendLog(generateId, `[Regen] Edge "${edge.id}" FAILED: ${e.message}`)
      console.error(`[Regen] Edge "${edge.id}" failed:`, e.message)
    }

    edgeRecord.updatedAt = nowISO()
    this.repo.saveEdgeRecord(generateId, edge.id, edgeRecord)
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
        // HTML nodes: skip AI image generation, copy HTML file
        if (node.contentType === 'html') {
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
              guide.resolution.width,
              guide.resolution.height,
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
      // HTML nodes: skip visual hotspot recommendation, use hotspotEdgeIds for validation only
      if (node.contentType === 'html') {
        if (node.hotspotEdgeIds && node.hotspotEdgeIds.length > 0) {
          this.appendLog(generateId, `[Hotspot] Node "${node.id}": HTML node, ${node.hotspotEdgeIds.length} declared edge ids (no visual hotspots)`)
        }
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

          const firstFrame = await this.mediaModule.exposeNodeImage(generateId, edge.fromNodeId)
          const lastFrame = await this.mediaModule.exposeNodeImage(generateId, edge.toNodeId)

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

  private publishFromGenerate(generateId: string, guide: KnowledgePackage) {
    this.syncAssetsToWorkspace(guide, generateId)

    const publishDir = `publish/${guide.id}/${guide.version}`
    this.repo.ensureDir(`${publishDir}/assets/nodes`)
    this.repo.ensureDir(`${publishDir}/assets/edges`)

    for (const node of guide.nodes) {
      if (node.contentType === 'html') {
        const htmlSrc = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/content.html`
        if (this.repo.fileExists(htmlSrc)) {
          this.repo.copyFile(htmlSrc, `${publishDir}/assets/nodes/${node.id}.html`)
        }
      } else {
        const src = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
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

    const manifest = this.buildManifest(guide, generateId)
    this.repo.writeJson(`${publishDir}/manifest.json`, manifest)
    this.repo.writeJson(
      `${publishDir}/summary.json`,
      this.repo.loadGenerateRecord(generateId),
    )
  }

  syncAssetsToWorkspace(guide: KnowledgePackage, generateId: string): void {
    const workspaceDir = `workspace/${guide.id}`
    this.repo.ensureDir(`${workspaceDir}/nodes`)
    this.repo.ensureDir(`${workspaceDir}/edges`)

    for (const node of guide.nodes) {
      if (node.contentType === 'html') {
        const htmlSrc = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/content.html`
        if (this.repo.fileExists(htmlSrc)) {
          this.repo.copyFile(htmlSrc, `${workspaceDir}/nodes/${node.id}.html`)
        }
      } else {
        const src = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
        if (this.repo.fileExists(src)) {
          this.repo.copyFile(src, `${workspaceDir}/nodes/${node.id}.png`)
        }
      }
    }

    for (const edge of guide.edges) {
      const src = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.mp4`
      if (this.repo.fileExists(src)) {
        this.repo.copyFile(src, `${workspaceDir}/edges/${edge.id}.mp4`)
      }
    }

    const manifest = this.buildWorkspaceManifest(guide)
    this.repo.writeJson(`${workspaceDir}/manifest.json`, manifest)
  }

  // ─── Manifest Builders ──────────────────────────────────────

  private buildManifest(guide: KnowledgePackage, generateId: string): PublishManifest {
    const mediaBase = `/api/media/${guide.id}/${guide.version}`

    const nodes = guide.nodes.map(n => {
      const summary = this.promptBuilder.getNodeSummary(n)
      const keyPoints = this.promptBuilder.getNodeKeyPoints(n)

      if (n.contentType === 'html') {
        return {
          id: n.id,
          title: n.title,
          summary: summary || undefined,
          keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
          topicType: n.topicType,
          sourceText: n.sourceText?.trim() || undefined,
          contentType: 'html' as const,
          htmlUrl: `${mediaBase}/assets/nodes/${n.id}.html`,
          hotspotEdgeIds: n.hotspotEdgeIds,
          hotspots: [] as Array<{
            edgeId: string; targetNodeId: string; label: string
            normalizedX: number; normalizedY: number; radius?: number
            markerType: 'dot'
          }>,
        }
      }

      return {
        id: n.id,
        title: n.title,
        summary: summary || undefined,
        keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        topicType: n.topicType,
        sourceText: n.sourceText?.trim() || undefined,
        imageUrl: `${mediaBase}/assets/nodes/${n.id}.png`,
        hotspots: (n.hotspots ?? []).map(hs => ({
          edgeId: hs.edgeId,
          targetNodeId: hs.targetNodeId,
          label: hs.label,
          normalizedX: hs.normalizedX,
          normalizedY: hs.normalizedY,
          radius: hs.radius,
          markerType: 'dot' as const,
        })),
      }
    })

    const edges = guide.edges.map(e => {
      const videoPath = `${GENERATES_DIR}/${generateId}/edges/${e.id}/transition.mp4`
      const hasVideo = this.repo.fileExists(videoPath)

      return {
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        relationLabel: e.relationLabel,
        transitionType: e.transitionType,
        builtinTransition: e.builtinTransition,
        videoUrl: hasVideo ? `${mediaBase}/assets/edges/${e.id}.mp4` : undefined,
      }
    })

    const nodeMap: Record<string, (typeof nodes)[0]> = {}
    for (const n of nodes) nodeMap[n.id] = n

    const edgeMap: Record<string, (typeof edges)[0]> = {}
    for (const e of edges) edgeMap[e.id] = e

    return {
      packageId: guide.id,
      version: guide.version,
      title: guide.title,
      rootNodeId: 'root',
      resolution: guide.resolution,
      visualStyle: guide.visualStyle,
      transitionStyle: guide.transitionStyle,
      nodes,
      edges,
      nodeMap,
      edgeMap,
      metadata: {
        generatedAt: nowISO(),
        manifestVersion: '1.0.0',
      },
    }
  }

  private buildWorkspaceManifest(guide: KnowledgePackage): PublishManifest {
    const mediaBase = `/api/media/workspace/${guide.id}`

    const nodes = guide.nodes.map(n => {
      const summary = this.promptBuilder.getNodeSummary(n)
      const keyPoints = this.promptBuilder.getNodeKeyPoints(n)

      if (n.contentType === 'html') {
        return {
          id: n.id,
          title: n.title,
          summary: summary || undefined,
          keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
          topicType: n.topicType,
          sourceText: n.sourceText?.trim() || undefined,
          contentType: 'html' as const,
          htmlUrl: `${mediaBase}/nodes/${n.id}.html`,
          hotspotEdgeIds: n.hotspotEdgeIds,
          hotspots: [] as Array<{
            edgeId: string; targetNodeId: string; label: string
            normalizedX: number; normalizedY: number; radius?: number
            markerType: 'dot'
          }>,
        }
      }

      return {
        id: n.id,
        title: n.title,
        summary: summary || undefined,
        keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        topicType: n.topicType,
        sourceText: n.sourceText?.trim() || undefined,
        imageUrl: `${mediaBase}/nodes/${n.id}.png`,
        hotspots: (n.hotspots ?? []).map(hs => ({
          edgeId: hs.edgeId,
          targetNodeId: hs.targetNodeId,
          label: hs.label,
          normalizedX: hs.normalizedX,
          normalizedY: hs.normalizedY,
          radius: hs.radius,
          markerType: 'dot' as const,
        })),
      }
    })

    const edges = guide.edges.map(e => {
      const videoPath = `workspace/${guide.id}/edges/${e.id}.mp4`
      const hasVideo = this.repo.fileExists(videoPath)

      return {
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        relationLabel: e.relationLabel,
        transitionType: e.transitionType,
        builtinTransition: e.builtinTransition,
        videoUrl: hasVideo ? `${mediaBase}/edges/${e.id}.mp4` : undefined,
      }
    })

    const nodeMap: Record<string, (typeof nodes)[0]> = {}
    for (const n of nodes) nodeMap[n.id] = n

    const edgeMap: Record<string, (typeof edges)[0]> = {}
    for (const e of edges) edgeMap[e.id] = e

    return {
      packageId: guide.id,
      version: guide.version,
      title: guide.title,
      rootNodeId: 'root',
      resolution: guide.resolution,
      visualStyle: guide.visualStyle,
      transitionStyle: guide.transitionStyle,
      nodes,
      edges,
      nodeMap,
      edgeMap,
      metadata: {
        generatedAt: nowISO(),
        manifestVersion: '1.0.0',
      },
    }
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