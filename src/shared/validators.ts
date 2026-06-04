// ============================================================
// Interactive Guide - Schema Validators
// ============================================================
// Lightweight validation functions for KnowledgePackage and PublishManifest.
// No Zod dependency in shared — pure runtime checks.

import type {
  RuntimeConfig,
  KnowledgePackage,
  KnowledgeNode,
  KnowledgeEdge,
  PublishManifest,
  QuadRange,
  SurfaceConfig,
  SurfaceFocusLayer,
  SurfaceCard,
  SurfaceHotspot,
  CameraState,
} from './types.js'
import { isPackageResolution, PACKAGE_RESOLUTIONS } from './utils.js'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function validateNormalizedPoint(
  point: unknown,
  label: string,
  errors: string[],
) {
  if (!point || typeof point !== 'object') {
    errors.push(`${label} must be an object with x/y`)
    return
  }

  const { x, y } = point as { x?: unknown, y?: unknown }
  if (typeof x !== 'number' || x < 0 || x > 1) {
    errors.push(`${label}.x must be 0~1, got ${String(x)}`)
  }
  if (typeof y !== 'number' || y < 0 || y > 1) {
    errors.push(`${label}.y must be 0~1, got ${String(y)}`)
  }
}

function validateBuiltinTransitionConfig(
  config: unknown,
  edgeLabel: string,
  errors: string[],
) {
  if (!config || typeof config !== 'object') return

  const builtin = config as {
    type?: unknown
    scale?: unknown
    centerX?: unknown
    centerY?: unknown
    focusMode?: unknown
    focusQuad?: Record<string, unknown>
  }

  if (builtin.type !== 'zoom') return

  if (builtin.scale != null && (typeof builtin.scale !== 'number' || builtin.scale <= 1)) {
    errors.push(`${edgeLabel} zoom scale must be > 1, got ${String(builtin.scale)}`)
  }
  if (builtin.centerX != null && (typeof builtin.centerX !== 'number' || builtin.centerX < 0 || builtin.centerX > 1)) {
    errors.push(`${edgeLabel} zoom centerX must be 0~1, got ${String(builtin.centerX)}`)
  }
  if (builtin.centerY != null && (typeof builtin.centerY !== 'number' || builtin.centerY < 0 || builtin.centerY > 1)) {
    errors.push(`${edgeLabel} zoom centerY must be 0~1, got ${String(builtin.centerY)}`)
  }

  if (
    builtin.focusMode != null
    && builtin.focusMode !== 'center'
    && builtin.focusMode !== 'quad'
  ) {
    errors.push(`${edgeLabel} zoom focusMode must be 'center' or 'quad', got ${String(builtin.focusMode)}`)
  }

  if (builtin.focusMode === 'quad') {
    if (!builtin.focusQuad || typeof builtin.focusQuad !== 'object') {
      errors.push(`${edgeLabel} zoom focusQuad is required when focusMode is 'quad'`)
      return
    }
    validateNormalizedPoint(builtin.focusQuad.topLeft, `${edgeLabel} zoom focusQuad.topLeft`, errors)
    validateNormalizedPoint(builtin.focusQuad.topRight, `${edgeLabel} zoom focusQuad.topRight`, errors)
    validateNormalizedPoint(builtin.focusQuad.bottomRight, `${edgeLabel} zoom focusQuad.bottomRight`, errors)
    validateNormalizedPoint(builtin.focusQuad.bottomLeft, `${edgeLabel} zoom focusQuad.bottomLeft`, errors)
  }
}

function validateQuadRange(range: unknown, label: string, errors: string[]) {
  if (!range || typeof range !== 'object') {
    errors.push(`${label} must be an object with topLeft/topRight/bottomRight/bottomLeft`)
    return
  }
  const quad = range as QuadRange
  validateNormalizedPoint(quad.topLeft, `${label}.topLeft`, errors)
  validateNormalizedPoint(quad.topRight, `${label}.topRight`, errors)
  validateNormalizedPoint(quad.bottomRight, `${label}.bottomRight`, errors)
  validateNormalizedPoint(quad.bottomLeft, `${label}.bottomLeft`, errors)
}

