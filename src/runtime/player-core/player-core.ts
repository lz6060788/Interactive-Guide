import type {
  PublishManifest,
  PublishHotspot,
  PublishNode,
  PublishEdge,
  BuiltinTransitionConfig,
} from '../../shared/types.js'
import type { BuiltinTransitionType } from '../../shared/types.js'
import type { Transition, TransitionPlaybackDirection } from '../transitions/index.js'
import { createTransition } from '../transitions/index.js'
import { resolveInitialRegionViewport } from './region-viewport.js'
import { RuntimeResourcePreloader } from './resource-preloader.js'
import { TransitionVideoController } from './transition-video-controller.js'

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

interface TransitionHotspot {
  normalizedX: number
  normalizedY: number
}

interface PendingVisualCommit {
  kind: 'builtin' | 'video'
  targetNodeId: string
  cleanup: () => void
}

type ResolvedNavigationTransition =
  | {
    kind: 'builtin'
    builtinTransition: BuiltinTransitionConfig
  }
  | {
    kind: 'video'
    videoUrl: string
  }
  | {
    kind: 'none'
  }

interface NavigationHistoryEntry {
  nodeId: string
  viaEdgeId?: string
  transitionKind: ResolvedNavigationTransition['kind']
  resolvedBuiltinTransition?: BuiltinTransitionConfig
}

class PlayerCore {
  private manifest: PublishManifest | null = null
  private currentNodeId = 'root'
  private history: NavigationHistoryEntry[] = []
  private transitioning = false
  private preloading = false

  private activeTransition: Transition | null = null
  private transitionContainer: HTMLElement | null = null
  private animationFrameId: number | null = null
  private pendingVisualCommit: PendingVisualCommit | null = null
  private resourcePreloader = new RuntimeResourcePreloader()
  private videoController: TransitionVideoController
  private backgroundPreloadTimer: number | null = null
  private videoPrimeTimer: number | null = null

  private listeners = new Map<EventName, Set<Function>>()

  constructor(private refs: PlayerRefs) {
    this.videoController = new TransitionVideoController(this.refs.video)
  }

