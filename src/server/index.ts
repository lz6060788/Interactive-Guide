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

// Business services
import { GuideService } from './services/guide-service.js'
import { GenerateService } from './services/generate-service.js'

// AI modules (imported as modules, not classes)
import * as visionModule from './ai/vision.js'
import * as imageModule from './ai/image.js'
import * as videoModule from './ai/video.js'
import * as mediaModule from './ai/media.js'

// Routes
import { healthRouter } from './routes/health.js'
import { createGuidesRouter } from './routes/guides.js'
import { createGeneratesRouter } from './routes/generates.js'

// Middleware
import { errorHandler } from './middleware/error-handler.js'

const config = loadConfig()

// ─── Dependency Injection ──────────────────────────────────

const repo = new FsRepository()
const guideService = new GuideService(repo)
const generateService = new GenerateService(repo, visionModule, imageModule, videoModule, mediaModule)

// ─── Express App ──────────────────────────────────────────

const app = express()

app.use(cors({ origin: config.CORS_ORIGIN }))
app.use(express.json({ limit: '50mb' }))

// Static file serving for build outputs and temp media
app.use('/api/media', express.static(path.resolve('data/publish')))
app.use('/api/media/generates', express.static(path.resolve('data/generates')))
app.use('/api/media/workspace', express.static(path.resolve('data/workspace')))
app.use('/api/runtime-bundles', express.static(path.resolve('data/runtime-bundles')))

// API routes
app.use('/api', healthRouter)
app.use('/api', createGuidesRouter(guideService))
app.use('/api', createGeneratesRouter(generateService))

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
