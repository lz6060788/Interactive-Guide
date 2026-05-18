// ============================================================
// Interactive Guide - Guide Service (Business Logic)
// ============================================================
// All guide/node/edge CRUD logic.
// Depends on Repository interface — does NOT import FsRepository.
// Throws AppError for controlled HTTP error responses.

import type { Repository } from '../storage/repository.js'
import type {
  KnowledgePackage,
  KnowledgeNode,
  KnowledgeEdge,
  NodeHotspot,
  PackageListItem,
  PublishManifest,
} from '../../shared/types.js'
import { validateKnowledgePackage } from '../../shared/validators.js'
import { nowISO } from '../../shared/utils.js'
import { AppError } from '../middleware/app-error.js'

export class GuideService {
  constructor(private repo: Repository) {}

  // ─── Guide CRUD ────────────────────────────────────────

  listGuides(): PackageListItem[] {
    this.repo.refresh()
    const guides = this.repo.loadAllGuides()
    const generates = this.repo.loadAllGenerates()
    return Array.from(guides.values()).map(pkg => {
      // Find latest generate for this guide
      const guideGenerates = Array.from(generates.values())
        .filter(g => g.packageId === pkg.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const latest = guideGenerates[0]
      return {
        id: pkg.id,
        title: pkg.title,
        version: pkg.version,
        resolution: pkg.resolution,
        nodeCount: pkg.nodes.length,
        edgeCount: pkg.edges.length,
        latestBuildStatus: latest?.status,
        updatedAt: pkg.metadata?.updatedAt,
      }
    })
  }

  getGuide(id: string): KnowledgePackage {
    this.repo.refresh()
    const guide = this.repo.loadAllGuides().get(id)
    if (!guide) throw AppError.notFound(`Guide "${id}" not found`)

    // Merge latest build results into nodes
    const generates = this.repo.loadAllGenerates()
    const latest = Array.from(generates.values())
      .filter(g => g.packageId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

    if (latest) {
      for (const node of guide.nodes) {
        // Prefer workspace assets over generate history
        const workspaceImagePath = `workspace/${guide.id}/nodes/${node.id}.png`
        if (this.repo.fileExists(workspaceImagePath)) {
          node.imageStatus = 'success'
          node.imageUrl = `/api/media/workspace/${guide.id}/nodes/${node.id}.png`
          continue
        }

        const record = this.repo.readJson<{
          status?: string
          imageStatus?: string
          imagePath?: string
        }>(`generates/${latest.buildId}/nodes/${node.id}/node-record.json`)
        if (record) {
          node.status = (record.status as any) ?? node.status
          node.imageStatus = (record.imageStatus as any) ?? node.imageStatus
          if (record.imagePath) {
            node.imageUrl = `/api/media/generates/${latest.buildId}/nodes/${node.id}/image.png`
          }
        }
      }

      for (const edge of guide.edges) {
        // Prefer workspace assets over generate history
        const workspaceVideoPath = `workspace/${guide.id}/edges/${edge.id}.mp4`
        if (this.repo.fileExists(workspaceVideoPath)) {
          edge.videoStatus = 'success'
          edge.videoUrl = `/api/media/workspace/${guide.id}/edges/${edge.id}.mp4`
          continue
        }

        const record = this.repo.readJson<{
          status?: string
          videoStatus?: string
          videoPath?: string
        }>(`generates/${latest.buildId}/edges/${edge.id}/edge-record.json`)
        if (record) {
          edge.status = (record.status as any) ?? edge.status
          edge.videoStatus = (record.videoStatus as any) ?? edge.videoStatus
          if (record.videoPath) {
            edge.videoUrl = `/api/media/generates/${latest.buildId}/edges/${edge.id}/transition.mp4`
          }
        }
      }
    }

    return guide
  }

  importGuide(data: unknown): KnowledgePackage {
    const validation = validateKnowledgePackage(data as KnowledgePackage)
    if (!validation.valid) {
      throw AppError.validation(`Invalid guide: ${validation.errors.join('; ')}`)
    }

    const guide: KnowledgePackage = {
      ...(data as KnowledgePackage),
      metadata: {
        createdAt: (data as KnowledgePackage).metadata?.createdAt ?? nowISO(),
        updatedAt: nowISO(),
      },
    }

    this.repo.saveGuide(guide)
    return guide
  }

  updateGuide(id: string, updates: Partial<KnowledgePackage>): KnowledgePackage {
    const guide = this.getGuide(id)

    // Prevent overwriting structural fields
    const safeUpdates = { ...updates }
    delete safeUpdates.id
    delete safeUpdates.nodes
    delete safeUpdates.edges

    const updated: KnowledgePackage = {
      ...guide,
      ...safeUpdates,
      id: guide.id,
      nodes: guide.nodes,
      edges: guide.edges,
      metadata: {
        ...guide.metadata,
        updatedAt: nowISO(),
      },
    }

    this.repo.saveGuide(updated)
    return updated
  }

  deleteGuide(id: string): void {
    // Verify guide exists
    this.getGuide(id)
    this.repo.deleteGuide(id)
  }

  // ─── Node CRUD ─────────────────────────────────────────

  updateNode(guideId: string, nodeId: string, updates: Partial<KnowledgeNode>): KnowledgeNode {
    const guide = this.getGuide(guideId)
    const idx = guide.nodes.findIndex(n => n.id === nodeId)
    if (idx === -1) throw AppError.notFound(`Node "${nodeId}" not found in guide "${guideId}"`)

    // Prevent overwriting id
    const safeUpdates = { ...updates }
    delete safeUpdates.id

    guide.nodes[idx] = { ...guide.nodes[idx], ...safeUpdates, id: guide.nodes[idx].id }
    guide.metadata = { ...guide.metadata, updatedAt: nowISO() }
    this.repo.saveGuide(guide)
    return guide.nodes[idx]
  }

  updateHotspots(
    guideId: string,
    nodeId: string,
    hotspots: Array<{
      edgeId: string
      targetNodeId: string
      label: string
      normalizedX: number
      normalizedY: number
      radius?: number
    }>,
  ): KnowledgeNode {
    const guide = this.getGuide(guideId)
    const node = guide.nodes.find(n => n.id === nodeId)
    if (!node) throw AppError.notFound(`Node "${nodeId}" not found`)

    // Validate normalized coordinates
    for (const hs of hotspots) {
      if (typeof hs.normalizedX !== 'number' || hs.normalizedX < 0 || hs.normalizedX > 1) {
        throw AppError.validation(`Hotspot normalizedX must be in [0,1], got ${hs.normalizedX}`)
      }
      if (typeof hs.normalizedY !== 'number' || hs.normalizedY < 0 || hs.normalizedY > 1) {
        throw AppError.validation(`Hotspot normalizedY must be in [0,1], got ${hs.normalizedY}`)
      }
      // Verify edge reference exists
      if (!guide.edges.some(e => e.id === hs.edgeId)) {
        throw AppError.validation(`Edge "${hs.edgeId}" not found in guide`)
      }
      // Verify target node reference exists
      if (!guide.nodes.some(n => n.id === hs.targetNodeId)) {
        throw AppError.validation(`Target node "${hs.targetNodeId}" not found in guide`)
      }
    }

    node.hotspots = hotspots.map(hs => ({
      ...hs,
      x: Math.round(hs.normalizedX * guide.resolution.width),
      y: Math.round(hs.normalizedY * guide.resolution.height),
      radius: hs.radius ?? 12,
    }))

    guide.metadata = { ...guide.metadata, updatedAt: nowISO() }
    this.repo.saveGuide(guide)

    // --- Sync to manifest if it exists ---
    try {
      const manifestPath = `publish/${guideId}/${guide.version}/manifest.json`
      // We must clear fs-repository cache for this file before reading
      // to ensure we're reading the latest content before modifying
      const manifest = this.repo.readJson<any>(manifestPath)
      if (manifest && manifest.nodes) {
        const updatedHotspots = node.hotspots?.map(hs => ({
          edgeId: hs.edgeId,
          targetNodeId: hs.targetNodeId,
          label: hs.label,
          normalizedX: hs.normalizedX,
          normalizedY: hs.normalizedY,
          radius: hs.radius,
          markerType: 'dot',
        })) || []

        manifest.nodes = manifest.nodes.map((n: any) => {
          if (n.id === nodeId) {
            return {
              ...n,
              hotspots: updatedHotspots,
            }
          }
          return n
        })
        if (manifest.nodeMap?.[nodeId]) {
          manifest.nodeMap[nodeId] = {
            ...manifest.nodeMap[nodeId],
            hotspots: updatedHotspots,
          }
        }
        this.repo.writeJson(manifestPath, manifest)
        
        // Ensure changes are flushed immediately (though fs is sync, good practice)
        console.log(`[updateHotspots] Synced to manifest: ${manifestPath}`)
      }
    } catch (e) {
      console.warn(`Failed to sync hotspots to manifest for guide ${guideId}:`, e)
    }

    return node
  }

  addNode(guideId: string, parentId: string, nodeData: { title: string; keyContent?: string }): KnowledgeNode {
    const guide = this.getGuide(guideId)

    // Validate parent exists
    const parentNode = guide.nodes.find(n => n.id === parentId)
    if (!parentNode) throw AppError.notFound(`Parent node "${parentId}" not found`)

    // Generate unique node id
    const nodeId = `node_${Date.now()}`

    // Create the new node
    const newNode: KnowledgeNode = {
      id: nodeId,
      title: nodeData.title,
      keyContent: nodeData.keyContent ?? '待补充',
      status: 'draft',
      hotspots: [],
    }

    // Generate edge id and create edge
    const edgeId = `edge_${parentId}_${nodeId}`
    const newEdge: KnowledgeEdge = {
      id: edgeId,
      fromNodeId: parentId,
      toNodeId: nodeId,
      relationLabel: '',
      status: 'draft',
    }

    // Add hotspot to parent node
    const hotspot: NodeHotspot = {
      edgeId,
      targetNodeId: nodeId,
      label: nodeData.title,
      x: Math.round(0.5 * guide.resolution.width),
      y: Math.round(0.5 * guide.resolution.height),
      normalizedX: 0.5,
      normalizedY: 0.5,
      radius: 12,
    }

    if (!parentNode.hotspots) parentNode.hotspots = []
    parentNode.hotspots.push(hotspot)

    guide.nodes.push(newNode)
    guide.edges.push(newEdge)
    guide.metadata = { ...guide.metadata, updatedAt: nowISO() }
    this.repo.saveGuide(guide)

    return newNode
  }

  deleteNode(guideId: string, nodeId: string): void {
    const guide = this.getGuide(guideId)

    if (nodeId === 'root') throw AppError.validation('Cannot delete root node')

    const nodeIdx = guide.nodes.findIndex(n => n.id === nodeId)
    if (nodeIdx === -1) throw AppError.notFound(`Node "${nodeId}" not found`)

    // Remove all edges connected to this node
    guide.edges = guide.edges.filter(
      e => e.fromNodeId !== nodeId && e.toNodeId !== nodeId,
    )

    // Remove hotspots targeting this node from all nodes
    for (const node of guide.nodes) {
      if (node.hotspots) {
        node.hotspots = node.hotspots.filter(hs => hs.targetNodeId !== nodeId)
      }
    }

    // Remove the node
    guide.nodes.splice(nodeIdx, 1)

    guide.metadata = { ...guide.metadata, updatedAt: nowISO() }
    this.repo.saveGuide(guide)
  }

  // ─── Edge CRUD ─────────────────────────────────────────

  updateEdge(guideId: string, edgeId: string, updates: Partial<KnowledgeEdge>): KnowledgeEdge {
    const guide = this.getGuide(guideId)
    const idx = guide.edges.findIndex(e => e.id === edgeId)
    if (idx === -1) throw AppError.notFound(`Edge "${edgeId}" not found`)

    // Prevent overwriting structural fields
    const safeUpdates = { ...updates }
    delete safeUpdates.id
    delete safeUpdates.fromNodeId
    delete safeUpdates.toNodeId

    guide.edges[idx] = { ...guide.edges[idx], ...safeUpdates, id: guide.edges[idx].id }
    guide.metadata = { ...guide.metadata, updatedAt: nowISO() }
    this.repo.saveGuide(guide)
    return guide.edges[idx]
  }

  // ─── Manifest ──────────────────────────────────────────

  getManifest(guideId: string): PublishManifest | null {
    this.repo.refresh()
    const guide = this.repo.loadAllGuides().get(guideId)
    if (!guide) return null

    // Try workspace first, then fall back to publish
    const workspaceManifest = this.repo.readJson<PublishManifest>(
      `workspace/${guideId}/manifest.json`,
    )
    if (workspaceManifest) return workspaceManifest

    return this.repo.readJson<PublishManifest>(
      `publish/${guideId}/${guide.version}/manifest.json`,
    )
  }

  // ─── Upload ──────────────────────────────────────────────

  uploadNodeImage(guideId: string, nodeId: string, buffer: Buffer): { imageUrl: string } {
    this.repo.refresh()
    const guide = this.repo.loadAllGuides().get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)
    if (!guide.nodes.some(n => n.id === nodeId)) {
      throw AppError.notFound(`Node "${nodeId}" not found in guide "${guideId}"`)
    }

    const filePath = `workspace/${guideId}/nodes/${nodeId}.png`
    this.repo.ensureDir(`workspace/${guideId}/nodes`)
    this.repo.writeFile(filePath, buffer)

    // Update workspace manifest if it exists
    this.patchWorkspaceManifest(guideId, manifest => {
      const node = manifest.nodes.find(n => n.id === nodeId)
      if (node) {
        node.imageUrl = `/api/media/workspace/${guideId}/nodes/${nodeId}.png`
      }
      if (manifest.nodeMap?.[nodeId]) {
        manifest.nodeMap[nodeId].imageUrl = `/api/media/workspace/${guideId}/nodes/${nodeId}.png`
      }
    })

    return { imageUrl: `/api/media/workspace/${guideId}/nodes/${nodeId}.png` }
  }

  uploadEdgeVideo(guideId: string, edgeId: string, buffer: Buffer): { videoUrl: string } {
    this.repo.refresh()
    const guide = this.repo.loadAllGuides().get(guideId)
    if (!guide) throw AppError.notFound(`Guide "${guideId}" not found`)
    if (!guide.edges.some(e => e.id === edgeId)) {
      throw AppError.notFound(`Edge "${edgeId}" not found in guide "${guideId}"`)
    }

    const filePath = `workspace/${guideId}/edges/${edgeId}.mp4`
    this.repo.ensureDir(`workspace/${guideId}/edges`)
    this.repo.writeFile(filePath, buffer)

    // Update workspace manifest if it exists
    this.patchWorkspaceManifest(guideId, manifest => {
      const edge = manifest.edges.find(e => e.id === edgeId)
      if (edge) {
        edge.videoUrl = `/api/media/workspace/${guideId}/edges/${edgeId}.mp4`
      }
      if (manifest.edgeMap?.[edgeId]) {
        manifest.edgeMap[edgeId].videoUrl = `/api/media/workspace/${guideId}/edges/${edgeId}.mp4`
      }
    })

    return { videoUrl: `/api/media/workspace/${guideId}/edges/${edgeId}.mp4` }
  }

  private patchWorkspaceManifest(
    guideId: string,
    patcher: (manifest: PublishManifest) => void,
  ): void {
    const manifest = this.getManifest(guideId)
    if (!manifest) return
    patcher(manifest)
    this.repo.writeJson(`workspace/${guideId}/manifest.json`, manifest)
  }
}
