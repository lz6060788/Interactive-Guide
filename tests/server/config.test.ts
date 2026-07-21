import test from 'node:test'
import assert from 'node:assert/strict'
import { parseConfig } from '../../src/server/config.js'

test('parseConfig starts the offline workbench without legacy provider credentials', () => {
  const config = parseConfig({})

  assert.deepEqual(config, {
    PORT: 8788,
    CORS_ORIGIN: 'http://localhost:5173',
    DATA_DIR: './data',
  })
})

test('parseConfig reads only the supported workbench environment settings', () => {
  const config = parseConfig({
    PORT: '9000',
    CORS_ORIGIN: 'http://127.0.0.1:4173',
    DATA_DIR: 'D:/guide-data',
    VISION_API_KEY: 'must-not-be-required',
  })

  assert.deepEqual(config, {
    PORT: 9000,
    CORS_ORIGIN: 'http://127.0.0.1:4173',
    DATA_DIR: 'D:/guide-data',
  })
})
