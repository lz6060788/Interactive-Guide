import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { FsRepository } from '../../src/server/storage/fs-repository.js'
import { GuideService } from '../../src/server/services/guide-service.js'
import type { KnowledgePackage } from '../../src/shared/types.js'

function createTempRepo(): { repo: FsRepository; service: GuideService; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-svc-'))
  const workspaceDir = path.join(tmpDir, 'workspace')
  fs.mkdirSync(workspaceDir, { recursive: true })
  const repo = new FsRepository(tmpDir)
  const service = new GuideService(repo)
  return { repo, service, cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }) }
}

function makeGuide(overrides: Partial<KnowledgePackage> = {}): KnowledgePackage {
  return {
    id: 'test-guide',
    title: 'Test Guide',
    version: '1.0.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [
      { id: 'root', title: 'Root', keyContent: 'root content', nodeKind: 'image' as const, imageUrl: '', hotspots: [] },
      { id: 'node-2', title: 'Node 2', keyContent: 'node 2 content', nodeKind: 'image' as const, imageUrl: '', hotspots: [] },
    ],
    edges: [
      { id: 'edge-1', fromNodeId: 'root', toNodeId: 'node-2', relationLabel: 'next' },
    ],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
    ...overrides,
  }
}

function writeGuideToWorkspace(repo: FsRepository, guide: KnowledgePackage) {
  const wsDir = (repo as any).workspaceDir
  const guideDir = path.join(wsDir, guide.id)
  fs.mkdirSync(guideDir, { recursive: true })
  fs.writeFileSync(path.join(guideDir, 'guide.json'), JSON.stringify(guide, null, 2))
  repo.refresh()
}

// ─── Guide CRUD ────────────────────────────────────────────────

test('GuideService.listGuides returns empty when no guides exist', () => {
  const { service, cleanup } = createTempRepo()
  try {
    const list = service.listGuides()
    assert.equal(list.length, 0)
  } finally {
    cleanup()
  }
})

test('GuideService.listGuides returns all guides as list items', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())
    writeGuideToWorkspace(repo, makeGuide({ id: 'guide-2', title: 'Guide 2' }))

    const list = service.listGuides()
    assert.equal(list.length, 2)
    const byId = Object.fromEntries(list.map(g => [g.id, g]))
    assert.ok(byId['test-guide'])
    assert.equal(byId['test-guide'].nodeCount, 2)
    assert.equal(byId['test-guide'].edgeCount, 1)
    assert.ok(byId['guide-2'])
  } finally {
    cleanup()
  }
})

test('GuideService.getGuide returns a fully hydrated guide', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())

    const guide = service.getGuide('test-guide')
    assert.equal(guide.id, 'test-guide')
    assert.equal(guide.nodes.length, 2)
    assert.equal(guide.edges.length, 1)
  } finally {
    cleanup()
  }
})

test('GuideService.getGuide throws 404 for unknown guide', () => {
  const { service, cleanup } = createTempRepo()
  try {
    assert.throws(
      () => service.getGuide('nonexistent'),
      (err: any) => err.statusCode === 404,
    )
  } finally {
    cleanup()
  }
})

// ─── Node CRUD ─────────────────────────────────────────────────

test('GuideService.addNode creates a node and auto-links edge', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())

    const result = service.addNode('test-guide', 'root', {
      title: 'New Node',
      keyContent: 'new content',
    })
    assert.ok(result.id)
    assert.equal(result.title, 'New Node')

    // Verify it was persisted
    const updated = service.getGuide('test-guide')
    assert.equal(updated.nodes.length, 3)
    const found = updated.nodes.find(n => n.title === 'New Node')
    assert.ok(found)
    // An edge should have been auto-created
    assert.equal(updated.edges.length, 2)
  } finally {
    cleanup()
  }
})

