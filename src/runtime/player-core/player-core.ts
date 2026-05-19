import type {
  PublishManifest,
  PublishHotspot,
  PublishNode,
} from '../../shared/types.js'
import type { Transition } from '../transitions/index.js'
import { createTransition } from '../transitions/index.js'
import { RuntimeResourcePreloader } from './resource-preloader.js'

export interface PlayerRefs {
  container: HTMLElement
  nodeImage: HTMLImageElement
  video: HTMLVideoElement
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

  private debugLog(label: string, extra: Record<string, unknown> = {}): void {
    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now().toFixed(2)
        : 'n/a'

    console.log(`[PlayerCore][${now}ms] ${label}`, {
      currentNodeId: this.currentNodeId,
      transitioning: this.transitioning,
      hasTransitionContainer: !!this.transitionContainer,
      activeTransition: this.activeTransition?.type ?? null,
      videoOpacity: this.refs.video.style.opacity || '(empty)',
      ...extra,
    })
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

    this.debugLog('host-commit:received', {
      pendingKind: pending.kind,
      targetNodeId: pending.targetNodeId,
    })

    pending.cleanup()
    this.emit('transitionEnd')

    this.debugLog('host-commit:cleanup-finished', {
      pendingKind: pending.kind,
      targetNodeId: pending.targetNodeId,
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

    if (edge?.transitionType === 'builtin' && edge.builtinTransition) {
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

  handleBack(): void {
    if (this.history.length === 0) return
    const prevNodeId = this.history[this.history.length - 1]
    this.history = this.history.slice(0, -1)
    this.switchNode(prevNodeId)
  }

  switchNode(nodeId: string, options: SwitchNodeOptions = {}): void {
    this.debugLog('switchNode:start', {
      nextNodeId: nodeId,
      preserveVisualLayer: !!options.preserveVisualLayer,
    })

    if (!options.preserveVisualLayer) {
      this.clearPendingVisualCommit('switchNode-replaced')
      this.abortRunningTransition()
    }

    this.currentNodeId = nodeId
    this.transitioning = false

    if (!options.preserveVisualLayer) {
      this.cleanupVideo()
      this.refs.video.style.opacity = '0'
    }

    this.debugLog('switchNode:before-stateChange', { nextNodeId: nodeId })
    this.emit('stateChange')
    this.debugLog('switchNode:after-stateChange', { nextNodeId: nodeId })
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
    const fromEl = this.refs.nodeImage.cloneNode(true) as HTMLElement
    fromEl.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:1;'

    const toImg = document.createElement('img')
    toImg.src = targetNode.imageUrl
    toImg.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:1;'

    const tc = document.createElement('div')
    tc.style.cssText =
      'position:absolute;inset:0;z-index:20;pointer-events:none;overflow:hidden;'
    container.appendChild(tc)
    this.transitionContainer = tc

    this.activeTransition = createTransition(config.type, config)

    const startTransition = () => {
      this.refs.nodeImage.style.opacity = '0'
      this.emit('stateChange')
      this.emit('transitionStart')

      this.debugLog('builtin:start', {
        targetNodeId,
        transitionType: config.type,
        targetImageUrl: targetNode.imageUrl,
      })
      const context = {
        container: tc,
        fromNodeEl: fromEl,
        toNodeEl: toImg,
        hotspot: { x: hotspot.normalizedX, y: hotspot.normalizedY },
        config,
      }

      this.activeTransition!.play(context).then(() => {
        this.debugLog('builtin:promise-resolved', {
          targetNodeId,
          transitionType: config.type,
        })

        const frozenFrame = toImg.cloneNode(true) as HTMLElement
        frozenFrame.style.cssText =
          'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:1;'
        tc.replaceChildren(frozenFrame)

        this.activeTransition = null

        this.pendingVisualCommit = {
          kind: 'builtin',
          targetNodeId,
          cleanup: () => {
            if (tc.parentNode) tc.parentNode.removeChild(tc)
            if (this.transitionContainer === tc) {
              this.transitionContainer = null
            }
            this.debugLog('builtin:container-removed-after-host-commit', {
              targetNodeId,
              transitionType: config.type,
            })
          },
        }

        this.debugLog('builtin:frozen-frame-pending-host-commit', {
          targetNodeId,
          transitionType: config.type,
        })

        this.switchNode(targetNodeId, { preserveVisualLayer: true })
      })
    }

    if (toImg.complete) {
      this.debugLog('builtin:target-image-ready-immediately', {
        targetNodeId,
        transitionType: config.type,
        targetImageUrl: targetNode.imageUrl,
      })
      startTransition()
    } else {
      toImg.onload = () => {
        this.debugLog('builtin:target-image-onload', {
          targetNodeId,
          transitionType: config.type,
          targetImageUrl: targetNode.imageUrl,
        })
        startTransition()
      }
    }

    toImg.onerror = () => {
      this.debugLog('builtin:target-image-error', {
        targetNodeId,
        transitionType: config.type,
        targetImageUrl: targetNode.imageUrl,
      })
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
      this.debugLog('video:ready-to-play', { targetNodeId, videoUrl })

      video.play().catch(() => {
        this.debugLog('video:play-rejected', { targetNodeId, videoUrl })
        this.cleanupVideo()
        this.switchNode(targetNodeId)
        this.emit('transitionEnd')
        this.debugLog('video:transition-end-emitted-after-play-rejected', { targetNodeId, videoUrl })
      })
    }

    const handleEnded = () => {
      this.debugLog('video:onended', { targetNodeId, videoUrl })

      this.pendingVisualCommit = {
        kind: 'video',
        targetNodeId,
        cleanup: () => {
          this.cleanupVideo()
          this.debugLog('video:cleanup-after-host-commit', { targetNodeId, videoUrl })
        },
      }

      this.debugLog('video:frozen-frame-pending-host-commit', { targetNodeId, videoUrl })
      this.switchNode(targetNodeId, { preserveVisualLayer: true })
    }

    const handleError = () => {
      this.debugLog('video:onerror', { targetNodeId, videoUrl })
      this.cleanupVideo()
      this.debugLog('video:after-cleanup-onerror', { targetNodeId, videoUrl })
      this.switchNode(targetNodeId)
      this.emit('transitionEnd')
      this.debugLog('video:transition-end-emitted-after-error', { targetNodeId, videoUrl })
    }

    this.cleanupVideo()
    this.debugLog('video:prepare-start', { targetNodeId, videoUrl })
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
    this.debugLog('cleanupVideo:start')
    if (this.videoCleanup) {
      this.videoCleanup()
      this.videoCleanup = null
    }
    const video = this.refs.video
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.style.opacity = '0'
    this.debugLog('cleanupVideo:end')
  }

  private clearPendingVisualCommit(reason: string): void {
    if (!this.pendingVisualCommit) return

    const pending = this.pendingVisualCommit
    this.pendingVisualCommit = null

    this.debugLog('pending-visual-commit:forced-cleanup', {
      reason,
      pendingKind: pending.kind,
      targetNodeId: pending.targetNodeId,
    })

    pending.cleanup()
  }

  private getEdgeConfig() {
    // Helper kept for type reference; not used at runtime.
    return null as any
  }
}
