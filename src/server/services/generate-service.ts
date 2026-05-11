// ============================================================
// Interactive Guide - Generate Service (Build Pipeline)
// ============================================================
// Six-stage pipeline: validate → prepare → gen_nodes → gen_hotspots → gen_edges → publish
// Integrates AI services (vision, image, video) through the ai/ layer.
// Depends on Repository interface — does NOT import FsRepository.

import type { Repository } from '../storage/repository.js'
import type {
  KnowledgePackage,
  KnowledgeNode,
  KnowledgeEdge,
  PackageBuildRecord,
  NodeBuildRecord,
  EdgeBuildRecord,
  PublishManifest,
  RuntimeBundlePayload,
  TransitionVisualPlan,
} from '../../shared/types.js'
import { validateKnowledgePackage, validatePublishManifest } from '../../shared/validators.js'
import { generateGenerateId, nowISO } from '../../shared/utils.js'
import { AppError } from '../middleware/app-error.js'

import type * as vision from '../ai/vision.js'
import type * as image from '../ai/image.js'
import type * as video from '../ai/video.js'
import type * as media from '../ai/media.js'

const GENERATES_DIR = 'generates'

// ─── Infographic Style Definitions ─────────────────────────
// Based on baoyu-infographic skill reference files.

interface StyleDef { name: string; guidelines: string }

