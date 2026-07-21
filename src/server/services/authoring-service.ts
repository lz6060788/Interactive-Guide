import crypto, { type Hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  GUIDE_AUTHORING_BUNDLE_CONTRACT,
  GUIDE_AUTHORING_BUNDLE_VERSION,
  type AuthoringFile,
  type GuideAuthoringBundleV1,
} from '../../automation/contracts/authoring-bundle-v1.js'
import { PROJECT_TREE_HASH_ALGORITHM } from '../../automation/contracts/authoring-state-v1.js'
import type { AssetDefinition, AssetRegistry } from '../../domain/project-types.js'
import { validateReleaseProject, type ValidationIssue } from '../../domain/project-validator.js'
import { WORKBENCH_VERSION } from '../workbench-version.js'
import { AssetRepository, validateHtmlBundleArchive } from '../storage/asset-repository.js'
import {
  AuthoringBlobHashMismatchError,
  AuthoringBlobNotFoundError,
  AuthoringBlobRepository,
  AuthoringBlobSizeMismatchError,
} from '../storage/authoring-blob-repository.js'
import {
  AuthoringOperationFingerprintConflictError,
  AuthoringOperationRepository,
  type AuthoringOperationRecord,
  type PreparedAuthoringOperation,
} from '../storage/authoring-operation-repository.js'
import { ProjectRepository } from '../storage/project-repository.js'
import { hashGuideProject } from './review-service.js'
import {
  mapAuthoringBundleToDraft,
  type AuthoringCalibrationQueueItem,
} from './authoring-mapper.js'

export { PROJECT_TREE_HASH_ALGORITHM }
const VALIDATION_TOKEN_ALGORITHM = 'sha256-authoring-validation-v1' as const

export interface AuthoringValidationIssue {
  code: string
  path: string
  message: string
}

export interface AuthoringValidationPlan {
  ok: boolean
  contract: typeof GUIDE_AUTHORING_BUNDLE_CONTRACT
  contractVersion: typeof GUIDE_AUTHORING_BUNDLE_VERSION
  workbenchVersion: string
  requestHash: string
  validationToken: string
  validationTokenAlgorithm: typeof VALIDATION_TOKEN_ALGORITHM
  blobFingerprint: string
  projectId: string
  baseRevision: 0
  projectedRevision: 1
  summary: {
    stageCount: 3
    categoryCount: number
    itemCount: number
    runtimeAssetCount: number
    authoringSourceCount: number
  }
  issues: AuthoringValidationIssue[]
  releaseIssues: ValidationIssue[]
  calibrationQueue: AuthoringCalibrationQueueItem[]
  normalizationNotes: string[]
}

export interface AuthoringApplyResult {
  contract: typeof GUIDE_AUTHORING_BUNDLE_CONTRACT
  contractVersion: typeof GUIDE_AUTHORING_BUNDLE_VERSION
  workbenchVersion: string
  projectId: string
  revision: number
  requestHash: string
  validationToken: string
  projectSha256: string
  projectTreeSha256: string
  projectTreeHashAlgorithm: typeof PROJECT_TREE_HASH_ALGORITHM
  calibrationQueue: AuthoringCalibrationQueueItem[]
  projectPath: string
}

