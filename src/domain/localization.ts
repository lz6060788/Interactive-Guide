import type { LocalizationConfig, LocalizedText, LocaleCode } from './project-types.js'

export const INITIAL_SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const
export type InitialSupportedLocale = (typeof INITIAL_SUPPORTED_LOCALES)[number]

export function readLocalizedText(text: LocalizedText | undefined, locale: LocaleCode): string {
  return text?.[locale] ?? ''
}

export function requireLocalizedText(
  text: LocalizedText | undefined,
  locale: LocaleCode,
  path: string,
): string {
  const value = text?.[locale]?.trim()
  if (!value) throw new Error(`${path} is missing translation for "${locale}"`)
  return value
}

export function setLocalizedText(
  text: LocalizedText | undefined,
  locale: LocaleCode,
  value: string,
): LocalizedText {
  return { ...(text ?? {}), [locale]: value }
}

export function resolveRuntimeLocale(
  localization: LocalizationConfig,
  options: { search?: string; navigatorLanguages?: readonly string[] } = {},
): LocaleCode {
  const supported = new Set(localization.supportedLocales)
  const requested = new URLSearchParams(options.search ?? '').get('lang')
  if (requested && supported.has(requested)) return requested

  for (const language of options.navigatorLanguages ?? []) {
    if (supported.has(language)) return language
    const base = language.split('-')[0]?.toLowerCase()
    const match = localization.supportedLocales.find(
      locale => locale.split('-')[0]?.toLowerCase() === base,
    )
    if (match) return match
  }
  return localization.defaultLocale
}

export function withLocaleInUrl(url: string, locale: LocaleCode, base?: string): string {
  const parsed = new URL(url, base ?? 'http://localhost')
  parsed.searchParams.set('lang', locale)
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return parsed.toString()
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
