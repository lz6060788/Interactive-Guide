import test from 'node:test'
import assert from 'node:assert/strict'

import { validateKnowledgePackage, validatePublishManifest } from '../../src/shared/validators.js'
import type { KnowledgePackage, PublishManifest } from '../../src/shared/types.js'

// ─── KnowledgePackage validation ───────────────────────────────

test('validateKnowledgePackage rejects package missing root node', () => {
  const pkg: KnowledgePackage = {
    id: 'test',
    title: 'Test',
    version: '1.0.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [{ id: 'not-root', title: 'Not Root', keyContent: 'content', nodeKind: 'image' as const, imageUrl: '', hotspots: [] }],
    edges: [],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
  }
  const result = validateKnowledgePackage(pkg)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('root')))
})

test('validateKnowledgePackage rejects edge with missing from-node', () => {
  const pkg: KnowledgePackage = {
    id: 'test',
    title: 'Test',
    version: '1.0.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [{ id: 'root', title: 'Root', keyContent: 'content', nodeKind: 'image' as const, imageUrl: '', hotspots: [] }],
    edges: [{ id: 'e1', fromNodeId: 'missing', toNodeId: 'root', relationLabel: 'x' }],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
  }
  const result = validateKnowledgePackage(pkg)
  assert.equal(result.valid, false)
})

test('validateKnowledgePackage accepts valid edges between existing nodes', () => {
  const pkg: KnowledgePackage = {
    id: 'test',
    title: 'Test',
    version: '1.0.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [
      { id: 'root', title: 'Root', keyContent: 'root content', nodeKind: 'image' as const, imageUrl: '', hotspots: [] },
      { id: 'n2', title: 'N2', keyContent: 'n2 content', nodeKind: 'image' as const, imageUrl: '', hotspots: [] },
    ],
    edges: [{ id: 'e1', fromNodeId: 'root', toNodeId: 'n2', relationLabel: 'x' }],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
  }
  const result = validateKnowledgePackage(pkg)
  assert.equal(result.valid, true, result.errors.join('\n'))
})

test('validateKnowledgePackage rejects edge with self-loop', () => {
  const pkg: KnowledgePackage = {
    id: 'test',
    title: 'Test',
    version: '1.0.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [{ id: 'root', title: 'Root', keyContent: 'content', nodeKind: 'image' as const, imageUrl: '', hotspots: [] }],
    edges: [{ id: 'e1', fromNodeId: 'root', toNodeId: 'root', relationLabel: 'x' }],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
  }
  const result = validateKnowledgePackage(pkg)
  assert.equal(result.valid, false)
})

test('validateKnowledgePackage rejects hotspot referencing nonexistent edge', () => {
  const pkg: KnowledgePackage = {
    id: 'test',
    title: 'Test',
    version: '1.0.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [
      { id: 'root', title: 'Root', keyContent: 'content', nodeKind: 'image' as const, imageUrl: '', hotspots: [{ edgeId: 'does-not-exist', targetNodeId: 'n2', label: 'Go', normalizedX: 0.5, normalizedY: 0.5, x: 187, y: 404 }] },
      { id: 'n2', title: 'N2', keyContent: 'content', nodeKind: 'image' as const, imageUrl: '', hotspots: [] },
    ],
    edges: [{ id: 'e1', fromNodeId: 'root', toNodeId: 'n2', relationLabel: 'x' }],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
  }
  const result = validateKnowledgePackage(pkg)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('edgeId')))
})

test('validateKnowledgePackage accepts a valid package with keyContent', () => {
  const pkg: KnowledgePackage = {
    id: 'minimal',
    title: 'Minimal',
    version: '0.1.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [{ id: 'root', title: 'Root', keyContent: 'A valid package', nodeKind: 'image' as const, imageUrl: '', hotspots: [] }],
    edges: [],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
  }
  const result = validateKnowledgePackage(pkg)
  assert.equal(result.valid, true, result.errors.join('\n'))
})

test('validateKnowledgePackage rejects image node without keyContent', () => {
  const pkg: KnowledgePackage = {
    id: 'test',
    title: 'Test',
    version: '1.0.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [{ id: 'root', title: 'Root', keyContent: '', nodeKind: 'image' as const, imageUrl: '', hotspots: [] }],
    edges: [],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
  }
  const result = validateKnowledgePackage(pkg)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('keyContent')))
})

// ─── PublishManifest validation ────────────────────────────────

