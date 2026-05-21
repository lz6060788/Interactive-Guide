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
export type TransitionStrategyMode = 'element-bridge' | 'fallback-navigation' | 'manual-directed'
export type TransitionDescriptionMode = 'auto' | 'manual'

// ─── Builtin Transition Types ─────────────────────────────────

export type BuiltinTransitionType = 'pan' | 'flip' | 'zoom'
export type ImageFitMode = 'fill' | 'fitHeight' | 'fitWidth'
export type EasingType = 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'

export interface PanTransitionConfig {
  type: 'pan'
  direction: 'left' | 'right' | 'up' | 'down'
  duration: number
  easing: EasingType
}

export interface FlipTransitionConfig {
  type: 'flip'
  direction: 'horizontal' | 'vertical'
  flipStyle: 'fade' | 'cut' | 'curl'
  duration: number
  easing: EasingType
}

export interface ZoomTransitionConfig {
  type: 'zoom'
  direction: 'in' | 'out'
  scale: number
  centerX: number
  centerY: number
  duration: number
  easing: EasingType
}

export type BuiltinTransitionConfig = PanTransitionConfig | FlipTransitionConfig | ZoomTransitionConfig
export type NodeTopicType =
  | 'general'
  | 'news-report'
  | 'common-knowledge'
  | 'content-analysis'
  | (string & {})

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

/** Aspect ratio of the knowledge package canvas. Only 16:9 (landscape) or 9:16 (portrait). */
export type PackageResolution = '16:9' | '9:16'

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
  keyContent?: string
  sourceText?: string
  summary?: string
  keyPoints?: string[]
  topicType?: NodeTopicType
  visualIntent?: string
  hotspotHints?: string[]
  presentationIntent?: string
  imageUrl?: string
  imageStatus?: ResourceStatus
  hotspots?: NodeHotspot[]
  status?: NodeStatus
  extensions?: Record<string, unknown>
  /** Node content type: 'image' (default, AI-generated PNG) or 'html' (local HTML file) */
  contentType?: 'image' | 'html'
  /** HTML file path relative to guide data directory (required when contentType === 'html') */
  htmlSource?: string
  /** Edge IDs declared by this HTML node for interaction hotspots (used for validation) */
  hotspotEdgeIds?: string[]
  /** Image fill mode: 'fill' (stretch, default), 'fitHeight' (equal ratio by height, draggable), 'fitWidth' (equal ratio by width, draggable) */
  imageFitMode?: ImageFitMode
}

export interface KnowledgeEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationLabel?: string
  transitionDescriptionMode?: TransitionDescriptionMode
  manualTransitionPrompt?: string
  promptStatus?: SubTaskStatus
  transitionStrategyMode?: TransitionStrategyMode
  transitionStrategyReason?: string
  transitionPlan?: TransitionVisualPlan
  transitionPrompt?: string
  transitionPath?: string
  videoUrl?: string
  videoStatus?: ResourceStatus
  status?: EdgeStatus
  transitionType?: 'video' | 'builtin' | 'none'
  builtinTransition?: BuiltinTransitionConfig
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
  /** Infographic style key (e.g. 'morandi-journal', 'pop-laboratory') */
  style?: string
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
  modelInputUrl?: string
  objectStorageKey?: string
  objectStorageUrl?: string
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
  transitionStrategyMode?: TransitionStrategyMode
  transitionStrategyReason?: string
  transitionPath?: string
  videoPath?: string
  errorMessage?: string
  updatedAt: string
}

export interface TransitionVisualPlan {
  mode: TransitionStrategyMode
  reason: string
  entryFocus: string
  openingPhase: string
  handoffPhase: string
  landingPhase: string
  avoidances?: string[]
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
  keyPoints?: string[]
  topicType?: NodeTopicType
  sourceText?: string
  imageUrl?: string
  hotspots: PublishHotspot[]
  /** Node content type: 'image' (default) or 'html' */
  contentType?: 'image' | 'html'
  /** HTML resource URL (API media path or bundle relative path) */
  htmlUrl?: string
  /** Edge IDs declared by this HTML node for interaction hotspots */
  hotspotEdgeIds?: string[]
  /** Image fill mode: 'fill' (stretch, default), 'fitHeight' (equal ratio by height, draggable), 'fitWidth' (equal ratio by width, draggable) */
  imageFitMode?: ImageFitMode
}

export interface PublishEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationLabel?: string
  transitionType?: 'video' | 'builtin' | 'none'
  builtinTransition?: BuiltinTransitionConfig
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
  summary?: string
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

export interface RuntimeBundlePayload {
  bundleId: string
  guideId: string
  version: string
  generatedAt: string
  entryUrl: string
  manifestUrl: string
  bundleUrl: string
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
