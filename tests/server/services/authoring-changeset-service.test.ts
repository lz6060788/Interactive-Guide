import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  GuideAuthoringChangeSetV1Schema,
  type GuideAuthoringChangeSetV1,
} from '../../../src/automation/contracts/authoring-changeset-v1.js'
import { createDraftProject } from '../../../src/domain/project-normalizer.js'
import type { GuideProject } from '../../../src/domain/project-types.js'
import {
  AuthoringChangeSetService,
  AuthoringChangeSetRevisionConflictError,
} from '../../../src/server/services/authoring-changeset-service.js'
import {
  AuthoringApplyAtomicityError,
  AuthoringOperationRecoveryRequiredError,
  AuthoringValidationTokenStaleError,
} from '../../../src/server/services/authoring-service.js'
import { AssetRepository } from '../../../src/server/storage/asset-repository.js'
import { AuthoringBlobRepository } from '../../../src/server/storage/authoring-blob-repository.js'
import { AuthoringOperationRepository } from '../../../src/server/storage/authoring-operation-repository.js'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'

const PROJECT_ID = 'changeset-service-fixture'
const BASE_TIME = '2026-07-21T03:00:00.000Z'
const APPLY_TIME = '2026-07-21T04:00:00.000Z'
const IDEMPOTENCY_KEY = '1b959cbb-d9a4-4d5a-875b-0bb3d1df777a'

interface Fixture {
  root: string
  projects: ProjectRepository
  assets: AssetRepository
  blobs: AuthoringBlobRepository
  operations: AuthoringOperationRepository
  service: AuthoringChangeSetService
}

function digest(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function createFixture(
  options: { beforeVisibleCommit?: (projectId: string) => void } = {},
): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-authoring-changeset-'))
  const projects = new ProjectRepository({ dataDir: root })
  const assets = new AssetRepository(projects, { dataDir: root })
  const blobs = new AuthoringBlobRepository({ dataDir: root })
  const operations = new AuthoringOperationRepository({ dataDir: root })
  const panoramaBytes = Buffer.from('base panorama bytes')
  const project = createDraftProject({ id: PROJECT_ID, title: '变更集测试' })
  project.title = { 'zh-CN': '变更集测试', 'en-US': 'ChangeSet Test' }
  project.assets.byId.panorama = {
    id: 'panorama',
    kind: 'image',
    sourcePath: 'images/panorama/image.png',
    mimeType: 'image/png',
    sha256: digest(panoramaBytes),
    size: panoramaBytes.length,
  }
  project.panorama.assetId = 'panorama'
  project.metadata.createdAt = BASE_TIME
  project.metadata.updatedAt = BASE_TIME
  const saved = projects.save(project, { expectedRevision: 0, timestamp: BASE_TIME })
  assert.equal(saved.conflict, false)
  assets.registerImage(PROJECT_ID, {
    id: 'panorama',
    bytes: panoramaBytes,
    mimeType: 'image/png',
    extension: 'png',
  })

  const service = new AuthoringChangeSetService(projects, assets, blobs, operations, {
    dataDir: root,
    now: () => new Date(APPLY_TIME),
    ...options,
  })
  return { root, projects, assets, blobs, operations, service }
}

function changeSet(
  partitions: GuideAuthoringChangeSetV1['partitions'],
  overrides: Partial<GuideAuthoringChangeSetV1> = {},
): GuideAuthoringChangeSetV1 {
  return GuideAuthoringChangeSetV1Schema.parse({
    contract: 'guide-authoring-changeset',
    contractVersion: '1.0.0',
    projectId: PROJECT_ID,
    expectedRevision: 1,
    idempotencyKey: IDEMPOTENCY_KEY,
    partitions,
    ...overrides,
  })
}

function runtimeImage(bytes: Buffer, assetId = 'panorama-v2') {
  return {
    usage: 'runtime' as const,
    assetId,
    kind: 'image' as const,
    blobSha256: digest(bytes),
    size: bytes.length,
    mimeType: 'image/png',
    extension: 'png',
    semanticRole: 'panorama-image' as const,
    originalName: `${assetId}.png`,
  }
}

