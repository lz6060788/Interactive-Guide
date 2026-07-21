import test from 'node:test'
import assert from 'node:assert/strict'
import { parseConfig } from '../../src/server/config.js'

test('parseConfig starts without legacy provider credentials', () => {
  assert.deepEqual(parseConfig({}), {
    PORT: 8788,
    CORS_ORIGIN: 'http://localhost:5173',
    DATA_DIR: './data',
  })
})

test('parseConfig exposes only supported offline settings', () => {
  assert.deepEqual(
    parseConfig({
      PORT: '9000',
      CORS_ORIGIN: 'http://127.0.0.1:4173',
      DATA_DIR: 'D:/guide-data',
      VISION_API_KEY: 'ignored-legacy-value',
      OBJECT_STORAGE_BUCKET: 'ignored-legacy-value',
    }),
    {
      PORT: 9000,
      CORS_ORIGIN: 'http://127.0.0.1:4173',
      DATA_DIR: 'D:/guide-data',
    },
  )
})