function makeManifest(overrides: Partial<PublishManifest> = {}): PublishManifest {
  const m: PublishManifest = {
    packageId: 'guide_test',
    version: '1.0.0',
    title: 'test',
    rootNodeId: 'root',
    resolution: '375*808',
    nodes: [{ id: 'root', title: 'Root', nodeKind: 'image', imageUrl: '/root.png', hotspots: [] }],
    edges: [],
    nodeMap: {},
    edgeMap: {},
    metadata: { generatedAt: new Date().toISOString(), manifestVersion: '1.0.0' },
  }
  Object.assign(m, overrides)
  m.nodeMap = Object.fromEntries(m.nodes.map(n => [n.id, n]))
  m.edgeMap = Object.fromEntries(m.edges.map(e => [e.id, e]))
  return m
}

test('validatePublishManifest rejects manifest without root node', () => {
  const manifest = makeManifest({
    nodes: [{ id: 'n1', title: 'N1', nodeKind: 'image', imageUrl: '/n1.png', hotspots: [] }],
  })
  const result = validatePublishManifest(manifest)
  assert.equal(result.valid, false)
})

test('validatePublishManifest accepts valid surface node with layers', () => {
  const manifest = makeManifest({
    nodes: [{
      id: 'root',
      title: 'Root Surface',
      nodeKind: 'surface',
      imageUrl: '/root.png',
      surfaceConfig: {
        sourceImageUrl: '/root.png',
        coordSpace: 'surface-normalized' as const,
        initialCamera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
        bounds: { minZoom: 1, maxZoom: 4 },
        gesture: { wheelZoom: true, dragPan: true },
      },
      surfaceLayers: [{
        id: 'layer-1', title: 'Layer 1',
        visibility: { minZoom: 1, hotspotsMinZoom: 1, cardsMinZoom: 2 },
        cameraPreset: { centerX: 0.5, centerY: 0.5, zoom: 2 },
        cards: [{
          id: 'card-1', title: 'Card', anchor: { x: 0.5, y: 0.5 }, coordSpace: 'surface-normalized' as const,
        }],
        hotspots: [{
          id: 'hs-1', label: 'Hotspot', anchor: { x: 0.5, y: 0.5 },
          coordSpace: 'surface-normalized' as const, target: { type: 'edge' as const, edgeId: 'e1' },
        }],
      }],
      hotspots: [],
    }],
    edges: [{ id: 'e1', fromNodeId: 'root', toNodeId: 'nxt', transitionType: 'builtin' as const, builtinTransition: { type: 'pan' as const, direction: 'right' as const, duration: 500, easing: 'ease-in-out' as const } }],
  })
  const result = validatePublishManifest(manifest)
  assert.equal(result.valid, true, result.errors.join('\n'))
})

test('validatePublishManifest accepts valid manifest with consistent maps', () => {
  const manifest = makeManifest()
  const result = validatePublishManifest(manifest)
  assert.equal(result.valid, true, result.errors.join('\n'))
})

test('validatePublishManifest requires imageUrl for image nodes', () => {
  const manifest = makeManifest({
    nodes: [{ id: 'root', title: 'Root', nodeKind: 'image' as const, imageUrl: '', hotspots: [] }],
  })
  const result = validatePublishManifest(manifest)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('imageUrl')))
})

test('validatePublishManifest requires htmlUrl for html nodes', () => {
  const manifest = makeManifest({
    nodes: [{ id: 'root', title: 'Root', nodeKind: 'html' as const, contentType: 'html' as const, htmlUrl: '', hotspots: [] }],
  })
  const result = validatePublishManifest(manifest)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('htmlUrl')))
})

test('validatePublishManifest rejects hotspot with out-of-range normalizedX', () => {
  const manifest = makeManifest({
    nodes: [{
      id: 'root', title: 'Root', nodeKind: 'image', imageUrl: '/r.png',
      hotspots: [{ edgeId: 'e1', targetNodeId: 'n2', label: 'x', normalizedX: 2.0, normalizedY: 0.5 }],
    }],
    edges: [{ id: 'e1', fromNodeId: 'root', toNodeId: 'n2', transitionType: 'builtin' as const, builtinTransition: { type: 'pan' as const, direction: 'right' as const, duration: 500, easing: 'ease-in-out' as const } }],
  })
  const result = validatePublishManifest(manifest)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('normalizedX')))
})

test('validatePublishManifest rejects edge with unknown target node in hotspot', () => {
  const manifest = makeManifest({
    nodes: [{
      id: 'root', title: 'Root', nodeKind: 'image', imageUrl: '/r.png',
      hotspots: [{ edgeId: 'e1', targetNodeId: 'ghost', label: 'x', normalizedX: 0.5, normalizedY: 0.5 }],
    }],
    edges: [{ id: 'e1', fromNodeId: 'root', toNodeId: 'ghost', transitionType: 'builtin' as const, builtinTransition: { type: 'pan' as const, direction: 'right' as const, duration: 500, easing: 'ease-in-out' as const } }],
  })
  const result = validatePublishManifest(manifest)
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(e => e.includes('ghost')))
})
