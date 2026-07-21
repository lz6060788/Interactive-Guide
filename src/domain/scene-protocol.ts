/**
 * SceneBridge protocol — versioned contract for HTML scene <-> runtime messaging.
 *
 * Phase 5 builds a runtime SceneBridge on top of this type. Phase 1 only
 * fixes the protocol envelope so that the domain model and Skill output
 * can be validated against it.
 *
 * The previous `interactive-guide:scene-bridge` channel name with v1.0.0
 * envelope (from docs/plans/2026-06-29 §5.5) is adopted as the initial
 * version. Bumping to v1.1.0+ requires a parallel-run period where both
 * versions are accepted but the older is logged as deprecated.
 */
import { z } from 'zod'

export const SCENE_PROTOCOL_CHANNEL = 'interactive-guide:scene-bridge'
export const SCENE_PROTOCOL_VERSION = '1.0.0'

export const SceneProtocolSchema = z.object({
  channel: z.literal(SCENE_PROTOCOL_CHANNEL),
  version: z.literal(SCENE_PROTOCOL_VERSION),
})

export type SceneProtocol = z.infer<typeof SceneProtocolSchema>

export interface SceneBridgeMessage<T = unknown> {
  type: string
  version: SceneProtocol['version']
  payload?: T
}

export interface SceneActivationMessage {
  type: string
  payload?: Record<string, unknown>
}

export function isSupportedProtocol(protocol: SceneProtocol): boolean {
  return protocol.channel === SCENE_PROTOCOL_CHANNEL && protocol.version === SCENE_PROTOCOL_VERSION
}
