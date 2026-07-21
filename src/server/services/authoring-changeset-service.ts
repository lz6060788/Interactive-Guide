import crypto, { type Hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  GUIDE_AUTHORING_CHANGESET_CONTRACT,
  GUIDE_AUTHORING_CHANGESET_VERSION,
  type GuideAuthoringChangeSetV1,
} from '../../automation/contracts/authoring-changeset-v1.js'
import {
  AuthoringSourceFileSchema,
  type AuthoringFile,
} from '../../automation/contracts/authoring-bundle-v1.js'
import { GuideProjectSchema } from '../../domain/project-schema.js'
import type { AssetDefinition, AssetRegistry, GuideProject } from '../../domain/project-types.js'
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
import {
  AuthoringApplyAtomicityError,
  AuthoringOperationRecoveryRequiredError,
  AuthoringValidationFailedError,
  AuthoringValidationTokenStaleError,
  PROJECT_TREE_HASH_ALGORITHM,
  hashProjectTree,
  type AuthoringValidationIssue,
} from './authoring-service.js'
import {
  mergeAuthoringChangeSet,
  type AuthoringChangeSetMergeResult,
} from './authoring-changeset-mapper.js'
import type { AuthoringCalibrationQueueItem } from './authoring-mapper.js'
import { hashGuideProject } from './review-service.js'

const VALIDATION_TOKEN_ALGORITHM = 'sha256-authoring-changeset-validation-v1' as const
const IDEMPOTENCY_SCOPE = `${GUIDE_AUTHORING_CHANGESET_CONTRACT}:` as const
const SOURCE_MANIFEST_RELATIVE_PATH = 'authoring-sources/manifest.json'

type RuntimeAuthoringFile = Extract<AuthoringFile, { usage: 'runtime' }>
type AuthoringSourceFile = Extract<AuthoringFile, { usage: 'authoring-source' }>
type StoredAuthoringSourceFile = Omit<AuthoringSourceFile, 'usage'>

const AuthoringSourceManifestSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    files: z.array(AuthoringSourceFileSchema.omit({ usage: true })),
  })
  .strict()

const CalibrationQueueItemSchema = z
  .object({
    code: z.enum(['CATEGORY_LAYOUT_MISSING', 'ITEM_MARKER_MISSING', 'ITEM_FOCUS_RECT_MISSING']),
    path: z.string(),
    targetKind: z.enum(['category', 'item']),
    targetId: z.string(),
    categoryId: z.string(),
    itemId: z.string().optional(),
    message: z.string(),
  })
  .strict()

export interface AuthoringChangeSetValidationPlan {
  ok: boolean
  contract: typeof GUIDE_AUTHORING_CHANGESET_CONTRACT
  contractVersion: typeof GUIDE_AUTHORING_CHANGESET_VERSION
  workbenchVersion: string
  requestHash: string
  validationToken: string
  validationTokenAlgorithm: typeof VALIDATION_TOKEN_ALGORITHM
  blobFingerprint: string
  projectId: string
  baseRevision: number
  projectedRevision: number
  baseProjectSha256: string
  baseProjectTreeSha256: string
  projectTreeHashAlgorithm: typeof PROJECT_TREE_HASH_ALGORITHM
  summary: {
    partitionCount: number
    runtimeAssetCount: number
    authoringSourceCount: number
  }
  issues: AuthoringValidationIssue[]
  releaseIssues: ValidationIssue[]
  calibrationQueue: AuthoringCalibrationQueueItem[]
  normalizationNotes: string[]
}

export interface AuthoringChangeSetApplyResult {
  contract: typeof GUIDE_AUTHORING_CHANGESET_CONTRACT
  contractVersion: typeof GUIDE_AUTHORING_CHANGESET_VERSION
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

const AuthoringChangeSetApplyResultSchema: z.ZodType<AuthoringChangeSetApplyResult> = z
  .object({
    contract: z.literal(GUIDE_AUTHORING_CHANGESET_CONTRACT),
    contractVersion: z.literal(GUIDE_AUTHORING_CHANGESET_VERSION),
    workbenchVersion: z.string().min(1),
    projectId: z.string().min(1),
    revision: z.number().int().positive(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    validationToken: z.string().regex(/^[a-f0-9]{64}$/),
    projectSha256: z.string().regex(/^[a-f0-9]{64}$/),
    projectTreeSha256: z.string().regex(/^[a-f0-9]{64}$/),
    projectTreeHashAlgorithm: z.literal(PROJECT_TREE_HASH_ALGORITHM),
    calibrationQueue: z.array(CalibrationQueueItemSchema),
    projectPath: z.string().startsWith('/projects/'),
  })
  .strict()

export class AuthoringChangeSetRevisionConflictError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly expectedRevision: number,
    public readonly currentRevision: number,
  ) {
    super(
      `revision conflict on authoring change set for "${projectId}": expected ${expectedRevision}, current ${currentRevision}`,
    )
    this.name = 'AuthoringChangeSetRevisionConflictError'
  }
}

