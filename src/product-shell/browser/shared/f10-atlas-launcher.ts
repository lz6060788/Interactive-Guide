/**
 * Opens the separately released Atlas bundle. F10 hosts provide the
 * fullscreen navigation helper at runtime; a regular browser retains a
 * useful, safe new-tab fallback for local preview and standalone hosting.
 */
interface F10Utils {
  jumpTofullScreenPage?: (url: string) => void | Promise<void>
}

function resolveF10Utils(): F10Utils | null {
  const host = window as Window & { F10Utils?: F10Utils; _f?: F10Utils }
  const utils = host.F10Utils ?? host._f ?? null
  if (utils && !host.F10Utils) host.F10Utils = utils
  return utils
}

function openInBestAvailableWindow(url: string): void {
  const features = 'noopener,noreferrer'
  try {
    const opened = window.top?.open(url, '_blank', features)
    if (opened) return
  } catch {
    // Cross-origin parents may reject access; the current window remains valid.
  }
  window.open(url, '_blank', features)
}

export function openAtlasWithF10(url: string): void {
  const f10 = resolveF10Utils()
  if (!f10?.jumpTofullScreenPage) {
    openInBestAvailableWindow(url)
    return
  }
  Promise.resolve(f10.jumpTofullScreenPage(url)).catch(() => openInBestAvailableWindow(url))
}
