/**
 * SceneBridge envelope and target-origin resolution tests.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SCENE_BRIDGE_CHANNEL,
  SCENE_BRIDGE_VERSION,
  buildSceneBridgeEnvelope,
  isSceneBridgeEnvelope,
  resolveSceneBridgeTargetOrigin,
} from '../../src/platform/scene-bridge/scene-bridge.js'

test('buildSceneBridgeEnvelope stamps channel, version, and source', () => {
  const env = buildSceneBridgeEnvelope('event', 'interactive-guide-host', 'host:init', {
    activationId: 'a1',
  })
  assert.equal(env.channel, SCENE_BRIDGE_CHANNEL)
  assert.equal(env.version, SCENE_BRIDGE_VERSION)
  assert.equal(env.source, 'interactive-guide-host')
  assert.equal(env.kind, 'event')
  assert.equal(env.type, 'host:init')
})

test('isSceneBridgeEnvelope validates channel and version', () => {
  const env = buildSceneBridgeEnvelope('event', 'interactive-guide-host', 'host:init')
  assert.ok(isSceneBridgeEnvelope(env))
  assert.ok(
    !isSceneBridgeEnvelope({
      channel: 'wrong',
      version: SCENE_BRIDGE_VERSION,
      source: 'interactive-guide-host',
      kind: 'event',
      type: 'host:init',
    }),
  )
  assert.ok(
    !isSceneBridgeEnvelope({
      channel: SCENE_BRIDGE_CHANNEL,
      version: '0.0.0',
      source: 'interactive-guide-host',
      kind: 'event',
      type: 'host:init',
    }),
  )
})

test('resolveSceneBridgeTargetOrigin returns iframe origin when same-origin', () => {
  const origin = resolveSceneBridgeTargetOrigin(
    'https://example.com/scenes/s1/index.html',
    'https://example.com/atlas/index.html',
  )
  assert.equal(origin, 'https://example.com')
})

test('resolveSceneBridgeTargetOrigin allows listed origins', () => {
  const origin = resolveSceneBridgeTargetOrigin(
    'https://cdn.example.com/scenes/s1/index.html',
    'https://example.com/atlas/index.html',
    ['https://cdn.example.com'],
  )
  assert.equal(origin, 'https://cdn.example.com')
})

test('resolveSceneBridgeTargetOrigin rejects cross-origin without allowlist', () => {
  const origin = resolveSceneBridgeTargetOrigin(
    'https://attacker.example/scenes/s1/index.html',
    'https://example.com/atlas/index.html',
  )
  assert.equal(origin, '')
})

test('resolveSceneBridgeTargetOrigin never returns "*"', () => {
  // The "*" wildcard is explicitly forbidden. Even with an empty allowlist
  // for an unparseable iframe src, we must return an empty string.
  const origin = resolveSceneBridgeTargetOrigin('not-a-url', 'https://example.com/atlas/')
  assert.notEqual(origin, '*')
})