export class AuthoringChangeSetAssetConflictError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly targetId: string,
    message = `append-only authoring target "${targetId}" already exists`,
  ) {
    super(`asset conflict on authoring change set for "${projectId}": ${message}`)
    this.name = 'AuthoringChangeSetAssetConflictError'
  }
}

export interface AuthoringChangeSetServiceOptions {
  dataDir: string
  now?: () => Date
  /** Failure-injection seam after append-only bytes land but before project.json commits. */
  beforeVisibleCommit?: (projectId: string) => void
}

interface ValidationAnalysis {
  plan: AuthoringChangeSetValidationPlan
  current: GuideProject
  assets: AssetRegistry
  merge: AuthoringChangeSetMergeResult
  sourceFiles: StoredAuthoringSourceFile[]
}

/**
 * Stable two-phase update service for GuideAuthoringChangeSet v1.
 *
 * Runtime/source bytes are append-only. They may become physically durable
 * while a journal is prepared, but the existing project.json cannot reference
 * them until the optimistic ProjectRepository.save succeeds.
 */
export class AuthoringChangeSetService {
  private readonly dataDir: string
  private readonly stagingRoot: string
  private readonly now: () => Date

  constructor(
    private readonly projects: ProjectRepository,
    private readonly assets: AssetRepository,
    private readonly blobs: AuthoringBlobRepository,
    private readonly operations: AuthoringOperationRepository,
    private readonly options: AuthoringChangeSetServiceOptions,
  ) {
    this.dataDir = path.resolve(options.dataDir)
    this.stagingRoot = path.join(this.dataDir, 'authoring', 'staging')
    this.now = options.now ?? (() => new Date())
    fs.mkdirSync(this.stagingRoot, { recursive: true })
  }

  validate(changeSet: GuideAuthoringChangeSetV1): AuthoringChangeSetValidationPlan {
    return this.analyze(changeSet).plan
  }

  apply(
    changeSet: GuideAuthoringChangeSetV1,
    validationToken: string,
  ): AuthoringChangeSetApplyResult {
    const requestHash = hashCanonicalJson(changeSet)
    const operationKey = scopedIdempotencyKey(changeSet.idempotencyKey)

    // Journal lookup intentionally precedes validation. A successful apply has
    // advanced the revision, so replaying it through validate would be stale.
    const existing = this.operations.get<AuthoringChangeSetApplyResult>(
      changeSet.projectId,
      operationKey,
    )
    if (existing) {
      assertOperationFingerprint(existing, requestHash)
      requireChangeSetOperation(changeSet, existing)
      if (existing.validationToken !== validationToken) {
        throw new AuthoringValidationTokenStaleError()
      }
      if (existing.status === 'succeeded') {
        return this.replaySucceeded(changeSet.projectId, existing)
      }
      return this.recoverPrepared(changeSet, existing)
    }

    const analysis = this.analyze(changeSet)
    if (validationToken !== analysis.plan.validationToken) {
      throw new AuthoringValidationTokenStaleError()
    }
    if (analysis.current.metadata.revision !== changeSet.expectedRevision) {
      throw new AuthoringChangeSetRevisionConflictError(
        changeSet.projectId,
        changeSet.expectedRevision,
        analysis.current.metadata.revision,
      )
    }
    if (!analysis.plan.ok) throw new AuthoringValidationFailedError(analysis.plan.issues)

    return this.prepareAndCommit(changeSet, analysis)
  }

  private analyze(changeSet: GuideAuthoringChangeSetV1): ValidationAnalysis {
    const current = this.projects.get(changeSet.projectId)
    const projectRoot = projectDir(this.projects, changeSet.projectId)
    const baseProjectSha256 = hashGuideProject(current)
    const baseProjectTreeSha256 = hashProjectTree(projectRoot)
    const requestHash = hashCanonicalJson(changeSet)
    const files = changeSet.partitions.assets?.append ?? []
    const blobFingerprint = hashCanonicalJson(
      files
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
      contract: changeSet.contract,
      contractVersion: changeSet.contractVersion,
      projectId: changeSet.projectId,
      expectedRevision: changeSet.expectedRevision,
      baseRevision: current.metadata.revision,
      baseProjectSha256,
      baseProjectTreeSha256,
      requestHash,
      blobFingerprint,
    })
    const issues: AuthoringValidationIssue[] = []

    if (current.metadata.revision !== changeSet.expectedRevision) {
      issues.push({
        code: 'REVISION_CONFLICT',
        path: 'expectedRevision',
        message: `expected revision ${changeSet.expectedRevision}, current revision is ${current.metadata.revision}`,
      })
    }

    let sourceFiles: StoredAuthoringSourceFile[] = []
    try {
      sourceFiles = readSourceManifest(projectRoot)
    } catch (error) {
      issues.push({
        code: 'AUTHORING_SOURCE_MANIFEST_INVALID',
        path: SOURCE_MANIFEST_RELATIVE_PATH,
        message: (error as Error).message,
      })
    }

