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
import { ProjectRepository } from './storage/project-repository.js'
import { AssetRepository } from './storage/asset-repository.js'
import { ReleaseRepository } from './storage/release-repository.js'

// Business services
import { ProjectService } from './services/project-service.js'
import { AssetService } from './services/asset-service.js'

// Routes
import { healthRouter } from './routes/health.js'
import { createProjectsRouter } from './routes/projects.js'
import { createAssetsRouter } from './routes/assets.js'
import { createReleasesRouter } from './routes/releases.js'
import { createPreviewsRouter } from './routes/previews.js'

// Middleware
import { errorHandler } from './middleware/error-handler.js'

const config = loadConfig()

// ─── Dependency Injection ──────────────────────────────────

const projectRepo = new ProjectRepository({ dataDir: config.DATA_DIR })
const assetRepo = new AssetRepository(projectRepo, { dataDir: config.DATA_DIR })
const releaseRepo = new ReleaseRepository({ dataDir: config.DATA_DIR })
const projectService = new ProjectService(projectRepo)
const assetService = new AssetService(projectRepo, assetRepo)

// ─── Express App ──────────────────────────────────────────

const app = express()

app.use(cors({ origin: config.CORS_ORIGIN }))
app.use(express.json({ limit: '50mb' }))

// API routes
app.use('/api', healthRouter)
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

void path

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