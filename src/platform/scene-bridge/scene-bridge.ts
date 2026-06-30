/**
 * SceneBridge v1.0.0 — postMessage protocol between the host runtime
 * and an HTML scene bundle (iframe). Versioned envelope so the runtime
 * can reject mismatched messages; `targetOrigin` is derived from the
 * iframe src (or the manifest's allowlist) — never `*`.
 */
export const SCENE_BRIDGE_CHANNEL = 'interactive-guide:scene-bridge'
export const SCENE_BRIDGE_VERSION = '1.0.0'
export const SCENE_BRIDGE_HOST_SOURCE = 'interactive-guide-host'
export const SCENE_BRIDGE_SCENE_SOURCE = 'interactive-guide-scene'

export type SceneBridgeMessageKind = 'event' | 'request' | 'response'

export type SceneBridgeHostEventType = 'host:init' | 'host:focus-item' | 'host:exit'
export type SceneBridgeSceneRequestType = 'scene:request-route' | 'scene:request-back'
export type SceneBridgeResponseType = SceneBridgeHostEventType | SceneBridgeSceneRequestType

export interface SceneBridgeRuntimeSnapshot {
  product: 'atlas' | 'catalog'
  projectId: string
  sceneId: string
  viewId: string
}

export interface SceneBridgeInitPayload {
  activationId: string
  sessionId: string
  product: 'atlas' | 'catalog'
  scene: { id: string; title: string; entryUrl: string }
  runtime: SceneBridgeRuntimeSnapshot
}

export interface SceneBridgeFocusItemPayload {
  itemId: string
  categoryId: string
}

export interface SceneBridgeRouteRequestPayload {
  routeId: string
  openMode?: 'current-tab' | 'new-tab'
}

export interface SceneBridgeEnvelope<TType extends string = string, TPayload = unknown> {
  channel: typeof SCENE_BRIDGE_CHANNEL
  version: typeof SCENE_BRIDGE_VERSION
  source: typeof SCENE_BRIDGE_HOST_SOURCE | typeof SCENE_BRIDGE_SCENE_SOURCE
  kind: SceneBridgeMessageKind
  type: TType
  requestId?: string
  payload?: TPayload
}

export function buildSceneBridgeEnvelope<TType extends string, TPayload>(
  kind: SceneBridgeMessageKind,
  source: SceneBridgeEnvelope['source'],
  type: TType,
  payload?: TPayload,
  requestId?: string,
): SceneBridgeEnvelope<TType, TPayload> {
  return {
    channel: SCENE_BRIDGE_CHANNEL,
    version: SCENE_BRIDGE_VERSION,
    source,
    kind,
    type,
    requestId,
    payload,
  }
}

export function isSceneBridgeEnvelope(value: unknown): value is SceneBridgeEnvelope {
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  return (
    e['channel'] === SCENE_BRIDGE_CHANNEL &&
    e['version'] === SCENE_BRIDGE_VERSION &&
    typeof e['source'] === 'string' &&
    typeof e['kind'] === 'string' &&
    typeof e['type'] === 'string'
  )
}

/**
 * Resolve the targetOrigin for postMessage to an iframe. We require an
 * explicit allowlist in the manifest — `*` is rejected unless the host
 * document is same-origin with the iframe URL.
 */
export function resolveSceneBridgeTargetOrigin(
  iframeSrc: string,
  baseHref: string,
  allowlist?: readonly string[],
): string {
  let iframeOrigin: string
  try {
    iframeOrigin = new URL(iframeSrc, baseHref).origin
  } catch {
    return ''
  }
  const baseOrigin = (() => {
    try {
      return new URL(baseHref).origin
    } catch {
      return ''
    }
  })()
  if (iframeOrigin === baseOrigin) return iframeOrigin
  if (allowlist?.includes(iframeOrigin)) return iframeOrigin
  return ''
}