import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRuntimeLocale, withLocaleInUrl } from '../../src/domain/localization.js'
import { migrateGuideProject } from '../../src/domain/project-migration.js'
import { createDraftProject } from '../../src/domain/project-normalizer.js'

const localization = {
  defaultLocale: 'zh-CN',
  supportedLocales: ['zh-CN', 'en-US'],
}

test('resolveRuntimeLocale prefers query, then browser language, then project default', () => {
  assert.equal(
    resolveRuntimeLocale(localization, {
      search: '?lang=en-US',
      navigatorLanguages: ['zh-CN'],
    }),
    'en-US',
  )
  assert.equal(resolveRuntimeLocale(localization, { navigatorLanguages: ['en-GB'] }), 'en-US')
  assert.equal(resolveRuntimeLocale(localization, { navigatorLanguages: ['fr-FR'] }), 'zh-CN')
})

test('withLocaleInUrl preserves existing URL parts and adds the selected locale', () => {
  assert.equal(
    withLocaleInUrl('./atlas/index.html?source=catalog#item', 'en-US'),
    '/atlas/index.html?source=catalog&lang=en-US#item',
  )
})

test('migrateGuideProject wraps legacy text without inventing translations', () => {
  const current = createDraftProject({ id: 'legacy', title: '旧项目', locale: 'zh-CN' })
  const legacy = structuredClone(current) as unknown as Record<string, any>
  legacy.schemaVersion = '2.0.0'
  legacy.metadata.schemaVersion = '2.0.0'
  legacy.locale = 'zh-CN'
  legacy.title = '旧项目'
  delete legacy.localization
  for (const stage of legacy.knowledge.stages) {
    stage.label = stage.label['zh-CN']
  }
  legacy.products.atlas.hintText = legacy.products.atlas.hintText['zh-CN']
  legacy.products.catalog.hintText = legacy.products.catalog.hintText['zh-CN']

  const migrated = migrateGuideProject(legacy)
  assert.equal(migrated.schemaVersion, '4.0.0')
  assert.equal(migrated.products.gallery.enabled, false)
  assert.deepEqual(migrated.title, { 'zh-CN': '旧项目' })
  assert.deepEqual(migrated.localization.supportedLocales, ['zh-CN', 'en-US'])
  assert.equal(migrated.title['en-US'], undefined)
})
