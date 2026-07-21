import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_AUTHORING_BLOB_MAX_BYTES = 512 * 1024 * 1024

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const VERIFY_BUFFER_BYTES = 64 * 1024

export interface AuthoringBlobRecord {
  sha256: string
  size: number
}

export interface PutAuthoringBlobInput {
  sha256: string
  size: number
  bytes: Uint8Array
  maxBytes?: number
}

export interface PutAuthoringBlobStreamInput {
  sha256: string
  size: number
  chunks: AsyncIterable<Uint8Array>
  maxBytes?: number
}

export class InvalidAuthoringBlobDigestError extends Error {
  constructor(public readonly sha256: string) {
    super(`invalid authoring blob sha256: ${JSON.stringify(sha256)}`)
    this.name = 'InvalidAuthoringBlobDigestError'
  }
}

export class InvalidAuthoringBlobSizeError extends Error {
  constructor(
    public readonly field: 'size' | 'maxBytes',
    public readonly value: number,
  ) {
    super(`invalid authoring blob ${field}: ${JSON.stringify(value)}`)
    this.name = 'InvalidAuthoringBlobSizeError'
  }
}

export class AuthoringBlobTooLargeError extends Error {
  constructor(
    public readonly actualBytes: number,
    public readonly maxBytes: number,
  ) {
    super(`authoring blob exceeds maximum size: ${actualBytes} > ${maxBytes}`)
    this.name = 'AuthoringBlobTooLargeError'
  }
}

export class AuthoringBlobSizeMismatchError extends Error {
  constructor(
    public readonly sha256: string,
    public readonly expectedSize: number,
    public readonly actualSize: number,
  ) {
    super(`authoring blob size mismatch for ${sha256}: expected ${expectedSize}, got ${actualSize}`)
    this.name = 'AuthoringBlobSizeMismatchError'
  }
}

export class AuthoringBlobHashMismatchError extends Error {
  constructor(
    public readonly expectedSha256: string,
    public readonly actualSha256: string,
  ) {
    super(`authoring blob hash mismatch: expected ${expectedSha256}, got ${actualSha256}`)
    this.name = 'AuthoringBlobHashMismatchError'
  }
}

export class AuthoringBlobNotFoundError extends Error {
  constructor(public readonly sha256: string) {
    super(`authoring blob "${sha256}" not found`)
    this.name = 'AuthoringBlobNotFoundError'
  }
}

/**
 * Immutable, content-addressed storage for authoring inputs.
 *
 * Layout: data/authoring/blobs/{first-two-sha256-characters}/{sha256}
 */
export class AuthoringBlobRepository {
  private readonly root: string

  constructor(options: { dataDir?: string } = {}) {
    this.root = path.resolve(options.dataDir ?? path.resolve('data'), 'authoring', 'blobs')
    fs.mkdirSync(this.root, { recursive: true })
  }

  rootDir(): string {
    return this.root
  }

  has(sha256: string): boolean {
    return fs.existsSync(this.resolveBlobPath(sha256))
  }

  getPath(sha256: string): string {
    const blobPath = this.resolveBlobPath(sha256)
    if (!fs.existsSync(blobPath)) throw new AuthoringBlobNotFoundError(sha256)
    return blobPath
  }

  stat(sha256: string): AuthoringBlobRecord | null {
    const blobPath = this.resolveBlobPath(sha256)
    if (!fs.existsSync(blobPath)) return null
    const file = fs.statSync(blobPath)
    if (!file.isFile()) throw new AuthoringBlobNotFoundError(sha256)
    return { sha256, size: file.size }
  }

  /** Re-hash a stored blob before it crosses an authoring trust boundary. */
  verify(sha256: string, expectedSize?: number): AuthoringBlobRecord {
    assertSha256(sha256)
    if (expectedSize !== undefined) assertByteCount('size', expectedSize)
    const blobPath = this.getPath(sha256)
    const { size, digest } = hashFile(blobPath)
    if (expectedSize !== undefined && size !== expectedSize) {
      throw new AuthoringBlobSizeMismatchError(sha256, expectedSize, size)
    }
    if (digest !== sha256) throw new AuthoringBlobHashMismatchError(sha256, digest)
    return { sha256, size }
  }

