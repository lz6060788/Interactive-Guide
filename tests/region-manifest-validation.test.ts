import test from 'node:test'
import assert from 'node:assert/strict'

import type { PublishManifest } from '../src/shared/types.js'
import { validatePublishManifest } from '../src/shared/validators.js'

test('validatePublishManifest accepts surface/image/html nodes and surface layers', () => {
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
        nodeKind: 'surface',
        imageUrl: '/root.png',
        surfaceConfig: {
          sourceImageUrl: '/root.png',
          coordSpace: 'surface-normalized',
          initialCamera: {
            centerX: 0.5,
            centerY: 0.5,
            zoom: 1,
          },
          bounds: {
            minZoom: 1,
            maxZoom: 4,
          },
          gesture: {
            wheelZoom: true,
            dragPan: true,
          },
        },
        surfaceLayers: [
          {
            id: 'layer-1',
            title: 'Layer 1',
            visibility: {
              minZoom: 1.5,
              hotspotsMinZoom: 1.5,
              cardsMinZoom: 2.4,
            },
            cameraPreset: {
              centerX: 0.45,
              centerY: 0.6,
              zoom: 2,
            },
            cards: [
              {
                id: 'card-1',
                title: '地面站',
                anchor: { x: 0.5, y: 0.6 },
                coordSpace: 'surface-normalized',
                callout: {
                  fromDock: 'bottom',
                  target: { x: 0.54, y: 0.68 },
                },
              },
            ],
            hotspots: [
              {
                id: 'surface-hotspot-1',
                label: '运载火箭',
                anchor: { x: 0.52, y: 0.36 },
                coordSpace: 'surface-normalized',
                target: {
                  type: 'edge',
                  edgeId: 'edge-root-rocket',
                },
              },
            ],
          },
        ],
        hotspots: [],
      },
      {
        id: 'poster',
        title: 'Poster',
        nodeKind: 'image',
        imageUrl: '/poster.png',
        hotspots: [],
      },
      {
        id: 'rocket',
        title: 'Rocket',
        nodeKind: 'html',
        contentType: 'html',
        htmlUrl: '/rocket.html',
        htmlSource: 'nodes/rocket.html',
        hotspots: [],
      }
    ],
    edges: [
      {
        id: 'edge-root-rocket',
        fromNodeId: 'root',
        toNodeId: 'rocket',
        transitionType: 'builtin',
        builtinTransition: {
          type: 'zoom',
          direction: 'in',
          focusMode: 'center',
          centerX: 0.52,
          centerY: 0.36,
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
