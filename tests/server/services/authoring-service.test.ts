import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { GuideAuthoringBundleV1 } from '../../../src/automation/contracts/authoring-bundle-v1.js'
import {
  AuthoringApplyAtomicityError,
  AuthoringService,
} from '../../../src/server/services/authoring-service.js'
import { AuthoringBlobRepository } from '../../../src/server/storage/authoring-blob-repository.js'
import { AuthoringOperationRepository } from '../../../src/server/storage/authoring-operation-repository.js'
import { ProjectRepository } from '../../../src/server/storage/project-repository.js'

function digest(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function bundleFor(bytes: Buffer): GuideAuthoringBundleV1 {
  return {
    contract: 'guide-authoring-bundle',
    contractVersion: '1.0.0',
    idempotencyKey: 'a7bc6e4e-5cc0-4fc1-809d-ec2f1ec04ab8',
    expectedRevision: 0,
    project: {
      id: 'atomic-authoring-fixture',
      version: '1.0.0',
      title: { 'zh-CN': '原子创建', 'en-US': 'Atomic Create' },
      localization: { defaultLocale: 'zh-CN', supportedLocales: ['zh-CN', 'en-US'] },
    },
    knowledge: {
      stages: [
        {
          key: 'upstream',
          label: { 'zh-CN': '上游', 'en-US': 'Upstream' },
          categories: [],
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
    files: [
      {
        usage: 'runtime',
        assetId: 'panorama',
        kind: 'image',
        blobSha256: digest(bytes),
        size: bytes.length,
        mimeType: 'image/png',
        extension: 'png',
        semanticRole: 'panorama-image',
        originalName: 'panorama.png',
      },
    ],
    panorama: { imageAssetId: 'panorama' },
  }
}

test('prepared authoring apply is invisible on failure and resumes from its durable journal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-authoring-atomic-'))
  try {
    const bytes = Buffer.from('panorama bytes')
    const bundle = bundleFor(bytes)
    const projects = new ProjectRepository({ dataDir: root })
    const blobs = new AuthoringBlobRepository({ dataDir: root })
    const operations = new AuthoringOperationRepository({ dataDir: root })
    blobs.put({ sha256: digest(bytes), size: bytes.length, bytes })

    let failOnce = true
    const service = new AuthoringService(projects, blobs, operations, {
      dataDir: root,
      beforeVisibleCommit() {
        if (!failOnce) return
        failOnce = false
        throw new Error('injected failure before directory rename')
      },
    })
    const validation = service.validate(bundle)
    assert.equal(validation.ok, true, JSON.stringify(validation.issues))

    assert.throws(
      () => service.apply(bundle, validation.validationToken),
      AuthoringApplyAtomicityError,
    )
    assert.equal(projects.tryGet(bundle.project.id), null)
    assert.equal(fs.existsSync(path.join(root, 'projects', bundle.project.id)), false)
    assert.equal(operations.get(bundle.project.id, bundle.idempotencyKey)?.status, 'prepared')

    const recovered = service.apply(bundle, validation.validationToken)
    assert.equal(recovered.projectId, bundle.project.id)
    assert.equal(recovered.revision, 1)
    assert.equal(projects.get(bundle.project.id).metadata.revision, 1)
    assert.equal(operations.get(bundle.project.id, bundle.idempotencyKey)?.status, 'succeeded')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