function validateCameraState(
  camera: unknown,
  label: string,
  errors: string[],
) {
  if (!camera || typeof camera !== 'object') {
    errors.push(`${label} must be an object with centerX/centerY/zoom`)
    return
  }

  const { centerX, centerY, zoom } = camera as CameraState
  if (typeof centerX !== 'number' || centerX < 0 || centerX > 1) {
    errors.push(`${label}.centerX must be 0~1, got ${String(centerX)}`)
  }
  if (typeof centerY !== 'number' || centerY < 0 || centerY > 1) {
    errors.push(`${label}.centerY must be 0~1, got ${String(centerY)}`)
  }
  if (typeof zoom !== 'number' || zoom <= 0) {
    errors.push(`${label}.zoom must be > 0, got ${String(zoom)}`)
  }
}

function validateSurfaceCard(card: SurfaceCard | undefined, label: string, errors: string[]) {
  if (!card || typeof card !== 'object') {
    errors.push(`${label} must be an object`)
    return
  }
  if (!card.id || typeof card.id !== 'string') {
    errors.push(`${label}.id is required`)
  }
  if (!card.title || typeof card.title !== 'string') {
    errors.push(`${label}.title is required`)
  }
  validateNormalizedPoint(card.anchor, `${label}.anchor`, errors)
  if (card.coordSpace !== 'surface-normalized') {
    errors.push(`${label}.coordSpace must be 'surface-normalized'`)
  }
  if (card.callout) {
    if (!['top', 'right', 'bottom', 'left'].includes(card.callout.fromDock)) {
      errors.push(`${label}.callout.fromDock must be top/right/bottom/left`)
    }
    validateNormalizedPoint(card.callout.target, `${label}.callout.target`, errors)
  }
}

function validateSurfaceHotspot(hotspot: SurfaceHotspot | undefined, label: string, errors: string[]) {
  if (!hotspot || typeof hotspot !== 'object') {
    errors.push(`${label} must be an object`)
    return
  }
  if (!hotspot.id || typeof hotspot.id !== 'string') {
    errors.push(`${label}.id is required`)
  }
  if (!hotspot.label || typeof hotspot.label !== 'string') {
    errors.push(`${label}.label is required`)
  }
  validateNormalizedPoint(hotspot.anchor, `${label}.anchor`, errors)
  if (hotspot.coordSpace !== 'surface-normalized') {
    errors.push(`${label}.coordSpace must be 'surface-normalized'`)
  }
  if (!hotspot.target || typeof hotspot.target !== 'object') {
    errors.push(`${label}.target is required`)
    return
  }
  if (hotspot.target.type === 'camera-preset') {
    validateCameraState(hotspot.target.camera, `${label}.target.camera`, errors)
    return
  }
  if (hotspot.target.type === 'focus-layer') {
    if (!hotspot.target.layerId || typeof hotspot.target.layerId !== 'string') {
      errors.push(`${label}.target.layerId is required`)
    }
    return
  }
  if (hotspot.target.type === 'edge') {
    if (!hotspot.target.edgeId || typeof hotspot.target.edgeId !== 'string') {
      errors.push(`${label}.target.edgeId is required`)
    }
    return
  }
  errors.push(`${label}.target.type must be 'camera-preset', 'focus-layer', or 'edge'`)
}

