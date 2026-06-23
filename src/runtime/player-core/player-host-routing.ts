import type { PublishManifest, PublishNode } from '../../shared/types.js'
import type { HtmlNodeBridgeHtmlRouteOpenMode } from './html-node-bridge.js'

export type RuntimeRouteSelection = {
  focusName: string
}

export type RuntimeRouteTarget =
  | {
      kind: 'surface'
      nodeId: string
      cardId: string
    }
  | {
      kind: 'html'
      nodeId: string
    }

export function toAbsoluteUrl(url: string): string {
  return new URL(url, window.location.href).href
}

export function isInteractiveSurfaceTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest('[data-surface-card="true"], [data-surface-stock="true"], button')
}

export function resolveHtmlRouteUrl(route: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(route)) {
    return new URL(route).toString()
  }

  if (route.startsWith('/')) {
    return new URL(route, window.location.origin).toString()
  }

  if (
    route.startsWith('./')
    || route.startsWith('../')
    || route.startsWith('?')
    || route.startsWith('#')
  ) {
    return new URL(route, window.location.href).toString()
  }

  return new URL(`/${route.replace(/^\/+/, '')}`, window.location.origin).toString()
}

export function performDefaultHtmlRouteNavigation(
  resolvedUrl: string,
  openMode: HtmlNodeBridgeHtmlRouteOpenMode,
): boolean {
  if (openMode === 'new-tab') {
    return !!window.open(resolvedUrl, '_blank', 'noopener,noreferrer')
  }

  window.open(resolvedUrl, '_self')
  return true
}

export function parseRuntimeRouteSelection(params: URLSearchParams): RuntimeRouteSelection | null {
  const focusName = params.get('focus')?.trim() || ''
  if (!focusName) {
    return null
  }
  return {
    focusName,
  }
}

export function normalizeRuntimeRouteFocusName(value: string): string {
  return value.trim().replace(/\s+/g, '').toLocaleLowerCase()
}

export const KNOWN_ROCKET_HTML_ROUTE_FOCUS_NAMES = new Set([
  '卫星总装',
  '整流罩',
  '二级控制系统',
  '二级箭体结构',
  '二级发动机',
  '级间段',
  '格栅舵',
  '一级控制系统',
  '一级箭体结构',
  '着陆系统',
  '一级发动机组',
  '热控系统',
  '结构系统',
  '有效载荷系统',
  '综合电子系统',
  '测控系统',
  '电源系统',
  '姿轨控系统',
].map(normalizeRuntimeRouteFocusName))

export function matchesKnownHtmlRouteFocus(htmlUrl: string, normalizedFocusName: string): boolean {
  const normalizedHtmlUrl = htmlUrl.trim().toLocaleLowerCase()
  if (!normalizedFocusName) return false
  if (normalizedHtmlUrl.includes('rocket-shared/rocket.html') || normalizedHtmlUrl.endsWith('/rocket.html')) {
    return KNOWN_ROCKET_HTML_ROUTE_FOCUS_NAMES.has(normalizedFocusName)
  }
  return false
}

export function resolveRuntimeRouteTarget(
  manifest: PublishManifest,
  getNodeKind: (node: PublishNode | null | undefined) => 'surface' | 'image' | 'html',
  focusName: string,
): RuntimeRouteTarget | null {
  const normalizedFocusName = normalizeRuntimeRouteFocusName(focusName)
  if (!normalizedFocusName) return null
  for (const node of manifest.nodes) {
    if (getNodeKind(node) !== 'surface') continue
    for (const layer of node.surfaceLayers ?? []) {
      const matchedCard = layer.cards.find(card => normalizeRuntimeRouteFocusName(card.title) === normalizedFocusName)
      if (matchedCard) {
        return {
          kind: 'surface',
          nodeId: node.id,
          cardId: matchedCard.id,
        }
      }
    }
  }
  for (const node of manifest.nodes) {
    if (getNodeKind(node) !== 'html' || !node.htmlUrl) continue
    if (!matchesKnownHtmlRouteFocus(node.htmlUrl, normalizedFocusName)) continue
    return {
      kind: 'html',
      nodeId: node.id,
    }
  }

  return null
}
