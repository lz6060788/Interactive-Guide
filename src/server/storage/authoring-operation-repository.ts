import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ProjectIdSchema } from '../../domain/project-schema.js'

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?$/
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/
const WINDOWS_RESERVED_SEGMENT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const IDEMPOTENCY_KEY_MAX_LENGTH = 512

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

interface AuthoringOperationBase {
  schemaVersion: '1.0.0'
  projectId: string
  idempotencyKeyHash: string
  requestFingerprint: string
  operationContract?: string
  expectedRevision?: number
  baseProjectSha256?: string
  baseProjectTreeSha256?: string
  validationToken?: string
  targetProjectSha256: string
  targetAssetTreeSha256: string
  preparedAt: string
  projectedRevision?: number
  operationId?: string
  stagingRelativePath?: string
}

export interface PreparedAuthoringOperation extends AuthoringOperationBase {
  status: 'prepared'
}

export interface SucceededAuthoringOperation<TResult = unknown> extends AuthoringOperationBase {
  status: 'succeeded'
  succeededAt: string
  result: TResult
}

export type AuthoringOperationRecord<TResult = unknown> =
  | PreparedAuthoringOperation
  | SucceededAuthoringOperation<TResult>

export interface PrepareAuthoringOperationInput {
  projectId: string
  idempotencyKey: string
  requestFingerprint: string
  operationContract?: string
  expectedRevision?: number
  baseProjectSha256?: string
  baseProjectTreeSha256?: string
  validationToken?: string
  targetProjectSha256: string
  targetAssetTreeSha256: string
  preparedAt?: string
  projectedRevision?: number
  operationId?: string
  stagingRelativePath?: string
}

export interface SucceedAuthoringOperationInput<TResult = unknown> {
  projectId: string
  idempotencyKey: string
  requestFingerprint: string
  result: TResult
  succeededAt?: string
}

export class InvalidAuthoringOperationKeyError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super('authoring operation idempotency key must be a non-empty printable string')
    this.name = 'InvalidAuthoringOperationKeyError'
  }
}

export class InvalidAuthoringOperationFieldError extends Error {
  constructor(
    public readonly field: string,
    public readonly value: unknown,
  ) {
    super(`invalid authoring operation ${field}: ${describeValue(value)}`)
    this.name = 'InvalidAuthoringOperationFieldError'
  }
}

export class AuthoringOperationNotFoundError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly idempotencyKeyHash: string,
  ) {
    super(`authoring operation "${projectId}/${idempotencyKeyHash}" not found`)
    this.name = 'AuthoringOperationNotFoundError'
  }
}

export class AuthoringOperationFingerprintConflictError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly idempotencyKeyHash: string,
    public readonly existingFingerprint: string,
    public readonly receivedFingerprint: string,
  ) {
    super(
      `authoring operation idempotency key was reused for a different request on "${projectId}"`,
    )
    this.name = 'AuthoringOperationFingerprintConflictError'
  }
}

export class AuthoringOperationCorruptError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly filePath: string,
    cause: unknown,
  ) {
    super(`authoring operation for "${projectId}" is corrupt: ${(cause as Error).message}`)
    this.name = 'AuthoringOperationCorruptError'
  }
}

export class AuthoringOperationBusyError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly idempotencyKeyHash: string,
  ) {
    super(`authoring operation "${projectId}/${idempotencyKeyHash}" is being updated`)
    this.name = 'AuthoringOperationBusyError'
  }
}

/**
 * Durable authoring apply journal keyed by project and a one-way hash of the
 * caller's idempotency key.
 *
 * Layout: data/authoring/operations/{projectId}/{sha256(idempotencyKey)}.json
 */
export class AuthoringOperationRepository {
  private readonly root: string
  private readonly now: () => Date

  constructor(options: { dataDir?: string; now?: () => Date } = {}) {
    this.root = path.resolve(options.dataDir ?? path.resolve('data'), 'authoring', 'operations')
    this.now = options.now ?? (() => new Date())
    fs.mkdirSync(this.root, { recursive: true })
  }