function validateSurfaceLayers(
  layers: SurfaceFocusLayer[] | undefined,
  label: string,
  errors: string[],
) {
  if (layers == null) return
  if (!Array.isArray(layers)) {
    errors.push(`${label} must be an array`)
    return
  }
  for (const [index, layer] of layers.entries()) {
    const layerLabel = `${label}[${index}]`
    if (!layer.id || typeof layer.id !== 'string') {
      errors.push(`${layerLabel}.id is required`)
    }
    if (!layer.title || typeof layer.title !== 'string') {
      errors.push(`${layerLabel}.title is required`)
    }
    if (
      !layer.visibility
      || typeof layer.visibility.minZoom !== 'number'
      || layer.visibility.minZoom <= 0
    ) {
      errors.push(`${layerLabel}.visibility.minZoom must be > 0`)
    }
    if (
      layer.visibility?.cardsMinZoom != null
      && (typeof layer.visibility.cardsMinZoom !== 'number' || layer.visibility.cardsMinZoom <= 0)
    ) {
      errors.push(`${layerLabel}.visibility.cardsMinZoom must be > 0 when provided`)
    }
    if (
      layer.visibility?.hotspotsMinZoom != null
      && (typeof layer.visibility.hotspotsMinZoom !== 'number' || layer.visibility.hotspotsMinZoom <= 0)
    ) {
      errors.push(`${layerLabel}.visibility.hotspotsMinZoom must be > 0 when provided`)
    }
    if (layer.cameraPreset) {
      validateCameraState(layer.cameraPreset, `${layerLabel}.cameraPreset`, errors)
    }
    if (!Array.isArray(layer.cards)) {
      errors.push(`${layerLabel}.cards must be an array`)
    } else {
      layer.cards.forEach((card, cardIndex) => {
        validateSurfaceCard(card, `${layerLabel}.cards[${cardIndex}]`, errors)
      })
    }
    if (!Array.isArray(layer.hotspots)) {
      errors.push(`${layerLabel}.hotspots must be an array`)
    } else {
      layer.hotspots.forEach((hotspot, hotspotIndex) => {
        validateSurfaceHotspot(hotspot, `${layerLabel}.hotspots[${hotspotIndex}]`, errors)
      })
    }
  }
}

function validateSurfaceConfig(
  surfaceConfig: SurfaceConfig | undefined,
  label: string,
  errors: string[],
) {
  if (!surfaceConfig) {
    errors.push(`${label} surfaceConfig is required`)
    return
  }
  if (!surfaceConfig.sourceImageUrl || typeof surfaceConfig.sourceImageUrl !== 'string') {
    errors.push(`${label} surfaceConfig.sourceImageUrl is required`)
  }
  if (surfaceConfig.coordSpace !== 'surface-normalized') {
    errors.push(`${label} surfaceConfig.coordSpace must be 'surface-normalized'`)
  }
  validateCameraState(surfaceConfig.initialCamera, `${label} surfaceConfig.initialCamera`, errors)
  if (
    !surfaceConfig.bounds
    || typeof surfaceConfig.bounds.minZoom !== 'number'
    || typeof surfaceConfig.bounds.maxZoom !== 'number'
  ) {
    errors.push(`${label} surfaceConfig.bounds.minZoom/maxZoom are required`)
  } else if (surfaceConfig.bounds.minZoom <= 0 || surfaceConfig.bounds.maxZoom < surfaceConfig.bounds.minZoom) {
    errors.push(`${label} surfaceConfig bounds are invalid`)
  }
  if (!surfaceConfig.gesture || surfaceConfig.gesture.wheelZoom !== true || surfaceConfig.gesture.dragPan !== true) {
    errors.push(`${label} surfaceConfig.gesture must enable wheelZoom and dragPan`)
  }
}

function validateRuntimeConfig(
  runtimeConfig: RuntimeConfig | undefined,
  label: string,
  errors: string[],
) {
  const strategy = runtimeConfig?.htmlIframePreloadStrategy
  if (strategy == null) return
  if (!['all', 'current-node', 'on-demand'].includes(strategy)) {
    errors.push(
      `${label} runtimeConfig.htmlIframePreloadStrategy must be 'all', 'current-node', or 'on-demand', got '${strategy}'`,
    )
  }
}

// ─── KnowledgePackage Validation ────────────────────────────

