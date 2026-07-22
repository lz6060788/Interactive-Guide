import fs from 'node:fs'
import path from 'node:path'
import { ProjectRepository } from '../storage/project-repository.js'
import { buildStaticProduct } from './static-product-builder.js'

export type DraftProduct = 'atlas' | 'catalog' | 'gallery'

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

  async buildDraft(
    projectId: string,
    product: DraftProduct,
    now: () => string = () => new Date().toISOString(),
  ): Promise<DraftBuildResult> {
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
      await renameWithTransientWindowsRetry(temporaryDir, draftDir)
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

async function renameWithTransientWindowsRetry(source: string, destination: string): Promise<void> {
  const retryableCodes = new Set(['EACCES', 'EBUSY', 'EPERM'])
  const attempts = process.platform === 'win32' ? 8 : 1

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fs.promises.rename(source, destination)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!code || !retryableCodes.has(code) || attempt === attempts) throw error
      await new Promise(resolve => setTimeout(resolve, attempt * 50))
    }
  }
}
