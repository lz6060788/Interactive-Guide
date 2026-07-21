import fs from 'node:fs'
import path from 'node:path'
import express, { type Express } from 'express'
import cors from 'cors'
import { ProjectRepository } from './storage/project-repository.js'
import { AssetRepository } from './storage/asset-repository.js'
import { ReleaseRepository } from './storage/release-repository.js'
import { ReviewRepository } from './storage/review-repository.js'
import { AuthoringBlobRepository } from './storage/authoring-blob-repository.js'
import { AuthoringOperationRepository } from './storage/authoring-operation-repository.js'
import { ProjectService } from './services/project-service.js'
import { AssetService } from './services/asset-service.js'
import { ReviewService } from './services/review-service.js'
import { AuthoringService } from './services/authoring-service.js'
import { AuthoringChangeSetService } from './services/authoring-changeset-service.js'
import { AuthoringStateService } from './services/authoring-state-service.js'
import { healthRouter } from './routes/health.js'
import { createAutomationRouter } from './routes/automation.js'
import { createProjectsRouter } from './routes/projects.js'
import { createAssetsRouter } from './routes/assets.js'
import { createReleasesRouter } from './routes/releases.js'
import { createPreviewsRouter } from './routes/previews.js'
import { createReviewSessionsRouter } from './routes/review-sessions.js'
import { createAuthoringRouter } from './routes/authoring.js'
import { errorHandler } from './middleware/error-handler.js'

export interface WorkbenchAppOptions {
  dataDir: string
  adminDir?: string
  corsOrigin?: string
}

/** Build the Workbench HTTP application without listening or touching process lifecycle. */
export function createWorkbenchApp(options: WorkbenchAppOptions): Express {
  const dataDir = path.resolve(options.dataDir)
  const adminDir = options.adminDir ? path.resolve(options.adminDir) : undefined
  const adminEntry = adminDir ? path.join(adminDir, 'index.html') : undefined
  if (adminEntry && !fs.existsSync(adminEntry)) {
    throw new Error(`Admin build is missing: ${adminEntry}`)
  }

  const projectRepo = new ProjectRepository({ dataDir })
  const assetRepo = new AssetRepository(projectRepo, { dataDir })
  const releaseRepo = new ReleaseRepository({ dataDir })
  const reviewRepo = new ReviewRepository({ dataDir })
  const authoringBlobRepo = new AuthoringBlobRepository({ dataDir })
  const authoringOperationRepo = new AuthoringOperationRepository({ dataDir })
  const projectService = new ProjectService(projectRepo)
  const assetService = new AssetService(projectRepo, assetRepo)
  const reviewService = new ReviewService(projectRepo, reviewRepo)
  const authoringService = new AuthoringService(
    projectRepo,
    authoringBlobRepo,
    authoringOperationRepo,
    { dataDir },
  )
  const authoringChangeSetService = new AuthoringChangeSetService(
    projectRepo,
    assetRepo,
    authoringBlobRepo,
    authoringOperationRepo,
    { dataDir },
  )
  const authoringStateService = new AuthoringStateService(projectRepo)

  const app = express()
  if (options.corsOrigin) app.use(cors({ origin: options.corsOrigin }))
  app.use(
    '/api',
    createAuthoringRouter(
      authoringBlobRepo,
      authoringService,
      authoringChangeSetService,
      authoringStateService,
    ),
  )
  app.use(express.json({ limit: '50mb' }))

  app.use('/api', healthRouter)
  app.use('/api', createAutomationRouter())
  app.use('/api', createProjectsRouter(projectService))
  app.use('/api', createAssetsRouter(projectService, assetService))
  app.use('/api', createReviewSessionsRouter(reviewService))
  app.use('/api', createReleasesRouter(projectRepo, releaseRepo, reviewService))
  app.use('/api', createPreviewsRouter(projectRepo, { dataDir }))
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
  })

  if (adminDir && adminEntry) {
    app.use(express.static(adminDir))
    app.get(/.*/, (req, res, next) => {
      if (path.extname(req.path)) {
        next()
        return
      }
      res.sendFile(adminEntry)
    })
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
  })
  app.use(errorHandler)
  return app
}
