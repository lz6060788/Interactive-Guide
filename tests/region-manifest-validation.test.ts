import test from 'node:test'
import assert from 'node:assert/strict'

import type { PublishManifest } from '../src/shared/types.js'
import { validatePublishManifest } from '../src/shared/validators.js'

test('validatePublishManifest accepts region nodes and target-region-auto zoom transitions', () => {
  const manifest: PublishManifest = {
    packageId: 'guide_test',
    version: '1.0.0',
    title: 'test',
    rootNodeId: 'root',
    resolution: '375*808',
    nodes: [
      {
        id: 'root',
        title: 'Root',
        nodeKind: 'image',
        imageUrl: '/root.png',
        hotspots: [],
      },
      {
        id: 'region-a',
        title: 'Region A',
        nodeKind: 'region',
        regionViewport: {
          sourceNodeId: 'root',
          coordSpace: 'source-normalized',
          panRange: {
            topLeft: { x: 0.2, y: 0.2 },
            topRight: { x: 0.7, y: 0.2 },
            bottomRight: { x: 0.7, y: 0.8 },
            bottomLeft: { x: 0.2, y: 0.8 },
          },
          initialWindowRule: {
            mode: 'derive-from-pan-range-center',
            fitBy: 'height',
          },
        },
        regionOverlay: {
          template: 'stock-info-v1',
          showWhenActive: true,
          cards: [],
        },
        hotspots: [],
      },
    ],
    edges: [
      {
        id: 'edge-root-region-a',
        fromNodeId: 'root',
        toNodeId: 'region-a',
        transitionType: 'builtin',
        builtinTransition: {
          type: 'zoom',
          direction: 'in',
          focusMode: 'target-region-auto',
          duration: 800,
          easing: 'ease-in-out',
        },
      },
    ],
    nodeMap: {} as Record<string, PublishManifest['nodes'][number]>,
    edgeMap: {} as Record<string, PublishManifest['edges'][number]>,
    metadata: {
      generatedAt: new Date().toISOString(),
      manifestVersion: '1.0.0',
    },
  }

  manifest.nodeMap = Object.fromEntries(manifest.nodes.map(node => [node.id, node]))
  manifest.edgeMap = Object.fromEntries(manifest.edges.map(edge => [edge.id, edge]))

  const result = validatePublishManifest(manifest)
  assert.equal(result.valid, true, result.errors.join('\n'))
})
