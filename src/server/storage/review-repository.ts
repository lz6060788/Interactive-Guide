import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  ReviewIdSchema,
  ReviewSessionRecordSchema,
  type ReviewSessionRecord,
} from '../../automation/contracts/review-session-v1.js'

export class ReviewNotFoundError extends Error {
  constructor(public readonly reviewId: string) {
    super(`review session "${reviewId}" not found`)
    this.name = 'ReviewNotFoundError'
  }
}

export class ReviewConflictError extends Error {
  constructor(public readonly reviewId: string) {
    super(`review session "${reviewId}" already exists`)
    this.name = 'ReviewConflictError'
  }
}

export class ReviewRepository {
  private readonly root: string

  constructor(options: { dataDir?: string } = {}) {
    this.root = path.resolve(options.dataDir ?? path.resolve('data'), 'reviews')
    fs.mkdirSync(this.root, { recursive: true })
  }

  create(record: ReviewSessionRecord): ReviewSessionRecord {
    const parsed = ReviewSessionRecordSchema.parse(record)
    const file = this.filePath(parsed.id)
    if (fs.existsSync(file)) throw new ReviewConflictError(parsed.id)
    this.write(file, parsed)
    return parsed
  }

  get(reviewId: string): ReviewSessionRecord {
    const file = this.filePath(reviewId)
    if (!fs.existsSync(file)) throw new ReviewNotFoundError(reviewId)
    try {
      return ReviewSessionRecordSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
    } catch (error) {
      if (error instanceof ReviewNotFoundError) throw error
      throw new Error(`review session "${reviewId}" is corrupt`)
    }
  }

  save(record: ReviewSessionRecord): ReviewSessionRecord {
    const parsed = ReviewSessionRecordSchema.parse(record)
    const file = this.filePath(parsed.id)
    if (!fs.existsSync(file)) throw new ReviewNotFoundError(parsed.id)
    this.write(file, parsed)
    return parsed
  }

  private filePath(reviewId: string): string {
    if (!ReviewIdSchema.safeParse(reviewId).success) throw new ReviewNotFoundError(reviewId)
    return path.join(this.root, `${reviewId}.json`)
  }

  private write(file: string, record: ReviewSessionRecord): void {
    const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(record, null, 2))
    fs.renameSync(temporary, file)
  }
}
