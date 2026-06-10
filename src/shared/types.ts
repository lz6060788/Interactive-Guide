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
export type HtmlIframePreloadStrategy = 'all' | 'current-node' | 'on-demand'
export type NodeKind = 'surface' | 'image' | 'html'
export type CoordSpace = 'surface-normalized'

export interface NormalizedPoint {
  x: number
  y: number
}

export interface ZoomFocusQuad {
  topLeft: NormalizedPoint
  topRight: NormalizedPoint
  bottomRight: NormalizedPoint
  bottomLeft: NormalizedPoint
}

export type QuadRange = ZoomFocusQuad

export interface CameraState {
  centerX: number
  centerY: number
  zoom: number
}

export interface CameraBounds {
  minZoom: number
  maxZoom: number
}

export interface SurfaceConfig {
  sourceImageUrl: string
  coordSpace: CoordSpace
  initialCamera: CameraState
  bounds: CameraBounds
  gesture: {
    wheelZoom: true
    dragPan: true
    pinchZoom?: true
    inertia?: boolean
  }
}

export type RuntimeAction =
  | { type: 'navigate-edge'; edgeId: string }
  | { type: 'open-route'; route: string; openMode?: 'current-tab' | 'new-tab' }
  | { type: 'open-url'; url: string; target?: '_self' | '_blank' }

export interface SurfaceStockItem {
  label: string
  valueText?: string
  action?: RuntimeAction
}

export interface SurfaceCallout {
  fromDock: 'top' | 'right' | 'bottom' | 'left'
  target: NormalizedPoint
}

export interface SurfaceCard {
  id: string
  title: string
  description?: string
  anchor: NormalizedPoint
  coordSpace: CoordSpace
  tags?: string[]
  stocks?: SurfaceStockItem[]
  callout?: SurfaceCallout
}

export interface SurfaceLayerVisibilityRule {
  minZoom: number
  cardsMinZoom?: number
  hotspotsMinZoom?: number
}

export type SurfaceHotspotTarget =
  | {
      type: 'camera-preset'
      camera: CameraState
    }
  | {
      type: 'focus-layer'
      layerId: string
    }
  | {
      type: 'edge'
      edgeId: string
    }

export interface SurfaceHotspot {
  id: string
  label: string
  anchor: NormalizedPoint
  coordSpace: CoordSpace
  style?: string
  target: SurfaceHotspotTarget
}

export interface SurfaceFocusLayer {
  id: string
  primaryCategory?: string
  title: string
  visibility: SurfaceLayerVisibilityRule
  cameraPreset?: CameraState
  cards: SurfaceCard[]
  hotspots: SurfaceHotspot[]
}

export interface CameraTweenConfig {
  duration: number
  easing: EasingType
}

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
  scale?: number
  centerX?: number
  centerY?: number
  focusMode?: 'center' | 'quad'
  focusQuad?: ZoomFocusQuad
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

/** Canvas resolution preset of the knowledge package. */
export type PackageResolution = '16:9' | '9:16' | '375*808'

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
  /** Optional inline CSS declarations applied to this hotspot button. */
  style?: string
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
  /** Resolved HTML file URL (set by build pipeline or upload) */
  htmlUrl?: string
  /** Edge IDs declared by this HTML node for interaction hotspots (used for validation) */
  hotspotEdgeIds?: string[]
  /** Image fill mode: 'fill' (stretch, default), 'fitHeight' (equal ratio by height, draggable), 'fitWidth' (equal ratio by width, draggable) */
  imageFitMode?: ImageFitMode
  /** Explicit node render kind. */
  nodeKind?: NodeKind
  /** Surface node camera and input configuration. Required when nodeKind === 'surface'. */
  surfaceConfig?: SurfaceConfig
  /** Surface content layers that appear at different zoom levels. */
  surfaceLayers?: SurfaceFocusLayer[]
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

export interface RuntimeConfig {
  /**
   * Controls when HTML node iframes are warmed up.
   * - 'all': eagerly preload every HTML node after runtime bootstraps.
   * - 'current-node': preload direct HTML children of the current node.
   * - 'on-demand': wait until the related hotspot/edge is triggered.
   */
  htmlIframePreloadStrategy?: HtmlIframePreloadStrategy
}

export interface InfoOverlaySection {
  heading: string
  body: string
}

export interface InfoOverlayConfig {
  title?: string
  sections: InfoOverlaySection[]
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
  runtimeConfig?: RuntimeConfig
  infoOverlay?: InfoOverlayConfig
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
  /** Optional inline CSS declarations applied to this hotspot button. */
  style?: string
}

export interface PublishNode {
  id: string
  title: string
  keyContent?: string
  summary?: string
  keyPoints?: string[]
  topicType?: NodeTopicType
  sourceText?: string
  visualIntent?: string
  hotspotHints?: string[]
  presentationIntent?: string
  imageUrl?: string
  imageStatus?: ResourceStatus
  hotspots: PublishHotspot[]
  status?: NodeStatus
  extensions?: Record<string, unknown>
  /** Node content type: 'image' (default) or 'html' */
  contentType?: 'image' | 'html'
  /** HTML file path relative to workspace package directory */
  htmlSource?: string
  /** HTML resource URL (API media path or bundle relative path) */
  htmlUrl?: string
  /** Edge IDs declared by this HTML node for interaction hotspots */
  hotspotEdgeIds?: string[]
  /** Image fill mode: 'fill' (stretch, default), 'fitHeight' (equal ratio by height, draggable), 'fitWidth' (equal ratio by width, draggable) */
  imageFitMode?: ImageFitMode
  /** Explicit node render kind. */
  nodeKind?: NodeKind
  /** Surface node camera and input configuration. Required when nodeKind === 'surface'. */
  surfaceConfig?: SurfaceConfig
  /** Surface content layers that appear at different zoom levels. */
  surfaceLayers?: SurfaceFocusLayer[]
}

export interface PublishEdge {
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
  transitionType?: 'video' | 'builtin' | 'none'
  builtinTransition?: BuiltinTransitionConfig
  videoUrl?: string
  videoStatus?: ResourceStatus
  status?: EdgeStatus
  extensions?: Record<string, unknown>
}

export interface PublishManifest {
  packageId: string
  version: string
  title: string
  rootNodeId: 'root'
  locale?: string
  description?: string
  resolution: PackageResolution
  visualStyle?: string
  transitionStyle?: string
  style?: string
  runtimeConfig?: RuntimeConfig
  infoOverlay?: InfoOverlayConfig
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