test('GuideService.updateNode modifies a node', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())

    const result = service.updateNode('test-guide', 'root', { title: 'Updated Root' })
    assert.equal(result.title, 'Updated Root')

    const updated = service.getGuide('test-guide')
    const rootNode = updated.nodes.find(n => n.id === 'root')
    assert.ok(rootNode)
    assert.equal(rootNode.title, 'Updated Root')
  } finally {
    cleanup()
  }
})

test('GuideService.deleteNode removes a node and its edges', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())

    service.deleteNode('test-guide', 'node-2')
    const updated = service.getGuide('test-guide')
    assert.equal(updated.nodes.length, 1)
    assert.equal(updated.nodes[0].id, 'root')
    // Edge connected to deleted node should also be removed
    assert.equal(updated.edges.length, 0)
  } finally {
    cleanup()
  }
})

test('GuideService.deleteNode throws when trying to delete root node', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())
    assert.throws(
      () => service.deleteNode('test-guide', 'root'),
      (err: any) => err.statusCode === 400,
    )
  } finally {
    cleanup()
  }
})

// ─── Edge CRUD ─────────────────────────────────────────────────

test('GuideService.updateEdge modifies edge metadata', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())

    const result = service.updateEdge('test-guide', 'edge-1', {
      relationLabel: 'updated-label',
    })
    assert.equal(result.id, 'edge-1')
    assert.equal(result.relationLabel, 'updated-label')

    const updated = service.getGuide('test-guide')
    const edge = updated.edges.find(e => e.id === 'edge-1')
    assert.ok(edge)
    assert.equal(edge.relationLabel, 'updated-label')
  } finally {
    cleanup()
  }
})

// ─── Guide lifecycle ───────────────────────────────────────────

test('GuideService.importGuide creates a new guide', () => {
  const { service, cleanup } = createTempRepo()
  try {
    const pkg = makeGuide({ id: 'imported', title: 'Imported Guide' })
    const result = service.importGuide(pkg)
    assert.equal(result.id, 'imported')
    assert.equal(result.title, 'Imported Guide')

    const list = service.listGuides()
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'imported')
  } finally {
    cleanup()
  }
})

test('GuideService.deleteGuide removes an entire guide', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())
    service.deleteGuide('test-guide')
    assert.throws(
      () => service.getGuide('test-guide'),
      (err: any) => err.statusCode === 404,
    )
  } finally {
    cleanup()
  }
})

test('GuideService.copyGuide duplicates a guide with new id', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())
    const result = service.copyGuide('test-guide')
    assert.ok(result.id !== 'test-guide')
    assert.ok(result.title.includes('Test Guide'))
    assert.equal(result.nodes.length, 2)
  } finally {
    cleanup()
  }
})

// ─── Upload operations ─────────────────────────────────────────

test('GuideService.uploadNodeImage persists buffer and returns URL', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())
    const buf = Buffer.from('fake-png-data')
    const result = service.uploadNodeImage('test-guide', 'root', buf)
    assert.ok(result.imageUrl.includes('test-guide'))
    assert.ok(result.imageUrl.includes('root.png'))
  } finally {
    cleanup()
  }
})

test('GuideService.uploadNodeHtml persists buffer and returns URL', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())
    const buf = Buffer.from('<html></html>')
    const result = service.uploadNodeHtml('test-guide', 'root', buf)
    assert.ok(result.htmlUrl.includes('test-guide'))
    assert.ok(result.htmlUrl.includes('root.html'))
  } finally {
    cleanup()
  }
})

test('GuideService.uploadEdgeVideo persists buffer and returns URL', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())
    const buf = Buffer.from('fake-mp4-data')
    const result = service.uploadEdgeVideo('test-guide', 'edge-1', buf)
    assert.ok(result.videoUrl.includes('test-guide'))
    assert.ok(result.videoUrl.includes('edge-1.mp4'))
  } finally {
    cleanup()
  }
})

test('GuideService.getManifest returns null when no manifest exists', () => {
  const { repo, service, cleanup } = createTempRepo()
  try {
    writeGuideToWorkspace(repo, makeGuide())
    const result = service.getManifest('test-guide')
    assert.equal(result, null)
  } finally {
    cleanup()
  }
})
