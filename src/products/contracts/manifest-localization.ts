import { readLocalizedText, requireLocalizedText } from '../../domain/localization.js'
import type { LocaleCode, LocalizedText } from '../../domain/project-types.js'
import type { AtlasManifest, ResolvedAtlasManifest } from '../atlas/contract/atlas-manifest.js'
import type {
  CatalogManifest,
  ResolvedCatalogManifest,
} from '../catalog/contract/catalog-manifest.js'

export interface ManifestLocalizationOptions {
  /** Draft previews may render incomplete translations; released runtimes remain strict by default. */
  allowMissingTranslations?: boolean
}

function text(
  value: LocalizedText | undefined,
  locale: LocaleCode,
  path: string,
  options: ManifestLocalizationOptions,
): string {
  return options.allowMissingTranslations
    ? readLocalizedText(value, locale)
    : requireLocalizedText(value, locale, path)
}

function resolveIntegrations(
  integrations: AtlasManifest['integrations'],
  locale: LocaleCode,
  options: ManifestLocalizationOptions,
): ResolvedAtlasManifest['integrations'] {
  const resolveText = (value: LocalizedText | undefined, path: string) =>
    text(value, locale, path, options)
  const share = integrations.share
  return {
    ...(integrations.analytics ? { analytics: integrations.analytics } : {}),
    ...(share
      ? {
          share: {
            ...share,
            ...(share.title
              ? { title: resolveText(share.title, 'integrations.share.title') }
              : {}),
            ...(share.description
              ? { description: resolveText(share.description, 'integrations.share.description') }
              : {}),
          },
        }
      : {}),
  } as ResolvedAtlasManifest['integrations']
}

export function resolveAtlasManifest(
  manifest: AtlasManifest,
  locale: LocaleCode,
  options: ManifestLocalizationOptions = {},
): ResolvedAtlasManifest {
  const resolveText = (value: LocalizedText | undefined, path: string) =>
    text(value, locale, path, options)
  return {
    ...manifest,
    locale,
    projectTitle: resolveText(manifest.projectTitle, 'projectTitle'),
    categories: manifest.categories.map(category => ({
      ...category,
      title: resolveText(category.title, `categories.${category.id}.title`),
      ...(category.stageLabel
        ? { stageLabel: resolveText(category.stageLabel, `categories.${category.id}.stageLabel`) }
        : {}),
      ...(category.description
        ? {
            description: resolveText(
              category.description,
              `categories.${category.id}.description`,
            ),
          }
        : {}),
    })),
    items: manifest.items.map(item => ({
      ...item,
      title: resolveText(item.title, `items.${item.id}.title`),
      description: resolveText(item.description, `items.${item.id}.description`),
    })),
    scenes: manifest.scenes.map(scene => ({
      ...scene,
      title: resolveText(scene.title, `scenes.${scene.sceneId}.title`),
      views: scene.views.map(view => ({
        ...view,
        title: resolveText(view.title, `scenes.${scene.sceneId}.views.${view.id}.title`),
      })),
    })),
    config: {
      ...manifest.config,
      ...(manifest.config.hintText
        ? { hintText: resolveText(manifest.config.hintText, 'config.hintText') }
        : {}),
    },
    integrations: resolveIntegrations(manifest.integrations, locale, options),
  } as unknown as ResolvedAtlasManifest
}

export function resolveCatalogManifest(
  manifest: CatalogManifest,
  locale: LocaleCode,
  options: ManifestLocalizationOptions = {},
): ResolvedCatalogManifest {
  const resolveText = (value: LocalizedText | undefined, path: string) =>
    text(value, locale, path, options)
  return {
    ...manifest,
    locale,
    projectTitle: resolveText(manifest.projectTitle, 'projectTitle'),
    stages: manifest.stages.map(stage => ({
      ...stage,
      label: resolveText(stage.label, `stages.${stage.key}.label`),
      categories: stage.categories.map(category => ({
        ...category,
        title: resolveText(category.title, `categories.${category.id}.title`),
        ...(category.description
          ? {
              description: resolveText(
                category.description,
                `categories.${category.id}.description`,
              ),
            }
          : {}),
      })),
    })),
    items: manifest.items.map(item => ({
      ...item,
      title: resolveText(item.title, `items.${item.id}.title`),
      description: resolveText(item.description, `items.${item.id}.description`),
    })),
    scenes: manifest.scenes.map(scene => ({
      ...scene,
      title: resolveText(scene.title, `scenes.${scene.sceneId}.title`),
      views: scene.views.map(view => ({
        ...view,
        title: resolveText(view.title, `scenes.${scene.sceneId}.views.${view.id}.title`),
      })),
    })),
    config: {
      ...manifest.config,
      ...(manifest.config.hintText
        ? { hintText: resolveText(manifest.config.hintText, 'config.hintText') }
        : {}),
    },
    integrations: resolveIntegrations(manifest.integrations, locale, options),
  } as unknown as ResolvedCatalogManifest
}
