// ============================================================
// Interactive Guide - Panorama Connector Geometry
// ============================================================

export interface PanoramaConnectorPoint {
  x: number
  y: number
}

export interface PanoramaConnectorPathInput {
  from: PanoramaConnectorPoint
  to: PanoramaConnectorPoint
}

export function buildPanoramaConnectorPath(input: PanoramaConnectorPathInput): string {
  const midX = (input.from.x + input.to.x) / 2
  return [
    `M ${input.from.x} ${input.from.y}`,
    `L ${midX} ${input.from.y}`,
    `L ${midX} ${input.to.y}`,
    `L ${input.to.x} ${input.to.y}`,
  ].join(' ')
}
