import type {
  PublishManifest,
  PublishHotspot,
  PublishNode,
} from '../../shared/types.js'
import type { BuiltinTransitionType } from '../../shared/types.js'
import type { Transition } from '../transitions/index.js'
import { createTransition } from '../transitions/index.js'
import { RuntimeResourcePreloader } from './resource-preloader.js'

// Builtin transitions that can safely handle HTML nodes (iframe content).
// Transitions NOT in this set will skip HTML nodes and fall back to video / instant switch.
const HTML_SAFE_BUILTIN_TRANSITIONS: ReadonlySet<BuiltinTransitionType> = new Set([
  'zoom',
])

export interface PlayerRefs {
  container: HTMLElement
  nodeImage: HTMLImageElement
  video: HTMLVideoElement
  nodeIframe?: HTMLIFrameElement
}

type EventName = 'stateChange' | 'transitionStart' | 'transitionEnd' | 'error'

interface SwitchNodeOptions {
  preserveVisualLayer?: boolean
}

interface PendingVisualCommit {
  kind: 'builtin' | 'video'
  targetNodeId: string
  cleanup: () => void
}

export class PlayerCore {
  private manifest: PublishManifest | null = null
  private currentNodeId = 'root'
  private history: string[] = []
  private transitioning = false
  private preloading = false

  private activeTransition: Transition | null = null
  private transitionContainer: HTMLElement | null = null
  private animationFrameId: number | null = null
  private videoCleanup: (() => void) | null = null
  private pendingVisualCommit: PendingVisualCommit | null = null
  private resourcePreloader = new RuntimeResourcePreloader()

  private listeners = new Map<EventName, Set<Function>>()

  constructor(private refs: PlayerRefs) {}

  updateRefs(nextRefs: Partial<PlayerRefs>): void {
    this.refs = {
      ...this.refs,
      ...nextRefs,
    }
  }

  // ─── Event System ──────────────────────────────────────────