  put(input: PutAuthoringBlobInput): AuthoringBlobRecord {
    const maxBytes = validatePutInput(input.sha256, input.size, input.maxBytes)
    if (!(input.bytes instanceof Uint8Array)) {
      throw new TypeError('authoring blob bytes must be a Uint8Array')
    }
    const actualSize = input.bytes.byteLength
    if (actualSize > maxBytes) throw new AuthoringBlobTooLargeError(actualSize, maxBytes)
    if (actualSize !== input.size) {
      throw new AuthoringBlobSizeMismatchError(input.sha256, input.size, actualSize)
    }
    const actualSha256 = crypto.createHash('sha256').update(input.bytes).digest('hex')
    if (actualSha256 !== input.sha256) {
      throw new AuthoringBlobHashMismatchError(input.sha256, actualSha256)
    }

    const finalPath = this.resolveBlobPath(input.sha256)
    fs.mkdirSync(path.dirname(finalPath), { recursive: true })
    const temporary = temporaryPath(finalPath)
    try {
      fs.writeFileSync(temporary, input.bytes, { flag: 'wx' })
      return this.commitTemporary(temporary, input.sha256, input.size)
    } catch (error) {
      fs.rmSync(temporary, { force: true })
      throw error
    }
  }

  async putStream(input: PutAuthoringBlobStreamInput): Promise<AuthoringBlobRecord> {
    const maxBytes = validatePutInput(input.sha256, input.size, input.maxBytes)
    const finalPath = this.resolveBlobPath(input.sha256)
    fs.mkdirSync(path.dirname(finalPath), { recursive: true })
    const temporary = temporaryPath(finalPath)
    const handle = await fs.promises.open(temporary, 'wx')
    const hash = crypto.createHash('sha256')
    let actualSize = 0
    let closed = false

    try {
      for await (const chunk of input.chunks) {
        if (!(chunk instanceof Uint8Array)) {
          throw new TypeError('authoring blob stream chunks must be Uint8Array instances')
        }
        actualSize += chunk.byteLength
        if (actualSize > maxBytes) throw new AuthoringBlobTooLargeError(actualSize, maxBytes)
        hash.update(chunk)
        await writeAll(handle, chunk)
      }
      await handle.sync()
      await handle.close()
      closed = true

      if (actualSize !== input.size) {
        throw new AuthoringBlobSizeMismatchError(input.sha256, input.size, actualSize)
      }
      const actualSha256 = hash.digest('hex')
      if (actualSha256 !== input.sha256) {
        throw new AuthoringBlobHashMismatchError(input.sha256, actualSha256)
      }
      return this.commitTemporary(temporary, input.sha256, input.size)
    } catch (error) {
      if (!closed) await handle.close().catch(() => undefined)
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private commitTemporary(temporary: string, sha256: string, size: number): AuthoringBlobRecord {
    const finalPath = this.resolveBlobPath(sha256)
    if (fs.existsSync(finalPath)) {
      const existing = this.verify(sha256, size)
      fs.rmSync(temporary, { force: true })
      return existing
    }

    try {
      fs.renameSync(temporary, finalPath)
    } catch (error) {
      // Another writer may have committed the same digest after our existence check.
      if (!fs.existsSync(finalPath)) throw error
      const existing = this.verify(sha256, size)
      fs.rmSync(temporary, { force: true })
      return existing
    }
    return { sha256, size }
  }

  private resolveBlobPath(sha256: string): string {
    assertSha256(sha256)
    const resolved = path.resolve(this.root, sha256.slice(0, 2), sha256)
    if (!resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new InvalidAuthoringBlobDigestError(sha256)
    }
    return resolved
  }
}

function validatePutInput(sha256: string, size: number, requestedMax?: number): number {
  assertSha256(sha256)
  assertByteCount('size', size)
  const maxBytes = requestedMax ?? DEFAULT_AUTHORING_BLOB_MAX_BYTES
  assertByteCount('maxBytes', maxBytes)
  if (maxBytes === 0) throw new InvalidAuthoringBlobSizeError('maxBytes', maxBytes)
  if (size > maxBytes) throw new AuthoringBlobTooLargeError(size, maxBytes)
  return maxBytes
}

function assertSha256(sha256: string): void {
  if (!SHA256_PATTERN.test(sha256)) throw new InvalidAuthoringBlobDigestError(sha256)
}

function assertByteCount(field: 'size' | 'maxBytes', value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidAuthoringBlobSizeError(field, value)
  }
}

function temporaryPath(finalPath: string): string {
  return `${finalPath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
}

function hashFile(filePath: string): { size: number; digest: string } {
  const descriptor = fs.openSync(filePath, 'r')
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(VERIFY_BUFFER_BYTES)
  let size = 0
  try {
    while (true) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.byteLength, null)
      if (bytesRead === 0) break
      size += bytesRead
      hash.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    fs.closeSync(descriptor)
  }
  return { size, digest: hash.digest('hex') }
}

async function writeAll(handle: fs.promises.FileHandle, bytes: Uint8Array): Promise<void> {
  let offset = 0
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset)
    if (bytesWritten === 0) throw new Error('authoring blob write made no progress')
    offset += bytesWritten
  }
}
