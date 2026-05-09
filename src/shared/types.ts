// ============================================================
// Interactive Guide - Shared Type Definitions
// ============================================================
// All types in this file are shared between server, admin, and runtime.
// Changes here affect every layer.

// ─── Primitive Types ────────────────────────────────────────

export type ResourceStatus = 'idle' | 'running' | 'success' | 'failed'
export type NodeStatus = 'draft' | 'ready' | 'archived'
export type EdgeStatus = 'draft' | 'ready' | 'archived'
export type BuildStatus = 'pending' | 'running' | 'partial_failed' | 'success' | 'failed'
export type SubTaskStatus = 'pending' | 'running' | 'success' | 'failed'

export type BuildCurrentStage =
  | 'validate'
  | 'prepare'
  | 'gen_nodes'
  | 'gen_hotspots'
  | 'gen_edges'
  | 'publish'
  | 'done'

// Legacy aliases for backward compatibility
export type GenerateCurrentStage = BuildCurrentStage

// ─── Resolution ─────────────────────────────────────────────

export interface PackageResolution {
  width: number
  height: number
}

// ─── Knowledge Layer ────────────────────────────────────────

export interface NodeHotspot {
  edgeId: string
  targetNodeId: string
  label: string
  x: number
  y: number
  normalizedX: number
  normalizedY: number
  radius?: number
  status?: ResourceStatus
}

export interface KnowledgeNode {
  id: string
  title: string
  keyContent: string
  presentationIntent?: string
  imageUrl?: string
  imageStatus?: ResourceStatus
  hotspots?: NodeHotspot[]
  status?: NodeStatus
  extensions?: Record<string, unknown>
}

export interface KnowledgeEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationLabel?: string
  videoUrl?: string
  videoStatus?: ResourceStatus
  status?: EdgeStatus
  extensions?: Record<string, unknown>
}

export interface PackageMetadata {
  createdAt?: string
  updatedAt?: string
}

export interface KnowledgePackage {
  id: string
  title: string
  version: string
  locale?: string
  description?: string
  resolution: PackageResolution
  visualStyle?: string
  transitionStyle?: string
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  metadata?: PackageMetadata
}

// ─── Build Record Layer ─────────────────────────────────────

export interface PackageBuildRecord {
  buildId: string
  packageId: string
  packageVersion: string
  status: BuildStatus
  currentStage: BuildCurrentStage
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  summary: {
    nodeTotal: number
    nodeSuccess: number
    hotspotTotal: number
    hotspotReady: number
    edgeTotal: number
    edgeSuccess: number
  }
}

export interface NodeBuildRecord {
  buildId: string
  nodeId: string
  status: SubTaskStatus
  plannerStatus: SubTaskStatus
  imageStatus: SubTaskStatus
  plannerOutputPath?: string
  imagePath?: string
  errorMessage?: string
  updatedAt: string
}

export interface HotspotBuildRecord {
  buildId: string
  nodeId: string
  status: SubTaskStatus
  recommendationStatus: SubTaskStatus
  manualAdjusted: boolean
  recommendedPath?: string
  finalPath?: string
  errorMessage?: string
  updatedAt: string
}

export interface EdgeBuildRecord {
  buildId: string
  edgeId: string
  status: SubTaskStatus
  promptStatus: SubTaskStatus
  videoStatus: SubTaskStatus
  transitionPath?: string
  videoPath?: string
  errorMessage?: string
  updatedAt: string
}

// ─── Publish Layer ──────────────────────────────────────────

export interface PublishHotspot {
  edgeId: string
  targetNodeId: string
  label: string
  normalizedX: number
  normalizedY: number
  radius?: number
  markerType: 'dot'
}

export interface PublishNode {
  id: string
  title: string
  summary?: string
  imageUrl: string
  hotspots: PublishHotspot[]
}

export interface PublishEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationLabel?: string
  videoUrl?: string
}

export interface PublishManifest {
  packageId: string
  version: string
  title: string
  rootNodeId: 'root'
  resolution: PackageResolution
  visualStyle?: string
  transitionStyle?: string
  nodes: PublishNode[]
  edges: PublishEdge[]
  nodeMap: Record<string, PublishNode>
  edgeMap: Record<string, PublishEdge>
  metadata: {
    generatedAt: string
    manifestVersion: string
  }
}

// ─── Runtime State ──────────────────────────────────────────

export type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'transitioning' | 'error'

export interface RuntimeState {
  manifest: PublishManifest | null
  currentNodeId: string
  currentEdgeId?: string
  status: RuntimeStatus
}

// ─── Admin UI State ─────────────────────────────────────────

export interface PackageListItem {
  id: string
  title: string
  version: string
  resolution: PackageResolution
  nodeCount: number
  edgeCount: number
  latestBuildStatus?: BuildStatus
  updatedAt?: string
}

export interface FlowNodeData {
  id: string
  title: string
  presentationIntent?: string
  imageStatus?: ResourceStatus
  hotspotCount?: number
}

export interface FlowEdgeData {
  id: string
  relationLabel?: string
  videoStatus?: ResourceStatus
}

export interface BuildSummaryPayload {
  buildId: string
  status: BuildStatus
  currentStage: string
  nodeSummary: {
    total: number
    success: number
    failed: number
  }
  hotspotSummary: {
    total: number
    ready: number
    pending: number
  }
  edgeSummary: {
    total: number
    success: number
    failed: number
  }
}

export interface PreviewSessionPayload {
  manifest: PublishManifest
  mode: 'preview' | 'published'
}

export interface UpdateHotspotsPayload {
  nodeId: string
  hotspots: Array<{
    edgeId: string
    targetNodeId: string
    label: string
    normalizedX: number
    normalizedY: number
    radius?: number
  }>
}

// ─── Design Document Type Aliases ─────────────────────────
// These aliases match the type names used in design documents.
// Use these in new code; legacy names remain for backward compatibility.

export type Guide = KnowledgePackage
export type GuideListItem = PackageListItem
export type GenerateRecord = PackageBuildRecord
export type NodeGenerateRecord = NodeBuildRecord
export type EdgeGenerateRecord = EdgeBuildRecord
export type HotspotGenerateRecord = HotspotBuildRecord
export type Manifest = PublishManifest
export type GuideResolution = PackageResolution
