import type { PublishNode } from '../../shared/types.js'
import type PlayerCore from './player-core.js'
import {
  resolveRuntimeRouteTarget,
  type RuntimeRouteSelection,
} from './player-host-routing.js'

export interface NavigationEnv {
  engine: PlayerCore
  getNodeKind: (node: PublishNode | null | undefined) => 'surface' | 'image' | 'html'
  focusSurfaceCard: (cardId: string, moveCamera: boolean) => void
  isActiveHtmlIframeReady: () => boolean
  closeInfoSheet: () => void
  navigateByEdge: (edgeId: string) => boolean
  getNodeIframeContentWindow: () => Window | null
  resetSurfaceFocus: (animated: boolean) => void
  hasActiveSurfaceFocus: (node: PublishNode | null | undefined) => boolean
  get pendingRouteSelection(): RuntimeRouteSelection | null
  set pendingRouteSelection(v: RuntimeRouteSelection | null)
  get activeHtmlRouteSelection(): RuntimeRouteSelection | null
  set activeHtmlRouteSelection(v: RuntimeRouteSelection | null)
  get infoSheetOpen(): boolean
}

export class NavigationHandler {
  constructor(private env: NavigationEnv) {}

  applyPendingRouteSelection(currentNode: PublishNode | null): void {
    const selection = this.env.pendingRouteSelection
    if (!selection || !currentNode) return
    const manifest = this.env.engine.getManifest()
    if (!manifest) return
    const target = resolveRuntimeRouteTarget(manifest, (node) => this.env.getNodeKind(node), selection.focusName)
    if (!target) {
      this.env.pendingRouteSelection = null
      this.env.activeHtmlRouteSelection = null
      return
    }

    if (currentNode.id !== target.nodeId) {
      this.env.engine.switchNode(target.nodeId)
      return
    }

    if (target.kind === 'surface' && this.env.getNodeKind(currentNode) === 'surface') {
      this.env.pendingRouteSelection = null
      this.env.focusSurfaceCard(target.cardId, true)
      return
    }

    if (target.kind === 'html' && this.env.getNodeKind(currentNode) === 'html') {
      this.env.activeHtmlRouteSelection = selection
      this.env.pendingRouteSelection = null
      this.postHtmlNodeRouteSelection(currentNode)
      return
    }

    this.env.pendingRouteSelection = null
  }

  postHtmlNodeRouteSelection(currentNode: PublishNode): void {
    if (this.env.getNodeKind(currentNode) !== 'html' || !this.env.isActiveHtmlIframeReady()) return
    const contentWindow = this.env.getNodeIframeContentWindow()
    if (!contentWindow) return
    const selection = this.env.activeHtmlRouteSelection
    if (!selection) return
    contentWindow.postMessage({
      source: 'panorama-player-host',
      namespace: currentNode.htmlBridge?.namespace ?? 'panorama-runtime',
      type: 'switchView',
      payload: {
        targetName: selection.focusName,
      },
    }, currentNode.htmlBridge?.targetOrigin || '*')
    this.env.activeHtmlRouteSelection = null
  }

  getHtmlNodeBridgeRuntimeSnapshot(): {
    currentNodeId: string
    historyDepth: number
    canGoBack: boolean
  } {
    const history = this.env.engine.getHistory()
    const currentNode = this.env.engine.getCurrentNode()
    return {
      currentNodeId: this.env.engine.getCurrentNodeId(),
      historyDepth: history.length,
      canGoBack: history.length > 0
        || this.env.hasActiveSurfaceFocus(currentNode)
        || this.canFallbackBackToRoot(currentNode),
    }
  }

  tryHandleBackAction(): boolean {
    if (this.env.infoSheetOpen) {
      this.env.closeInfoSheet()
      return true
    }
    const currentNode = this.env.engine.getCurrentNode()
    if (this.env.hasActiveSurfaceFocus(currentNode)) {
      this.env.resetSurfaceFocus(true)
      return true
    }
    if (this.env.engine.getHistory().length > 0) {
      this.env.engine.handleBack()
      return true
    }
    if (this.canFallbackBackToRoot(currentNode)) {
      const manifest = this.env.engine.getManifest()
      if (!manifest) return false
      this.env.pendingRouteSelection = null
      this.env.activeHtmlRouteSelection = null
      this.env.engine.switchNode(manifest.rootNodeId)
      return true
    }
    return false
  }

  handleBackAction(): void {
    this.tryHandleBackAction()
  }

  canFallbackBackToRoot(node: PublishNode | null | undefined): boolean {
    const manifest = this.env.engine.getManifest()
    if (!manifest || !node) return false
    return node.id !== manifest.rootNodeId && this.env.engine.getHistory().length === 0
  }

}
