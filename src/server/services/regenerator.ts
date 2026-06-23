import type { Repository } from '../storage/repository.js'
import type {
  KnowledgePackage,
  KnowledgeNode,
  KnowledgeEdge,
  NodeBuildRecord,
  EdgeBuildRecord,
} from '../../shared/types.js'
import { AppError } from '../middleware/app-error.js'
import { nowISO, getResolutionDimensions } from '../../shared/utils.js'
import { type ManifestBuilderContext, buildManifest, buildWorkspaceManifest } from './manifest-builder.js'
import type { PromptBuilder } from './prompt-builder.js'

import type * as vision from '../ai/vision.js'
import type * as image from '../ai/image.js'
import type * as video from '../ai/video.js'
import type * as media from '../ai/media.js'

const GENERATES_DIR = 'generates'

export interface RegeneratorDeps {
  repo: Repository
  visionModule: typeof vision
  imageModule: typeof image
  videoModule: typeof video
  mediaModule: typeof media
  promptBuilder: PromptBuilder
  manifestCtx: ManifestBuilderContext
  log: (generateId: string, message: string) => void
}

export async function regenerateHotspots(
  guideId: string,
  nodeId: string,
  deps: RegeneratorDeps,
) {
  const { repo, visionModule } = deps
  repo.refresh()
  const guides = repo.loadAllGuides()
  const guide = guides.get(guideId)
  if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)

  const node = guide.nodes.find(n => n.id === nodeId)
  if (!node) throw AppError.notFound(`Node "${nodeId}" not found`)
  if (!node.hotspots || node.hotspots.length === 0) return []

  const generates = repo.loadAllGenerates()
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
    source: 'manual' as const,
  }))

  const imageRelPath = `${GENERATES_DIR}/${generateId}/nodes/${nodeId}/image.png`
  const imageBuffer = repo.readFile(imageRelPath)
  if (!imageBuffer) throw AppError.validation(`Image not found for node "${nodeId}"`)

  let recommended: typeof manualHotspots = manualHotspots
  try {
    const visionResult = await visionModule.recommendHotspots(node, imageBuffer)
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

  repo.writeJson(
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
  repo.saveGuide(updatedGuide)

  try {
    const manifestPath = `publish/${guideId}/${guide.version}/manifest.json`
    const manifest = repo.readJson<any>(manifestPath)
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
      repo.writeJson(manifestPath, manifest)
    }
  } catch (e) {
    console.error(`[Pipeline] Failed to sync regenerated hotspots to manifest for guide ${guideId}:`, e)
  }

  return recommended
}

export async function runRegenerateNode(
  generateId: string,
  guide: KnowledgePackage,
  node: KnowledgeNode,
  deps: RegeneratorDeps,
) {
  const { repo, imageModule, promptBuilder, manifestCtx, log } = deps
  const nodeRecord: NodeBuildRecord = {
    buildId: generateId,
    nodeId: node.id,
    status: 'running',
    plannerStatus: 'success',
    imageStatus: 'running',
    updatedAt: nowISO(),
  }

  try {
    const imagePrompt = promptBuilder.buildImagePrompt(node, guide)

    repo.writeJson(
      `${GENERATES_DIR}/${generateId}/nodes/${node.id}/planner.json`,
      {
        nodeId: node.id,
        title: node.title,
        style: guide.style ?? 'morandi-journal',
        imagePrompt,
        summary: promptBuilder.getNodeSummary(node) ?? '',
        status: 'success',
      },
    )

    log(generateId, `[Regen] Generating image for "${node.id}"...`)
    const imageResult = await imageModule.generateNodeImage(
      node.id,
      imagePrompt,
      getResolutionDimensions(guide.resolution).width,
      getResolutionDimensions(guide.resolution).height,
    )

    const buildImagePath = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
    repo.copyFile(imageResult.localPath, buildImagePath)

    const publishImagePath = `publish/${guide.id}/${guide.version}/assets/nodes/${node.id}.png`
    if (repo.fileExists(publishImagePath)) {
      repo.copyFile(imageResult.localPath, publishImagePath)
    }

    const workspaceImagePath = `workspace/${guide.id}/nodes/${node.id}.png`
    repo.copyFile(imageResult.localPath, workspaceImagePath)
    const workspaceManifest = buildWorkspaceManifest(guide, manifestCtx)
    repo.writeJson(`workspace/${guide.id}/manifest.json`, workspaceManifest)

    nodeRecord.imageStatus = 'success'
    nodeRecord.imagePath = buildImagePath
    nodeRecord.modelInputUrl = imageResult.modelInputUrl
    nodeRecord.status = 'success'

    log(generateId, `[Regen] Node "${node.id}" done (cached: ${imageResult.fromCache})`)
  } catch (e: any) {
    nodeRecord.status = 'failed'
    nodeRecord.imageStatus = 'failed'
    nodeRecord.errorMessage = e.message
    log(generateId, `[Regen] Node "${node.id}" FAILED: ${e.message}`)
    console.error(`[Regen] Node "${node.id}" failed:`, e.message)
  }

  nodeRecord.updatedAt = nowISO()
  repo.saveNodeRecord(generateId, node.id, nodeRecord)
}