export function validateKnowledgePackage(pkg: KnowledgePackage): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Top-level
  if (!pkg.id || typeof pkg.id !== 'string') {
    errors.push('KnowledgePackage.id is required and must be a non-empty string')
  }
  if (!pkg.title || typeof pkg.title !== 'string') {
    errors.push('KnowledgePackage.title is required and must be a non-empty string')
  }
  if (!pkg.version || typeof pkg.version !== 'string') {
    errors.push('KnowledgePackage.version is required and must be a non-empty string')
  }
  if (!isPackageResolution(pkg.resolution)) {
    errors.push(`KnowledgePackage.resolution must be one of ${PACKAGE_RESOLUTIONS.join(', ')}`)
  }
  validateRuntimeConfig(pkg.runtimeConfig, 'KnowledgePackage', errors)

  // Nodes
  if (!Array.isArray(pkg.nodes) || pkg.nodes.length === 0) {
    errors.push('KnowledgePackage.nodes must be a non-empty array')
  } else {
    const nodeIds = new Set<string>()
    const hasRoot = pkg.nodes.some(n => n.id === 'root')
    if (!hasRoot) {
      errors.push('KnowledgePackage must contain a node with id "root"')
    }

    for (const node of pkg.nodes) {
      validateNode(node, nodeIds, errors, warnings)
    }
  }

  // Edges
  if (Array.isArray(pkg.edges)) {
    const edgeIds = new Set<string>()
    const nodeIds = new Set(pkg.nodes?.map(n => n.id) ?? [])

    for (const edge of pkg.edges) {
      validateEdge(edge, edgeIds, nodeIds, errors, warnings)
    }

    // Check hotspot references
    for (const node of pkg.nodes ?? []) {
      if (node.hotspots) {
        for (const hs of node.hotspots) {
          if (!nodeIds.has(hs.targetNodeId)) {
            errors.push(`Node "${node.id}" hotspot targetNodeId "${hs.targetNodeId}" does not exist`)
          }
          const edgeExists = pkg.edges.some(e => e.id === hs.edgeId)
          if (!edgeExists) {
            errors.push(`Node "${node.id}" hotspot edgeId "${hs.edgeId}" does not exist in edges`)
          }
        }
      }
      // Check hotspotEdgeIds references (for HTML nodes)
      if (node.hotspotEdgeIds) {
        for (const edgeId of node.hotspotEdgeIds) {
          const edgeExists = pkg.edges.some(e => e.id === edgeId)
          if (!edgeExists) {
            errors.push(`Node "${node.id}" hotspotEdgeIds references non-existent edge "${edgeId}"`)
          }
        }
      }
    }
  } else {
    warnings.push('KnowledgePackage.edges is empty — single-node guide')
  }

  return { valid: errors.length === 0, errors, warnings }
}

