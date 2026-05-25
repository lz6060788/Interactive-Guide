import type { PublishNode } from '../../shared/types.js'

export const HTML_NODE_BRIDGE_CHANNEL = 'interactive-guide:html-node-bridge'
export const HTML_NODE_BRIDGE_VERSION = '1.0.0'
export const HTML_NODE_BRIDGE_HOST_SOURCE = 'interactive-guide-host'
export const HTML_NODE_BRIDGE_HTML_SOURCE = 'interactive-guide-html-node'

export type HtmlNodeBridgeMessageKind = 'event' | 'request' | 'response'
export type HtmlNodeBridgeHostEventType = 'host:node-init' | 'host:node-exit'
export type HtmlNodeBridgeHtmlRequestType = 'html:request-back'
export type HtmlNodeBridgeResponseType =
  | HtmlNodeBridgeHostEventType
  | HtmlNodeBridgeHtmlRequestType

export interface HtmlNodeBridgeRuntimeSnapshot {
  currentNodeId: string
  historyDepth: number
  canGoBack: boolean
}

export interface HtmlNodeInitPayload {
  activationId: string
  sessionId: string
  node: Pick<PublishNode, 'id' | 'title' | 'htmlUrl' | 'imageUrl' | 'contentType'>
  runtime: HtmlNodeBridgeRuntimeSnapshot
}

export interface HtmlNodeExitPayload {
  activationId: string
  sessionId: string
  node: Pick<PublishNode, 'id' | 'title' | 'htmlUrl' | 'imageUrl' | 'contentType'>
}

export interface HtmlNodeBackRequestPayload {
  reason?: string
}

export interface HtmlNodeBackResponsePayload {
  handled: boolean
  runtime: HtmlNodeBridgeRuntimeSnapshot
}

export interface HtmlNodeBridgeEnvelope<TType extends string = string, TPayload = unknown> {
  channel: typeof HTML_NODE_BRIDGE_CHANNEL
  version: typeof HTML_NODE_BRIDGE_VERSION
  source: typeof HTML_NODE_BRIDGE_HOST_SOURCE | typeof HTML_NODE_BRIDGE_HTML_SOURCE
  kind: HtmlNodeBridgeMessageKind
  type: TType
  requestId?: string
  payload?: TPayload
}

export interface HtmlNodeBridgeActiveNode {
  activationId: string
  iframe: HTMLIFrameElement
  node: PublishNode
  initPosted: boolean
}

export interface HtmlNodeBridgeHostPort {
  getRuntimeSnapshot: () => HtmlNodeBridgeRuntimeSnapshot
  handleBackRequest: (
    payload: HtmlNodeBackRequestPayload | undefined,
  ) => HtmlNodeBackResponsePayload
  handleLegacyHotspotClick?: (edgeId: string) => void
}

interface ParsedBridgeMessage {
  envelope: HtmlNodeBridgeEnvelope
  sourceWindow: Window
  origin: string
}

export function buildHtmlNodeBridgeEnvelope<TType extends string, TPayload>(
  kind: HtmlNodeBridgeMessageKind,
  source: HtmlNodeBridgeEnvelope['source'],
  type: TType,
  payload?: TPayload,
  requestId?: string,
): HtmlNodeBridgeEnvelope<TType, TPayload> {
  return {
    channel: HTML_NODE_BRIDGE_CHANNEL,
    version: HTML_NODE_BRIDGE_VERSION,
    source,
    kind,
    type,
    requestId,
    payload,
  }
}

export class HtmlNodeBridge {
  private sessionId = createBridgeId('host-session')
  private activeNode: HtmlNodeBridgeActiveNode | null = null

  constructor(private hostPort: HtmlNodeBridgeHostPort) {
    window.addEventListener('message', this.handleWindowMessage)
  }

  destroy(): void {
    window.removeEventListener('message', this.handleWindowMessage)
    this.deactivateNode()
  }

  activateNode(params: {
    iframe: HTMLIFrameElement
    node: PublishNode
  }): void {
    const activeNode = this.activeNode
    if (
      !activeNode
      || activeNode.iframe !== params.iframe
      || activeNode.node.id !== params.node.id
    ) {
      this.activeNode = {
        activationId: createBridgeId(`html-node-${params.node.id}`),
        iframe: params.iframe,
        node: params.node,
        initPosted: false,
      }
    } else {
      activeNode.node = params.node
    }

    this.postInitEventIfNeeded()
  }

  deactivateNode(): void {
    this.postExitEventIfNeeded()
    this.activeNode = null
  }