function resolveVideoFrameNodeId(guide: KnowledgePackage, nodeId: string): string {
  const node = guide.nodes.find(item => item.id === nodeId)
  if (!node) return nodeId
  return nodeId
}

export async function runRegenerateEdge(
  generateId: string,
  guide: KnowledgePackage,
  edge: KnowledgeEdge,
  fromNode: KnowledgeNode,
  toNode: KnowledgeNode,
  deps: RegeneratorDeps,
) {
  const { repo, videoModule, mediaModule, manifestCtx, log } = deps
  const promptBuilder = deps.promptBuilder
  const edgeRecord: EdgeBuildRecord = {
    buildId: generateId,
    edgeId: edge.id,
    status: 'running',
    promptStatus: 'running',
    videoStatus: 'pending',
    updatedAt: nowISO(),
  }

  try {
    const visualPlan = promptBuilder.resolveTransitionDescriptionMode?.(edge) === 'manual'
      ? promptBuilder.buildManualTransitionPlan(edge)
      : await promptBuilder.planTransitionVisuals(generateId, edge, fromNode, toNode, guide, repo)

    const transitionPrompt = promptBuilder.buildTransitionPrompt(edge, fromNode, toNode, guide, visualPlan)
    const transitionJsonPath = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.json`

    edgeRecord.promptStatus = 'success'
    edgeRecord.transitionStrategyMode = visualPlan.mode
    edgeRecord.transitionStrategyReason = visualPlan.reason
    edgeRecord.transitionPath = transitionJsonPath

    repo.writeJson(
      transitionJsonPath,
      {
        edgeId: edge.id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        relationLabel: edge.relationLabel,
        descriptionMode: promptBuilder.resolveTransitionDescriptionMode(edge),
        manualTransitionPrompt: promptBuilder.getManualTransitionDescription?.(edge) || undefined,
        strategyMode: visualPlan.mode,
        strategyReason: visualPlan.reason,
        visualPlan,
        prompt: transitionPrompt,
        status: 'running',
      },
    )

    const firstFrame = await mediaModule.exposeNodeImage(
      generateId,
      resolveVideoFrameNodeId(guide, edge.fromNodeId),
    )
    const lastFrame = await mediaModule.exposeNodeImage(
      generateId,
      resolveVideoFrameNodeId(guide, edge.toNodeId),
    )

    edgeRecord.videoStatus = 'running'
    log(generateId, `[Regen] Generating video "${edge.id}" (${edge.fromNodeId} → ${edge.toNodeId})...`)

    const videoResult = await videoModule.generateTransitionVideo(
      edge.id,
      edge.fromNodeId,
      edge.toNodeId,
      transitionPrompt,
      firstFrame.url,
      lastFrame.url,
      (status, taskId) => {
        log(generateId, `[Regen] "${edge.id}" video task ${taskId}: ${status}`)
      },
    )

    const buildVideoPath = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.mp4`
    const publishVideoPath = `publish/${guide.id}/${guide.version}/assets/edges/${edge.id}.mp4`

    repo.copyFile(videoResult.localPath, buildVideoPath)
    repo.copyFile(videoResult.localPath, publishVideoPath)

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

    repo.saveGuide(updatedGuide)
    const manifest = buildManifest(updatedGuide, generateId, manifestCtx)
    repo.writeJson(`publish/${guide.id}/${guide.version}/manifest.json`, manifest)

    const workspaceVideoPath = `workspace/${guide.id}/edges/${edge.id}.mp4`
    repo.copyFile(videoResult.localPath, workspaceVideoPath)
    const workspaceManifest = buildWorkspaceManifest(updatedGuide, manifestCtx)
    repo.writeJson(`workspace/${guide.id}/manifest.json`, workspaceManifest)

    log(generateId, `[Regen] Edge "${edge.id}" done (cached: ${videoResult.fromCache})`)
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

    repo.saveGuide(updatedGuide)

    edgeRecord.status = 'failed'
    edgeRecord.videoStatus = 'failed'
    edgeRecord.errorMessage = e.message
    log(generateId, `[Regen] Edge "${edge.id}" FAILED: ${e.message}`)
    console.error(`[Regen] Edge "${edge.id}" failed:`, e.message)
  }

  edgeRecord.updatedAt = nowISO()
  repo.saveEdgeRecord(generateId, edge.id, edgeRecord)
}