    const sourceRefs = new Set(sourceFiles.map(file => file.fileRef))
    const nextAssets: AssetRegistry = structuredClone(current.assets)
    const verified = new Set<string>()
    for (const [index, file] of files.entries()) {
      const filePath = `partitions.assets.append.${index}`
      const verificationKey = `${file.blobSha256}:${file.size}`
      if (!verified.has(verificationKey)) {
        try {
          this.blobs.verify(file.blobSha256, file.size)
          verified.add(verificationKey)
        } catch (error) {
          issues.push(blobIssue(error, filePath))
          continue
        }
      }

      if (file.usage === 'runtime') {
        const definition = runtimeAssetDefinition(file)
        if (current.assets.byId[file.assetId]) {
          issues.push({
            code: 'ASSET_ID_CONFLICT',
            path: `${filePath}.assetId`,
            message: `runtime asset id "${file.assetId}" already exists`,
          })
        }
        const storageDir = runtimeStorageDir(this.assets, changeSet.projectId, definition)
        if (fs.existsSync(storageDir)) {
          issues.push({
            code: 'ASSET_STORAGE_CONFLICT',
            path: `${filePath}.assetId`,
            message: `runtime asset storage for "${file.assetId}" already exists`,
          })
        }
        nextAssets.byId[file.assetId] = definition
        if (file.kind === 'html-bundle') {
          try {
            validateHtmlBundleArchive(fs.readFileSync(this.blobs.getPath(file.blobSha256)))
          } catch (error) {
            issues.push({
              code: 'HTML_BUNDLE_INVALID',
              path: filePath,
              message: (error as Error).message,
            })
          }
        }
      } else if (sourceRefs.has(file.fileRef)) {
        issues.push({
          code: 'AUTHORING_SOURCE_REF_CONFLICT',
          path: `${filePath}.fileRef`,
          message: `authoring source fileRef "${file.fileRef}" already exists`,
        })
      }
    }

    const merge = mergeAuthoringChangeSet(current, changeSet, nextAssets)
    issues.push(...merge.conflicts.map(toConflictIssue), ...merge.issues.map(toValidationIssue))
    const releaseIssues = validateReleaseProject(merge.project).issues
    const runtimeAssetCount = files.filter(file => file.usage === 'runtime').length
    const authoringSourceCount = files.length - runtimeAssetCount

