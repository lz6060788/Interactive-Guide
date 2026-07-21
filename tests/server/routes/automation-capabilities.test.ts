import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import request from 'supertest'
import {
  WORKBENCH_VERSION,
  createAutomationRouter,
} from '../../../src/server/routes/automation.js'

test('GET /automation/v1/capabilities advertises only implemented stable capabilities', async () => {
  const app = express()
  app.use('/api', createAutomationRouter())

  const response = await request(app).get('/api/automation/v1/capabilities')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    data: {
      workbenchVersion: WORKBENCH_VERSION,
      automationProtocol: {
        selected: '1.0',
        supported: ['1.0'],
      },
      authoringContracts: [],
      projectSchemas: {
        read: ['2.0.0', '3.0.0'],
        write: ['3.0.0'],
      },
      products: ['atlas', 'catalog'],
      capabilities: [
        'atomic-dual-product-build',
        'catalog-initial-focus',
        'draft-product-build',
        'localized-content',
        'project-section-update',
        'revision-locked-update',
      ],
    },
  })
})

test('capability workbenchVersion stays aligned with package.json', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve('package.json'), 'utf8'),
  ) as { version: string }

  assert.equal(WORKBENCH_VERSION, packageJson.version)
})