  rootDir(): string {
    return this.root
  }

  get<TResult = unknown>(
    projectId: string,
    idempotencyKey: string,
  ): AuthoringOperationRecord<TResult> | null {
    const location = this.location(projectId, idempotencyKey)
    if (!fs.existsSync(location.file)) return null
    return this.read<TResult>(location.file, projectId, location.keyHash)
  }

  prepare(input: PrepareAuthoringOperationInput): AuthoringOperationRecord {
    validateFingerprint('requestFingerprint', input.requestFingerprint)
    if (input.operationContract !== undefined) {
      validateIdentifier('operationContract', input.operationContract)
    }
    if (input.expectedRevision !== undefined) validateExpectedRevision(input.expectedRevision)
    if (input.baseProjectSha256 !== undefined) {
      validateFingerprint('baseProjectSha256', input.baseProjectSha256)
    }
    if (input.baseProjectTreeSha256 !== undefined) {
      validateFingerprint('baseProjectTreeSha256', input.baseProjectTreeSha256)
    }
    if (input.validationToken !== undefined) {
      validateFingerprint('validationToken', input.validationToken)
    }
    validateFingerprint('targetProjectSha256', input.targetProjectSha256)
    validateFingerprint('targetAssetTreeSha256', input.targetAssetTreeSha256)
    if (input.projectedRevision !== undefined) validateProjectedRevision(input.projectedRevision)
    if (input.operationId !== undefined) validateIdentifier('operationId', input.operationId)
    if (input.stagingRelativePath !== undefined) {
      validateStagingRelativePath(input.stagingRelativePath)
    }
    const preparedAt = input.preparedAt ?? this.now().toISOString()
    validateTimestamp('preparedAt', preparedAt)
    const location = this.location(input.projectId, input.idempotencyKey)

    return this.withLock(location.file, input.projectId, location.keyHash, () => {
      const existing = fs.existsSync(location.file)
        ? this.read<unknown>(location.file, input.projectId, location.keyHash)
        : null
      if (existing) {
        assertSameFingerprint(existing, input.requestFingerprint)
        return existing
      }

      const record: PreparedAuthoringOperation = {
        schemaVersion: '1.0.0',
        projectId: input.projectId,
        idempotencyKeyHash: location.keyHash,
        requestFingerprint: input.requestFingerprint,
        ...(input.operationContract === undefined
          ? {}
          : { operationContract: input.operationContract }),
        ...(input.expectedRevision === undefined
          ? {}
          : { expectedRevision: input.expectedRevision }),
        ...(input.baseProjectSha256 === undefined
          ? {}
          : { baseProjectSha256: input.baseProjectSha256 }),
        ...(input.baseProjectTreeSha256 === undefined
          ? {}
          : { baseProjectTreeSha256: input.baseProjectTreeSha256 }),
        ...(input.validationToken === undefined ? {} : { validationToken: input.validationToken }),
        targetProjectSha256: input.targetProjectSha256,
        targetAssetTreeSha256: input.targetAssetTreeSha256,
        status: 'prepared',
        preparedAt,
        ...(input.projectedRevision === undefined
          ? {}
          : { projectedRevision: input.projectedRevision }),
        ...(input.operationId === undefined ? {} : { operationId: input.operationId }),
        ...(input.stagingRelativePath === undefined
          ? {}
          : { stagingRelativePath: input.stagingRelativePath }),
      }
      this.writeAtomic(location.file, record)
      return record
    })
  }

  succeed<TResult>(
    input: SucceedAuthoringOperationInput<TResult>,
  ): SucceededAuthoringOperation<TResult> {
    validateFingerprint('requestFingerprint', input.requestFingerprint)
    const succeededAt = input.succeededAt ?? this.now().toISOString()
    validateTimestamp('succeededAt', succeededAt)
    const result = cloneJsonValue(input.result, 'result')
    const location = this.location(input.projectId, input.idempotencyKey)

    return this.withLock(location.file, input.projectId, location.keyHash, () => {
      if (!fs.existsSync(location.file)) {
        throw new AuthoringOperationNotFoundError(input.projectId, location.keyHash)
      }
      const existing = this.read<TResult>(location.file, input.projectId, location.keyHash)
      assertSameFingerprint(existing, input.requestFingerprint)
      if (existing.status === 'succeeded') return existing

      const record: SucceededAuthoringOperation<TResult> = {
        ...existing,
        status: 'succeeded',
        succeededAt,
        result,
      }
      this.writeAtomic(location.file, record)
      return record
    })
  }