const AuthoringApplyResultSchema: z.ZodType<AuthoringApplyResult> = z
  .object({
    contract: z.literal(GUIDE_AUTHORING_BUNDLE_CONTRACT),
    contractVersion: z.literal(GUIDE_AUTHORING_BUNDLE_VERSION),
    workbenchVersion: z.string().min(1),
    projectId: z.string().min(1),
    revision: z.number().int().positive(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    validationToken: z.string().regex(/^[a-f0-9]{64}$/),
    projectSha256: z.string().regex(/^[a-f0-9]{64}$/),
    projectTreeSha256: z.string().regex(/^[a-f0-9]{64}$/),
    projectTreeHashAlgorithm: z.literal(PROJECT_TREE_HASH_ALGORITHM),
    calibrationQueue: z.array(
      z
        .object({
          code: z.enum([
            'CATEGORY_LAYOUT_MISSING',
            'ITEM_MARKER_MISSING',
            'ITEM_FOCUS_RECT_MISSING',
          ]),
          path: z.string(),
          targetKind: z.enum(['category', 'item']),
          targetId: z.string(),
          categoryId: z.string(),
          itemId: z.string().optional(),
          message: z.string(),
        })
        .strict(),
    ),
    projectPath: z.string().startsWith('/projects/'),
  })
  .strict()

export class AuthoringValidationFailedError extends Error {
  constructor(public readonly issues: AuthoringValidationIssue[]) {
    super(`authoring bundle validation failed with ${issues.length} issue(s)`)
    this.name = 'AuthoringValidationFailedError'
  }
}

export class AuthoringValidationTokenStaleError extends Error {
  constructor() {
    super('authoring validation token does not match the current bundle and Workbench')
    this.name = 'AuthoringValidationTokenStaleError'
  }
}

export class AuthoringProjectExistsError extends Error {
  constructor(public readonly projectId: string) {
    super(`project "${projectId}" already exists`)
    this.name = 'AuthoringProjectExistsError'
  }
}

export class AuthoringOperationRecoveryRequiredError extends Error {
  constructor(
    public readonly projectId: string,
    message: string,
  ) {
    super(`authoring operation recovery required for "${projectId}": ${message}`)
    this.name = 'AuthoringOperationRecoveryRequiredError'
  }
}

export class AuthoringApplyAtomicityError extends Error {
  constructor(
    public readonly projectId: string,
    cause: unknown,
  ) {
    super(`authoring apply failed before an atomic project commit: ${(cause as Error).message}`)
    this.name = 'AuthoringApplyAtomicityError'
  }
}

export interface AuthoringServiceOptions {
  dataDir: string
  now?: () => Date
  /** Failure-injection seam used to verify that a prepared project is not visible early. */
  beforeVisibleCommit?: (projectId: string) => void
}

export class AuthoringService {
  private readonly dataDir: string
  private readonly stagingRoot: string
  private readonly now: () => Date

  constructor(
    private readonly projects: ProjectRepository,
    private readonly blobs: AuthoringBlobRepository,
    private readonly operations: AuthoringOperationRepository,
    private readonly options: AuthoringServiceOptions,
  ) {
    this.dataDir = path.resolve(options.dataDir)
    this.stagingRoot = path.join(this.dataDir, 'authoring', 'staging')
    this.now = options.now ?? (() => new Date())
    fs.mkdirSync(this.stagingRoot, { recursive: true })
  }

  validate(bundle: GuideAuthoringBundleV1): AuthoringValidationPlan {
    const requestHash = hashCanonicalJson(bundle)
    const blobFingerprint = hashCanonicalJson(
      bundle.files
        .map(file => ({ sha256: file.blobSha256, size: file.size }))
        .sort((left, right) =>
          left.sha256 === right.sha256
            ? left.size - right.size
            : compareText(left.sha256, right.sha256),
        ),
    )
    const validationToken = hashCanonicalJson({
      algorithm: VALIDATION_TOKEN_ALGORITHM,
      workbenchVersion: WORKBENCH_VERSION,
      contract: bundle.contract,
      contractVersion: bundle.contractVersion,
      expectedRevision: bundle.expectedRevision,
      requestHash,
      blobFingerprint,
    })
    const issues: AuthoringValidationIssue[] = []

    if (this.projects.tryGet(bundle.project.id)) {
      issues.push({
        code: 'PROJECT_EXISTS',
        path: 'project.id',
        message: `project "${bundle.project.id}" already exists`,
      })
    }

    const verified = new Set<string>()
    for (const [index, file] of bundle.files.entries()) {
      const verificationKey = `${file.blobSha256}:${file.size}`
      if (!verified.has(verificationKey)) {
        try {
          this.blobs.verify(file.blobSha256, file.size)
          verified.add(verificationKey)
        } catch (error) {
          issues.push(blobIssue(error, index))
          continue
        }
      }
      if (file.usage === 'runtime' && file.kind === 'html-bundle') {
        try {
          validateHtmlBundleArchive(fs.readFileSync(this.blobs.getPath(file.blobSha256)))
        } catch (error) {
          issues.push({
            code: 'HTML_BUNDLE_INVALID',
            path: `files.${index}`,
            message: (error as Error).message,
          })
        }
      }
    }

    const assets = buildAssetRegistry(bundle)
    let releaseIssues: ValidationIssue[] = []
    let calibrationQueue: AuthoringCalibrationQueueItem[] = []
    try {
      const mapped = mapAuthoringBundleToDraft(bundle, assets, {
        now: '1970-01-01T00:00:00.000Z',
      })
      calibrationQueue = mapped.calibrationQueue
      issues.push(...mapped.draftIssues.map(toAuthoringIssue))
      releaseIssues = validateReleaseProject(mapped.project).issues
    } catch (error) {
      if (error instanceof z.ZodError) {
        issues.push(
          ...error.issues.map(issue => ({
            code: 'PROJECT_MAPPING_INVALID',
            path: issue.path.join('.'),
            message: issue.message,
          })),
        )
      } else {
        issues.push({
          code: 'PROJECT_MAPPING_INVALID',
          path: 'project',
          message: (error as Error).message,
        })
      }
    }

    const runtimeAssets = bundle.files.filter(file => file.usage === 'runtime')
    const authoringSources = bundle.files.filter(file => file.usage === 'authoring-source')
    const categoryCount = bundle.knowledge.stages.reduce(
      (total, stage) => total + stage.categories.length,
      0,
    )
    const itemCount = bundle.knowledge.stages.reduce(
      (total, stage) =>
        total +
        stage.categories.reduce((stageTotal, category) => stageTotal + category.items.length, 0),
      0,
    )

    return {
      ok: issues.length === 0,
      contract: GUIDE_AUTHORING_BUNDLE_CONTRACT,
      contractVersion: GUIDE_AUTHORING_BUNDLE_VERSION,
      workbenchVersion: WORKBENCH_VERSION,
      requestHash,
      validationToken,
      validationTokenAlgorithm: VALIDATION_TOKEN_ALGORITHM,
      blobFingerprint,
      projectId: bundle.project.id,
      baseRevision: 0,
      projectedRevision: 1,
      summary: {
        stageCount: 3,
        categoryCount,
        itemCount,
        runtimeAssetCount: runtimeAssets.length,
        authoringSourceCount: authoringSources.length,
      },
      issues,
      releaseIssues,
      calibrationQueue,
      normalizationNotes: [
        'Workbench assigns project metadata timestamps during apply.',
        'Workbench derives project-relative runtime asset paths from asset kind and assetId.',
        'Authoring source files are retained outside the release asset registry.',
      ],
    }
  }

  apply(bundle: GuideAuthoringBundleV1, validationToken: string): AuthoringApplyResult {
    const plan = this.validate(bundle)
    if (validationToken !== plan.validationToken) throw new AuthoringValidationTokenStaleError()
    const fingerprint = plan.requestHash

    const existingOperation = this.operations.get<AuthoringApplyResult>(
      bundle.project.id,
      bundle.idempotencyKey,
    )
    if (existingOperation) {
      assertOperationFingerprint(existingOperation, fingerprint)
      assertBundleOperationMetadata(bundle, plan, existingOperation)
      if (existingOperation.status === 'succeeded') {
        return this.replaySucceeded(bundle, plan, existingOperation)
      }
      return this.recoverPrepared(bundle, plan, existingOperation)
    }

    if (this.projects.tryGet(bundle.project.id)) {
      throw new AuthoringProjectExistsError(bundle.project.id)
    }
    if (!plan.ok) throw new AuthoringValidationFailedError(plan.issues)

    return this.createAtomically(bundle, plan)
  }

  private createAtomically(
    bundle: GuideAuthoringBundleV1,
    plan: AuthoringValidationPlan,
  ): AuthoringApplyResult {
    const operationId = `authoring-${crypto.randomUUID()}`
    const stageDataDir = this.resolveStage(operationId)
    const stageProjects = new ProjectRepository({ dataDir: stageDataDir })
    let prepared = false

    try {
      const assets = this.materializeRuntimeAssets(bundle, stageProjects)
      this.materializeAuthoringSources(bundle, stageProjects)
      const mapped = mapAuthoringBundleToDraft(bundle, assets, {
        now: this.now().toISOString(),
      })
      if (mapped.draftIssues.length > 0) {
        throw new AuthoringValidationFailedError(mapped.draftIssues.map(toAuthoringIssue))
      }
      const saved = stageProjects.save(mapped.project, { expectedRevision: 0 })
      if (saved.conflict) throw new Error('staged project was created concurrently')

      const stagedProjectDir = projectDir(stageProjects, bundle.project.id)
      const targetProjectSha256 = hashGuideProject(saved.project)
      const targetAssetTreeSha256 = hashProjectTree(stagedProjectDir)
      if (this.projectExistsOnDisk(bundle.project.id)) {
        throw new AuthoringProjectExistsError(bundle.project.id)
      }

      const operation = this.operations.prepare({
        projectId: bundle.project.id,
        idempotencyKey: bundle.idempotencyKey,
        requestFingerprint: plan.requestHash,
        operationContract: bundle.contract,
        expectedRevision: bundle.expectedRevision,
        validationToken: plan.validationToken,
        targetProjectSha256,
        targetAssetTreeSha256,
        projectedRevision: 1,
        operationId,
        stagingRelativePath: operationId,
        preparedAt: this.now().toISOString(),
      })
      prepared = true

      if (
        operation.status === 'succeeded' ||
        operation.targetProjectSha256 !== targetProjectSha256 ||
        operation.operationId !== operationId
      ) {
        cleanupStage(this.stagingRoot, stageDataDir)
        if (operation.status === 'succeeded') {
          assertBundleOperationMetadata(bundle, plan, operation)
          return this.replaySucceeded(bundle, plan, operation)
        }
        return this.recoverPrepared(bundle, plan, operation)
      }

      this.options.beforeVisibleCommit?.(bundle.project.id)
      this.commitStagedProject(stageProjects, bundle.project.id)
      const result = this.finalizeCommitted(bundle, plan, operation)
      cleanupStage(this.stagingRoot, stageDataDir)
      return result
    } catch (error) {
      if (!prepared) cleanupStage(this.stagingRoot, stageDataDir)
      if (
        error instanceof AuthoringValidationFailedError ||
        error instanceof AuthoringProjectExistsError ||
        error instanceof AuthoringOperationFingerprintConflictError ||
        error instanceof AuthoringOperationRecoveryRequiredError
      ) {
        throw error
      }
      throw new AuthoringApplyAtomicityError(bundle.project.id, error)
    }
  }

  private recoverPrepared(
    bundle: GuideAuthoringBundleV1,
    plan: AuthoringValidationPlan,
    operation: PreparedAuthoringOperation,
  ): AuthoringApplyResult {
    assertBundleOperationMetadata(bundle, plan, operation)
    const visible = this.projects.tryGet(bundle.project.id)
    if (visible) return this.finalizeCommitted(bundle, plan, operation)
    if (!operation.stagingRelativePath) {
      throw new AuthoringOperationRecoveryRequiredError(
        bundle.project.id,
        'prepared journal has no staging path',
      )
    }

    const stageDataDir = this.resolveStage(operation.stagingRelativePath)
    const stagedProjectFile = path.join(stageDataDir, 'projects', bundle.project.id, 'project.json')
    if (!fs.existsSync(stagedProjectFile)) {
      throw new AuthoringOperationRecoveryRequiredError(
        bundle.project.id,
        'prepared staging directory is missing',
      )
    }
    const stageProjects = new ProjectRepository({ dataDir: stageDataDir })
    const staged = stageProjects.get(bundle.project.id)
    const stagedProjectDir = projectDir(stageProjects, bundle.project.id)
    if (hashGuideProject(staged) !== operation.targetProjectSha256) {
      throw new AuthoringOperationRecoveryRequiredError(
        bundle.project.id,
        'staged project hash no longer matches the journal',
      )
    }
    if (hashProjectTree(stagedProjectDir) !== operation.targetAssetTreeSha256) {
      throw new AuthoringOperationRecoveryRequiredError(
        bundle.project.id,
        'staged project asset tree no longer matches the journal',
      )
    }

    this.options.beforeVisibleCommit?.(bundle.project.id)
    this.commitStagedProject(stageProjects, bundle.project.id)
    const result = this.finalizeCommitted(bundle, plan, operation)
    cleanupStage(this.stagingRoot, stageDataDir)
    return result
  }

  private finalizeCommitted(
    bundle: GuideAuthoringBundleV1,
    plan: AuthoringValidationPlan,
    operation: PreparedAuthoringOperation,
  ): AuthoringApplyResult {
    const project = this.projects.get(bundle.project.id)
    const projectSha256 = hashGuideProject(project)
    const projectTreeSha256 = hashProjectTree(projectDir(this.projects, bundle.project.id))
    if (
      projectSha256 !== operation.targetProjectSha256 ||
      projectTreeSha256 !== operation.targetAssetTreeSha256
    ) {
      throw new AuthoringOperationRecoveryRequiredError(
        bundle.project.id,
        'visible project does not match the prepared journal',
      )
    }

    const result: AuthoringApplyResult = {
      contract: GUIDE_AUTHORING_BUNDLE_CONTRACT,
      contractVersion: GUIDE_AUTHORING_BUNDLE_VERSION,
      workbenchVersion: WORKBENCH_VERSION,
      projectId: project.id,
      revision: project.metadata.revision,
      requestHash: plan.requestHash,
      validationToken: plan.validationToken,
      projectSha256,
      projectTreeSha256,
      projectTreeHashAlgorithm: PROJECT_TREE_HASH_ALGORITHM,
      calibrationQueue: plan.calibrationQueue,
      projectPath: `/projects/${encodeURIComponent(project.id)}`,
    }
    return this.operations.succeed({
      projectId: bundle.project.id,
      idempotencyKey: bundle.idempotencyKey,
      requestFingerprint: plan.requestHash,
      result,
      succeededAt: this.now().toISOString(),
    }).result
  }

  private replaySucceeded(
    bundle: GuideAuthoringBundleV1,
    plan: AuthoringValidationPlan,
    operation: Extract<AuthoringOperationRecord<unknown>, { status: 'succeeded' }>,
  ): AuthoringApplyResult {
    const projectId = bundle.project.id
    assertBundleOperationMetadata(bundle, plan, operation)
    const result = requireApplyResult(projectId, operation.result)
    const visible = this.projects.tryGet(projectId)
    if (!visible) {
      throw new AuthoringOperationRecoveryRequiredError(
        projectId,
        'succeeded journal points to a missing visible project',
      )
    }
    let projectSha256: string
    let projectTreeSha256: string
    try {
      projectSha256 = hashGuideProject(visible)
      projectTreeSha256 = hashProjectTree(projectDir(this.projects, projectId))
    } catch {
      throw new AuthoringOperationRecoveryRequiredError(
        projectId,
        'succeeded journal points to an incomplete visible project tree',
      )
    }
    if (
      projectSha256 !== operation.targetProjectSha256 ||
      projectTreeSha256 !== operation.targetAssetTreeSha256 ||
      result.projectSha256 !== projectSha256 ||
      result.projectTreeSha256 !== projectTreeSha256 ||
      result.requestHash !== operation.requestFingerprint ||
      result.requestHash !== plan.requestHash ||
      result.validationToken !== plan.validationToken ||
      result.revision !== (operation.projectedRevision ?? 1)
    ) {
      throw new AuthoringOperationRecoveryRequiredError(
        projectId,
        'visible project no longer matches the succeeded journal',
      )
    }
    return result
  }

  private commitStagedProject(stageProjects: ProjectRepository, projectId: string): void {
    const stagedProjectDir = projectDir(stageProjects, projectId)
    const finalProjectDir = projectDir(this.projects, projectId)
    if (fs.existsSync(finalProjectDir)) throw new AuthoringProjectExistsError(projectId)
    fs.mkdirSync(path.dirname(finalProjectDir), { recursive: true })
    try {
      fs.renameSync(stagedProjectDir, finalProjectDir)
    } catch (error) {
      if (fs.existsSync(finalProjectDir)) throw new AuthoringProjectExistsError(projectId)
      throw error
    }
  }

  private materializeRuntimeAssets(
    bundle: GuideAuthoringBundleV1,
    stageProjects: ProjectRepository,
  ): AssetRegistry {
    const registry = buildAssetRegistry(bundle)
    const assetRoot = stageProjects.resolveAssetDir(bundle.project.id)
    const htmlAssets = new AssetRepository(stageProjects, { dataDir: this.dataDir })

    for (const file of bundle.files) {
      if (file.usage !== 'runtime') continue
      this.blobs.verify(file.blobSha256, file.size)
      const source = this.blobs.getPath(file.blobSha256)
      const definition = registry.byId[file.assetId]!
      if (file.kind === 'html-bundle') {
        htmlAssets.registerHtmlBundle(bundle.project.id, {
          id: file.assetId,
          bytes: fs.readFileSync(source),
        })
        continue
      }
      const target = path.join(assetRoot, definition.sourcePath)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL)
    }
    return registry
  }

  private materializeAuthoringSources(
    bundle: GuideAuthoringBundleV1,
    stageProjects: ProjectRepository,
  ): void {
    const sources = bundle.files.filter(
      (file): file is Extract<AuthoringFile, { usage: 'authoring-source' }> =>
        file.usage === 'authoring-source',
    )
    if (sources.length === 0) return

    const root = path.join(projectDir(stageProjects, bundle.project.id), 'authoring-sources')
    const blobsRoot = path.join(root, 'blobs')
    fs.mkdirSync(blobsRoot, { recursive: true })
    const copied = new Set<string>()
    for (const source of sources) {
      this.blobs.verify(source.blobSha256, source.size)
      if (!copied.has(source.blobSha256)) {
        fs.copyFileSync(
          this.blobs.getPath(source.blobSha256),
          path.join(blobsRoot, source.blobSha256),
          fs.constants.COPYFILE_EXCL,
        )
        copied.add(source.blobSha256)
      }
    }
    fs.writeFileSync(
      path.join(root, 'manifest.json'),
      JSON.stringify(
        {
          schemaVersion: '1.0.0',
          files: sources.map(source => ({
            fileRef: source.fileRef,
            blobSha256: source.blobSha256,
            size: source.size,
            mediaType: source.mediaType,
            semanticRole: source.semanticRole,
            originalName: source.originalName,
          })),
        },
        null,
        2,
      ),
    )
  }

  private projectExistsOnDisk(projectId: string): boolean {
    return (
      fs.existsSync(projectDir(this.projects, projectId)) ||
      this.projects.tryGet(projectId) !== null
    )
  }

  private resolveStage(segment: string): string {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(segment)) {
      throw new AuthoringOperationRecoveryRequiredError('unknown', 'invalid staging path')
    }
    const resolved = path.resolve(this.stagingRoot, segment)
    if (!isInside(this.stagingRoot, resolved)) {
      throw new AuthoringOperationRecoveryRequiredError('unknown', 'staging path escapes root')
    }
    return resolved
  }
}