    return {
      current,
      assets: nextAssets,
      merge,
      sourceFiles,
      plan: {
        ok: issues.length === 0,
        contract: GUIDE_AUTHORING_CHANGESET_CONTRACT,
        contractVersion: GUIDE_AUTHORING_CHANGESET_VERSION,
        workbenchVersion: WORKBENCH_VERSION,
        requestHash,
        validationToken,
        validationTokenAlgorithm: VALIDATION_TOKEN_ALGORITHM,
        blobFingerprint,
        projectId: changeSet.projectId,
        baseRevision: current.metadata.revision,
        projectedRevision: current.metadata.revision + 1,
        baseProjectSha256,
        baseProjectTreeSha256,
        projectTreeHashAlgorithm: PROJECT_TREE_HASH_ALGORITHM,
        summary: {
          partitionCount: Object.values(changeSet.partitions).filter(value => value !== undefined)
            .length,
          runtimeAssetCount,
          authoringSourceCount,
        },
        issues,
        releaseIssues,
        calibrationQueue: merge.calibrationQueue,
        normalizationNotes: [
          'Workbench preserves untouched aggregate partitions and project creation metadata.',
          'Workbench assigns the next revision and a fixed update timestamp during apply.',
          'Runtime assets and authoring sources are append-only in ChangeSet v1.',
        ],
      },
    }
  }

  private prepareAndCommit(
    changeSet: GuideAuthoringChangeSetV1,
    analysis: ValidationAnalysis,
  ): AuthoringChangeSetApplyResult {
    const operationId = `changeset-${crypto.randomUUID()}`
    const stageDataDir = this.resolveStage(operationId)
    let prepared = false

    try {
      const timestamp = this.now().toISOString()
      const targetProject = GuideProjectSchema.parse({
        ...analysis.merge.project,
        metadata: {
          ...analysis.merge.project.metadata,
          revision: changeSet.expectedRevision + 1,
          updatedAt: timestamp,
          createdAt: analysis.current.metadata.createdAt,
          schemaVersion: '3.0.0',
        },
      })
      const stageProjectRoot = this.materializeStage(
        changeSet,
        analysis.sourceFiles,
        targetProject,
        stageDataDir,
      )

      this.assertBaseUnchanged(changeSet, analysis.plan)
      const targetProjectSha256 = hashGuideProject(targetProject)
      const targetAssetTreeSha256 = hashProjectedProjectTree(
        projectDir(this.projects, changeSet.projectId),
        stageProjectRoot,
      )
      const operationKey = scopedIdempotencyKey(changeSet.idempotencyKey)
      const operation = this.operations.prepare({
        projectId: changeSet.projectId,
        idempotencyKey: operationKey,
        requestFingerprint: analysis.plan.requestHash,
        operationContract: GUIDE_AUTHORING_CHANGESET_CONTRACT,
        expectedRevision: changeSet.expectedRevision,
        baseProjectSha256: analysis.plan.baseProjectSha256,
        baseProjectTreeSha256: analysis.plan.baseProjectTreeSha256,
        validationToken: analysis.plan.validationToken,
        targetProjectSha256,
        targetAssetTreeSha256,
        projectedRevision: changeSet.expectedRevision + 1,
        operationId,
        stagingRelativePath: operationId,
        preparedAt: timestamp,
      })
      prepared = true
      requireChangeSetOperation(changeSet, operation)
      if (operation.validationToken !== analysis.plan.validationToken) {
        throw new AuthoringValidationTokenStaleError()
      }

      if (
        operation.status === 'succeeded' ||
        operation.operationId !== operationId ||
        operation.targetProjectSha256 !== targetProjectSha256 ||
        operation.targetAssetTreeSha256 !== targetAssetTreeSha256
      ) {
        cleanupStage(this.stagingRoot, stageDataDir)
        if (operation.status === 'succeeded') {
          return this.replaySucceeded(changeSet.projectId, operation)
        }
        return this.recoverPrepared(changeSet, operation)
      }

      this.commitPreparedOverlay(changeSet, operation, stageProjectRoot)
      const result = this.finalizeCommitted(changeSet, operation, analysis.plan.calibrationQueue)
      cleanupStage(this.stagingRoot, stageDataDir)
      return result
    } catch (error) {
      if (!prepared) cleanupStage(this.stagingRoot, stageDataDir)
      if (
        error instanceof AuthoringValidationFailedError ||
        error instanceof AuthoringValidationTokenStaleError ||
        error instanceof AuthoringChangeSetRevisionConflictError ||
        error instanceof AuthoringChangeSetAssetConflictError ||
        error instanceof AuthoringOperationFingerprintConflictError ||
        error instanceof AuthoringOperationRecoveryRequiredError
      ) {
        throw error
      }
      throw new AuthoringApplyAtomicityError(changeSet.projectId, error)
    }
  }

  private recoverPrepared(
    changeSet: GuideAuthoringChangeSetV1,
    operation: PreparedAuthoringOperation,
  ): AuthoringChangeSetApplyResult {
    requireChangeSetOperation(changeSet, operation)
    const visibleState = readVisibleStateOrRecovery(this.projects, changeSet.projectId)
    const { project: visible, projectSha256: visibleProjectHash } = visibleState
    const visibleTreeHash = visibleState.projectTreeSha256

    if (visibleProjectHash === operation.targetProjectSha256) {
      if (visibleTreeHash !== operation.targetAssetTreeSha256) {
        throw recoveryRequired(changeSet.projectId, 'visible target project tree is inconsistent')
      }
      return this.finalizeCommitted(changeSet, operation)
    }
    if (
      visibleProjectHash !== operation.baseProjectSha256 ||
      visible.metadata.revision !== operation.expectedRevision
    ) {
      throw recoveryRequired(
        changeSet.projectId,
        'visible project no longer matches the journal base',
      )
    }
    if (!operation.stagingRelativePath) {
      throw recoveryRequired(changeSet.projectId, 'prepared journal has no staging path')
    }
    const stageDataDir = this.resolveStage(operation.stagingRelativePath)
    const stageProjectRoot = path.join(stageDataDir, 'projects', changeSet.projectId)
    const targetProject = readStagedProject(stageProjectRoot, changeSet.projectId)
    if (hashGuideProject(targetProject) !== operation.targetProjectSha256) {
      throw recoveryRequired(changeSet.projectId, 'staged target project hash is inconsistent')
    }
    if (
      projectedTreeHashOrRecovery(
        changeSet.projectId,
        projectDir(this.projects, changeSet.projectId),
        stageProjectRoot,
      ) !== operation.targetAssetTreeSha256
    ) {
      throw recoveryRequired(changeSet.projectId, 'staged target project tree is inconsistent')
    }

    this.commitPreparedOverlay(changeSet, operation, stageProjectRoot)
    const result = this.finalizeCommitted(changeSet, operation)
    cleanupStage(this.stagingRoot, stageDataDir)
    return result
  }

  private commitPreparedOverlay(
    changeSet: GuideAuthoringChangeSetV1,
    operation: PreparedAuthoringOperation,
    stageProjectRoot: string,
  ): void {
    const visibleRoot = projectDir(this.projects, changeSet.projectId)
    const targetProject = readStagedProject(stageProjectRoot, changeSet.projectId)
    const visible = readVisibleStateOrRecovery(this.projects, changeSet.projectId).project
    if (
      visible.metadata.revision !== operation.expectedRevision ||
      hashGuideProject(visible) !== operation.baseProjectSha256
    ) {
      throw recoveryRequired(changeSet.projectId, 'base project changed before append commit')
    }

    const overlayFiles = collectProjectFiles(stageProjectRoot)
    for (const [relativePath, staged] of overlayFiles) {
      if (relativePath === SOURCE_MANIFEST_RELATIVE_PATH) continue
      copyAppendOnlyFile(changeSet.projectId, visibleRoot, relativePath, staged)
    }

    const stagedManifest = overlayFiles.get(SOURCE_MANIFEST_RELATIVE_PATH)
    if (stagedManifest) {
      const visibleManifest = path.join(visibleRoot, ...SOURCE_MANIFEST_RELATIVE_PATH.split('/'))
      if (!sameFileContents(visibleManifest, stagedManifest.absolutePath)) {
        const baseProjection = hashTreeWithoutOverlayAppends(
          visibleRoot,
          new Set(
            [...overlayFiles.keys()].filter(
              relativePath => relativePath !== SOURCE_MANIFEST_RELATIVE_PATH,
            ),
          ),
        )
        if (baseProjection !== operation.baseProjectTreeSha256) {
          throw recoveryRequired(
            changeSet.projectId,
            'authoring source manifest no longer matches the journal base',
          )
        }
        replaceFileAtomically(stagedManifest.absolutePath, visibleManifest)
      }
    }

    if (
      projectTreeHashOrRecovery(changeSet.projectId, visibleRoot) !==
      operation.targetAssetTreeSha256
    ) {
      throw recoveryRequired(changeSet.projectId, 'append-only project tree does not match target')
    }

    this.options.beforeVisibleCommit?.(changeSet.projectId)
    const beforeSave = readVisibleStateOrRecovery(this.projects, changeSet.projectId).project
    if (
      beforeSave.metadata.revision !== operation.expectedRevision ||
      hashGuideProject(beforeSave) !== operation.baseProjectSha256
    ) {
      throw recoveryRequired(changeSet.projectId, 'base project changed before visible commit')
    }
    const saved = this.projects.save(targetProject, {
      expectedRevision: operation.expectedRevision,
      timestamp: targetProject.metadata.updatedAt,
    })
    if (saved.conflict) {
      throw recoveryRequired(
        changeSet.projectId,
        `revision changed to ${saved.currentRevision} before visible commit`,
      )
    }
    if (hashGuideProject(saved.project) !== operation.targetProjectSha256) {
      throw recoveryRequired(changeSet.projectId, 'saved project does not match target hash')
    }
  }

  private finalizeCommitted(
    changeSet: GuideAuthoringChangeSetV1,
    operation: PreparedAuthoringOperation,
    calibrationQueue?: AuthoringCalibrationQueueItem[],
  ): AuthoringChangeSetApplyResult {
    const visibleState = readVisibleStateOrRecovery(this.projects, changeSet.projectId)
    const project = visibleState.project
    const projectSha256 = visibleState.projectSha256
    const projectTreeSha256 = visibleState.projectTreeSha256
    if (
      projectSha256 !== operation.targetProjectSha256 ||
      projectTreeSha256 !== operation.targetAssetTreeSha256
    ) {
      throw recoveryRequired(changeSet.projectId, 'visible project does not match prepared journal')
    }

    const queue =
      calibrationQueue ??
      mergeAuthoringChangeSet(project, changeSet, project.assets).calibrationQueue
    const result: AuthoringChangeSetApplyResult = {
      contract: GUIDE_AUTHORING_CHANGESET_CONTRACT,
      contractVersion: GUIDE_AUTHORING_CHANGESET_VERSION,
      workbenchVersion: WORKBENCH_VERSION,
      projectId: project.id,
      revision: project.metadata.revision,
      requestHash: operation.requestFingerprint,
      validationToken: operation.validationToken!,
      projectSha256,
      projectTreeSha256,
      projectTreeHashAlgorithm: PROJECT_TREE_HASH_ALGORITHM,
      calibrationQueue: queue,
      projectPath: `/projects/${encodeURIComponent(project.id)}`,
    }
    return this.operations.succeed({
      projectId: changeSet.projectId,
      idempotencyKey: scopedIdempotencyKey(changeSet.idempotencyKey),
      requestFingerprint: operation.requestFingerprint,
      result,
      succeededAt: this.now().toISOString(),
    }).result
  }

  private replaySucceeded(
    projectId: string,
    operation: Extract<AuthoringOperationRecord<unknown>, { status: 'succeeded' }>,
  ): AuthoringChangeSetApplyResult {
    const result = requireApplyResult(projectId, operation.result)
    const visibleState = readVisibleStateOrRecovery(this.projects, projectId)
    const projectSha256 = visibleState.projectSha256
    const projectTreeSha256 = visibleState.projectTreeSha256
    if (
      operation.operationContract !== GUIDE_AUTHORING_CHANGESET_CONTRACT ||
      projectSha256 !== operation.targetProjectSha256 ||
      projectTreeSha256 !== operation.targetAssetTreeSha256 ||
      result.requestHash !== operation.requestFingerprint ||
      result.validationToken !== operation.validationToken ||
      result.revision !== operation.projectedRevision ||
      result.projectSha256 !== projectSha256 ||
      result.projectTreeSha256 !== projectTreeSha256
    ) {
      throw recoveryRequired(projectId, 'visible project no longer matches succeeded journal')
    }
    return result
  }

  private materializeStage(
    changeSet: GuideAuthoringChangeSetV1,
    currentSources: StoredAuthoringSourceFile[],
    targetProject: GuideProject,
    stageDataDir: string,
  ): string {
    const stageProjects = new ProjectRepository({ dataDir: stageDataDir })
    const stageAssets = new AssetRepository(stageProjects, { dataDir: stageDataDir })
    const files = changeSet.partitions.assets?.append ?? []
    for (const file of files) {
      this.blobs.verify(file.blobSha256, file.size)
      if (file.usage !== 'runtime') continue
      const bytes = fs.readFileSync(this.blobs.getPath(file.blobSha256))
      if (file.kind === 'image') {
        stageAssets.registerImage(changeSet.projectId, {
          id: file.assetId,
          bytes,
          mimeType: file.mimeType,
          extension: file.extension,
        })
      } else if (file.kind === 'video') {
        stageAssets.registerVideo(changeSet.projectId, {
          id: file.assetId,
          bytes,
          mimeType: file.mimeType,
          extension: file.extension,
        })
      } else {
        stageAssets.registerHtmlBundle(changeSet.projectId, { id: file.assetId, bytes })
      }
    }

    const stageProjectRoot = projectDir(stageProjects, changeSet.projectId)
    const appendedSources = files.filter(
      (file): file is AuthoringSourceFile => file.usage === 'authoring-source',
    )
    if (appendedSources.length > 0) {
      const sourceRoot = path.join(stageProjectRoot, 'authoring-sources')
      const sourceBlobRoot = path.join(sourceRoot, 'blobs')
      fs.mkdirSync(sourceBlobRoot, { recursive: true })
      const visibleSourceBlobRoot = path.join(
        projectDir(this.projects, changeSet.projectId),
        'authoring-sources',
        'blobs',
      )
      for (const source of appendedSources) {
        const visibleBlob = path.join(visibleSourceBlobRoot, source.blobSha256)
        if (fs.existsSync(visibleBlob)) {
          assertFileMatchesBlob(changeSet.projectId, visibleBlob, source)
          continue
        }
        const target = path.join(sourceBlobRoot, source.blobSha256)
        if (!fs.existsSync(target)) {
          fs.copyFileSync(this.blobs.getPath(source.blobSha256), target, fs.constants.COPYFILE_EXCL)
        }
      }
      const mergedSources = [
        ...currentSources,
        ...appendedSources.map(source => storedSource(source)),
      ].sort((left, right) => compareText(left.fileRef, right.fileRef))
      fs.writeFileSync(
        path.join(sourceRoot, 'manifest.json'),
        JSON.stringify({ schemaVersion: '1.0.0', files: mergedSources }, null, 2),
      )
    }

    fs.mkdirSync(stageProjectRoot, { recursive: true })
    fs.writeFileSync(
      path.join(stageProjectRoot, 'project.json'),
      JSON.stringify(targetProject, null, 2),
    )
    return stageProjectRoot
  }

  private assertBaseUnchanged(
    changeSet: GuideAuthoringChangeSetV1,
    plan: AuthoringChangeSetValidationPlan,
  ): void {
    const current = this.projects.get(changeSet.projectId)
    if (current.metadata.revision !== changeSet.expectedRevision) {
      throw new AuthoringChangeSetRevisionConflictError(
        changeSet.projectId,
        changeSet.expectedRevision,
        current.metadata.revision,
      )
    }
    if (
      hashGuideProject(current) !== plan.baseProjectSha256 ||
      hashProjectTree(projectDir(this.projects, changeSet.projectId)) !== plan.baseProjectTreeSha256
    ) {
      throw new AuthoringValidationTokenStaleError()
    }
  }

  private resolveStage(segment: string): string {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(segment)) {
      throw recoveryRequired('unknown', 'invalid staging path')
    }
    const resolved = path.resolve(this.stagingRoot, segment)
    if (!isInside(this.stagingRoot, resolved)) {
      throw recoveryRequired('unknown', 'staging path escapes root')
    }
    return resolved
  }
}