  private location(projectId: string, idempotencyKey: string): { file: string; keyHash: string } {
    if (!ProjectIdSchema.safeParse(projectId).success) {
      throw new InvalidAuthoringOperationFieldError('projectId', projectId)
    }
    validateIdempotencyKey(idempotencyKey)
    const keyHash = crypto.createHash('sha256').update(idempotencyKey, 'utf8').digest('hex')
    const projectDir = path.resolve(this.root, projectId)
    const file = path.resolve(projectDir, `${keyHash}.json`)
    if (
      !projectDir.startsWith(`${this.root}${path.sep}`) ||
      !file.startsWith(`${projectDir}${path.sep}`)
    ) {
      throw new InvalidAuthoringOperationFieldError('projectId', projectId)
    }
    return { file, keyHash }
  }

  private read<TResult>(
    file: string,
    projectId: string,
    keyHash: string,
  ): AuthoringOperationRecord<TResult> {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
      return parseRecord<TResult>(parsed, projectId, keyHash)
    } catch (error) {
      if (error instanceof AuthoringOperationCorruptError) throw error
      throw new AuthoringOperationCorruptError(projectId, file, error)
    }
  }

  private withLock<T>(file: string, projectId: string, keyHash: string, callback: () => T): T {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const lock = `${file}.lock`
    acquireLock(lock, projectId, keyHash)
    try {
      return callback()
    } finally {
      fs.rmSync(lock, { force: true })
    }
  }

  private writeAtomic(file: string, record: AuthoringOperationRecord<unknown>): void {
    const temporary = `${file}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
    try {
      fs.writeFileSync(temporary, JSON.stringify(record, null, 2), { flag: 'wx' })
      fs.renameSync(temporary, file)
    } catch (error) {
      fs.rmSync(temporary, { force: true })
      throw error
    }
  }
}

function acquireLock(lock: string, projectId: string, keyHash: string, retried = false): void {
  try {
    const descriptor = fs.openSync(lock, 'wx')
    try {
      fs.writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }),
      )
    } finally {
      fs.closeSync(descriptor)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (!retried) {
      const ownerPid = readLockPid(lock)
      if (ownerPid !== null && !isProcessAlive(ownerPid)) {
        fs.rmSync(lock, { force: true })
        acquireLock(lock, projectId, keyHash, true)
        return
      }
    }
    throw new AuthoringOperationBusyError(projectId, keyHash)
  }
}

function readLockPid(lock: string): number | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(lock, 'utf8')) as { pid?: unknown }
    return typeof parsed.pid === 'number' && Number.isInteger(parsed.pid) ? parsed.pid : null
  } catch {
    return null
  }
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function parseRecord<TResult>(
  value: unknown,
  expectedProjectId: string,
  expectedKeyHash: string,
): AuthoringOperationRecord<TResult> {
  if (!isPlainObject(value)) throw new Error('record must be a JSON object')
  if (value.status !== 'prepared' && value.status !== 'succeeded') {
    throw new Error('record status is unsupported')
  }
  const allowed = new Set([
    'schemaVersion',
    'projectId',
    'idempotencyKeyHash',
    'requestFingerprint',
    'operationContract',
    'expectedRevision',
    'baseProjectSha256',
    'baseProjectTreeSha256',
    'validationToken',
    'targetProjectSha256',
    'targetAssetTreeSha256',
    'status',
    'preparedAt',
    'projectedRevision',
    'operationId',
    'stagingRelativePath',
    ...(value.status === 'succeeded' ? ['succeededAt', 'result'] : []),
  ])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`record contains unknown field "${key}"`)
  }
  if (value.schemaVersion !== '1.0.0') throw new Error('record schemaVersion is unsupported')
  if (value.projectId !== expectedProjectId) throw new Error('record projectId does not match path')
  if (value.idempotencyKeyHash !== expectedKeyHash) {
    throw new Error('record idempotencyKeyHash does not match path')
  }
  validateFingerprint('requestFingerprint', value.requestFingerprint)
  if (value.operationContract !== undefined) {
    validateIdentifier('operationContract', value.operationContract)
  }
  if (value.expectedRevision !== undefined) validateExpectedRevision(value.expectedRevision)
  if (value.baseProjectSha256 !== undefined) {
    validateFingerprint('baseProjectSha256', value.baseProjectSha256)
  }
  if (value.baseProjectTreeSha256 !== undefined) {
    validateFingerprint('baseProjectTreeSha256', value.baseProjectTreeSha256)
  }
  if (value.validationToken !== undefined) {
    validateFingerprint('validationToken', value.validationToken)
  }
  validateFingerprint('targetProjectSha256', value.targetProjectSha256)
  validateFingerprint('targetAssetTreeSha256', value.targetAssetTreeSha256)
  validateTimestamp('preparedAt', value.preparedAt)
  if (value.projectedRevision !== undefined) validateProjectedRevision(value.projectedRevision)
  if (value.operationId !== undefined) validateIdentifier('operationId', value.operationId)
  if (value.stagingRelativePath !== undefined) {
    validateStagingRelativePath(value.stagingRelativePath)
  }

  if (value.status === 'prepared') return value as unknown as PreparedAuthoringOperation
  validateTimestamp('succeededAt', value.succeededAt)
  cloneJsonValue(value.result, 'result')
  return value as unknown as SucceededAuthoringOperation<TResult>
}

function assertSameFingerprint(
  record: AuthoringOperationRecord<unknown>,
  receivedFingerprint: string,
): void {
  if (record.requestFingerprint === receivedFingerprint) return
  throw new AuthoringOperationFingerprintConflictError(
    record.projectId,
    record.idempotencyKeyHash,
    record.requestFingerprint,
    receivedFingerprint,
  )
}

function validateIdempotencyKey(value: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > IDEMPOTENCY_KEY_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new InvalidAuthoringOperationKeyError(value)
  }
}

function validateFingerprint(field: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new InvalidAuthoringOperationFieldError(field, value)
  }
}

function validateProjectedRevision(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new InvalidAuthoringOperationFieldError('projectedRevision', value)
  }
}

function validateExpectedRevision(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new InvalidAuthoringOperationFieldError('expectedRevision', value)
  }
}

function validateIdentifier(field: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 128 || !SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new InvalidAuthoringOperationFieldError(field, value)
  }
}

function validateStagingRelativePath(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length > 128 ||
    !SAFE_PATH_SEGMENT_PATTERN.test(value) ||
    WINDOWS_RESERVED_SEGMENT.test(value)
  ) {
    throw new InvalidAuthoringOperationFieldError('stagingRelativePath', value)
  }
}

function validateTimestamp(field: string, value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new InvalidAuthoringOperationFieldError(field, value)
  }
}

function cloneJsonValue<TValue>(value: TValue, field: string): TValue {
  assertJsonValue(value, field, new Set())
  return JSON.parse(JSON.stringify(value)) as TValue
}

function assertJsonValue(value: unknown, field: string, ancestors: Set<object>): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return
  }
  if (typeof value !== 'object') throw new InvalidAuthoringOperationFieldError(field, value)
  if (ancestors.has(value)) throw new InvalidAuthoringOperationFieldError(field, '[circular]')
  ancestors.add(value)
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, field, ancestors)
  } else {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new InvalidAuthoringOperationFieldError(field, value)
    }
    for (const item of Object.values(value)) assertJsonValue(item, field, ancestors)
  }
  ancestors.delete(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function describeValue(value: unknown): string {
  try {
    const encoded = JSON.stringify(value)
    return encoded === undefined ? String(value) : encoded
  } catch {
    return String(value)
  }
}