function validateNode(
  node: KnowledgeNode,
  nodeIds: Set<string>,
  errors: string[],
  _warnings: string[],
) {
  if (!node.id || typeof node.id !== 'string') {
    errors.push('Node id is required')
    return
  }
  if (nodeIds.has(node.id)) {
    errors.push(`Duplicate node id: "${node.id}"`)
  }
  nodeIds.add(node.id)

  if (!node.title || typeof node.title !== 'string') {
    errors.push(`Node "${node.id}" title is required`)
  }

  const contentType = node.contentType ?? 'image'
  const nodeKind = node.nodeKind ?? (contentType === 'html' ? 'html' : 'image')

  if (!['surface', 'image', 'html'].includes(nodeKind)) {
    errors.push(`Node "${node.id}" nodeKind must be 'surface', 'image', or 'html', got '${String(node.nodeKind)}'`)
  }

  // Content type validation
  if (nodeKind === 'html' || contentType === 'html') {
    if (!node.htmlSource || typeof node.htmlSource !== 'string' || node.htmlSource.trim() === '') {
      errors.push(`Node "${node.id}" contentType is 'html' but htmlSource is missing or empty`)
    }
  } else if (nodeKind === 'surface') {
    validateSurfaceConfig(node.surfaceConfig, `Node "${node.id}"`, errors)
    validateSurfaceLayers(node.surfaceLayers, `Node "${node.id}" surfaceLayers`, errors)
  } else {
    if (!node.keyContent || typeof node.keyContent !== 'string' || node.keyContent.trim() === '') {
      errors.push(`Node "${node.id}" keyContent must be a non-empty string`)
    }
  }

  if (node.summary != null && typeof node.summary !== 'string') {
    errors.push(`Node "${node.id}" summary must be a string when provided`)
  }
  if (node.sourceText != null && typeof node.sourceText !== 'string') {
    errors.push(`Node "${node.id}" sourceText must be a string when provided`)
  }
  if (node.topicType != null && typeof node.topicType !== 'string') {
    errors.push(`Node "${node.id}" topicType must be a string when provided`)
  }
  if (node.visualIntent != null && typeof node.visualIntent !== 'string') {
    errors.push(`Node "${node.id}" visualIntent must be a string when provided`)
  }
  if (node.keyPoints != null) {
    if (!Array.isArray(node.keyPoints) || node.keyPoints.some(item => typeof item !== 'string')) {
      errors.push(`Node "${node.id}" keyPoints must be an array of strings when provided`)
    }
  }
  if (node.hotspotHints != null) {
    if (!Array.isArray(node.hotspotHints) || node.hotspotHints.some(item => typeof item !== 'string')) {
      errors.push(`Node "${node.id}" hotspotHints must be an array of strings when provided`)
    }
  }

  // Hotspot validation
  if (node.hotspots) {
    for (const hs of node.hotspots) {
      if (!hs.edgeId || !hs.targetNodeId) {
        errors.push(`Node "${node.id}" hotspot missing edgeId or targetNodeId`)
      }
      if (!hs.label || typeof hs.label !== 'string') {
        errors.push(`Node "${node.id}" hotspot must have a non-empty label`)
      }
    }
  }

  // imageFitMode validation
  if (node.imageFitMode != null && !['fill', 'fitHeight', 'fitWidth'].includes(node.imageFitMode)) {
    errors.push(`Node "${node.id}" imageFitMode must be 'fill', 'fitHeight', or 'fitWidth', got '${node.imageFitMode}'`)
  }
}

function validateEdge(
  edge: KnowledgeEdge,
  edgeIds: Set<string>,
  nodeIds: Set<string>,
  errors: string[],
  _warnings: string[],
) {
  if (!edge.id || typeof edge.id !== 'string') {
    errors.push('Edge id is required')
    return
  }
  if (edgeIds.has(edge.id)) {
    errors.push(`Duplicate edge id: "${edge.id}"`)
  }
  edgeIds.add(edge.id)

  if (!edge.fromNodeId || !nodeIds.has(edge.fromNodeId)) {
    errors.push(`Edge "${edge.id}" fromNodeId "${edge.fromNodeId}" does not exist`)
  }
  if (!edge.toNodeId || !nodeIds.has(edge.toNodeId)) {
    errors.push(`Edge "${edge.id}" toNodeId "${edge.toNodeId}" does not exist`)
  }
  if (edge.fromNodeId === edge.toNodeId) {
    errors.push(`Edge "${edge.id}" has self-loop (fromNodeId === toNodeId)`)
  }

  validateBuiltinTransitionConfig(edge.builtinTransition, `Edge "${edge.id}"`, errors)
}

// ─── PublishManifest Validation ─────────────────────────────