function runtimeAssetDefinition(file: RuntimeAuthoringFile): AssetDefinition {
  const sourcePath =
    file.kind === 'image'
      ? path.posix.join('images', file.assetId, `image.${file.extension}`)
      : file.kind === 'video'
        ? path.posix.join('videos', file.assetId, `video.${file.extension}`)
        : path.posix.join('scenes', file.assetId)
  return {
    id: file.assetId,
    kind: file.kind,
    sourcePath,
    ...(file.kind === 'html-bundle' ? { entryPath: 'index.html' } : {}),
    mimeType: file.mimeType,
    sha256: file.blobSha256,
    size: file.size,
  }
}

function runtimeStorageDir(
  assets: AssetRepository,
  projectId: string,
  definition: AssetDefinition,
): string {
  const absolute = assets.absolutePathFor(projectId, definition.sourcePath)
  return definition.kind === 'html-bundle' ? absolute : path.dirname(absolute)
}

function readSourceManifest(projectRoot: string): StoredAuthoringSourceFile[] {
  const manifestPath = path.join(projectRoot, ...SOURCE_MANIFEST_RELATIVE_PATH.split('/'))
  if (!fs.existsSync(manifestPath)) return []
  const parsed = AuthoringSourceManifestSchema.parse(
    JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  )
  return parsed.files.map(file => structuredClone(file))
}