function buildAssetRegistry(bundle: GuideAuthoringBundleV1): AssetRegistry {
  const byId: Record<string, AssetDefinition> = {}
  for (const file of bundle.files) {
    if (file.usage !== 'runtime') continue
    const sourcePath =
      file.kind === 'image'
        ? path.posix.join('images', file.assetId, `image.${file.extension}`)
        : file.kind === 'video'
          ? path.posix.join('videos', file.assetId, `video.${file.extension}`)
          : path.posix.join('scenes', file.assetId)
    byId[file.assetId] = {
      id: file.assetId,
      kind: file.kind,
      sourcePath,
      ...(file.kind === 'html-bundle' ? { entryPath: 'index.html' } : {}),
      mimeType: file.mimeType,
      sha256: file.blobSha256,
      size: file.size,
    }
  }
  return { byId }
}

function blobIssue(error: unknown, fileIndex: number): AuthoringValidationIssue {
  if (error instanceof AuthoringBlobNotFoundError) {
    return {
      code: 'BLOB_NOT_FOUND',
      path: `files.${fileIndex}.blobSha256`,
      message: error.message,
    }
  }
  if (error instanceof AuthoringBlobSizeMismatchError) {
    return { code: 'BLOB_SIZE_MISMATCH', path: `files.${fileIndex}.size`, message: error.message }
  }
  if (error instanceof AuthoringBlobHashMismatchError) {
    return {
      code: 'BLOB_HASH_MISMATCH',
      path: `files.${fileIndex}.blobSha256`,
      message: error.message,
    }
  }
  return { code: 'BLOB_INVALID', path: `files.${fileIndex}`, message: (error as Error).message }
}

