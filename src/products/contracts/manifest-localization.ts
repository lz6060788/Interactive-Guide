import { requireLocalizedText } from '../../domain/localization.js'
import type { LocaleCode, LocalizedText } from '../../domain/project-types.js'
import type { AtlasManifest, ResolvedAtlasManifest } from '../atlas/contract/atlas-manifest.js'
import type {
  CatalogManifest,
  ResolvedCatalogManifest,
} from '../catalog/contract/catalog-manifest.js'

function text(value: LocalizedText | undefined, locale: LocaleCode, path: string): string {
  return requireLocalizedText(value, locale, path)
}

function resolveIntegrations(
  integrations: AtlasManifest['integrations'],
  locale: LocaleCode,
): ResolvedAtlasManifest['integrations'] {
  const share = integrations.share
  return {
    ...(integrations.analytics ? { analytics: integrations.analytics } : {}),
    ...(share
      ? {
          share: {
            ...share,
            ...(share.title
              ? { title: text(share.title, locale, 'integrations.share.title') }
              : {}),
            ...(share.description
              ? { description: text(share.description, locale, 'integrations.share.description') }
              : {}),
          },
        }
      : {}),
  } as ResolvedAtlasManifest['integrations']
}

export function resolveAtlasManifest(
  manifest: AtlasManifest,
  locale: LocaleCode,
): ResolvedAtlasManifest {
  return {
    ...manifest,
    locale,
    projectTitle: text(manifest.projectTitle, locale, 'projectTitle'),
    categories: manifest.categories.map(category => ({
      ...category,
      title: text(category.title, locale, `categories.${category.id}.title`),
      ...(category.stageLabel
        ? { stageLabel: text(category.stageLabel, locale, `categories.${category.id}.stageLabel`) }
        : {}),
      ...(category.description
        ? {
            description: text(
              category.description,
              locale,
              `categories.${category.id}.description`,
            ),
          }
        : {}),
    })),
    items: manifest.items.map(item => ({
      ...item,
      title: text(item.title, locale, `items.${item.id}.title`),
      description: text(item.description, locale, `items.${item.id}.description`),
    })),
    scenes: manifest.scenes.map(scene => ({
      ...scene,
      title: text(scene.title, locale, `scenes.${scene.sceneId}.title`),
      views: scene.views.map(view => ({
        ...view,
        title: text(view.title, locale, `scenes.${scene.sceneId}.views.${view.id}.title`),
      })),
    })),
    config: {
      ...manifest.config,
      ...(manifest.config.hintText
        ? { hintText: text(manifest.config.hintText, locale, 'config.hintText') }
        : {}),
    },
    integrations: resolveIntegrations(manifest.integrations, locale),
  } as unknown as ResolvedAtlasManifest
}

export function resolveCatalogManifest(
  manifest: CatalogManifest,
  locale: LocaleCode,
): ResolvedCatalogManifest {
  return {
    ...manifest,
    locale,
    projectTitle: text(manifest.projectTitle, locale, 'projectTitle'),
    stages: manifest.stages.map(stage => ({
      ...stage,
      label: text(stage.label, locale, `stages.${stage.key}.label`),
      categories: stage.categories.map(category => ({
        ...category,
        title: text(category.title, locale, `categories.${category.id}.title`),
        ...(category.description
          ? {
              description: text(
                category.description,
                locale,
                `categories.${category.id}.description`,
              ),
            }
          : {}),
      })),
    })),
    items: manifest.items.map(item => ({
      ...item,
      title: text(item.title, locale, `items.${item.id}.title`),
      description: text(item.description, locale, `items.${item.id}.description`),
    })),
    scenes: manifest.scenes.map(scene => ({
      ...scene,
      title: text(scene.title, locale, `scenes.${scene.sceneId}.title`),
      views: scene.views.map(view => ({
        ...view,
        title: text(view.title, locale, `scenes.${scene.sceneId}.views.${view.id}.title`),
      })),
    })),
    config: {
      ...manifest.config,
      ...(manifest.config.hintText
        ? { hintText: text(manifest.config.hintText, locale, 'config.hintText') }
        : {}),
    },
    integrations: resolveIntegrations(manifest.integrations, locale),
  } as unknown as ResolvedCatalogManifest
}