  private postInitEventIfNeeded(): void {
    if (!this.activeNode || this.activeNode.initPosted) {
      return
    }

    this.postEventToActiveNode('host:node-init', {
      activationId: this.activeNode.activationId,
      sessionId: this.sessionId,
      node: {
        id: this.activeNode.node.id,
        title: this.activeNode.node.title,
        htmlUrl: this.activeNode.node.htmlUrl,
        imageUrl: this.activeNode.node.imageUrl,
        contentType: this.activeNode.node.contentType,
      },
      runtime: this.hostPort.getRuntimeSnapshot(),
    })
    this.activeNode.initPosted = true
  }

  private postExitEventIfNeeded(): void {
    if (!this.activeNode) return

    this.postEventToActiveNode('host:node-exit', {
      activationId: this.activeNode.activationId,
      sessionId: this.sessionId,
      node: {
        id: this.activeNode.node.id,
        title: this.activeNode.node.title,
        htmlUrl: this.activeNode.node.htmlUrl,
        imageUrl: this.activeNode.node.imageUrl,
        contentType: this.activeNode.node.contentType,
      },
    })
  }

  private handleWindowMessage = (event: MessageEvent): void => {
    if (this.handleLegacyHotspotMessage(event)) {
      return
    }

    const parsed = this.parseBridgeMessage(event)
    if (!parsed) return

    const { envelope } = parsed
    if (envelope.source !== HTML_NODE_BRIDGE_HTML_SOURCE) return
    if (envelope.kind !== 'request') return

    if (envelope.type === 'html:request-back') {
      this.handleBackRequest(parsed)
    }
  }

  private handleBackRequest(message: ParsedBridgeMessage): void {
    const requestId = message.envelope.requestId
    try {
      const payload = this.hostPort.handleBackRequest(
        message.envelope.payload as HtmlNodeBackRequestPayload | undefined,
      )
      this.postResponseToSourceWindow(message, 'html:request-back', true, payload, requestId)
    } catch (error) {
      this.postResponseToSourceWindow(
        message,
        'html:request-back',
        false,
        {
          message: error instanceof Error ? error.message : String(error),
        },
        requestId,
      )
    }
  }

  private handleLegacyHotspotMessage(event: MessageEvent): boolean {
    const edgeId = event.data?.edgeId
    if (event.data?.type !== 'hotspot-click' || typeof edgeId !== 'string') {
      return false
    }
    if (!this.isMessageFromActiveIframe(event.source)) {
      return false
    }

    this.hostPort.handleLegacyHotspotClick?.(edgeId)
    return true
  }

  private parseBridgeMessage(event: MessageEvent): ParsedBridgeMessage | null {
    const envelope = event.data
    if (!envelope || typeof envelope !== 'object') return null
    if (envelope.channel !== HTML_NODE_BRIDGE_CHANNEL) return null
    if (envelope.version !== HTML_NODE_BRIDGE_VERSION) return null
    if (!this.isMessageFromActiveIframe(event.source)) return null
    if (typeof envelope.kind !== 'string' || typeof envelope.type !== 'string') return null

    return {
      envelope: envelope as HtmlNodeBridgeEnvelope,
      sourceWindow: event.source as Window,
      origin: event.origin,
    }
  }

  private isMessageFromActiveIframe(source: MessageEventSource | null): boolean {
    if (!source || !this.activeNode) return false
    return source === this.activeNode.iframe.contentWindow
  }

  private postEventToActiveNode(
    type: HtmlNodeBridgeHostEventType,
    payload: HtmlNodeInitPayload | HtmlNodeExitPayload,
  ): void {
    if (!this.activeNode?.iframe.contentWindow) return
    this.activeNode.iframe.contentWindow.postMessage(
      buildHtmlNodeBridgeEnvelope('event', HTML_NODE_BRIDGE_HOST_SOURCE, type, payload),
      resolveIframeTargetOrigin(this.activeNode.iframe),
    )
  }

  private postResponseToSourceWindow(
    message: ParsedBridgeMessage,
    type: HtmlNodeBridgeResponseType,
    ok: boolean,
    payload: unknown,
    requestId?: string,
  ): void {
    message.sourceWindow.postMessage(
      buildHtmlNodeBridgeEnvelope('response', HTML_NODE_BRIDGE_HOST_SOURCE, type, {
        ok,
        payload,
      }, requestId),
      resolveMessageTargetOrigin(message.origin),
    )
  }
}

function resolveIframeTargetOrigin(iframe: HTMLIFrameElement): string {
  try {
    return resolveMessageTargetOrigin(new URL(iframe.src, window.location.href).origin)
  } catch {
    return '*'
  }
}

function resolveMessageTargetOrigin(origin: string | undefined): string {
  if (!origin || origin === 'null') {
    return '*'
  }
  return origin
}

function createBridgeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