function toAuthoringIssue(issue: ValidationIssue): AuthoringValidationIssue {
  return { code: issue.code, path: issue.path, message: issue.message }
}

function assertOperationFingerprint(
  operation: AuthoringOperationRecord<AuthoringApplyResult>,
  fingerprint: string,
): void {
  if (operation.requestFingerprint === fingerprint) return
  throw new AuthoringOperationFingerprintConflictError(
    operation.projectId,
    operation.idempotencyKeyHash,
    operation.requestFingerprint,
    fingerprint,
  )
}

function assertBundleOperationMetadata(
  bundle: GuideAuthoringBundleV1,
  plan: AuthoringValidationPlan,
  operation: AuthoringOperationRecord<unknown>,
): void {
  if (
    (operation.operationContract !== undefined &&
      operation.operationContract !== GUIDE_AUTHORING_BUNDLE_CONTRACT) ||
    (operation.expectedRevision !== undefined &&
      operation.expectedRevision !== bundle.expectedRevision) ||
    (operation.projectedRevision !== undefined && operation.projectedRevision !== 1) ||
    (operation.validationToken !== undefined && operation.validationToken !== plan.validationToken)
  ) {
    throw new AuthoringOperationRecoveryRequiredError(
      bundle.project.id,
      'journal metadata does not match the authoring bundle',
    )
  }
}