  on(event: EventName, handler: Function): void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler)
  }

  off(event: EventName, handler: Function): void {
    this.listeners.get(event)?.delete(handler)
  }

  private emit(event: EventName, ...args: any[]): void {
    for (const fn of this.listeners.get(event) ?? []) {
      try {
        fn(...args)
      } catch {
        // Don't let a bad listener break the event loop
      }
    }
  }

  // ─── State Accessors ───────────────────────────────────────

  getCurrentNodeId(): string {
    return this.currentNodeId
  }

  getManifest(): PublishManifest | null {
    return this.manifest
  }

  isTransitioning(): boolean {
    return this.transitioning
  }

  isPreloading(): boolean {
    return this.preloading
  }

  getHistory(): string[] {
    return [...this.history]
  }

  getCurrentNode(): PublishNode | null {
    if (!this.manifest) return null
    return this.manifest.nodeMap[this.currentNodeId] ?? null
  }

  getPendingVisualCommitKind(): 'builtin' | 'video' | null {
    return this.pendingVisualCommit?.kind ?? null
  }

  confirmHostVisualCommitted(): void {
    if (!this.pendingVisualCommit) return

    const pending = this.pendingVisualCommit
    this.pendingVisualCommit = null

    requestAnimationFrame(() => {
      this.transitioning = false
      this.refs.nodeImage.style.opacity = '1'
      pending.cleanup()
      this.emit('stateChange')
      this.emit('transitionEnd')
    })
  }

  // ─── Actions ───────────────────────────────────────────────

  loadManifest(manifest: PublishManifest): void {
    this.manifest = manifest
    this.currentNodeId = manifest.rootNodeId
    this.history = []
    this.transitioning = false
    this.preloading = true
    this.refs.nodeImage.style.opacity = '1'
    this.emit('stateChange')
    void this.resourcePreloader.preloadAllResources(manifest).finally(() => {
      this.preloading = false
      this.emit('stateChange')
    })
  }

  handleHotspotClick(hotspot: PublishHotspot): void {
    if (!this.manifest || this.transitioning) return

    const edge = this.manifest.edgeMap?.[hotspot.edgeId]

    // Push current node to history before navigating
    this.history.push(this.currentNodeId)

    // Some builtin transitions can handle HTML nodes; others must skip them.
    const hasHtmlNode = this.isHtmlNode(this.currentNodeId) || this.isHtmlNode(hotspot.targetNodeId)
    const builtinAllowsHtml = hasHtmlNode && edge?.builtinTransition
      ? HTML_SAFE_BUILTIN_TRANSITIONS.has(edge.builtinTransition.type)
      : !hasHtmlNode

    if (edge?.transitionType === 'builtin' && edge.builtinTransition && builtinAllowsHtml) {
      this.transitioning = true
      this.playBuiltinTransition(
        hotspot.targetNodeId,
        edge.builtinTransition,
        hotspot,
      )
    } else if (edge?.videoUrl) {
      this.transitioning = true
      this.playVideoTransition(hotspot.targetNodeId, edge.videoUrl)
    } else {
      this.switchNode(hotspot.targetNodeId)
    }
  }

  handleHotspotById(edgeId: string): void {
    if (!this.manifest || this.transitioning) return
    const edge = this.manifest.edgeMap[edgeId]
    if (!edge) return
    const hotspot: PublishHotspot = {
      edgeId: edge.id,
      targetNodeId: edge.toNodeId,
      label: edge.relationLabel || '',
      normalizedX: 0.5,
      normalizedY: 0.5,
      markerType: 'dot',
    }
    this.handleHotspotClick(hotspot)
  }

  isHtmlNode(nodeId: string): boolean {
    const node = this.manifest?.nodeMap[nodeId]
    return node?.contentType === 'html'
  }

  handleBack(): void {
    if (this.history.length === 0) return
    const prevNodeId = this.history[this.history.length - 1]
    this.history = this.history.slice(0, -1)
    this.switchNode(prevNodeId)
  }

  switchNode(nodeId: string, options: SwitchNodeOptions = {}): void {
    if (!options.preserveVisualLayer) {
      this.clearPendingVisualCommit('switchNode-replaced')
      this.abortRunningTransition()
    }

    this.currentNodeId = nodeId
    if (!options.preserveVisualLayer) {
      this.transitioning = false
    }

    if (!options.preserveVisualLayer) {
      this.cleanupVideo()
      this.refs.video.style.opacity = '0'
    }

    this.emit('stateChange')
  }

  /** Breadcrumb click — push current node to history then switch. */
  navigateTo(nodeId: string): void {
    this.history.push(this.currentNodeId)
    this.switchNode(nodeId)
  }

  buildBreadcrumb(): Array<{ id: string; title: string }> {
    if (!this.manifest) return []
    const m = this.manifest
    const path: Array<{ id: string; title: string }> = [
      { id: this.currentNodeId, title: m.nodeMap[this.currentNodeId]?.title ?? this.currentNodeId },
    ]
    let cursor = this.currentNodeId
    while (cursor !== m.rootNodeId) {
      const edge = m.edges.find(e => e.toNodeId === cursor)
      if (!edge) break
      cursor = edge.fromNodeId
      path.unshift({ id: cursor, title: m.nodeMap[cursor]?.title ?? cursor })
    }
    return path
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  destroy(): void {
    this.clearPendingVisualCommit('destroy')
    this.abortRunningTransition()
    this.cleanupVideo()
    this.resourcePreloader.clear()
    this.refs.nodeImage.style.opacity = '1'
    this.refs.video.style.opacity = '0'
    this.listeners.clear()
  }

  // ─── Private: Transition Helpers ───────────────────────────

  private createTransitionVisualShell(borderRadius: string): HTMLDivElement {
    const wrapper = document.createElement('div')
    wrapper.style.position = 'absolute'
    wrapper.style.inset = '0'
    wrapper.style.width = '100%'
    wrapper.style.height = '100%'
    wrapper.style.overflow = 'hidden'
    wrapper.style.borderRadius = borderRadius
    return wrapper
  }

  private createTransitionVisualFromCurrentImage(borderRadius: string): HTMLElement {
    const wrapper = this.createTransitionVisualShell(borderRadius)
    const clone = this.refs.nodeImage.cloneNode(true) as HTMLImageElement
    const containerRect = this.refs.container.getBoundingClientRect()
    const imageRect = this.refs.nodeImage.getBoundingClientRect()
    clone.draggable = false
    if (imageRect.width > 0 && imageRect.height > 0) {
      clone.style.position = 'absolute'
      clone.style.left = `${imageRect.left - containerRect.left}px`
      clone.style.top = `${imageRect.top - containerRect.top}px`
      clone.style.width = `${imageRect.width}px`
      clone.style.height = `${imageRect.height}px`
      clone.style.maxWidth = 'none'
      clone.style.maxHeight = 'none'
      clone.style.transform = 'none'
      clone.style.objectFit = 'fill'
      clone.style.objectPosition = '50% 50%'
    }
    wrapper.appendChild(clone)
    return wrapper
  }

  private applyTransitionNodeImageStyle(
    img: HTMLImageElement,
    node: PublishNode,
  ): void {
    const fitMode = node.imageFitMode ?? 'fill'

    img.draggable = false
    img.style.display = 'block'
    img.style.userSelect = 'none'
    img.style.opacity = '1'
    img.style.maxWidth = 'none'
    img.style.maxHeight = 'none'

    if (fitMode === 'fitHeight') {
      img.style.position = 'absolute'
      img.style.left = '50%'
      img.style.top = '50%'
      img.style.width = 'auto'
      img.style.height = '100%'
      img.style.objectFit = ''
      img.style.objectPosition = ''
      img.style.transform = 'translate(-50%, -50%)'
    } else if (fitMode === 'fitWidth') {
      img.style.position = 'absolute'
      img.style.left = '50%'
      img.style.top = '50%'
      img.style.width = '100%'
      img.style.height = 'auto'
      img.style.objectFit = ''
      img.style.objectPosition = ''
      img.style.transform = 'translate(-50%, -50%)'
    } else {
      img.style.position = ''
      img.style.left = ''
      img.style.top = ''
      img.style.transform = ''
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'fill'
      img.style.objectPosition = '50% 50%'
    }
  }

  private createTransitionVisualForNode(
    node: PublishNode,
    borderRadius: string,
  ): { visual: HTMLElement, image: HTMLImageElement } {
    const wrapper = this.createTransitionVisualShell(borderRadius)
    const img = document.createElement('img')
    img.src = node.imageUrl ?? ''
    img.alt = node.title ?? node.id
    this.applyTransitionNodeImageStyle(img, node)
    wrapper.appendChild(img)
    return { visual: wrapper, image: img }
  }

  private playBuiltinTransition(
    targetNodeId: string,
    config: NonNullable<ReturnType<typeof this.getEdgeConfig>['builtinTransition']>,
    hotspot: PublishHotspot,
  ): void {
    if (!this.manifest) return

    const targetNode = this.manifest.nodeMap[targetNodeId]
    if (!targetNode) {
      this.switchNode(targetNodeId)
      return
    }

    const container = this.refs.container
    const nodeImageStyle = window.getComputedStyle(this.refs.nodeImage)
    const imageBorderRadius = nodeImageStyle.borderRadius || '0px'

    const fromEl = this.createTransitionVisualFromCurrentImage(imageBorderRadius)
    const { visual: toEl, image: toImg } = this.createTransitionVisualForNode(
      targetNode,
      imageBorderRadius,
    )

    const tc = document.createElement('div')
    tc.style.cssText =
      'position:absolute;inset:0;z-index:20;pointer-events:none;overflow:hidden;'
    tc.dataset.transitionOverlay = 'builtin'
    tc.dataset.targetNodeId = targetNodeId
    container.appendChild(tc)
    this.transitionContainer = tc

    this.activeTransition = createTransition(config.type, config)

    const startTransition = () => {
      const context = {
        container: tc,
        fromNodeEl: fromEl,
        toNodeEl: toEl,
        hotspot: { x: hotspot.normalizedX, y: hotspot.normalizedY },
        config,
      }

      const transitionPromise = this.activeTransition!.play(context)

      const targetRect = toImg.getBoundingClientRect()
      const containerRc = this.refs.container.getBoundingClientRect()
      const aspectW = containerRc.width / Math.max(containerRc.height, 1)
      const aspectH = containerRc.height / Math.max(containerRc.width, 1)
      const ratioLabel = Math.abs(aspectW - 16 / 9) < Math.abs(aspectW - 9 / 16) ? '16:9' : '9:16'
      console.log(
        `[Transition] ${this.currentNodeId} -> ${targetNodeId} (${config.type}) | ` +
        `target start rect: ${Math.round(targetRect.x)},${Math.round(targetRect.y)} ` +
        `${Math.round(targetRect.width)}x${Math.round(targetRect.height)} | ` +
        `container: ${Math.round(containerRc.width)}x${Math.round(containerRc.height)} (${ratioLabel})`,
      )

      this.refs.nodeImage.style.opacity = '0'
      this.emit('stateChange')
      this.emit('transitionStart')

      transitionPromise.then(() => {
        const frozenFrame = tc.firstElementChild as HTMLElement | null
        if (frozenFrame) {
          frozenFrame.setAttribute('data-builtin-frozen-frame', 'true')
          frozenFrame.setAttribute('data-target-node-id', targetNodeId)
        }

        this.activeTransition = null

        this.pendingVisualCommit = {
          kind: 'builtin',
          targetNodeId,
          cleanup: () => {
            if (tc.parentNode) tc.parentNode.removeChild(tc)
            if (this.transitionContainer === tc) {
              this.transitionContainer = null
            }
          },
        }

        this.switchNode(targetNodeId, { preserveVisualLayer: true })
      })
    }

    if (toImg.complete) {
      startTransition()
    } else {
      toImg.onload = () => {
        startTransition()
      }
    }

    toImg.onerror = () => {
      if (tc.parentNode) tc.parentNode.removeChild(tc)
      this.transitionContainer = null
      this.activeTransition = null
      this.transitioning = false
      this.refs.nodeImage.style.opacity = '1'
      this.emit('stateChange')
      this.emit('transitionEnd')
      this.emit('error', new Error(`Failed to load target node image: ${targetNode.imageUrl}`))
    }
  }

  private playVideoTransition(targetNodeId: string, videoUrl: string): void {
    const video = this.refs.video
    let started = false

    const startPlayback = () => {
      if (started) return
      started = true

      this.refs.nodeImage.style.opacity = '0'
      video.style.opacity = '1'
      this.emit('stateChange')
      this.emit('transitionStart')

      video.play().catch(() => {
        this.cleanupVideo()
        this.switchNode(targetNodeId)
        this.emit('transitionEnd')
      })
    }

    const handleEnded = () => {
      this.pendingVisualCommit = {
        kind: 'video',
        targetNodeId,
        cleanup: () => {
          this.cleanupVideo()
        },
      }

      this.switchNode(targetNodeId, { preserveVisualLayer: true })
    }

    const handleError = () => {
      this.cleanupVideo()
      this.switchNode(targetNodeId)
      this.emit('transitionEnd')
    }

    this.cleanupVideo()
    video.onloadeddata = startPlayback
    video.oncanplay = startPlayback
    video.onended = handleEnded
    video.onerror = handleError
    video.src = videoUrl
    video.currentTime = 0
    video.load()

    this.videoCleanup = () => {
      video.onloadeddata = null
      video.oncanplay = null
      video.onended = null
      video.onerror = null
      video.style.opacity = '0'
    }
  }

  private abortRunningTransition(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    this.activeTransition?.abort()
    this.activeTransition = null
    if (this.transitionContainer?.parentNode) {
      this.transitionContainer.parentNode.removeChild(this.transitionContainer)
    }
    this.transitionContainer = null
  }

  private cleanupVideo(): void {
    if (this.videoCleanup) {
      this.videoCleanup()
      this.videoCleanup = null
    }
    const video = this.refs.video
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.style.opacity = '0'
  }

  private clearPendingVisualCommit(reason: string): void {
    if (!this.pendingVisualCommit) return

    const pending = this.pendingVisualCommit
    this.pendingVisualCommit = null

    pending.cleanup()
  }

  private getEdgeConfig() {
    // Helper kept for type reference; not used at runtime.
    return null as any
  }
}
