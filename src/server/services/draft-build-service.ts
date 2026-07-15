import fs from 'node:fs'
import path from 'node:path'
import { ProjectRepository } from '../storage/project-repository.js'
import { buildStaticProduct } from './static-product-builder.js'

export type DraftProduct = 'atlas' | 'catalog'

export interface DraftBuildResult {
  product: DraftProduct
  sourceRevision: number
  projectVersion: string
  manifestPath: string
  draftDir: string
  productDir: string
}

/** Builds one validated product into the static draft proxy directory. */
export class DraftBuildService {
  private readonly projects: ProjectRepository
  private readonly root: string

  constructor(projects: ProjectRepository, opts: { dataDir?: string } = {}) {
    this.projects = projects
    this.root = path.join(opts.dataDir ?? path.resolve('data'), 'draft-builds')
    fs.mkdirSync(this.root, { recursive: true })
  }

  rootDir(): string {
    return this.root
  }

  buildDraft(
    projectId: string,
    product: DraftProduct,
    now: () => string = () => new Date().toISOString(),
  ): DraftBuildResult {
    const project = this.projects.get(projectId)
    const buildId = `${product}-${Date.now()}-${project.metadata.revision}`
    const draftDir = path.join(this.root, projectId, buildId)
    const temporaryDir = `${draftDir}__tmp`
    const productDir = path.join(draftDir, product)

    if (fs.existsSync(temporaryDir)) fs.rmSync(temporaryDir, { recursive: true, force: true })
    fs.mkdirSync(temporaryDir, { recursive: true })

    try {
      const result = buildStaticProduct({
        project,
        projects: this.projects,
        product,
        productDir: path.join(temporaryDir, product),
        now,
      })
      if (fs.existsSync(draftDir)) fs.rmSync(draftDir, { recursive: true, force: true })
      fs.renameSync(temporaryDir, draftDir)
      return {
        product,
        sourceRevision: project.metadata.revision,
        projectVersion: project.version,
        manifestPath: path.join(productDir, path.basename(result.manifestPath)),
        draftDir,
        productDir,
      }
    } catch (error) {
      if (fs.existsSync(temporaryDir)) fs.rmSync(temporaryDir, { recursive: true, force: true })
      throw error
    }
  }
}
