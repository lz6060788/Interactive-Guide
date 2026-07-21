import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { executeWorkbenchCli, parseWorkbenchCliArgs } from '../../src/server/workbench-cli.js'
import {
  AUTOMATION_PROTOCOL_VERSION,
  WORKBENCH_VERSION,
} from '../../src/server/routes/automation.js'

test('parseWorkbenchCliArgs parses a machine-readable handshake', () => {
  assert.deepEqual(
    parseWorkbenchCliArgs(['handshake', '--client', 'interactive-guide-skill/1.0.0', '--json']),
    {
      command: 'handshake',
      client: 'interactive-guide-skill/1.0.0',
      json: true,
    },
  )
})

test('parseWorkbenchCliArgs parses start with an automatic local port', () => {
  const parsed = parseWorkbenchCliArgs([
    'start',
    '--workspace',
    './guide-workspace',
    '--port',
    'auto',
    '--admin-dir',
    './dist/admin',
    '--json',
  ])

  assert.deepEqual(parsed, {
    command: 'start',
    workspace: path.resolve('./guide-workspace'),
    port: 0,
    adminDir: path.resolve('./dist/admin'),
    json: true,
  })
})

test('parseWorkbenchCliArgs rejects missing workspaces and invalid ports', () => {
  assert.throws(() => parseWorkbenchCliArgs(['start', '--json']), /--workspace is required/)
  assert.throws(
    () => parseWorkbenchCliArgs(['start', '--workspace', './data', '--port', '70000']),
    /port must be auto or an integer from 1 to 65535/,
  )
})

test('executeWorkbenchCli writes one stable JSON handshake envelope to stdout', async () => {
  const stdout: string[] = []
  const stderr: string[] = []
  const exitCode = await executeWorkbenchCli(['handshake', '--json'], {
    stdout: value => stdout.push(value),
    stderr: value => stderr.push(value),
  })

  assert.equal(exitCode, 0)
  assert.equal(stdout.length, 1)
  assert.deepEqual(JSON.parse(stdout[0]!), {
    ok: true,
    protocolVersion: AUTOMATION_PROTOCOL_VERSION,
    data: {
      workbenchVersion: WORKBENCH_VERSION,
      automationProtocol: {
        selected: AUTOMATION_PROTOCOL_VERSION,
        supported: [AUTOMATION_PROTOCOL_VERSION],
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
  assert.deepEqual(stderr, [])
})