function storedSource(source: AuthoringSourceFile): StoredAuthoringSourceFile {
  return {
    fileRef: source.fileRef,
    blobSha256: source.blobSha256,
    size: source.size,
    mediaType: source.mediaType,
    semanticRole: source.semanticRole,
    originalName: source.originalName,
  }
}

function assertFileMatchesBlob(
  projectId: string,
  filePath: string,
  source: AuthoringSourceFile,
): void {
  const actual = hashFile(filePath)
  if (actual.size !== source.size || actual.sha256 !== source.blobSha256) {
    throw new AuthoringChangeSetAssetConflictError(
      projectId,
      source.fileRef,
      `stored authoring source blob "${source.blobSha256}" is inconsistent`,
    )
  }
}

function blobIssue(error: unknown, filePath: string): AuthoringValidationIssue {
  if (error instanceof AuthoringBlobNotFoundError) {
    return { code: 'BLOB_NOT_FOUND', path: `${filePath}.blobSha256`, message: error.message }
  }
  if (error instanceof AuthoringBlobSizeMismatchError) {
    return { code: 'BLOB_SIZE_MISMATCH', path: `${filePath}.size`, message: error.message }
  }
  if (error instanceof AuthoringBlobHashMismatchError) {
    return { code: 'BLOB_HASH_MISMATCH', path: `${filePath}.blobSha256`, message: error.message }
  }
  return { code: 'BLOB_INVALID', path: filePath, message: (error as Error).message }
}