  updateRefs(nextRefs: Partial<PlayerRefs>): void {
    this.refs = {
      ...this.refs,
      ...nextRefs,
    }
    if (this.refs.video) {
      this.videoController.updateVideoElement(this.refs.video)
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
    return this.history.map(entry => entry.nodeId)
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
      void this.primeLikelyVideoTransition()
      this.emit('stateChange')
      this.emit('transitionEnd')
    })
  }

  // ─── Actions ───────────────────────────────────────────────

  loadManifest(manifest: PublishManifest): void {
    this.clearBackgroundTasks()
    this.resourcePreloader.clear()
    this.manifest = manifest
    this.currentNodeId = manifest.rootNodeId
    this.history = []
    this.transitioning = false
    this.preloading = false
    this.refs.nodeImage.style.opacity = '1'
    this.emit('stateChange')
    void this.resourcePreloader.preloadNodeResources(manifest, manifest.rootNodeId)
    this.scheduleLikelyVideoTransitionPrime()
    this.scheduleManifestBackgroundPreload(manifest)
  }

  handleHotspotClick(hotspot: PublishHotspot): void {
    if (!this.manifest || this.transitioning) return

    const edge = this.manifest.edgeMap?.[hotspot.edgeId]
    const transition = this.resolveForwardTransition(edge, hotspot)

    // Push current node to history before navigating
    this.history.push(this.createHistoryEntry(this.currentNodeId, edge?.id, transition))

    this.navigateWithResolvedTransition(hotspot.targetNodeId, transition, hotspot, 'forward')
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
    return this.getNodeKind(node) === 'html'
  }

  handleBack(): void {
    if (this.history.length === 0) return
    const previousEntry = this.history[this.history.length - 1]
    const prevNodeId = previousEntry.nodeId
    this.history = this.history.slice(0, -1)
    const transition = this.resolveBackwardTransition(previousEntry)
    this.navigateWithResolvedTransition(
      prevNodeId,
      transition,
      { normalizedX: 0.5, normalizedY: 0.5 },
      'backward',
    )
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
    }

    this.emit('stateChange')
    if (!options.preserveVisualLayer) {
      this.scheduleLikelyVideoTransitionPrime()
    }
  }

  /** Breadcrumb click — push current node to history then switch. */
  navigateTo(nodeId: string): void {
    this.history.push(this.createHistoryEntry(this.currentNodeId, undefined, { kind: 'none' }))
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
    this.clearBackgroundTasks()
    this.clearPendingVisualCommit('destroy')
    this.abortRunningTransition()
    this.cleanupVideo()
    this.resourcePreloader.clear()
    this.refs.nodeImage.style.opacity = '1'
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
    const currentNode = this.getCurrentNode()
    if (this.getNodeKind(currentNode) === 'region') {
      clone.draggable = false
      wrapper.appendChild(clone)
      return wrapper
    }
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
    if (this.getNodeKind(node) === 'region') {
      const layout = this.resolveRegionViewportForNode(node)
      if (layout) {
        img.draggable = false
        img.style.display = 'block'
        img.style.userSelect = 'none'
        img.style.opacity = '1'
        img.style.position = 'absolute'
        img.style.left = '0'
        img.style.top = '0'
        img.style.width = `${layout.scaledImageWidth}px`
        img.style.height = `${layout.scaledImageHeight}px`
        img.style.maxWidth = 'none'
        img.style.maxHeight = 'none'
        img.style.objectFit = 'fill'
        img.style.objectPosition = '50% 50%'
        img.style.transform = `translate(${layout.offsetX}px, ${layout.offsetY}px)`
        img.style.clipPath = layout.clipPath
        return
      }
    }

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
    const sourceNode = this.getNodeKind(node) === 'region'
      ? this.getRegionSourceNode(node)
      : node
    img.src = sourceNode?.imageUrl ?? node.imageUrl ?? ''
    img.alt = node.title ?? node.id
    this.applyTransitionNodeImageStyle(img, node)
    wrapper.appendChild(img)
    return { visual: wrapper, image: img }
  }

  private playBuiltinTransition(
    targetNodeId: string,
    config: NonNullable<ReturnType<typeof this.getEdgeConfig>['builtinTransition']>,
    hotspot: TransitionHotspot,
    playbackDirection: TransitionPlaybackDirection = 'forward',
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
        playbackDirection,
      }

      const transitionPromise = this.activeTransition!.play(context)

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
    this.videoController.play(videoUrl, {
      onStart: () => {
        this.refs.nodeImage.style.opacity = '0'
        this.emit('stateChange')
        this.emit('transitionStart')
      },
      onEnded: () => {
        this.pendingVisualCommit = {
          kind: 'video',
          targetNodeId,
          cleanup: () => {
            this.cleanupVideo()
          },
        }

        this.switchNode(targetNodeId, { preserveVisualLayer: true })
      },
      onError: () => {
        this.cleanupVideo()
        this.switchNode(targetNodeId)
        this.emit('transitionEnd')
      },
    })
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
    this.videoController.clear()
  }

  private getLikelyVideoTransitionUrl(nodeId: string): string | null {
    if (!this.manifest) return null
    const edge = this.manifest.edges.find(item => item.fromNodeId === nodeId && !!item.videoUrl)
    return edge?.videoUrl ?? null
  }

  private async primeLikelyVideoTransition(): Promise<void> {
    if (!this.manifest || this.transitioning) return

    const nextVideoUrl = this.getLikelyVideoTransitionUrl(this.currentNodeId)
    await this.videoController.prime(nextVideoUrl)
  }

  private scheduleManifestBackgroundPreload(manifest: PublishManifest): void {
    this.clearBackgroundPreloadTimer()
    this.backgroundPreloadTimer = window.setTimeout(() => {
      this.backgroundPreloadTimer = null
      void this.runWhenIdle(() => this.resourcePreloader.preloadAllResources(manifest, {
        excludeNodeIds: [manifest.rootNodeId],
      }))
    }, 1200)
  }

  private scheduleLikelyVideoTransitionPrime(): void {
    this.clearVideoPrimeTimer()
    this.videoPrimeTimer = window.setTimeout(() => {
      this.videoPrimeTimer = null
      void this.runWhenIdle(() => this.primeLikelyVideoTransition())
    }, 1200)
  }

  private clearBackgroundTasks(): void {
    this.clearBackgroundPreloadTimer()
    this.clearVideoPrimeTimer()
  }

  private clearBackgroundPreloadTimer(): void {
    if (this.backgroundPreloadTimer === null) return
    window.clearTimeout(this.backgroundPreloadTimer)
    this.backgroundPreloadTimer = null
  }

  private clearVideoPrimeTimer(): void {
    if (this.videoPrimeTimer === null) return
    window.clearTimeout(this.videoPrimeTimer)
    this.videoPrimeTimer = null
  }

  private runWhenIdle(task: () => void | Promise<void>): Promise<void> {
    return new Promise(resolve => {
      const execute = () => {
        Promise.resolve(task()).finally(() => resolve())
      }

      const browserWindow = globalThis as typeof globalThis & Window
      if (typeof browserWindow.requestIdleCallback === 'function') {
        browserWindow.requestIdleCallback(() => execute(), { timeout: 1500 })
        return
      }

      globalThis.setTimeout(execute, 0)
    })
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

  private createHistoryEntry(
    nodeId: string,
    viaEdgeId: string | undefined,
    transition: ResolvedNavigationTransition,
  ): NavigationHistoryEntry {
    return {
      nodeId,
      viaEdgeId,
      transitionKind: transition.kind,
      resolvedBuiltinTransition: transition.kind === 'builtin'
        ? transition.builtinTransition
        : undefined,
    }
  }

  private resolveForwardTransition(
    edge: PublishEdge | undefined,
    hotspot: TransitionHotspot,
  ): ResolvedNavigationTransition {
    if (!edge) {
      return { kind: 'none' }
    }

    const hasHtmlNode = this.isHtmlNode(edge.fromNodeId) || this.isHtmlNode(edge.toNodeId)
    const builtinAllowsHtml = hasHtmlNode && edge.builtinTransition
      ? HTML_SAFE_BUILTIN_TRANSITIONS.has(edge.builtinTransition.type)
      : !hasHtmlNode

    if (edge.transitionType === 'builtin' && edge.builtinTransition && builtinAllowsHtml) {
      return {
        kind: 'builtin',
        builtinTransition: this.resolveBuiltinTransitionConfig(edge.builtinTransition, hotspot, edge.toNodeId),
      }
    }

    if (edge.videoUrl) {
      return {
        kind: 'video',
        videoUrl: edge.videoUrl,
      }
    }

    return { kind: 'none' }
  }

  private resolveBackwardTransition(
    historyEntry: NavigationHistoryEntry,
  ): ResolvedNavigationTransition {
    if (
      historyEntry.transitionKind === 'builtin'
      && historyEntry.resolvedBuiltinTransition
      && this.canPlayBuiltinTransitionBetween(
        this.currentNodeId,
        historyEntry.nodeId,
        historyEntry.resolvedBuiltinTransition.type,
      )
    ) {
      return {
        kind: 'builtin',
        builtinTransition: this.reverseBuiltinTransitionConfig(historyEntry.resolvedBuiltinTransition),
      }
    }

    return { kind: 'none' }
  }

  private navigateWithResolvedTransition(
    targetNodeId: string,
    transition: ResolvedNavigationTransition,
    hotspot: TransitionHotspot,
    playbackDirection: TransitionPlaybackDirection,
  ): void {
    if (transition.kind === 'builtin') {
      this.transitioning = true
      this.playBuiltinTransition(targetNodeId, transition.builtinTransition, hotspot, playbackDirection)
      return
    }

    if (transition.kind === 'video') {
      this.transitioning = true
      this.playVideoTransition(targetNodeId, transition.videoUrl)
      return
    }

    this.switchNode(targetNodeId)
  }

  private canPlayBuiltinTransitionBetween(
    fromNodeId: string,
    toNodeId: string,
    transitionType: BuiltinTransitionType,
  ): boolean {
    const hasHtmlNode = this.isHtmlNode(fromNodeId) || this.isHtmlNode(toNodeId)
    if (!hasHtmlNode) return true
    return HTML_SAFE_BUILTIN_TRANSITIONS.has(transitionType)
  }

  private resolveBuiltinTransitionConfig(
    config: BuiltinTransitionConfig,
    hotspot: TransitionHotspot,
    targetNodeId?: string,
  ): BuiltinTransitionConfig {
    if (config.type !== 'zoom') {
      return { ...config }
    }

    if (config.focusMode === 'target-region-auto' && targetNodeId) {
      const targetNode = this.manifest?.nodeMap[targetNodeId]
      const layout = targetNode ? this.resolveRegionViewportForNode(targetNode) : null
      if (layout) {
        return {
          ...config,
          focusMode: 'quad',
          focusQuad: layout.initialWindow,
          centerX: undefined,
          centerY: undefined,
        }
      }
    }

    return {
      ...config,
      centerX: config.centerX ?? hotspot.normalizedX,
      centerY: config.centerY ?? hotspot.normalizedY,
    }
  }

  private getNodeKind(node: PublishNode | null | undefined): 'image' | 'region' | 'html' {
    if (!node) return 'image'
    return node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')
  }

  private getRegionSourceNode(node: PublishNode): PublishNode | null {
    if (!this.manifest || this.getNodeKind(node) !== 'region') return null
    const sourceNodeId = node.regionViewport?.sourceNodeId
    if (!sourceNodeId) return null
    return this.manifest.nodeMap[sourceNodeId] ?? null
  }

  private resolveRegionViewportForNode(node: PublishNode) {
    if (!this.manifest || this.getNodeKind(node) !== 'region' || !node.regionViewport) {
      return null
    }
    const sourceNode = this.getRegionSourceNode(node)
    const sourceAspect = this.getSourceNodeAspectRatio(sourceNode)
    if (!sourceNode?.imageUrl || !sourceAspect) return null

    const rect = this.refs.container.getBoundingClientRect()
    return resolveInitialRegionViewport({
      viewportWidth: rect.width,
      viewportHeight: rect.height,
      sourceAspect,
      regionViewport: node.regionViewport,
      imageFitMode: node.imageFitMode,
    })
  }

  getSourceNodeAspectRatio(node: PublishNode | null | undefined): number | null {
    const imageUrl = node?.imageUrl
    if (!imageUrl) return null

    const metadata = this.resourcePreloader.getImageMetadata(imageUrl)
    if (metadata?.naturalWidth && metadata.naturalHeight) {
      return metadata.naturalWidth / metadata.naturalHeight
    }

    const currentSrc = this.refs.nodeImage.currentSrc || this.refs.nodeImage.src
    if (currentSrc && this.resolveAbsoluteUrl(imageUrl) === currentSrc && this.refs.nodeImage.naturalWidth && this.refs.nodeImage.naturalHeight) {
      return this.refs.nodeImage.naturalWidth / this.refs.nodeImage.naturalHeight
    }

    return null
  }

  private resolveAbsoluteUrl(url: string): string {
    try {
      return new URL(url, window.location.href).href
    } catch {
      return url
    }
  }

  private reverseBuiltinTransitionConfig(
    config: BuiltinTransitionConfig,
  ): BuiltinTransitionConfig {
    if (config.type === 'pan') {
      const reverseDirectionMap = {
        left: 'right',
        right: 'left',
        up: 'down',
        down: 'up',
      } as const

      return {
        ...config,
        direction: reverseDirectionMap[config.direction],
      }
    }

    if (config.type === 'zoom') {
      return {
        ...config,
        direction: config.direction === 'in' ? 'out' : 'in',
      }
    }

    return { ...config }
  }
}

export default PlayerCore