function projectDir(projects: ProjectRepository, projectId: string): string {
  return path.dirname(projects.resolveAssetDir(projectId))
}

function hashCanonicalJson(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(sortJson(value)))
    .digest('hex')
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, sortJson(child)]),
    )
  }
  return value
}

/** Hash all persisted project bytes except project.json, whose canonical hash is reported separately. */
export function hashProjectTree(projectRootInput: string): string {
  const projectRoot = path.resolve(projectRootInput)
  const files: Array<{ relativePath: string; absolutePath: string; size: number }> = []
  walkProjectTree(projectRoot, '', files)
  files.sort((left, right) => compareText(left.relativePath, right.relativePath))
  const hash = crypto.createHash('sha256')
  updateText(hash, PROJECT_TREE_HASH_ALGORITHM)
  updateText(hash, String(files.length))
  for (const file of files) {
    updateText(hash, file.relativePath)
    updateText(hash, String(file.size))
    hashFileInto(hash, file.absolutePath, file.size)
  }
  return hash.digest('hex')
}

function walkProjectTree(
  current: string,
  relativeDir: string,
  files: Array<{ relativePath: string; absolutePath: string; size: number }>,
): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
    if (relativePath === 'project.json') continue
    const absolutePath = path.join(current, entry.name)
    const stat = fs.lstatSync(absolutePath)
    if (stat.isSymbolicLink()) throw new Error(`symbolic link is not allowed: ${relativePath}`)
    if (stat.isDirectory()) walkProjectTree(absolutePath, relativePath, files)
    else if (stat.isFile()) files.push({ relativePath, absolutePath, size: stat.size })
    else throw new Error(`unsupported project entry: ${relativePath}`)
  }
}

