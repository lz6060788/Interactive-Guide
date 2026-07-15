import { F10HostAdapter } from '../../../platform/f10/f10-host-adapter.js'

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

export async function openAtlasWithF10(url: string, f10 = new F10HostAdapter()): Promise<void> {
  if (await f10.jumpTofullScreenPage(url)) return
  openInBestAvailableWindow(url)
}
