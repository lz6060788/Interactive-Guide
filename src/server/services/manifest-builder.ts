import type { Repository } from '../storage/repository.js'
import type { KnowledgePackage, PublishManifest } from '../../shared/types.js'
import { nowISO } from '../../shared/utils.js'
import type { PromptBuilder } from './prompt-builder.js'

const GENERATES_DIR = 'generates'

export interface ManifestBuilderContext {
  repo: Repository
  promptBuilder: PromptBuilder
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'bmp', 'svg']

export function resolveNodeImageFileName(
  guide: KnowledgePackage,
  nodeId: string,
  repo: Repository,
): string | null {
  for (const ext of IMAGE_EXTENSIONS) {
    if (repo.fileExists(`workspace/${guide.id}/nodes/${nodeId}.${ext}`)) return `${nodeId}.${ext}`
  }
  return null
}

export function buildManifest(
  guide: KnowledgePackage,
  generateId: string,
  ctx: ManifestBuilderContext,
): PublishManifest {
  const { repo, promptBuilder } = ctx
  const mediaBase = `/api/media/${guide.id}/${guide.version}`

  const nodes = guide.nodes.map(n => {
    const summary = promptBuilder.getNodeSummary(n)
    const keyPoints = promptBuilder.getNodeKeyPoints(n)
    const imageFileName = resolveNodeImageFileName(guide, n.id, repo)
    const hasHtmlPreviewImage = imageFileName !== null

    const nodeKind = n.nodeKind ?? (n.contentType === 'html' ? 'html' : 'image')
    if (nodeKind === 'html') {
      return {
        id: n.id,
        title: n.title,
        summary: summary || undefined,
        keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        topicType: n.topicType,
        sourceText: n.sourceText?.trim() || undefined,
        contentType: 'html' as const,
        htmlUrl: `${mediaBase}/assets/nodes/${n.id}.html`,
        imageUrl: hasHtmlPreviewImage ? `${mediaBase}/assets/nodes/${imageFileName}` : undefined,
        hotspotEdgeIds: n.hotspotEdgeIds,
        imageFitMode: n.imageFitMode,
        nodeKind,
        surfaceConfig: n.surfaceConfig
          ? { ...n.surfaceConfig, sourceImageUrl: `${mediaBase}/assets/nodes/${imageFileName ?? `${n.id}.png`}` }
          : undefined,
        surfaceLayers: n.surfaceLayers,
        hotspots: [] as Array<{
          edgeId: string; targetNodeId: string; label: string
          normalizedX: number; normalizedY: number; radius?: number
          markerType: 'dot'
          style?: string
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
      imageUrl: `${mediaBase}/assets/nodes/${imageFileName ?? `${n.id}.png`}`,
      imageFitMode: n.imageFitMode,
      nodeKind,
      surfaceConfig: n.surfaceConfig
        ? { ...n.surfaceConfig, sourceImageUrl: `${mediaBase}/assets/nodes/${imageFileName ?? `${n.id}.png`}` }
        : undefined,
      surfaceLayers: n.surfaceLayers,
      hotspots: (n.hotspots ?? []).map(hs => ({
        edgeId: hs.edgeId,
        targetNodeId: hs.targetNodeId,
        label: hs.label,
        normalizedX: hs.normalizedX,
        normalizedY: hs.normalizedY,
        radius: hs.radius,
        markerType: 'dot' as const,
        style: hs.style,
      })),
    }
  })

  const edges = guide.edges.map(e => {
    const videoPath = `${GENERATES_DIR}/${generateId}/edges/${e.id}/transition.mp4`
    const hasVideo = repo.fileExists(videoPath)

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
    runtimeConfig: guide.runtimeConfig,
    infoOverlay: guide.infoOverlay,
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

export function buildWorkspaceManifest(
  guide: KnowledgePackage,
  ctx: ManifestBuilderContext,
): PublishManifest {
  const { repo, promptBuilder } = ctx
  const mediaBase = `/api/media/workspace/${guide.id}`

  const nodes = guide.nodes.map(n => {
    const summary = promptBuilder.getNodeSummary(n)
    const keyPoints = promptBuilder.getNodeKeyPoints(n)
    const imageFileName = resolveNodeImageFileName(guide, n.id, repo)
    const hasHtmlPreviewImage = imageFileName !== null

    const nodeKind = n.nodeKind ?? (n.contentType === 'html' ? 'html' : 'image')
    if (nodeKind === 'html') {
      return {
        id: n.id,
        title: n.title,
        keyContent: n.keyContent,
        summary: summary || undefined,
        keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        topicType: n.topicType,
        sourceText: n.sourceText?.trim() || undefined,
        visualIntent: n.visualIntent,
        hotspotHints: n.hotspotHints,
        presentationIntent: n.presentationIntent,
        imageStatus: n.imageStatus,
        status: n.status,
        extensions: n.extensions,
        contentType: 'html' as const,
        htmlSource: n.htmlSource,
        htmlUrl: `${mediaBase}/nodes/${n.id}.html`,
        imageUrl: hasHtmlPreviewImage ? `${mediaBase}/nodes/${imageFileName}` : undefined,
        hotspotEdgeIds: n.hotspotEdgeIds,
        imageFitMode: n.imageFitMode,
        nodeKind,
        surfaceConfig: n.surfaceConfig
          ? { ...n.surfaceConfig, sourceImageUrl: `${mediaBase}/nodes/${imageFileName ?? `${n.id}.png`}` }
          : undefined,
        surfaceLayers: n.surfaceLayers,
        hotspots: [] as Array<{
          edgeId: string; targetNodeId: string; label: string
          normalizedX: number; normalizedY: number; radius?: number
          markerType: 'dot'
          style?: string
        }>,
      }
    }

    return {
      id: n.id,
      title: n.title,
      keyContent: n.keyContent,
      summary: summary || undefined,
      keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
      topicType: n.topicType,
      sourceText: n.sourceText?.trim() || undefined,
      visualIntent: n.visualIntent,
      hotspotHints: n.hotspotHints,
      presentationIntent: n.presentationIntent,
      imageUrl: `${mediaBase}/nodes/${imageFileName ?? `${n.id}.png`}`,
      imageStatus: n.imageStatus,
      status: n.status,
      extensions: n.extensions,
      imageFitMode: n.imageFitMode,
      nodeKind,
      surfaceConfig: n.surfaceConfig
        ? { ...n.surfaceConfig, sourceImageUrl: `${mediaBase}/nodes/${imageFileName ?? `${n.id}.png`}` }
        : undefined,
      surfaceLayers: n.surfaceLayers,
      hotspots: (n.hotspots ?? []).map(hs => ({
        edgeId: hs.edgeId,
        targetNodeId: hs.targetNodeId,
        label: hs.label,
        normalizedX: hs.normalizedX,
        normalizedY: hs.normalizedY,
        radius: hs.radius,
        markerType: 'dot' as const,
        style: hs.style,
      })),
    }
  })

  const edges = guide.edges.map(e => {
    const videoPath = `workspace/${guide.id}/edges/${e.id}.mp4`
    const hasVideo = repo.fileExists(videoPath)

    return {
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      relationLabel: e.relationLabel,
      transitionDescriptionMode: e.transitionDescriptionMode,
      manualTransitionPrompt: e.manualTransitionPrompt,
      promptStatus: e.promptStatus,
      transitionStrategyMode: e.transitionStrategyMode,
      transitionStrategyReason: e.transitionStrategyReason,
      transitionPlan: e.transitionPlan,
      transitionPrompt: e.transitionPrompt,
      transitionPath: e.transitionPath,
      transitionType: e.transitionType,
      builtinTransition: e.builtinTransition,
      videoStatus: e.videoStatus,
      status: e.status,
      extensions: e.extensions,
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
    locale: guide.locale,
    description: guide.description,
    resolution: guide.resolution,
    visualStyle: guide.visualStyle,
    transitionStyle: guide.transitionStyle,
    style: guide.style,
    runtimeConfig: guide.runtimeConfig,
    infoOverlay: guide.infoOverlay,
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

export function syncAssetsToWorkspace(
  guide: KnowledgePackage,
  generateId: string,
  ctx: ManifestBuilderContext,
): void {
  const { repo } = ctx
  const workspaceDir = `workspace/${guide.id}`
  repo.ensureDir(`${workspaceDir}/nodes`)
  repo.ensureDir(`${workspaceDir}/edges`)

  for (const node of guide.nodes) {
    const nodeKind = node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')
    if (nodeKind === 'html') {
      const htmlSrc = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/content.html`
      if (repo.fileExists(htmlSrc)) {
        repo.copyFile(htmlSrc, `${workspaceDir}/nodes/${node.id}.html`)
      }
    } else {
      const src = `${GENERATES_DIR}/${generateId}/nodes/${node.id}/image.png`
      if (repo.fileExists(src)) {
        repo.copyFile(src, `${workspaceDir}/nodes/${node.id}.png`)
      }
    }
  }

  for (const edge of guide.edges) {
    const src = `${GENERATES_DIR}/${generateId}/edges/${edge.id}/transition.mp4`
    if (repo.fileExists(src)) {
      repo.copyFile(src, `${workspaceDir}/edges/${edge.id}.mp4`)
    }
  }

  const manifest = buildWorkspaceManifest(guide, ctx)
  repo.writeJson(`${workspaceDir}/manifest.json`, manifest)
}
