import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import cors from 'cors'

import { FsRepository } from '../../src/server/storage/fs-repository.js'
import { GuideService } from '../../src/server/services/guide-service.js'
import { GenerateService } from '../../src/server/services/generate-service.js'
import { healthRouter } from '../../src/server/routes/health.js'
import { createGuidesRouter } from '../../src/server/routes/guides.js'
import { createGeneratesRouter } from '../../src/server/routes/generates.js'
import { errorHandler } from '../../src/server/middleware/error-handler.js'
import type { KnowledgePackage } from '../../src/shared/types.js'

const NULL_MODULE = {
  recommendHotspots: async () => [],
  generateNodeImage: async () => ({ imageUrl: '' }),
  generateTransitionVideo: async () => ({ videoUrl: '' }),
  exposeNodeImage: async () => Buffer.alloc(0),
  uploadBuffer: async () => '',
} as any

export function createTestGuide(overrides: Partial<KnowledgePackage> = {}): KnowledgePackage {
  return {
    id: 'test-guide',
    title: 'Test Guide',
    version: '1.0.0',
    resolution: '375*808',
    rootNodeId: 'root',
    nodes: [
      {
        id: 'root',
        title: 'Root Node',
        keyContent: 'Root content',
        nodeKind: 'image' as const,
        imageUrl: '',
        hotspots: [
          { edgeId: 'edge-1', targetNodeId: 'node-2', label: 'Next', x: 0.5, y: 0.8 },
        ],
      },
      {
        id: 'node-2',
        title: 'Second Node',
        keyContent: 'Second node content',
        nodeKind: 'image' as const,
        imageUrl: '',
        hotspots: [],
      },
    ],
    edges: [
      { id: 'edge-1', fromNodeId: 'root', toNodeId: 'node-2', relationLabel: 'Next' },
    ],
    metadata: { updatedAt: '2026-06-23T00:00:00.000Z' },
    ...overrides,
  }
}

export function createTestApp(): { app: express.Express; cleanup: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-test-'))

  // Write test guide fixture into workspace
  const workspaceDir = path.join(tmpDir, 'workspace')
  const guideDir = path.join(workspaceDir, 'test-guide')
  fs.mkdirSync(guideDir, { recursive: true })
  const guide = createTestGuide()
  fs.writeFileSync(path.join(guideDir, 'guide.json'), JSON.stringify(guide, null, 2))

  const repo = new FsRepository(tmpDir)
  const guideService = new GuideService(repo)
  const generateService = new GenerateService(repo, NULL_MODULE, NULL_MODULE, NULL_MODULE, NULL_MODULE)

  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '50mb' }))
  app.use('/api', healthRouter)
  app.use('/api', createGuidesRouter(guideService))
  app.use('/api', createGeneratesRouter(generateService))
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
  })
  app.use(errorHandler)

  return {
    app,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  }
}
