import { create } from 'zustand'
import type { GuideProject, LocalizedText } from '@domain/project-types'
import { readLocalizedText, setLocalizedText } from '@domain/localization'

interface ContentLocaleState {
  locale: string
  setLocale: (locale: string) => void
}

export const useContentLocaleStore = create<ContentLocaleState>(set => ({
  locale: 'zh-CN',
  setLocale: locale => set({ locale }),
}))

export function effectiveContentLocale(project: GuideProject, requested: string): string {
  return project.localization.supportedLocales.includes(requested)
    ? requested
    : project.localization.defaultLocale
}

export function localized(text: LocalizedText | undefined, locale: string): string {
  return readLocalizedText(text, locale)
}

export function updateLocalized(
  text: LocalizedText | undefined,
  locale: string,
  value: string,
): LocalizedText {
  return setLocalizedText(text, locale, value)
}
