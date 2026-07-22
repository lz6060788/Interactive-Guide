import type { GuideProject, LocalizedText } from './project-types.js'

type LegacyProject = Record<string, any>

function localize(value: unknown, locale: string): LocalizedText | undefined {
  if (typeof value === 'string') return { [locale]: value }
  if (value && typeof value === 'object') return value as LocalizedText
  return undefined
}

/** Deterministically upgrades the persisted 2.0 shape without inventing translations. */
export function migrateGuideProject(raw: unknown): GuideProject {
  const source = raw as LegacyProject
  if (source?.schemaVersion === '4.0.0') return source as GuideProject
  if (source?.schemaVersion === '3.0.0') return migrateV3ToV4(source)
  if (source?.schemaVersion !== '2.0.0') {
    throw new Error(`unsupported GuideProject schemaVersion "${String(source?.schemaVersion)}"`)
  }

  const next = JSON.parse(JSON.stringify(source)) as LegacyProject
  const locale = typeof next.locale === 'string' && next.locale ? next.locale : 'zh-CN'
  next.schemaVersion = '3.0.0'
  next.title = localize(next.title, locale)
  next.localization = {
    defaultLocale: locale,
    supportedLocales: Array.from(new Set([locale, 'zh-CN', 'en-US'])),
  }
  delete next.locale

  for (const stage of next.knowledge?.stages ?? []) {
    stage.label = localize(stage.label, locale)
    for (const category of stage.categories ?? []) {
      category.title = localize(category.title, locale)
      if (category.description !== undefined) {
        category.description = localize(category.description, locale)
      }
    }
  }
  for (const item of Object.values(next.knowledge?.items ?? {}) as LegacyProject[]) {
    item.title = localize(item.title, locale)
    item.description = localize(item.description ?? '', locale)
  }
  for (const scene of next.scenes ?? []) {
    scene.title = localize(scene.title, locale)
    for (const view of scene.views ?? []) view.title = localize(view.title, locale)
  }
  if (next.products?.atlas?.hintText !== undefined) {
    next.products.atlas.hintText = localize(next.products.atlas.hintText, locale)
  }
  if (next.products?.catalog?.hintText !== undefined) {
    next.products.catalog.hintText = localize(next.products.catalog.hintText, locale)
  }
  if (next.integrations?.share?.title !== undefined) {
    next.integrations.share.title = localize(next.integrations.share.title, locale)
  }
  if (next.integrations?.share?.description !== undefined) {
    next.integrations.share.description = localize(next.integrations.share.description, locale)
  }
  if (next.metadata) next.metadata.schemaVersion = '3.0.0'
  return migrateV3ToV4(next)
}

function migrateV3ToV4(source: LegacyProject): GuideProject {
  const next = JSON.parse(JSON.stringify(source)) as LegacyProject
  next.schemaVersion = '4.0.0'
  next.products = next.products ?? {}
  next.products.gallery = next.products.gallery ?? {
    enabled: false,
    viewport: { width: 375, height: 808 },
    theme: { listDensity: 'comfortable' },
    chrome: {},
    interaction: {
      listActivation: 'center-nearest',
      itemTransitionMs: 220,
      categoryTransitionMs: 320,
    },
    stageOrder: ['upstream', 'midstream', 'downstream'],
    hintText: {
      'zh-CN': '点击或滑动文字切换节点图片',
      'en-US': 'Tap or swipe through the list to change images',
    },
    itemImageAssetIds: {},
  }
  if (next.metadata) next.metadata.schemaVersion = '4.0.0'
  return next as GuideProject
}
