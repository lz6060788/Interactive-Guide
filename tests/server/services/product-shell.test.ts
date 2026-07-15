import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProductShell } from '../../../src/server/services/product-shell.js'

test('product shell fills its browser or iframe host without a phone-sized frame', () => {
  const html = buildProductShell('Project title', 'void 0;')['index.html']

  assert.match(html, /html, body \{[\s\S]*width: 100%;[\s\S]*height: 100%;/)
  assert.match(html, /#app \{[\s\S]*width: 100%;[\s\S]*height: 100%;/)
  assert.match(html, /overflow: hidden;/)
  assert.doesNotMatch(html, /min-height:\s*100vh|375px|808px|24px auto/)
})
