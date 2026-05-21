// ============================================================
// Interactive Guide - Shared Utilities
// ============================================================

import { v4 as uuidv4 } from 'uuid'
import type { KnowledgePackage, PackageListItem, PackageResolution } from './types.js'

/** Base pixel dimensions for each supported canvas resolution. */
const RESOLUTION_BASES: Record<PackageResolution, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '375*808': { width: 375, height: 808 },
}

export const PACKAGE_RESOLUTIONS = Object.freeze(
  Object.keys(RESOLUTION_BASES) as PackageResolution[],
)

export function isPackageResolution(value: unknown): value is PackageResolution {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RESOLUTION_BASES, value)
}

/** Convert a package resolution to base pixel dimensions. */
export function getResolutionDimensions(resolution: PackageResolution): { width: number; height: number } {
  return RESOLUTION_BASES[resolution]
}

export function getResolutionAspectRatio(resolution: PackageResolution): number {
  const { width, height } = getResolutionDimensions(resolution)
  return width / height
}

export function getResolutionAspectRatioCss(resolution: PackageResolution): string {
  const { width, height } = getResolutionDimensions(resolution)
  return `${width} / ${height}`
}

/**
 * Generate a unique generate ID.
 */
export function generateGenerateId(): string {
  return `generate_${Date.now()}_${uuidv4().slice(0, 8)}`
}

/**
 * Generate a unique build ID (legacy alias).
 */
export function generateBuildId(): string {
  return generateGenerateId()
}

/**
 * Generate a unique node/edge ID.
 */
export function generateId(prefix: string): string {
  return `${prefix}_${uuidv4().slice(0, 8)}`
}

/**
 * Convert a KnowledgePackage to a PackageListItem for overview display.
 */
export function toPackageListItem(pkg: KnowledgePackage): PackageListItem {
  return {
    id: pkg.id,
    title: pkg.title,
    version: pkg.version,
    resolution: pkg.resolution,
    nodeCount: pkg.nodes.length,
    edgeCount: pkg.edges.length,
    updatedAt: pkg.metadata?.updatedAt,
  }
}

/**
 * Generate a timestamp in ISO format.
 */
export function nowISO(): string {
  return new Date().toISOString()
}

/**
 * Get the root node from a package.
 */
export function getRootNode(pkg: KnowledgePackage) {
  return pkg.nodes.find(n => n.id === 'root')
}