test('validation token binds the current revision and project/tree hashes', () => {
  const fixture = createFixture()
  try {
    const input = changeSet({
      profile: { title: { 'zh-CN': '新标题', 'en-US': 'New Title' } },
    })
    const first = fixture.service.validate(input)
    assert.equal(first.ok, true, JSON.stringify(first.issues))
    assert.equal(first.baseRevision, 1)
    assert.match(first.baseProjectSha256, /^[a-f0-9]{64}$/)
    assert.match(first.baseProjectTreeSha256, /^[a-f0-9]{64}$/)

    const current = fixture.projects.get(PROJECT_ID)
    const external: GuideProject = { ...current, version: '1.1.0' }
    const saved = fixture.projects.save(external, { expectedRevision: 1 })
    assert.equal(saved.conflict, false)
    const second = fixture.service.validate(input)
    assert.equal(second.ok, false)
    assert.notEqual(second.validationToken, first.validationToken)
    assert.ok(second.issues.some(issue => issue.code === 'REVISION_CONFLICT'))
    assert.throws(
      () => fixture.service.apply(input, first.validationToken),
      AuthoringValidationTokenStaleError,
    )
    assert.throws(
      () => fixture.service.apply(input, second.validationToken),
      AuthoringChangeSetRevisionConflictError,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('atomically appends runtime/source files and records a scoped durable operation', () => {
  const fixture = createFixture()
  try {
    const imageBytes = Buffer.from('replacement panorama bytes')
    const sourceBytes = Buffer.from('# hotspot source')
    fixture.blobs.put({
      sha256: digest(imageBytes),
      size: imageBytes.length,
      bytes: imageBytes,
    })
    fixture.blobs.put({
      sha256: digest(sourceBytes),
      size: sourceBytes.length,
      bytes: sourceBytes,
    })
    const input = changeSet({
      assets: {
        append: [
          runtimeImage(imageBytes),
          {
            usage: 'authoring-source',
            fileRef: 'hotspot-source-v2',
            blobSha256: digest(sourceBytes),
            size: sourceBytes.length,
            mediaType: 'text/markdown',
            semanticRole: 'hotspot-map',
            originalName: 'hotspots.md',
          },
        ],
      },
      panorama: { patch: { imageAssetId: 'panorama-v2' } },
    })
    const validation = fixture.service.validate(input)
    assert.equal(validation.ok, true, JSON.stringify(validation.issues))

    const result = fixture.service.apply(input, validation.validationToken)
    assert.equal(result.revision, 2)
    assert.equal(result.validationToken, validation.validationToken)
    assert.equal(fixture.projects.get(PROJECT_ID).panorama.assetId, 'panorama-v2')
    assert.deepEqual(
      fs.readFileSync(
        path.join(
          fixture.root,
          'projects',
          PROJECT_ID,
          'assets',
          'images',
          'panorama-v2',
          'image.png',
        ),
      ),
      imageBytes,
    )
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(fixture.root, 'projects', PROJECT_ID, 'authoring-sources', 'manifest.json'),
        'utf8',
      ),
    ) as { files: Array<{ fileRef: string }> }
    assert.deepEqual(
      manifest.files.map(file => file.fileRef),
      ['hotspot-source-v2'],
    )

    const scopedKey = `guide-authoring-changeset:${IDEMPOTENCY_KEY}`
    const journal = fixture.operations.get(PROJECT_ID, scopedKey)
    assert.equal(journal?.status, 'succeeded')
    assert.equal(journal?.operationContract, 'guide-authoring-changeset')
    assert.equal(journal?.expectedRevision, 1)
    assert.equal(journal?.baseProjectSha256, validation.baseProjectSha256)
    assert.equal(journal?.baseProjectTreeSha256, validation.baseProjectTreeSha256)
    assert.equal(journal?.validationToken, validation.validationToken)
    assert.equal(fixture.operations.get(PROJECT_ID, IDEMPOTENCY_KEY), null)
    assert.deepEqual(fixture.service.apply(input, validation.validationToken), result)
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('prepared update resumes after append bytes land but before project.json commit', () => {
  let failOnce = true
  const fixture = createFixture({
    beforeVisibleCommit() {
      if (!failOnce) return
      failOnce = false
      throw new Error('injected failure before project save')
    },
  })
  try {
    const imageBytes = Buffer.from('prepared panorama bytes')
    fixture.blobs.put({
      sha256: digest(imageBytes),
      size: imageBytes.length,
      bytes: imageBytes,
    })
    const input = changeSet({
      assets: { append: [runtimeImage(imageBytes)] },
      panorama: { patch: { imageAssetId: 'panorama-v2' } },
    })
    const validation = fixture.service.validate(input)

    assert.throws(
      () => fixture.service.apply(input, validation.validationToken),
      AuthoringApplyAtomicityError,
    )
    assert.equal(fixture.projects.get(PROJECT_ID).metadata.revision, 1)
    assert.equal(fixture.projects.get(PROJECT_ID).assets.byId['panorama-v2'], undefined)
    assert.equal(
      fs.existsSync(
        path.join(
          fixture.root,
          'projects',
          PROJECT_ID,
          'assets',
          'images',
          'panorama-v2',
          'image.png',
        ),
      ),
      true,
    )
    assert.equal(
      fixture.operations.get(PROJECT_ID, `guide-authoring-changeset:${IDEMPOTENCY_KEY}`)?.status,
      'prepared',
    )

    // Recovery must use the prepared journal before revalidation: the newly
    // durable asset would otherwise look like an unrelated storage conflict.
    const recovered = fixture.service.apply(input, validation.validationToken)
    assert.equal(recovered.revision, 2)
    assert.equal(fixture.projects.get(PROJECT_ID).panorama.assetId, 'panorama-v2')
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('validation reports append conflicts, invalid HTML archives, and calibration work', () => {
  const fixture = createFixture()
  try {
    const invalidZip = Buffer.from('not a zip archive')
    fixture.blobs.put({
      sha256: digest(invalidZip),
      size: invalidZip.length,
      bytes: invalidZip,
    })
    fs.mkdirSync(path.join(fixture.root, 'projects', PROJECT_ID, 'assets', 'scenes', 'panorama'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(fixture.root, 'projects', PROJECT_ID, 'assets', 'scenes', 'panorama', 'index.html'),
      '<html></html>',
    )
    const conflictInput = changeSet({
      assets: {
        append: [
          {
            usage: 'runtime',
            assetId: 'panorama',
            kind: 'html-bundle',
            blobSha256: digest(invalidZip),
            size: invalidZip.length,
            mimeType: 'application/zip',
            extension: 'zip',
            semanticRole: 'html-scene-bundle',
            originalName: 'scene.zip',
          },
        ],
      },
    })
    const conflicts = fixture.service.validate(conflictInput)
    assert.equal(conflicts.ok, false)
    assert.ok(conflicts.issues.some(issue => issue.code === 'ASSET_ID_CONFLICT'))
    assert.ok(conflicts.issues.some(issue => issue.code === 'ASSET_STORAGE_CONFLICT'))
    assert.ok(conflicts.issues.some(issue => issue.code === 'HTML_BUNDLE_INVALID'))

    const knowledgeInput = changeSet({
      knowledge: {
        replace: {
          stages: [
            {
              key: 'upstream',
              label: { 'zh-CN': '上游', 'en-US': 'Upstream' },
              categories: [
                {
                  id: 'materials',
                  title: { 'zh-CN': '材料', 'en-US': 'Materials' },
                  experience: { kind: 'panorama' },
                  items: [
                    {
                      id: 'wafer',
                      title: { 'zh-CN': '硅片', 'en-US': 'Wafer' },
                      description: { 'zh-CN': '说明', 'en-US': 'Description' },
                    },
                  ],
                },
              ],
            },
            {
              key: 'midstream',
              label: { 'zh-CN': '中游', 'en-US': 'Midstream' },
              categories: [],
            },
            {
              key: 'downstream',
              label: { 'zh-CN': '下游', 'en-US': 'Downstream' },
              categories: [],
            },
          ],
        },
      },
    })
    const calibration = fixture.service.validate(knowledgeInput)
    assert.equal(calibration.ok, true, JSON.stringify(calibration.issues))
    assert.deepEqual(
      calibration.calibrationQueue.map(item => item.code),
      ['CATEGORY_LAYOUT_MISSING', 'ITEM_MARKER_MISSING', 'ITEM_FOCUS_RECT_MISSING'],
    )
    assert.ok(calibration.releaseIssues.some(issue => issue.code === 'CALIBRATION_MISSING'))
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('succeeded replay fails closed after the visible project advances', () => {
  const fixture = createFixture()
  try {
    const input = changeSet({ profile: { version: '2.0.0' } })
    const validation = fixture.service.validate(input)
    fixture.service.apply(input, validation.validationToken)

    const current = fixture.projects.get(PROJECT_ID)
    const saved = fixture.projects.save({ ...current, version: '2.1.0' }, { expectedRevision: 2 })
    assert.equal(saved.conflict, false)
    assert.throws(
      () => fixture.service.apply(input, validation.validationToken),
      AuthoringOperationRecoveryRequiredError,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('corrupt prepared journal metadata is recovery-required rather than token-stale', () => {
  const fixture = createFixture({
    beforeVisibleCommit() {
      throw new Error('leave operation prepared')
    },
  })
  try {
    const input = changeSet({ profile: { version: '2.0.0' } })
    const validation = fixture.service.validate(input)
    assert.throws(
      () => fixture.service.apply(input, validation.validationToken),
      AuthoringApplyAtomicityError,
    )

    const scopedKey = `guide-authoring-changeset:${IDEMPOTENCY_KEY}`
    const keyHash = digest(Buffer.from(scopedKey))
    const journalPath = path.join(fixture.operations.rootDir(), PROJECT_ID, `${keyHash}.json`)
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Record<string, unknown>
    delete journal.validationToken
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2))

    assert.throws(
      () => fixture.service.apply(input, validation.validationToken),
      AuthoringOperationRecoveryRequiredError,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})

test('succeeded replay maps a missing visible project tree to recovery-required', () => {
  const fixture = createFixture()
  try {
    const input = changeSet({ profile: { version: '2.0.0' } })
    const validation = fixture.service.validate(input)
    fixture.service.apply(input, validation.validationToken)
    fs.rmSync(path.join(fixture.root, 'projects', PROJECT_ID), {
      recursive: true,
      force: true,
    })

    assert.throws(
      () => fixture.service.apply(input, validation.validationToken),
      AuthoringOperationRecoveryRequiredError,
    )
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true })
  }
})
