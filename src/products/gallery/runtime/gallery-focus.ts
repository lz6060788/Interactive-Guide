import type { LocalizedText } from '../../../domain/project-types.js'

export interface GalleryFocusableItem {
  id: string
  title: string | LocalizedText
}

export function resolveGalleryFocusItemId(
  items: readonly GalleryFocusableItem[],
  focus: string | undefined,
): string | undefined {
  const normalized = normalizeFocus(focus)
  if (!normalized) return undefined

  return items.find(item => {
    if (normalizeFocus(item.id) === normalized) return true
    const titles = typeof item.title === 'string' ? [item.title] : Object.values(item.title)
    return titles.some(title => normalizeFocus(title) === normalized)
  })?.id
}

function normalizeFocus(value: string | undefined): string | undefined {
  const normalized = value?.trim().normalize('NFC')
  return normalized || undefined
}
