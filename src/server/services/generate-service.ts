// ============================================================
// Interactive Guide - Generate Service (Build Pipeline)
// ============================================================
// Six-stage pipeline: validate → prepare → gen_nodes → gen_hotspots → gen_edges → publish
// Integrates AI services (vision, image, video) through the ai/ layer.
// Depends on Repository interface — does NOT import FsRepository.

import fs from 'node:fs'
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

import type * as vision from '../ai/vision.js'
import type * as image from '../ai/image.js'
import type * as video from '../ai/video.js'
import type * as media from '../ai/media.js'

const GENERATES_DIR = 'generates'

export class GenerateService {
  private logs: Map<string, string[]> = new Map()

  constructor(
    private repo: Repository,
    private visionModule: typeof vision,
    private imageModule: typeof image,
    private videoModule: typeof video,
    private mediaModule: typeof media,
  ) {}

  // ─── Public API ─────────────────────────────────────────

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

    // Run pipeline asynchronously — caller polls for status
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
    // Try in-memory first, then fall back to persisted file
    const memLogs = this.logs.get(generateId)
    if (memLogs) return memLogs
    return this.repo.readJson<string[]>(
      `${GENERATES_DIR}/${generateId}/logs.json`,
    ) ?? []
  }

  regenerateNode(guideId: string, nodeId: string): void {
    // TODO: Phase 5 — single node regeneration
    throw new AppError('Node regeneration not yet implemented', 'NOT_IMPLEMENTED', 501)
  }

  regenerateEdge(guideId: string, edgeId: string): void {
    // TODO: Phase 5 — single edge regeneration
    throw new AppError('Edge regeneration not yet implemented', 'NOT_IMPLEMENTED', 501)
  }

  // ─── Logging ────────────────────────────────────────────

  private appendLog(generateId: string, message: string) {
    const timestamp = nowISO()
    const line = `[${timestamp}] ${message}`

    // In-memory
    if (!this.logs.has(generateId)) {
      this.logs.set(generateId, [])
    }
    this.logs.get(generateId)!.push(line)

    // Persist to disk
    this.repo.writeJson(
      `${GENERATES_DIR}/${generateId}/logs.json`,
      this.logs.get(generateId),
    )
  }

  // ─── Pipeline ──────────────────────────────────────────

  private async runGenerate(generateId: string, guide: KnowledgePackage) {
    const record = this.repo.loadGenerateRecord(generateId)
    if (!record) return

    record.status = 'running'
    record.startedAt = nowISO()
    record.updatedAt = nowISO()
    this.repo.saveGenerateRecord(record)

    try {
      // Stage 1: Validate
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

      // Stage 2: Prepare
      record.currentStage = 'prepare'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] prepare')
      this.prepareGenerate(generateId, guide)

      // Stage 3: Generate Nodes (Vision + Image)
      record.currentStage = 'gen_nodes'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] gen_nodes')
      await this.generateNodes(generateId, guide, record)

      // Stage 4: Generate Hotspots
      record.currentStage = 'gen_hotspots'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] gen_hotspots')
      await this.generateHotspots(generateId, guide, record)

      // Stage 5: Generate Edges (Async Video)
      record.currentStage = 'gen_edges'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] gen_edges')
      await this.generateEdges(generateId, guide, record)

      // Stage 6: Publish
      record.currentStage = 'publish'
      this.repo.saveGenerateRecord(record)
      this.appendLog(generateId, '[Stage] publish')
      this.publishFromGenerate(generateId, guide)

      // Validate the generated manifest
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

  // ─── Stage 2: Prepare ──────────────────────────────────

  private prepareGenerate(generateId: string, guide: KnowledgePackage) {
    this.repo.writeJson(`${GENERATES_DIR}/${generateId}/input/guide.snapshot.json`, guide)
  }

  // ─── Stage 3: Generate Nodes ────────────────────────────

  private async generateNodes(
    generateId: string,
    guide: KnowledgePackage,
    record: PackageBuildRecord,
  ) {
    // Build parent-child map from edges
    const childMap = new Map<string, string[]>()
    for (const edge of guide.edges) {
      if (!childMap.has(edge.fromNodeId)) childMap.set(edge.fromNodeId, [])
      childMap.get(edge.fromNodeId)!.push(edge.toNodeId)
    }

    // BFS traversal: root → first layer → second layer → ...
    const nodeImagePaths = new Map<string, string>() // nodeId -> localImagePath
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

    // Generate in BFS order, passing parent image to children
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
        // Find parent image for this node
        const parentEdge = guide.edges.find(e => e.toNodeId === node.id)
        const parentImagePath = parentEdge ? nodeImagePaths.get(parentEdge.fromNodeId) : undefined
        const refBuffer = parentImagePath ? fs.readFileSync(parentImagePath) : undefined

        // Find the parent hotspot label that leads to this child
        let parentHotspotLabel: string | undefined
        if (parentEdge) {
          const parentNode = guide.nodes.find(n => n.id === parentEdge.fromNodeId)
          const hotspot = parentNode?.hotspots?.find(h => h.targetNodeId === node.id)
          parentHotspotLabel = hotspot?.label
        }

        if (refBuffer) {
          this.appendLog(generateId, `[Node] "${node.id}" using reference image from parent "${parentEdge!.fromNodeId}" (hotspot: "${parentHotspotLabel ?? '?'}")`)
        }

        // Build image prompt directly from keyContent (no vision planner)
        const imagePrompt = this.buildImagePrompt(node, guide, refBuffer != null, parentHotspotLabel)

        this.repo.writeJson(
          `${GENERATES_DIR}/${generateId}/nodes/${node.id}/planner.json`,
          {
            nodeId: node.id,
            title: node.title,
            imagePrompt,
            summary: node.keyContent.slice(0, 200),
            status: 'success',
          },
        )

        // Image generation (with reference if available)
        nodeRecord.imageStatus = 'running'
        this.appendLog(generateId, `[Node] Generating image for "${node.id}"...`)
        const imageResult = await this.imageModule.generateNodeImage(
          node.id,
          imagePrompt,
          guide.resolution.width,
          guide.resolution.height,
          refBuffer,
        )

        // Track image path for child node reference
        nodeImagePaths.set(node.id, imageResult.localPath)

        // Copy image to generate dir
        const buildImagePath = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
        this.repo.copyFile(imageResult.localPath, buildImagePath)

        nodeRecord.imageStatus = 'success'
        nodeRecord.imagePath = buildImagePath
        nodeRecord.status = 'success'
        record.summary.nodeSuccess++

        this.appendLog(generateId, `[Node] "${node.id}" done (cached: ${imageResult.fromCache})`)
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

  private buildImagePrompt(
    node: KnowledgeNode,
    guide: KnowledgePackage,
    hasReference: boolean,
    parentHotspotLabel?: string,
  ): string {
    const parts: string[] = []
    parts.push(`Generate an infographic image (${guide.resolution.width}x${guide.resolution.height} pixels).`)
    parts.push(`Visual style: ${guide.visualStyle ?? 'modern clean design'}.`)
    if (hasReference && parentHotspotLabel) {
      parts.push(`This image should zoom into and detail the "${parentHotspotLabel}" element from the parent image. Maintain the parent image's visual elements (shapes, colors, textures) as the core subject, expanding and deconstructing them into detailed views.`)
    }
    parts.push(`Content to visualize:\n${node.keyContent}`)
    if (node.presentationIntent) {
      parts.push(`Presentation intent: ${node.presentationIntent}`)
    }
    if (node.hotspots && node.hotspots.length > 0) {
      parts.push(`Highlight areas for interactive hotspots: ${node.hotspots.map(h => `"${h.label}"`).join(', ')}. Make these areas visually distinct with subtle glow borders.`)
    }
    return parts.join('\n\n')
  }

  // ─── Stage 4: Generate Hotspots (Vision-based) ─────────────

  private async generateHotspots(
    generateId: string,
    guide: KnowledgePackage,
    record: PackageBuildRecord,
  ) {
    for (const node of guide.nodes) {
      if (!node.hotspots || node.hotspots.length === 0) continue

      // Manual coordinates as fallback
      const manualHotspots = node.hotspots.map(hs => ({
        edgeId: hs.edgeId,
        targetNodeId: hs.targetNodeId,
        label: hs.label,
        normalizedX: hs.normalizedX,
        normalizedY: hs.normalizedY,
        radius: hs.radius ?? 12,
        source: 'manual' as 'manual' | 'vision',
      }))

      // Try vision-based hotspot recommendation
      let recommended: typeof manualHotspots = manualHotspots
      try {
        const imageRelPath = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
        const imageBuffer = this.repo.readFile(imageRelPath)
        if (imageBuffer) {
          this.appendLog(generateId, `[Hotspot] Node "${node.id}": analyzing image with vision model...`)
          const visionResult = await this.visionModule.recommendHotspots(node, imageBuffer)

          if (visionResult.length > 0) {
            // Merge vision results with edge metadata from manual hotspots
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

      // Write recommended (vision or manual fallback)
      this.repo.writeJson(
        `${GENERATES_DIR}/${generateId}/nodes/${node.id}/hotspots.recommended.json`,
        recommended,
      )
      // Final = manual coordinates (operator can override vision results via calibration UI)
      this.repo.writeJson(
        `${GENERATES_DIR}/${generateId}/nodes/${node.id}/hotspots.final.json`,
        manualHotspots,
      )
      // Write to hotspots/ directory (per design spec)
      this.repo.writeJson(
        `${GENERATES_DIR}/${generateId}/hotspots/${node.id}/final.json`,
        manualHotspots,
      )
    }

    this.repo.saveGenerateRecord(record)
  }

  // ─── Stage 5: Generate Edges (Async Video) ─────────────

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
        // Build transition prompt
        const fromNode = guide.nodes.find(n => n.id === edge.fromNodeId)
        const toNode = guide.nodes.find(n => n.id === edge.toNodeId)
        const transitionPrompt = this.buildTransitionPrompt(edge, fromNode, toNode, guide)
        edgeRecord.promptStatus = 'success'

        this.repo.writeJson(
          `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.json`,
          {
            edgeId: edge.id,
            fromNodeId: edge.fromNodeId,
            toNodeId: edge.toNodeId,
            relationLabel: edge.relationLabel,
            prompt: transitionPrompt,
            status: 'running',
          },
        )

        // Get HTTP URLs for frame images (DashScope requires URLs, not local paths)
        const firstFrame = this.mediaModule.exposeNodeImage(generateId, edge.fromNodeId)
        const lastFrame = this.mediaModule.exposeNodeImage(generateId, edge.toNodeId)

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

        // Copy video to generate dir
        const buildVideoPath = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.mp4`
        this.repo.copyFile(videoResult.localPath, buildVideoPath)

        edgeRecord.videoStatus = 'success'
        edgeRecord.videoPath = buildVideoPath
        edgeRecord.status = 'success'
        record.summary.edgeSuccess++

        this.appendLog(generateId, `[Edge] "${edge.id}" done (cached: ${videoResult.fromCache})`)
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

  // ─── Stage 6: Publish ──────────────────────────────────

  private publishFromGenerate(generateId: string, guide: KnowledgePackage) {
    const publishDir = `publish/${guide.id}/${guide.version}`
    this.repo.ensureDir(`${publishDir}/assets/nodes`)
    this.repo.ensureDir(`${publishDir}/assets/edges`)

    // Copy node images
    for (const node of guide.nodes) {
      const src = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
      if (this.repo.fileExists(src)) {
        this.repo.copyFile(src, `${publishDir}/assets/nodes/${node.id}.png`)
      }
    }

    // Copy edge videos
    for (const edge of guide.edges) {
      const src = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.mp4`
      if (this.repo.fileExists(src)) {
        this.repo.copyFile(src, `${publishDir}/assets/edges/${edge.id}.mp4`)
      }
    }

    // Generate and write manifest
    const manifest = this.buildManifest(guide, generateId)
    this.repo.writeJson(`${publishDir}/manifest.json`, manifest)
    this.repo.writeJson(
      `${publishDir}/summary.json`,
      this.repo.loadGenerateRecord(generateId),
    )
  }

  // ─── Manifest Builder ──────────────────────────────────

  private buildManifest(guide: KnowledgePackage, generateId: string): PublishManifest {
    const mediaBase = `/api/media/${guide.id}/${guide.version}`

    const nodes = guide.nodes.map(n => {
      const summary = n.keyContent.slice(0, 200)

      return {
        id: n.id,
        title: n.title,
        summary: summary || undefined,
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

  // ─── Helpers ───────────────────────────────────────────

  private buildTransitionPrompt(
    edge: KnowledgeEdge,
    fromNode?: KnowledgeNode,
    toNode?: KnowledgeNode,
    guide?: KnowledgePackage,
  ): string {
    const fromTitle = fromNode?.title ?? edge.fromNodeId
    const toTitle = toNode?.title ?? edge.toNodeId
    const relation = edge.relationLabel ?? '移动到'
    const style = guide?.transitionStyle ?? 'smooth pan'

    return (
      `A smooth ${style} camera transition from "${fromTitle}" page to "${toTitle}" page. ` +
      `The transition represents: ${relation}. ` +
      `Visual style: ${guide?.visualStyle ?? 'modern clean interface'}. ` +
      `Fluid motion, professional UI transition effect.`
    )
  }
}
