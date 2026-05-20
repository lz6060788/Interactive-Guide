// ============================================================
// Interactive Guide - Schema Validators
// ============================================================
// Lightweight validation functions for KnowledgePackage and PublishManifest.
// No Zod dependency in shared — pure runtime checks.

import type {
  KnowledgePackage,
  KnowledgeNode,
  KnowledgeEdge,
  PublishManifest,
} from './types.js'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
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
  if (!pkg.resolution || typeof pkg.resolution.width !== 'number' || typeof pkg.resolution.height !== 'number') {
    errors.push('KnowledgePackage.resolution must have numeric width and height')
  } else {
    if (pkg.resolution.width <= 0 || !Number.isInteger(pkg.resolution.width)) {
      errors.push('resolution.width must be a positive integer')
    }
    if (pkg.resolution.height <= 0 || !Number.isInteger(pkg.resolution.height)) {
      errors.push('resolution.height must be a positive integer')
    }
  }

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

  // Content type validation
  if (contentType === 'html') {
    if (!node.htmlSource || typeof node.htmlSource !== 'string' || node.htmlSource.trim() === '') {
      errors.push(`Node "${node.id}" contentType is 'html' but htmlSource is missing or empty`)
    }
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
}

// ─── PublishManifest Validation ─────────────────────────────

export function validatePublishManifest(manifest: PublishManifest): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!manifest.packageId) errors.push('packageId is required')
  if (!manifest.version) errors.push('version is required')
  if (!manifest.title) errors.push('title is required')
  if (manifest.rootNodeId !== 'root') errors.push('rootNodeId must be "root"')

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

  // Hotspot validation & HTML node validation
  for (const node of manifest.nodes) {
    // HTML node must have htmlUrl
    if (node.contentType === 'html' && !node.htmlUrl) {
      errors.push(`HTML Node "${node.id}" must have htmlUrl`)
    }
    // Image node (or default) must have imageUrl
    if ((node.contentType ?? 'image') === 'image' && !node.imageUrl) {
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