const STYLE_DEFS: Record<string, StyleDef> = {
  'morandi-journal': {
    name: 'Morandi Journal',
    guidelines: [
      '- Background: Warm cream/beige with subtle paper texture (#F5F0E6)',
      '- Primary: Muted teal/sage green (#7BA3A8) for headers and frames',
      '- Secondary: Warm terracotta/orange (#D4956A) for highlights and numbers',
      '- Line art: Dark charcoal brown (#4A4540)',
      '- Hand-drawn doodle illustrations with organic, slightly imperfect ink lines',
      '- Washi tape strip decorations and rounded card containers',
      '- Dotted line frames around sections',
      '- Corner decorations: tiny houses, stars, sparkles',
      '- Main title: Bold hand-lettered calligraphy style',
      '- All imagery must maintain hand-drawn/doodle aesthetic — no digital precision',
      '- Warm and cozy journal feel, not clinical or corporate',
      '- AVOID: Flat vector icons, clean geometric shapes, stock illustration style',
    ].join('\n'),
  },
  'pop-laboratory': {
    name: 'Pop Laboratory',
    guidelines: [
      '- Background: Professional grayish-white with faint blueprint grid texture (#F2F2F2)',
      '- Primary: Muted teal/sage green (#B8D8BE) for major functional blocks',
      '- High-alert accent: Vibrant fluorescent pink (#E91E63) for critical data or highlights',
      '- Marker highlights: Vivid lemon yellow (#FFF200) as highlighter effect for keywords',
      '- Line art: Ultra-fine charcoal brown (#2D2926) for technical grids and hairlines',
      '- Coordinate-style labels on every module (e.g. R-20, G-02)',
      '- Technical diagrams: exploded views, cross-sections with anchor points',
      '- Vertical/horizontal rulers with precise markers',
      '- Corner metadata: tiny barcodes, timestamps, technical parameters',
      '- Headers: Bold brutalist characters, high visual impact',
      '- Numbers: Large, highlighted with yellow or blue to stand out',
      '- AVOID: Cute doodles, soft pastels, empty white space, flat vector icons',
    ].join('\n'),
  },
  'cyberpunk-neon': {
    name: 'Cyberpunk Neon',
    guidelines: [
      '- Primary colors: Neon pink (#FF00FF), cyan (#00FFFF), electric blue',
      '- Background: Deep black (#0A0A0A) or dark purple gradients',
      '- Glowing neon outlines on all elements',
      '- Dark atmospheric backgrounds with digital glitch effects',
      '- Circuit patterns and holographic elements',
      '- Glowing neon text with digital/tech fonts',
      '- Chrome reflections and flickering effects',
    ].join('\n'),
  },
  'technical-schematic': {
    name: 'Technical Schematic',
    guidelines: [
      '- Primary: Blues (#2563EB), teals, grays, white lines',
      '- Background: Deep blue (#1E3A5F) or light gray with grid pattern',
      '- Accents: Amber highlights (#F59E0B), cyan callouts',
      '- Geometric precision throughout with grid pattern',
      '- Dimension lines and measurements',
      '- Technical symbols and annotations',
      '- Clean vector shapes with consistent stroke weights',
      '- All-caps labels with measurement annotations',
    ].join('\n'),
  },
  'craft-handmade': {
    name: 'Craft Handmade',
    guidelines: [
      '- Hand-drawn style with visible pen/brush strokes',
      '- Paper or notebook texture backgrounds',
      '- Warm, natural color palette with earthy tones',
      '- Organic shapes with slight imperfections',
      '- Cut-out and collage aesthetic elements',
      '- Handwritten-style typography for labels',
      '- Craft material textures: paper, cardboard, fabric',
    ].join('\n'),
  },
}

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

  async packageGuide(guideId: string): Promise<RuntimeBundlePayload> {
    this.repo.refresh()
    const guide = this.repo.loadAllGuides().get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)

    const manifest = this.repo.readJson<PublishManifest>(
      `publish/${guide.id}/${guide.version}/manifest.json`,
    )
    if (!manifest) {
      throw AppError.validation('Guide has no published manifest. Run generate before packaging.')
    }

    const bundleId = `${guide.id}-${Date.now()}`
    const bundleDir = `runtime-bundles/${bundleId}`
    const bundleAssetsDir = `${bundleDir}/assets`
    const bundleNodesDir = `${bundleAssetsDir}/nodes`
    const bundleEdgesDir = `${bundleAssetsDir}/edges`
    const generatedAt = nowISO()

    this.repo.ensureDir(bundleNodesDir)
    this.repo.ensureDir(bundleEdgesDir)

    for (const node of manifest.nodes) {
      const src = `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.png`
      if (this.repo.fileExists(src)) {
        this.repo.copyFile(src, `${bundleNodesDir}/${node.id}.png`)
      }
    }

    for (const edge of manifest.edges) {
      const src = `publish/${guide.id}/${guide.version}/assets/edges/${edge.id}.mp4`
      if (this.repo.fileExists(src)) {
        this.repo.copyFile(src, `${bundleEdgesDir}/${edge.id}.mp4`)
      }
    }

    const bundledManifest = this.buildRuntimeBundleManifest(guide, manifest)
    this.repo.writeJson(`${bundleDir}/manifest.json`, bundledManifest)

    const payload: RuntimeBundlePayload = {
      bundleId,
      guideId: guide.id,
      version: guide.version,
      generatedAt,
      entryUrl: `/api/runtime-bundles/${bundleId}/index.html`,
      manifestUrl: `/api/runtime-bundles/${bundleId}/manifest.json`,
      bundleUrl: `/api/runtime-bundles/${bundleId}/`,
    }

    this.repo.writeJson(`${bundleDir}/bundle.json`, payload)
    this.repo.writeFile(
      `${bundleDir}/index.html`,
      Buffer.from(this.buildRuntimeIndexHtml(guide.title), 'utf-8'),
    )
    this.repo.writeFile(
      `${bundleDir}/styles.css`,
      Buffer.from(this.buildRuntimeStyles(), 'utf-8'),
    )
    this.repo.writeFile(
      `${bundleDir}/app.js`,
      Buffer.from(this.buildRuntimeScript(), 'utf-8'),
    )

    return payload
  }

  regenerateNode(guideId: string, nodeId: string): void {
    this.repo.refresh()
    const guides = this.repo.loadAllGuides()
    const guide = guides.get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)

    const node = guide.nodes.find(n => n.id === nodeId)
    if (!node) throw AppError.notFound(`Node "${nodeId}" not found in guide "${guideId}"`)

    // Find latest generate for this guide
    const generates = this.repo.loadAllGenerates()
    const guideGenerates = Array.from(generates.values())
      .filter(g => g.packageId === guideId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const latest = guideGenerates[0]
    if (!latest) throw AppError.validation('No existing build found — run a full build first')

    const generateId = latest.buildId

    this.appendLog(generateId, `[Regen] Regenerating node "${nodeId}"...`)

    // Run async
    this.runRegenerateNode(generateId, guide, node).catch(err => {
      this.appendLog(generateId, `[Regen] Node "${nodeId}" fatal error: ${err.message}`)
      console.error(`[Regen] Node "${nodeId}" fatal error:`, err)
    })
  }

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
      const imagePrompt = this.buildImagePrompt(node, guide)

      this.repo.writeJson(
        `${GENERATES_DIR}/${generateId}/nodes/${node.id}/planner.json`,
        {
          nodeId: node.id,
          title: node.title,
          style: guide.style ?? 'morandi-journal',
          imagePrompt,
          summary: this.getNodeSummary(node),
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

      // Also update publish assets
      const publishImagePath = `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.png`
      if (this.repo.fileExists(publishImagePath)) {
        this.repo.copyFile(imageResult.localPath, publishImagePath)
      }

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
      const visualPlan = await this.planTransitionVisuals(generateId, edge, fromNode, toNode, guide)
      const transitionPrompt = this.buildTransitionPrompt(edge, fromNode, toNode, guide, visualPlan)
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
        metadata: {
          ...guide.metadata,
          updatedAt: nowISO(),
        },
      }

      this.repo.saveGuide(updatedGuide)
      const manifest = this.buildManifest(updatedGuide, generateId)
      this.repo.writeJson(`publish/${guide.id}/${guide.version}/manifest.json`, manifest)

      this.appendLog(generateId, `[Regen] Edge "${edge.id}" done (cached: ${videoResult.fromCache})`)
    } catch (e: any) {
      const updatedGuide: KnowledgePackage = {
        ...guide,
        edges: guide.edges.map(currentEdge => (
          currentEdge.id === edge.id
            ? {
              ...currentEdge,
              videoStatus: 'failed',
            }
            : currentEdge
        )),
        metadata: {
          ...guide.metadata,
          updatedAt: nowISO(),
        },
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

  async regenerateHotspots(guideId: string, nodeId: string): Promise<Array<{
    edgeId: string; targetNodeId: string; label: string
    normalizedX: number; normalizedY: number; radius: number
    source: 'vision' | 'manual'
  }>> {
    this.repo.refresh()
    const guides = this.repo.loadAllGuides()
    const guide = guides.get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)

    const node = guide.nodes.find(n => n.id === nodeId)
    if (!node) throw AppError.notFound(`Node "${nodeId}" not found`)
    if (!node.hotspots || node.hotspots.length === 0) return []

    // Find latest generate
    const generates = this.repo.loadAllGenerates()
    const latest = Array.from(generates.values())
      .filter(g => g.packageId === guideId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (!latest) throw AppError.validation('No existing build found')

    const generateId = latest.buildId

    // Manual fallback
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

    // Vision-based recommendation
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

    // Write results
    this.repo.writeJson(
      `${GENERATES_DIR}/${generateId}/nodes/${nodeId}/hotspots.recommended.json`,
      recommended,
    )

    // Update guide.json hotspots with vision coordinates
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

    return recommended
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
        // Build image prompt directly from structured content
        const imagePrompt = this.buildImagePrompt(node, guide)

        this.repo.writeJson(
          `${GENERATES_DIR}/${generateId}/nodes/${node.id}/planner.json`,
          {
            nodeId: node.id,
            title: node.title,
            style: guide.style ?? 'morandi-journal',
            imagePrompt,
            summary: this.getNodeSummary(node),
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
        )

        // Copy image to generate dir
        const buildImagePath = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
        this.repo.copyFile(imageResult.localPath, buildImagePath)

        nodeRecord.imageStatus = 'success'
        nodeRecord.imagePath = buildImagePath
        nodeRecord.modelInputUrl = imageResult.modelInputUrl
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

  private getNodeSummary(node: KnowledgeNode): string {
    const summary = node.summary?.trim()
    if (summary) return summary.slice(0, 200)

    const keyPoints = (node.keyPoints ?? [])
      .map(item => item.trim())
      .filter(Boolean)
    if (keyPoints.length > 0) {
      return keyPoints.slice(0, 2).join('；').slice(0, 200)
    }

    return node.keyContent.trim().slice(0, 200)
  }

  private getNodeKeyPoints(node: KnowledgeNode): string[] {
    return (node.keyPoints ?? [])
      .map(item => item.trim())
      .filter(Boolean)
  }

  private getNodeHotspotHints(node: KnowledgeNode): string[] {
    const explicitHints = (node.hotspotHints ?? [])
      .map(item => item.trim())
      .filter(Boolean)
    if (explicitHints.length > 0) return explicitHints

    return (node.hotspots ?? [])
      .map(hs => hs.label.trim())
      .filter(Boolean)
  }

  private getNodeVisualIntent(node: KnowledgeNode): string {
    return node.visualIntent?.trim() || node.presentationIntent?.trim() || ''
  }

  private getTopicGuidance(topicType?: string): string {
    switch (topicType) {
      case 'news-report':
        return [
          '- Treat this page as a factual news explainer, not a cinematic scene.',
          '- Prioritize event context, timeline cues, geographic hints, key actors, and data evidence.',
          '- Use information panels, newsroom graphics, maps, and charts before decorative metaphor.',
        ].join('\n')
      case 'common-knowledge':
        return [
          '- Treat this page as an educational explainer for a general audience.',
          '- Prioritize definitions, mechanisms, categories, comparisons, and intuitive examples.',
          '- Use clear diagrammatic zones, annotated objects, and explanatory callouts before atmosphere.',
        ].join('\n')
      case 'content-analysis':
        return [
          '- Treat this page as an analytical breakdown of a topic or viewpoint.',
          '- Prioritize claims, evidence, context, cause-effect links, and contrasting interpretations.',
          '- Use analysis boards, comparison modules, and relationship diagrams before visual spectacle.',
        ].join('\n')
      default:
        return [
          '- Treat this page as a content-first infographic.',
          '- The image should help explain the subject, not replace it with a purely symbolic illustration.',
          '- Prefer charts, callouts, labeled objects, comparison modules, and structured information zones.',
        ].join('\n')
    }
  }

  private getCanvasGuidance(width: number, height: number): string {
    if (height > width) {
      return [
        '- This is a tall mobile portrait canvas. Compose for vertical reading from top to bottom.',
        '- Fill the full canvas height with content. Use clear top, middle, and lower information zones.',
        '- Keep overall information density high enough that at least 80% of the canvas contains meaningful visual content.',
        '- Avoid a single centered horizontal board, poster, desk, or card floating in the middle with large empty margins above and below.',
        '- Prefer 3 to 5 vertically stacked or cascading modules, callout groups, charts, and labeled illustrations.',
        '- The title area should be compact. Do not let oversized title text consume too much vertical space.',
      ].join('\n')
    }

    if (width > height) {
      return [
        '- This is a landscape canvas. Spread content across the horizontal space with multiple distinct but connected zones.',
        '- Avoid shrinking all important content into a narrow central strip.',
      ].join('\n')
    }

    return [
      '- This is a square canvas. Balance information across all four quadrants.',
      '- Avoid leaving large unused areas around the central subject.',
    ].join('\n')
  }

  private buildImagePrompt(
    node: KnowledgeNode,
    guide: KnowledgePackage,
  ): string {
    const lang = guide.locale ?? 'zh-CN'
    const langName = lang.startsWith('zh') ? 'Chinese' : lang.startsWith('ja') ? 'Japanese' : 'English'
    const w = guide.resolution.width
    const h = guide.resolution.height
    const aspectLabel = w > h ? 'landscape' : w < h ? 'portrait' : 'square'
    const styleKey = guide.style ?? 'morandi-journal'
    const styleDef = STYLE_DEFS[styleKey]
    const topicType = node.topicType?.trim() || 'general'
    const summary = this.getNodeSummary(node)
    const keyPoints = this.getNodeKeyPoints(node)
    const sourceText = node.sourceText?.trim()
    const visualIntent = this.getNodeVisualIntent(node)
    const hotspotHints = this.getNodeHotspotHints(node)

    const parts: string[] = []

    // ── Image specs ──
    parts.push(
      `Create a professional infographic image (${w}x${h} pixels, ${aspectLabel}). All text in ${langName}.`
    )

    // ── Style guidelines ──
    if (styleDef) {
      parts.push(`Visual Style — ${styleDef.name}:\n${styleDef.guidelines}`)
    }

    // ── Scenario guidance ──
    parts.push(`Scenario Template — ${topicType}:\n${this.getTopicGuidance(topicType)}`)
    parts.push(`Canvas Composition Rules:\n${this.getCanvasGuidance(w, h)}`)
    parts.push(
      [
        'This page must remain closely tied to the source content.',
        'Avoid turning the subject into a purely atmospheric or decorative scene.',
        'If long text would be needed, express it as concise labels, callout cards, diagrams, charts, icons, or structured modules.',
        'Use dense explanatory visuals, not sparse decoration.',
        'Do not leave large blank background areas without instructional value.',
      ].join('\n')
    )

    // ── Content ──
    parts.push(`Page Summary:\n${summary}`)
    if (keyPoints.length > 0) {
      parts.push(`Must-retain key points:\n${keyPoints.map((item, index) => `${index + 1}. ${item}`).join('\n')}`)
    }
    if (sourceText) {
      parts.push(`Source material reference:\n${sourceText}`)
    }
    parts.push(
      `Legacy content hints (low priority, use only as optional visual details when consistent with the source content; do not let this override the topic, structure, or composition):\n${node.keyContent}`
    )

    // ── Presentation intent ──
    if (visualIntent) {
      parts.push(`Visual goal:\n${visualIntent}`)
    }

    // ── Hotspot hints ──
    if (hotspotHints.length > 0) {
      parts.push(`Make these areas visually distinct for interaction:\n${hotspotHints.map(item => `- ${item}`).join('\n')}`)
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
        const visualPlan = await this.planTransitionVisuals(generateId, edge, fromNode, toNode, guide)
        const transitionPrompt = this.buildTransitionPrompt(edge, fromNode, toNode, guide, visualPlan)
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
            strategyMode: visualPlan.mode,
            strategyReason: visualPlan.reason,
            visualPlan,
            prompt: transitionPrompt,
            status: 'running',
          },
        )

        // Get HTTP URLs for frame images (DashScope requires URLs, not local paths)
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
      const summary = this.getNodeSummary(n)
      const keyPoints = this.getNodeKeyPoints(n)

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

  private buildRuntimeBundleManifest(
    guide: KnowledgePackage,
    manifest: PublishManifest,
  ): PublishManifest {
    const nodes = manifest.nodes.map(node => {
      const localImagePath = `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.png`
      if (!this.repo.fileExists(localImagePath)) {
        throw AppError.validation(`Missing node asset for standalone bundle: ${node.id}.png`)
      }
      return {
        ...node,
        imageUrl: `./assets/nodes/${node.id}.png`,
      }
    })

    const edges = manifest.edges.map(edge => {
      const localVideoPath = `publish/${guide.id}/${guide.version}/assets/edges/${edge.id}.mp4`
      const hasLocalVideo = this.repo.fileExists(localVideoPath)
      if (edge.videoUrl && !hasLocalVideo) {
        throw AppError.validation(`Missing edge asset for standalone bundle: ${edge.id}.mp4`)
      }
      return {
        ...edge,
        videoUrl: hasLocalVideo ? `./assets/edges/${edge.id}.mp4` : undefined,
      }
    })

    const nodeMap: PublishManifest['nodeMap'] = {}
    for (const node of nodes) nodeMap[node.id] = node

    const edgeMap: PublishManifest['edgeMap'] = {}
    for (const edge of edges) edgeMap[edge.id] = edge

    return {
      ...manifest,
      nodes,
      edges,
      nodeMap,
      edgeMap,
      metadata: {
        ...manifest.metadata,
        generatedAt: nowISO(),
      },
    }
  }

  private buildRuntimeIndexHtml(title: string): string {
    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `  <title>${this.escapeHtml(title)} - Runtime Bundle</title>`,
      '  <link rel="stylesheet" href="./styles.css" />',
      '</head>',
      '<body>',
      '  <div id="app" class="runtime-shell">',
      '    <nav class="runtime-nav" aria-label="面包屑导航">',
      '      <button id="back-button" class="nav-back" type="button">返回</button>',
      '      <div id="breadcrumb" class="breadcrumb"></div>',
      '    </nav>',
      '    <main class="runtime-main">',
      '      <section class="player-shell">',
      '        <div id="status" class="status-text">加载中...</div>',
      '        <div id="stage" class="stage" hidden>',
      '          <div id="media-root" class="media-root">',
      '            <img id="node-image" class="node-image" alt="" />',
      '            <video id="transition-video" class="transition-video" muted playsinline></video>',
      '            <div id="hotspots" class="hotspots"></div>',
      '          </div>',
      '        </div>',
      '      </section>',
      '    </main>',
      '  </div>',
      '  <script src="./app.js" defer></script>',
      '</body>',
      '</html>',
    ].join('\n')
  }

  private buildRuntimeStyles(): string {
    return [
      ':root {',
      '  color-scheme: dark;',
      '  --bg: #08090d;',
      '  --panel: rgba(15, 17, 24, 0.9);',
      '  --panel-border: rgba(255, 255, 255, 0.08);',
      '  --panel-soft: rgba(255, 255, 255, 0.05);',
      '  --text: #f4f4f5;',
      '  --text-soft: rgba(244, 244, 245, 0.68);',
      '  --text-dim: rgba(244, 244, 245, 0.42);',
      '  --shadow: 0 20px 60px rgba(0, 0, 0, 0.4);',
      '}',
      '* { box-sizing: border-box; }',
      'html, body { margin: 0; min-height: 100%; background: radial-gradient(circle at top, rgba(53, 60, 92, 0.32) 0%, rgba(8, 9, 13, 1) 46%); color: var(--text); font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif; }',
      'button { font: inherit; }',
      '.runtime-shell { min-height: 100vh; display: flex; flex-direction: column; padding: 16px; gap: 12px; }',
      '.runtime-nav, .player-shell { border: 1px solid var(--panel-border); background: var(--panel); backdrop-filter: blur(18px); box-shadow: var(--shadow); }',
      '.runtime-nav { display: flex; align-items: center; gap: 12px; min-height: 60px; border-radius: 18px; padding: 10px 14px; }',
      '.nav-back { flex-shrink: 0; border: 1px solid var(--panel-border); background: transparent; color: var(--text-soft); border-radius: 999px; padding: 8px 14px; cursor: pointer; transition: 160ms ease; }',
      '.nav-back:hover:not(:disabled) { background: var(--panel-soft); color: var(--text); }',
      '.nav-back:disabled { opacity: 0.42; cursor: not-allowed; }',
      '.breadcrumb { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; color: var(--text-soft); font-size: 14px; }',
      '.breadcrumb span { color: var(--text-dim); }',
      '.breadcrumb button { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0; max-width: 18rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.breadcrumb button:hover { color: var(--text); }',
      '.breadcrumb button.current { color: var(--text); font-weight: 600; cursor: default; }',
      '.runtime-main { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }',
      '.player-shell { width: 100%; height: 100%; min-height: 0; border-radius: 24px; padding: 16px; display: flex; align-items: center; justify-content: center; }',
      '.status-text { color: var(--text-soft); font-size: 14px; letter-spacing: 0.02em; }',
      '.stage { position: relative; width: min(100%, 1280px); height: min(calc(100vh - 132px), calc(100vw * 1.2)); max-height: 100%; border-radius: 20px; overflow: hidden; background: #020305; }',
      '.media-root { position: relative; width: 100%; height: 100%; }',
      '.node-image, .transition-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }',
      '.transition-video { opacity: 0; pointer-events: none; z-index: 3; }',
      '.transition-video.visible { opacity: 1; }',
      '.hotspots { position: absolute; z-index: 4; pointer-events: none; opacity: 1; transition: opacity 180ms ease; }',
      '.hotspots.hidden { opacity: 0; pointer-events: none; }',
      '.hotspot { position: absolute; transform: translate(-50%, -50%); width: 28px; height: 28px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.86); background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.98) 0%, rgba(223, 239, 255, 0.96) 36%, rgba(107, 177, 255, 0.84) 70%, rgba(33, 105, 255, 0.46) 100%); box-shadow: 0 0 12px rgba(131, 194, 255, 0.7), 0 0 28px rgba(87, 162, 255, 0.4), inset 0 0 10px rgba(255, 255, 255, 0.88); cursor: pointer; transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, border-color 180ms ease; }',
      '.hotspot { pointer-events: auto; }',
      '.hotspot::before { content: ""; position: absolute; inset: 5px; border-radius: inherit; background: radial-gradient(circle, rgba(255, 255, 255, 0.98) 0%, rgba(214, 238, 255, 0.94) 42%, rgba(148, 206, 255, 0.2) 100%); }',
      '.hotspot::after { content: ""; position: absolute; inset: -8px; border-radius: inherit; background: radial-gradient(circle, rgba(118, 184, 255, 0.55) 0%, rgba(82, 156, 255, 0.28) 45%, rgba(48, 124, 255, 0.08) 72%, rgba(48, 124, 255, 0) 100%); animation: hotspot-pulse 1.9s ease-in-out infinite; }',
      '.hotspot:hover { transform: translate(-50%, -50%) scale(1.18); border-color: rgba(202, 233, 255, 0.98); background: radial-gradient(circle at 35% 35%, rgba(244, 251, 255, 1) 0%, rgba(198, 230, 255, 0.98) 30%, rgba(113, 185, 255, 0.92) 62%, rgba(37, 119, 255, 0.7) 100%); box-shadow: 0 0 18px rgba(137, 208, 255, 0.9), 0 0 40px rgba(95, 176, 255, 0.72), 0 0 72px rgba(49, 128, 255, 0.42), inset 0 0 12px rgba(255, 255, 255, 0.96); }',
      '.hotspot:hover::after { inset: -13px; background: radial-gradient(circle, rgba(158, 214, 255, 0.72) 0%, rgba(110, 186, 255, 0.42) 38%, rgba(58, 137, 255, 0.18) 68%, rgba(58, 137, 255, 0) 100%); }',
      '@keyframes hotspot-pulse { 0%, 100% { transform: scale(0.94); opacity: 0.76; } 50% { transform: scale(1.22); opacity: 0.24; } }',
      '@media (min-width: 1024px) { .runtime-shell { padding: 20px; } .player-shell { padding: 20px; } .stage { height: min(calc(100vh - 152px), 860px); } }',
      '@media (max-width: 767px) { .runtime-shell { padding: 10px; gap: 10px; } .runtime-nav { min-height: 52px; border-radius: 14px; padding: 8px 10px; } .breadcrumb { font-size: 13px; gap: 6px; } .breadcrumb button { max-width: 9rem; } .player-shell { border-radius: 16px; padding: 10px; } .stage { width: 100%; height: min(calc(100vh - 104px), calc(100vw * 1.78)); border-radius: 14px; } .hotspot { width: 24px; height: 24px; } .hotspot::before { inset: 4px; } .hotspot::after { inset: -6px; } .hotspot:hover::after { inset: -10px; } }',
    ].join('\n')
  }

  private buildRuntimeScript(): string {
    return [
      'const state = { manifest: null, currentNodeId: "", history: [], transitioning: false, pendingTransition: null }',
      '',
      'const refs = {}',
      '',
      'document.addEventListener("DOMContentLoaded", () => {',
      '  refs.backButton = document.getElementById("back-button")',
      '  refs.breadcrumb = document.getElementById("breadcrumb")',
      '  refs.status = document.getElementById("status")',
      '  refs.stage = document.getElementById("stage")',
      '  refs.mediaRoot = document.getElementById("media-root")',
      '  refs.nodeImage = document.getElementById("node-image")',
      '  refs.hotspots = document.getElementById("hotspots")',
      '  refs.video = document.getElementById("transition-video")',
      '',
      '  refs.backButton.addEventListener("click", handleBack)',
      '  refs.nodeImage.addEventListener("load", updateHotspotViewport)',
      '  window.addEventListener("resize", updateHotspotViewport)',
      '  init().catch(error => showError(error instanceof Error ? error.message : String(error)))',
      '})',
      '',
      'async function init() {',
      '  refs.status.textContent = "加载运行时资源..."',
      '  const response = await fetch("./manifest.json", { cache: "no-store" })',
      '  if (!response.ok) throw new Error("无法加载 manifest.json")',
      '  state.manifest = await response.json()',
      '  state.currentNodeId = state.manifest.rootNodeId',
      '  document.title = `${state.manifest.title} - Runtime Bundle`',
      '  render()',
      '}',
      '',
      'function getCurrentNode() {',
      '  if (!state.manifest) return null',
      '  return state.manifest.nodeMap[state.currentNodeId] || null',
      '}',
      '',
      'function render() {',
      '  const manifest = state.manifest',
      '  const currentNode = getCurrentNode()',
      '  if (!manifest || !currentNode) {',
      '    showError("当前节点不存在或 manifest 不完整")',
      '    return',
      '  }',
      '',
      '  refs.stage.hidden = false',
      '  refs.status.textContent = ""',
      '  refs.backButton.disabled = state.history.length === 0',
      '  refs.nodeImage.src = currentNode.imageUrl',
      '  refs.nodeImage.alt = currentNode.title || currentNode.id',
      '  refs.nodeImage.onerror = () => { refs.status.textContent = "当前节点图片缺失"; refs.stage.hidden = false }',
      '  refs.hotspots.style.left = "0px"',
      '  refs.hotspots.style.top = "0px"',
      '  refs.hotspots.style.width = "100%"',
      '  refs.hotspots.style.height = "100%"',
      '',
      '  renderBreadcrumb()',
      '  renderHotspots()',
      '  requestAnimationFrame(updateHotspotViewport)',
      '  refs.hotspots.classList.toggle("hidden", state.transitioning)',
      '  refs.video.classList.toggle("visible", state.transitioning)',
      '  if (!state.transitioning) {',
      '    refs.video.removeAttribute("src")',
      '    refs.video.load()',
      '  }',
      '}',
      '',
      'function renderBreadcrumb() {',
      '  const items = buildBreadcrumb()',
      '  refs.breadcrumb.innerHTML = ""',
      '  items.forEach((item, index) => {',
      '    if (index > 0) {',
      '      const sep = document.createElement("span")',
      '      sep.textContent = "/"',
      '      refs.breadcrumb.appendChild(sep)',
      '    }',
      '    const button = document.createElement("button")',
      '    button.type = "button"',
      '    button.textContent = item.title',
      '    button.className = index === items.length - 1 ? "current" : ""',
      '    if (index < items.length - 1) {',
      '      button.addEventListener("click", () => {',
      '        state.history.push(state.currentNodeId)',
      '        state.currentNodeId = item.id',
      '        state.transitioning = false',
      '        state.pendingTransition = null',
      '        render()',
      '      })',
      '    } else {',
      '      button.disabled = true',
      '    }',
      '    refs.breadcrumb.appendChild(button)',
      '  })',
      '}',
      '',
      'function renderHotspots() {',
      '  const currentNode = getCurrentNode()',
      '  refs.hotspots.innerHTML = ""',
      '  ;(currentNode.hotspots || []).forEach(hotspot => {',
      '    const button = document.createElement("button")',
      '    button.type = "button"',
      '    button.className = "hotspot"',
      '    button.style.left = `${hotspot.normalizedX * 100}%`',
      '    button.style.top = `${hotspot.normalizedY * 100}%`',
      '    button.title = hotspot.label || hotspot.targetNodeId',
      '    button.addEventListener("click", () => handleHotspotClick(hotspot))',
      '    refs.hotspots.appendChild(button)',
      '  })',
      '  requestAnimationFrame(updateHotspotViewport)',
      '}',
      '',
      'function handleHotspotClick(hotspot) {',
      '  if (!state.manifest || state.transitioning) return',
      '  const edge = state.manifest.edgeMap[hotspot.edgeId]',
      '  state.history.push(state.currentNodeId)',
      '  if (edge && edge.videoUrl) {',
      '    state.transitioning = true',
      '    state.pendingTransition = { targetNodeId: hotspot.targetNodeId, videoUrl: edge.videoUrl }',
      '    render()',
      '    playTransition()',
      '    return',
      '  }',
      '  switchNode(hotspot.targetNodeId)',
      '}',
      '',
      'function playTransition() {',
      '  if (!state.pendingTransition) return',
      '  refs.video.onended = () => switchNode(state.pendingTransition.targetNodeId)',
      '  refs.video.onerror = () => switchNode(state.pendingTransition.targetNodeId)',
      '  refs.video.src = state.pendingTransition.videoUrl',
      '  refs.video.load()',
      '  refs.video.play().catch(() => switchNode(state.pendingTransition.targetNodeId))',
      '}',
      '',
      'function handleBack() {',
      '  if (state.history.length === 0) return',
      '  state.currentNodeId = state.history.pop()',
      '  state.transitioning = false',
      '  state.pendingTransition = null',
      '  render()',
      '}',
      '',
      'function switchNode(nodeId) {',
      '  state.currentNodeId = nodeId',
      '  state.transitioning = false',
      '  state.pendingTransition = null',
      '  render()',
      '}',
      '',
      'function buildBreadcrumb() {',
      '  if (!state.manifest) return []',
      '  const manifest = state.manifest',
      '  const path = [{ id: state.currentNodeId, title: manifest.nodeMap[state.currentNodeId]?.title || state.currentNodeId }]',
      '  let cursor = state.currentNodeId',
      '  while (cursor !== manifest.rootNodeId) {',
      '    const edge = manifest.edges.find(item => item.toNodeId === cursor)',
      '    if (!edge) break',
      '    cursor = edge.fromNodeId',
      '    path.unshift({ id: cursor, title: manifest.nodeMap[cursor]?.title || cursor })',
      '  }',
      '  return path',
      '}',
      '',
      'function updateHotspotViewport() {',
      '  if (!refs.mediaRoot || !refs.nodeImage || refs.stage.hidden) return',
      '  const mediaRect = refs.mediaRoot.getBoundingClientRect()',
      '  const imageRect = refs.nodeImage.getBoundingClientRect()',
      '  if (!mediaRect.width || !mediaRect.height || !imageRect.width || !imageRect.height) return',
      '  refs.hotspots.style.left = `${imageRect.left - mediaRect.left}px`',
      '  refs.hotspots.style.top = `${imageRect.top - mediaRect.top}px`',
      '  refs.hotspots.style.width = `${imageRect.width}px`',
      '  refs.hotspots.style.height = `${imageRect.height}px`',
      '}',
      '',
      'function showError(message) {',
      '  refs.stage.hidden = true',
      '  refs.status.textContent = message',
      '}',
    ].join('\n')
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // ─── Helpers ───────────────────────────────────────────

  private buildTransitionPrompt(
    edge: KnowledgeEdge,
    fromNode?: KnowledgeNode,
    toNode?: KnowledgeNode,
    guide?: KnowledgePackage,
    visualPlan?: TransitionVisualPlan,
  ): string {
    const fromTitle = fromNode?.title ?? edge.fromNodeId
    const toTitle = toNode?.title ?? edge.toNodeId
    const fromSummary = fromNode ? this.getNodeSummary(fromNode) : ''
    const toSummary = toNode ? this.getNodeSummary(toNode) : ''
    const relation = edge.relationLabel ?? '移动到'
    const transitionStyle = this.normalizeTransitionStyle(guide?.transitionStyle)
    const visualStyle = [
      guide?.style,
      guide?.visualStyle?.trim(),
    ].filter(Boolean).join(' | ') || 'clean infographic interface'
    const canvasDescriptor = guide
      ? `${guide.resolution.width}:${guide.resolution.height} portrait mobile canvas`
      : 'portrait mobile canvas'
    const sourceHotspot = fromNode?.hotspots?.find(hs => hs.edgeId === edge.id)
    const hotspotCue = sourceHotspot
      ? `Source hotspot region: x ${sourceHotspot.normalizedX.toFixed(2)}, y ${sourceHotspot.normalizedY.toFixed(2)}, radius ${(sourceHotspot.radius ?? 18)}.`
      : ''
    const hotspotPositionCue = this.buildHotspotPositionCue(sourceHotspot?.normalizedX, sourceHotspot?.normalizedY)
    const elementBridgeCue = this.buildElementBridgeCue(fromNode, toNode)
    const strategyMode = visualPlan?.mode ?? 'element-bridge'
    const strategyReason = visualPlan?.reason?.trim()
    const entryFocus = visualPlan?.entryFocus?.trim()
    const sourceFadePlan = visualPlan?.sourceFadePlan?.trim()
    const targetRevealPlan = visualPlan?.targetRevealPlan?.trim()
    const midTransitionAction = visualPlan?.midTransitionAction?.trim()
    const avoidances = (visualPlan?.avoidances ?? []).slice(0, 6)

    return [
      'Create a short navigation transition between two connected infographic screens using the provided first frame and last frame as hard visual constraints.',
      `Start screen title: ${fromTitle}.`,
      fromSummary ? `Start screen summary: ${fromSummary}.` : '',
      `End screen title: ${toTitle}.`,
      toSummary ? `End screen summary: ${toSummary}.` : '',
      `Navigation topic for semantic continuity only: ${relation}.`,
      `Preferred motion language: ${transitionStyle}.`,
      `Overall visual style: ${visualStyle}.`,
      `Canvas: ${canvasDescriptor}.`,
      hotspotCue,
      hotspotPositionCue,
      elementBridgeCue,
      `Selected transition strategy: ${strategyMode}.`,
      strategyReason ? `Why this strategy fits: ${strategyReason}.` : '',
      entryFocus ? `Entry focus: ${entryFocus}.` : '',
      sourceFadePlan ? `Source fade plan: ${sourceFadePlan}.` : '',
      targetRevealPlan ? `Target reveal plan: ${targetRevealPlan}.` : '',
      midTransitionAction ? `Mid-transition action: ${midTransitionAction}.` : '',
      avoidances.length > 0 ? `Extra avoidances: ${avoidances.join('; ')}.` : '',
      'Treat this as spatial navigation inside one knowledge system, not page turning.',
      'Open by matching the first frame exactly, then move into the source hotspot along its real on-screen position before converging to the destination.',
      'The main motion must be forward zoom-in / dive with depth, not lateral slide. Allow one elegant reveal only if it stays logically tied to endpoint layouts.',
      strategyMode === 'element-bridge'
        ? 'Use element-bridge mode: transform real endpoint elements such as cards, charts, labels, arrows, borders, icons, repeated textures, or shared topic tokens so the source module gradually reorganizes into the target module.'
        : 'Use fallback-navigation mode: let the source region guide the entry path, then progressively reduce the source layout while the destination layout gradually appears and takes over the frame. Prefer guided reveal, focus handoff, panel takeover, or depth-led replacement over forced object morphing.',
      'The image must progress continuously toward the target throughout the clip: early segment leaves source, middle segment transforms or reveals, final segment settles into the exact last frame.',
      'Each moment should be closer to the destination than the previous one. Keep intermediate frames anchored to structures already present in the first or last frame.',
      'Keep the tone readable, restrained, and infographic-like.',
      'Do not literalize the navigation topic as a new prop unless that object is already clearly dominant in both endpoint frames.',
      'Do not use page-turn, paper flip, card flip, swipe, simple left-right pan, late hard cut, snap replacement, fake camera shake, unrelated objects, or major composition drift.',
      'Do not spend most of the clip animating the first frame and then suddenly jump to the last frame. Do not drift away from the destination or end with only an approximate target.',
    ].filter(Boolean).join(' ')
  }

  private async planTransitionVisuals(
    generateId: string,
    edge: KnowledgeEdge,
    fromNode: KnowledgeNode | undefined,
    toNode: KnowledgeNode | undefined,
    guide: KnowledgePackage,
  ): Promise<TransitionVisualPlan> {
    if (!fromNode || !toNode) {
      return {
        mode: 'fallback-navigation',
        reason: '节点信息不完整，默认使用兜底导览转场',
        entryFocus: '从源热点区域进入',
        sourceFadePlan: '源页局部逐步退场',
        targetRevealPlan: '目标页主体逐步接管画面',
        midTransitionAction: '使用导览式揭示完成中段过渡',
        avoidances: ['不要晚切', '不要首帧自循环'],
      }
    }

    const fromImage = this.repo.readFile(`${GENERATES_DIR}/${generateId}/nodes/${fromNode.id}/image.png`)
    const toImage = this.repo.readFile(`${GENERATES_DIR}/${generateId}/nodes/${toNode.id}/image.png`)

    if (!fromImage || !toImage) {
      return {
        mode: 'fallback-navigation',
        reason: '首尾帧图片缺失，默认使用兜底导览转场',
        entryFocus: '从源热点区域进入',
        sourceFadePlan: '源页局部逐步退场',
        targetRevealPlan: '目标页主体逐步接管画面',
        midTransitionAction: '使用导览式揭示完成中段过渡',
        avoidances: ['不要晚切', '不要首帧自循环'],
      }
    }

    try {
      return await this.visionModule.planTransitionVisuals(
        edge,
        fromNode,
        toNode,
        guide,
        fromImage,
        toImage,
      )
    } catch (error: any) {
      const message = error?.message ? String(error.message) : '转场规划失败'
      return {
        mode: 'fallback-navigation',
        reason: `转场规划失败，回退为兜底导览转场：${message.slice(0, 120)}`,
        entryFocus: '从源热点区域进入',
        sourceFadePlan: '源页局部逐步退场',
        targetRevealPlan: '目标页主体逐步接管画面',
        midTransitionAction: '使用导览式揭示完成中段过渡',
        avoidances: ['不要晚切', '不要首帧自循环'],
      }
    }
  }

  private buildHotspotPositionCue(x?: number, y?: number): string {
    if (typeof x !== 'number' || typeof y !== 'number') return ''

    const horizontal =
      x < 0.33 ? 'left' :
      x > 0.67 ? 'right' :
      'center'
    const vertical =
      y < 0.33 ? 'upper' :
      y > 0.67 ? 'lower' :
      'middle'

    return `The source hotspot sits in the ${vertical}-${horizontal} part of the screen. Preserve that spatial origin during the initial zoom path before converging toward the destination layout.`
  }

  private buildElementBridgeCue(
    fromNode?: KnowledgeNode,
    toNode?: KnowledgeNode,
  ): string {
    const fromTokens = this.collectVisualAnchorTokens(fromNode)
    const toTokens = this.collectVisualAnchorTokens(toNode)
    const sharedTokens = fromTokens.filter(token => toTokens.includes(token)).slice(0, 3)

    if (sharedTokens.length > 0) {
      return `Shared endpoint token(s) that should guide the element-level bridge: ${sharedTokens.join(', ')}.`
    }

    return 'Find a real shared visual bridge across the endpoints and use it as the zoom-in anchor instead of introducing a generic tunnel or neutral transition layer.'
  }

  private collectVisualAnchorTokens(node?: KnowledgeNode): string[] {
    if (!node) return []

    const raw = [
      node.title,
      node.summary,
      ...(node.keyPoints ?? []),
      node.visualIntent,
      node.presentationIntent,
    ].filter(Boolean).join(' ')

    const matches = raw.match(/[A-Z][A-Z0-9-]{1,}/g) ?? []
    return Array.from(new Set(matches.map(token => token.trim()).filter(Boolean)))
  }

  private normalizeTransitionStyle(transitionStyle?: string): string {
    const raw = transitionStyle?.trim()
    if (!raw) return 'gentle push-in navigation with stable convergence into the target screen'

    const bannedTerms = [
      /翻页/iu,
      /翻书/iu,
      /书页/iu,
      /page[\s-]?turn/iu,
      /book[\s-]?flip/iu,
      /paper[\s-]?curl/iu,
      /card[\s-]?flip/iu,
      /swipe/iu,
    ]

    if (bannedTerms.some(pattern => pattern.test(raw))) {
      return 'gentle push-in navigation with stable convergence into the target screen'
    }

    return raw
  }
}
