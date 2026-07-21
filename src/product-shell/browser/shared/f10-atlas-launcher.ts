import { F10HostAdapter } from '../../../platform/f10/f10-host-adapter.js'

export async function openAtlasWithF10(url: string, f10 = new F10HostAdapter()): Promise<void> {
  try {
    if (await f10.jumpTofullScreenPage(url)) return
    throw new Error('F10Utils.jumpTofullScreenPage is unavailable')
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