function toConflictIssue(conflict: {
  code: string
  path: string
  message: string
}): AuthoringValidationIssue {
  return { code: conflict.code, path: conflict.path, message: conflict.message }
}

function toValidationIssue(issue: ValidationIssue): AuthoringValidationIssue {
  return { code: issue.code, path: issue.path, message: issue.message }
}

function scopedIdempotencyKey(idempotencyKey: string): string {
  return `${IDEMPOTENCY_SCOPE}${idempotencyKey}`
}

function requireChangeSetOperation(
  changeSet: GuideAuthoringChangeSetV1,
  operation: AuthoringOperationRecord<unknown>,
): void {
  if (
    operation.operationContract !== GUIDE_AUTHORING_CHANGESET_CONTRACT ||
    operation.expectedRevision !== changeSet.expectedRevision ||
    operation.projectedRevision !== changeSet.expectedRevision + 1 ||
    !operation.baseProjectSha256 ||
    !operation.baseProjectTreeSha256 ||
    !operation.validationToken ||
    !operation.operationId ||
    (operation.status === 'prepared' && !operation.stagingRelativePath)
  ) {
    throw recoveryRequired(changeSet.projectId, 'operation journal is incomplete or incompatible')
  }
}

function assertOperationFingerprint(
  operation: AuthoringOperationRecord<unknown>,
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

function requireApplyResult(projectId: string, value: unknown): AuthoringChangeSetApplyResult {
  const parsed = AuthoringChangeSetApplyResultSchema.safeParse(value)
  if (!parsed.success || parsed.data.projectId !== projectId) {
    throw recoveryRequired(projectId, 'succeeded journal contains an invalid result')
  }
  return parsed.data
}

function readStagedProject(stageProjectRoot: string, projectId: string): GuideProject {
  const file = path.join(stageProjectRoot, 'project.json')
  if (!fs.existsSync(file))
    throw recoveryRequired(projectId, 'prepared staging directory is missing')
  try {
    const project = GuideProjectSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
    if (project.id !== projectId) throw new Error('staged project id does not match journal')
    return project
  } catch (error) {
    if (error instanceof AuthoringOperationRecoveryRequiredError) throw error
    throw recoveryRequired(
      projectId,
      `staged target project is invalid: ${(error as Error).message}`,
    )
  }
}

function copyAppendOnlyFile(
  projectId: string,
  visibleRoot: string,
  relativePath: string,
  staged: ProjectTreeFile,
): void {
  const target = resolveProjectRelative(visibleRoot, relativePath)
  if (fs.existsSync(target)) {
    if (!sameFileContents(target, staged.absolutePath)) {
      throw recoveryRequired(projectId, `append-only target "${relativePath}" is inconsistent`)
    }
    return
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  try {
    fs.copyFileSync(staged.absolutePath, target, fs.constants.COPYFILE_EXCL)
  } catch (error) {
    if (!fs.existsSync(target) || !sameFileContents(target, staged.absolutePath)) throw error
  }
}

function replaceFileAtomically(source: string, target: string): void {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
  try {
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL)
    fs.renameSync(temporary, target)
  } catch (error) {
    fs.rmSync(temporary, { force: true })
    throw error
  }
}

interface ProjectTreeFile {
  relativePath: string
  absolutePath: string
  size: number
}

function collectProjectFiles(projectRootInput: string): Map<string, ProjectTreeFile> {
  const projectRoot = path.resolve(projectRootInput)
  const files = new Map<string, ProjectTreeFile>()
  walkProjectFiles(projectRoot, '', files)
  files.delete('project.json')
  return files
}

function walkProjectFiles(
  current: string,
  relativeDir: string,
  files: Map<string, ProjectTreeFile>,
): void {
  if (!fs.existsSync(current)) return
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
    const absolutePath = path.join(current, entry.name)
    const stat = fs.lstatSync(absolutePath)
    if (stat.isSymbolicLink()) throw new Error(`symbolic link is not allowed: ${relativePath}`)
    if (stat.isDirectory()) walkProjectFiles(absolutePath, relativePath, files)
    else if (stat.isFile()) files.set(relativePath, { relativePath, absolutePath, size: stat.size })
    else throw new Error(`unsupported project entry: ${relativePath}`)
  }
}

