import test from 'node:test'
import assert from 'node:assert/strict'
import {
  matchRoute,
  listRoutesFrom,
  ExperienceLocationSchema,
  ExperienceRouteSchema,
} from '../../src/domain/experience-navigation.js'

const sampleNav = {
  routes: [
    {
      id: 'r-overview-rocket',
      from: { kind: 'panorama' as const },
      to: { kind: 'scene' as const, sceneId: 'scene-rocket' },
    },
    {
      id: 'r-rocket-overview',
      from: { kind: 'scene' as const, sceneId: 'scene-rocket' },
      to: { kind: 'panorama' as const },
    },
    {
      id: 'r-launch-ttc',
      from: { kind: 'panorama' as const, categoryId: 'midstream-launch-services' },
      to: { kind: 'panorama' as const, categoryId: 'midstream-ttc-ops' },
    },
  ],
}

test('matchRoute returns the panorama -> scene route', () => {
  const r = matchRoute(sampleNav, { kind: 'panorama' }, { kind: 'scene', sceneId: 'scene-rocket' })
  assert.equal(r?.id, 'r-overview-rocket')
})

test('matchRoute returns the scene -> panorama route', () => {
  const r = matchRoute(
    sampleNav,
    { kind: 'scene', sceneId: 'scene-rocket' },
    { kind: 'panorama' },
  )
  assert.equal(r?.id, 'r-rocket-overview')
})

test('matchRoute returns undefined when no route matches', () => {
  const r = matchRoute(
    sampleNav,
    { kind: 'panorama' },
    { kind: 'scene', sceneId: 'scene-missing' },
  )
  assert.equal(r, undefined)
})

test('matchRoute matches panorama locations with same categoryId/itemId', () => {
  const r = matchRoute(
    sampleNav,
    { kind: 'panorama', categoryId: 'midstream-launch-services' },
    { kind: 'panorama', categoryId: 'midstream-ttc-ops' },
  )
  assert.equal(r?.id, 'r-launch-ttc')
})

test('matchRoute does not match locations with different categoryId', () => {
  const r = matchRoute(
    sampleNav,
    { kind: 'panorama', categoryId: 'midstream-launch-services' },
    { kind: 'panorama', categoryId: 'downstream-satcom' },
  )
  assert.equal(r, undefined)
})

test('listRoutesFrom returns routes that originate at a given location', () => {
  const rs = listRoutesFrom(sampleNav, { kind: 'panorama' })
  assert.equal(rs.length, 1)
  assert.equal(rs[0].id, 'r-overview-rocket')
})

test('listRoutesFrom returns routes that originate at a specific scene', () => {
  const rs = listRoutesFrom(sampleNav, { kind: 'scene', sceneId: 'scene-rocket' })
  assert.equal(rs.length, 1)
  assert.equal(rs[0].id, 'r-rocket-overview')
})

test('ExperienceLocationSchema rejects unknown kind', () => {
  const r = ExperienceLocationSchema.safeParse({ kind: 'unknown' })
  assert.equal(r.success, false)
})

test('ExperienceRouteSchema requires onFailure to be one of two literals', () => {
  const r = ExperienceRouteSchema.safeParse({
    id: 'r-x',
    from: { kind: 'panorama' },
    to: { kind: 'panorama' },
    transition: { kind: 'video', assetId: 'a', onFailure: 'explode' },
  })
  assert.equal(r.success, false)
})

test('ExperienceRouteSchema accepts the valid onFailure values', () => {
  for (const v of ['abort-navigation', 'cut']) {
    const r = ExperienceRouteSchema.safeParse({
      id: 'r-x',
      from: { kind: 'panorama' },
      to: { kind: 'panorama' },
      transition: { kind: 'video', assetId: 'a', onFailure: v },
    })
    assert.equal(r.success, true, `value "${v}" must be accepted`)
  }
})