export function validatePublishManifest(manifest: PublishManifest): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!manifest.packageId) errors.push('packageId is required')
  if (!manifest.version) errors.push('version is required')
  if (!manifest.title) errors.push('title is required')
  if (manifest.rootNodeId !== 'root') errors.push('rootNodeId must be "root"')
  validateRuntimeConfig(manifest.runtimeConfig, 'PublishManifest', errors)

  // rootNodeId must exist in nodeMap
  if (!manifest.nodeMap['root']) {
    errors.push('root node missing from nodeMap')
  }

  // nodes <-> nodeMap consistency
  const nodeArrayIds = new Set(manifest.nodes.map(n => n.id))
  const nodeMapIds = new Set(Object.keys(manifest.nodeMap))
  for (const id of nodeArrayIds) {
    if (!nodeMapIds.has(id)) {
      errors.push(`Node "${id}" exists in nodes array but not in nodeMap`)
    }
  }
  for (const id of nodeMapIds) {
    if (!nodeArrayIds.has(id)) {
      errors.push(`Node "${id}" exists in nodeMap but not in nodes array`)
    }
  }

  // edges <-> edgeMap consistency
  const edgeArrayIds = new Set(manifest.edges.map(e => e.id))
  const edgeMapIds = new Set(Object.keys(manifest.edgeMap))
  for (const id of edgeArrayIds) {
    if (!edgeMapIds.has(id)) {
      errors.push(`Edge "${id}" exists in edges array but not in edgeMap`)
    }
  }
  for (const id of edgeMapIds) {
    if (!edgeArrayIds.has(id)) {
      errors.push(`Edge "${id}" exists in edgeMap but not in edges array`)
    }
  }

  for (const edge of manifest.edges) {
    validateBuiltinTransitionConfig(edge.builtinTransition, `Edge "${edge.id}"`, errors)
  }

  // Hotspot validation & HTML node validation
  for (const node of manifest.nodes) {
    const nodeKind = node.nodeKind ?? ((node.contentType ?? 'image') === 'html' ? 'html' : 'image')
    // HTML node must have htmlUrl
    if (nodeKind === 'html' && !node.htmlUrl) {
      errors.push(`HTML Node "${node.id}" must have htmlUrl`)
    }
    if (nodeKind === 'surface') {
      validateSurfaceConfig(node.surfaceConfig, `Node "${node.id}"`, errors)
      validateSurfaceLayers(node.surfaceLayers, `Node "${node.id}" surfaceLayers`, errors)
    }
    if (nodeKind === 'image' && !node.imageUrl) {
      errors.push(`Image Node "${node.id}" must have imageUrl`)
    }
    // hotspotEdgeIds validation for HTML nodes
    if (node.hotspotEdgeIds) {
      for (const edgeId of node.hotspotEdgeIds) {
        if (!manifest.edgeMap[edgeId]) {
          errors.push(`Node "${node.id}" hotspotEdgeIds references non-existent edge "${edgeId}"`)
        }
      }
    }
    // imageFitMode validation
    if (node.imageFitMode != null && !['fill', 'fitHeight', 'fitWidth'].includes(node.imageFitMode)) {
      errors.push(`Node "${node.id}" imageFitMode must be 'fill', 'fitHeight', or 'fitWidth', got '${node.imageFitMode}'`)
    }
    for (const hs of node.hotspots) {
      if (typeof hs.normalizedX !== 'number' || hs.normalizedX < 0 || hs.normalizedX > 1) {
        errors.push(`Node "${node.id}" hotspot normalizedX must be 0~1, got ${hs.normalizedX}`)
      }
      if (typeof hs.normalizedY !== 'number' || hs.normalizedY < 0 || hs.normalizedY > 1) {
        errors.push(`Node "${node.id}" hotspot normalizedY must be 0~1, got ${hs.normalizedY}`)
      }
      if (!manifest.nodeMap[hs.targetNodeId]) {
        errors.push(`Node "${node.id}" hotspot targetNodeId "${hs.targetNodeId}" not found`)
      }
      if (!manifest.edgeMap[hs.edgeId]) {
        errors.push(`Node "${node.id}" hotspot edgeId "${hs.edgeId}" not found`)
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── Design Aliases ───────────────────────────────────────
// These aliases match the function names in design documents and acceptance criteria.

export const validateGuide = validateKnowledgePackage
export const validateManifest = validatePublishManifest
