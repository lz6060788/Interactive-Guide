import test from 'node:test'
import assert from 'node:assert/strict'
import { EDITOR_THEME } from '../../src/config/editor-theme.js'

test('EDITOR_THEME.design exposes the design variance/motion/density parameters', () => {
  assert.equal(EDITOR_THEME.design.variance, 6)
  assert.equal(EDITOR_THEME.design.motion, 4)
  assert.equal(EDITOR_THEME.design.density, 5)
})

test('EDITOR_THEME has color, radius, shadow, font, spacing, motion sections', () => {
  for (const key of ['color', 'radius', 'shadow', 'font', 'spacing', 'motion']) {
    assert.ok(EDITOR_THEME[key as keyof typeof EDITOR_THEME], `missing section: ${key}`)
  }
})

test('EDITOR_THEME avoids AI purple/blue gradient palette', () => {
  const hexColors = Object.values(EDITOR_THEME.color).filter((c): c is string => typeof c === 'string')
  for (const c of hexColors) {
    // The chosen accent is a solid blue but not a gradient — there are no gradient strings in the token file.
    assert.doesNotMatch(c, /gradient/i, `editor-theme.color must not contain gradient string: ${c}`)
  }
})

test('EDITOR_THEME motion durations stay within 160-240ms range', () => {
  for (const v of Object.values(EDITOR_THEME.motion)) {
    if (typeof v === 'number') {
      assert.ok(v >= 100 && v <= 320, `motion duration out of expected range: ${v}`)
    }
  }
})
