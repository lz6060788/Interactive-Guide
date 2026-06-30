// ============================================================
// Interactive Guide - Server Entry Point
// ============================================================
// Wires up: config → repository → services → routes → middleware
// Graceful shutdown on SIGTERM/SIGINT.

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { loadConfig } from './config.js'

// Storage layer
import { FsRepository } from './storage/fs-repository.js'
import { ProjectRepository } from './storage/project-repository.js'
import { AssetRepository } from './storage/asset-repository.js'
import { ReleaseRepository } from './storage/release-repository.js'

// Business services
import { GuideService } from './services/guide-service.js'
import { GenerateService } from './services/generate-service.js'
import { ProjectService } from './services/project-service.js'
import { AssetService } from './services/asset-service.js'

// AI modules (imported as modules, not classes)
import * as visionModule from './ai/vision.js'
import * as imageModule from './ai/image.js'
import * as videoModule from './ai/video.js'
import * as mediaModule from './ai/media.js'

// Routes
import { healthRouter } from './routes/health.js'
import { createGuidesRouter } from './routes/guides.js'
import { createGeneratesRouter } from './routes/generates.js'
import { createProjectsRouter } from './routes/projects.js'
import { createAssetsRouter } from './routes/assets.js'
import { createReleasesRouter } from './routes/releases.js'
import { createPreviewsRouter } from './routes/previews.js'

// Middleware
import { errorHandler } from './middleware/error-handler.js'

const config = loadConfig()

// ─── Dependency Injection ──────────────────────────────────

const fsRepo = new FsRepository()
const guideService = new GuideService(fsRepo)
const generateService = new GenerateService(fsRepo, visionModule, imageModule, videoModule, mediaModule)

const projectRepo = new ProjectRepository({ dataDir: config.DATA_DIR })
const assetRepo = new AssetRepository(projectRepo, { dataDir: config.DATA_DIR })
const releaseRepo = new ReleaseRepository({ dataDir: config.DATA_DIR })
const projectService = new ProjectService(projectRepo)
const assetService = new AssetService(projectRepo, assetRepo)

// ─── Express App ──────────────────────────────────────────

const app = express()

app.use(cors({ origin: config.CORS_ORIGIN }))
app.use(express.json({ limit: '50mb' }))

// Static file serving for build outputs and temp media
app.use('/api/media', express.static(path.resolve('data/publish')))
app.use('/api/media/generates', express.static(path.resolve('data/generates')))
app.use('/api/media/workspace', express.static(path.resolve('data/workspace')))
app.use('/api/runtime-bundles', express.static(path.resolve('data/runtime-bundles')))
app.use('/api/panorama-bundles', express.static(path.resolve('data/panorama-bundles')))

// API routes
app.use('/api', healthRouter)
app.use('/api', createGuidesRouter(guideService))
app.use('/api', createGeneratesRouter(generateService))
// Phase 2 routes — GuideProject 2.0 surface
app.use('/api', createProjectsRouter(projectService))
app.use('/api', createAssetsRouter(projectService, assetService))
app.use('/api', createReleasesRouter(projectRepo, releaseRepo))
app.use('/api', createPreviewsRouter(projectRepo))

// 404 catch-all for unmatched routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
})

// Global error handler (must be registered after routes)
app.use(errorHandler)

// ─── Server Start ─────────────────────────────────────────

const server = app.listen(config.PORT, () => {
  console.log(`[Interactive-Guide] Server running on http://localhost:${config.PORT}`)
})

// ─── Graceful Shutdown ────────────────────────────────────

function shutdown(signal: string) {
  console.log(`\n[Interactive-Guide] ${signal} received, shutting down...`)
  server.close(() => {
    console.log('[Interactive-Guide] Server closed')
    process.exit(0)
  })

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[Interactive-Guide] Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