function hashFileInto(hash: Hash, filePath: string, size: number): void {
  const descriptor = fs.openSync(filePath, 'r')
  const buffer = Buffer.allocUnsafe(64 * 1024)
  try {
    let offset = 0
    while (offset < size) {
      const read = fs.readSync(
        descriptor,
        buffer,
        0,
        Math.min(buffer.length, size - offset),
        offset,
      )
      if (read === 0) throw new Error(`unexpected end of file: ${filePath}`)
      hash.update(buffer.subarray(0, read))
      offset += read
    }
  } finally {
    fs.closeSync(descriptor)
  }
}

function updateText(hash: Hash, value: string): void {
  const bytes = Buffer.from(value, 'utf8')
  const length = Buffer.allocUnsafe(8)
  length.writeBigUInt64BE(BigInt(bytes.length))
  hash.update(length)
  hash.update(bytes)
}

function removeInside(root: string, target: string): void {
  if (!fs.existsSync(target)) return
  if (!isInside(root, target) || path.resolve(root) === path.resolve(target)) {
    throw new Error(`refusing to remove staging path outside root: ${target}`)
  }
  fs.rmSync(target, { recursive: true, force: true })
}

function cleanupStage(root: string, target: string): void {
  try {
    removeInside(root, target)
  } catch (error) {
    console.warn(
      `[AuthoringService] staging cleanup required for ${target}: ${(error as Error).message}`,
    )
  }
}

function requireApplyResult(projectId: string, value: unknown): AuthoringApplyResult {
  const parsed = AuthoringApplyResultSchema.safeParse(value)
  if (!parsed.success || parsed.data.projectId !== projectId) {
    throw new AuthoringOperationRecoveryRequiredError(
      projectId,
      'succeeded journal contains an invalid result',
    )
  }
  return parsed.data
}

function isInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  return resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