function hashProjectedProjectTree(baseRoot: string, overlayRoot: string): string {
  const files = collectProjectFiles(baseRoot)
  for (const [relativePath, file] of collectProjectFiles(overlayRoot)) files.set(relativePath, file)
  return hashProjectFileMap(files)
}

function hashTreeWithoutOverlayAppends(projectRoot: string, appendedPaths: Set<string>): string {
  const files = collectProjectFiles(projectRoot)
  for (const relativePath of appendedPaths) files.delete(relativePath)
  return hashProjectFileMap(files)
}

function hashProjectFileMap(files: Map<string, ProjectTreeFile>): string {
  const ordered = [...files.values()].sort((left, right) =>
    compareText(left.relativePath, right.relativePath),
  )
  const hash = crypto.createHash('sha256')
  updateText(hash, PROJECT_TREE_HASH_ALGORITHM)
  updateText(hash, String(ordered.length))
  for (const file of ordered) {
    updateText(hash, file.relativePath)
    updateText(hash, String(file.size))
    hashFileInto(hash, file.absolutePath, file.size)
  }
  return hash.digest('hex')
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

function sameFileContents(left: string, right: string): boolean {
  if (!fs.existsSync(left) || !fs.existsSync(right)) return false
  const leftHash = hashFile(left)
  const rightHash = hashFile(right)
  return leftHash.size === rightHash.size && leftHash.sha256 === rightHash.sha256
}

function hashFile(filePath: string): { size: number; sha256: string } {
  const stat = fs.statSync(filePath)
  if (!stat.isFile()) throw new Error(`expected a regular file: ${filePath}`)
  const descriptor = fs.openSync(filePath, 'r')
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(64 * 1024)
  let size = 0
  try {
    while (true) {
      const read = fs.readSync(descriptor, buffer, 0, buffer.length, null)
      if (read === 0) break
      size += read
      hash.update(buffer.subarray(0, read))
    }
  } finally {
    fs.closeSync(descriptor)
  }
  return { size, sha256: hash.digest('hex') }
}

function projectDir(projects: ProjectRepository, projectId: string): string {
  return path.dirname(projects.resolveAssetDir(projectId))
}

function readVisibleStateOrRecovery(
  projects: ProjectRepository,
  projectId: string,
): {
  project: GuideProject
  projectSha256: string
  projectTreeSha256: string
} {
  const root = projectDir(projects, projectId)
  try {
    if (!fs.existsSync(path.join(root, 'project.json'))) {
      throw new Error('project.json is missing')
    }
    const project = projects.get(projectId)
    return {
      project,
      projectSha256: hashGuideProject(project),
      projectTreeSha256: hashProjectTree(root),
    }
  } catch (error) {
    if (error instanceof AuthoringOperationRecoveryRequiredError) throw error
    throw recoveryRequired(
      projectId,
      `visible project cannot be verified: ${(error as Error).message}`,
    )
  }
}

function projectTreeHashOrRecovery(projectId: string, projectRoot: string): string {
  try {
    return hashProjectTree(projectRoot)
  } catch (error) {
    throw recoveryRequired(
      projectId,
      `visible project tree cannot be verified: ${(error as Error).message}`,
    )
  }
}

function projectedTreeHashOrRecovery(
  projectId: string,
  baseRoot: string,
  overlayRoot: string,
): string {
  try {
    return hashProjectedProjectTree(baseRoot, overlayRoot)
  } catch (error) {
    throw recoveryRequired(
      projectId,
      `prepared project tree cannot be verified: ${(error as Error).message}`,
    )
  }
}

function resolveProjectRelative(projectRoot: string, relativePath: string): string {
  const normalized = relativePath.split('/').join(path.sep)
  const target = path.resolve(projectRoot, normalized)
  if (!isInside(projectRoot, target)) throw new Error(`project path escapes root: ${relativePath}`)
  return target
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

function cleanupStage(root: string, target: string): void {
  try {
    if (!fs.existsSync(target)) return
    if (!isInside(root, target) || path.resolve(root) === path.resolve(target)) {
      throw new Error(`refusing to remove staging path outside root: ${target}`)
    }
    fs.rmSync(target, { recursive: true, force: true })
  } catch (error) {
    console.warn(
      `[AuthoringChangeSetService] staging cleanup required for ${target}: ${(error as Error).message}`,
    )
  }
}

function recoveryRequired(
  projectId: string,
  message: string,
): AuthoringOperationRecoveryRequiredError {
  return new AuthoringOperationRecoveryRequiredError(projectId, message)
}

function isInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  return resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
