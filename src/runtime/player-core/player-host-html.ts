import type {
  HtmlIframePreloadStrategy,
  PublishManifest,
  PublishNode,
  RuntimeConfig,
} from '../../shared/types.js'
import type PlayerCore from './player-core.js'
import type { PlayerHostRefs } from './player-host.js'

export type HtmlIframeEntry = {
  iframe: HTMLIFrameElement
  ready: boolean
  readyPromise: Promise<void>
  preloadSettled: boolean
  cleanup: () => void
}

export interface HtmlIframeManagerEnv {
  refs: PlayerHostRefs
  engine: PlayerCore
  getNodeKind: (node: PublishNode | null | undefined) => 'surface' | 'image' | 'html'
  toAbsoluteUrl: (url: string) => string
  htmlIframeLayer: HTMLElement
  requestRender: () => void
  updateHotspotViewport: () => void
  confirmHostVisualCommitIfReady: (reason: string) => void
  postHtmlNodeRouteSelection: (node: PublishNode) => void
  getRuntimeConfig: () => RuntimeConfig | undefined
}

export class HtmlIframeManager {
  entries = new Map<string, HtmlIframeEntry>()
  preloading = false
  preloadedScopes = new Set<string>()
  warmupQueue: Promise<void> = Promise.resolve()
  activeUrl = ''

  constructor(private env: HtmlIframeManagerEnv) {}

  applyBaseStyle(iframe: HTMLIFrameElement): void {
    Object.assign(iframe.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      border: 'none',
      background: '#000',
      display: 'block',
      visibility: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
    })
  }

  hideAll(): void {
    this.entries.forEach(entry => {
      entry.iframe.style.visibility = 'hidden'
      entry.iframe.style.opacity = '0'
      entry.iframe.style.pointerEvents = 'none'
    })
    this.env.htmlIframeLayer.style.pointerEvents = 'none'
  }

  activate(htmlUrl: string): void {
    const absoluteUrl = this.env.toAbsoluteUrl(htmlUrl)
    const entry = this.entries.get(absoluteUrl)
    if (!entry) return
    this.activeUrl = absoluteUrl
    this.env.refs.nodeIframe = entry.iframe
    this.hideAll()
  }

  isActiveReady(): boolean {
    const entry = this.entries.get(this.activeUrl)
    return !!entry?.ready
  }

  ensure(url: string): HtmlIframeEntry {
    const absoluteUrl = this.env.toAbsoluteUrl(url)
    const existing = this.entries.get(absoluteUrl)
    if (existing) return existing

    const iframe = this.entries.size === 0
      ? this.env.refs.nodeIframe
      : document.createElement('iframe')
    if (this.entries.size !== 0) {
      iframe.sandbox.value = this.env.refs.nodeIframe.sandbox.value
      this.env.htmlIframeLayer.appendChild(iframe)
    }
    this.applyBaseStyle(iframe)

    let preloadResolved = false
    let timeoutId = 0
    let entry!: HtmlIframeEntry
    const readyPromise = new Promise<void>((resolve) => {
      const settlePreloadWait = () => {
        if (preloadResolved) return
        preloadResolved = true
        entry.preloadSettled = true
        window.clearTimeout(timeoutId)
        resolve()
      }

      const handleLoad = () => {
        entry.ready = true
        iframe.removeEventListener('load', handleLoad)
        settlePreloadWait()
        if (this.env.refs.nodeIframe === iframe) {
          this.env.requestRender()
          const currentNode = this.env.engine.getCurrentNode()
          if (currentNode && this.env.getNodeKind(currentNode) === 'html') {
            this.env.postHtmlNodeRouteSelection(currentNode)
          }
          this.env.updateHotspotViewport()
          requestAnimationFrame(() => {
            this.env.confirmHostVisualCommitIfReady('node-iframe:onLoad:next-frame')
          })
        }
      }

      iframe.addEventListener('load', handleLoad)
      timeoutId = window.setTimeout(() => {
        settlePreloadWait()
      }, 12000)
      iframe.src = absoluteUrl
    })

    entry = {
      iframe,
      ready: false,
      readyPromise,
      preloadSettled: false,
      cleanup: () => {
        window.clearTimeout(timeoutId)
      },
    }
    this.entries.set(absoluteUrl, entry)
    return entry
  }

  async preload(urls: string[]): Promise<void> {
    const htmlUrls = Array.from(new Set(urls.map(url => this.env.toAbsoluteUrl(url))))
    if (htmlUrls.length === 0) return

    for (const url of htmlUrls) {
      await this.runWarmupWhenIdle(() => this.ensure(url).readyPromise)
      await this.yieldToBrowser()
    }
  }

  maybeStartPreload(): void {
    const manifest = this.env.engine.getManifest()
    if (!manifest) return
    if (this.preloading) return

    const strategy = this.resolvePreloadStrategy(manifest)
    if (strategy === 'on-demand') return

    const scope = this.getPreloadScope(manifest, strategy)
    if (!scope) return
    if (this.preloadedScopes.has(scope.key)) return

    this.preloadedScopes.add(scope.key)
    this.preloading = true
    this.warmupQueue = this.warmupQueue
      .then(() => this.preload(scope.urls))
      .finally(() => {
        this.preloading = false
      })
  }

  primeForEdgeId(edgeId: string): void {
    const manifest = this.env.engine.getManifest()
    const edge = manifest?.edgeMap[edgeId]
    if (!edge) return
    this.primeForNodeId(edge.toNodeId)
  }

  primeForNodeId(nodeId: string): void {
    const manifest = this.env.engine.getManifest()
    const node = manifest?.nodeMap[nodeId]
    if (!node || this.env.getNodeKind(node) !== 'html' || !node.htmlUrl) return
    void this.ensure(node.htmlUrl).readyPromise
  }

  private resolvePreloadStrategy(manifest: PublishManifest): HtmlIframePreloadStrategy {
    return this.env.getRuntimeConfig()?.htmlIframePreloadStrategy
      ?? manifest.runtimeConfig?.htmlIframePreloadStrategy
      ?? 'current-node'
  }

  private getPreloadScope(
    manifest: PublishManifest,
    strategy: Exclude<HtmlIframePreloadStrategy, 'on-demand'>,
  ): { key: string, urls: string[] } | null {
    if (strategy === 'all') {
      const urls = manifest.nodes
        .filter(node => this.env.getNodeKind(node) === 'html' && node.htmlUrl)
        .map(node => node.htmlUrl as string)
      return {
        key: 'all',
        urls,
      }
    }

    const currentNodeId = this.env.engine.getCurrentNodeId()
    const urls = manifest.edges
      .filter(edge => edge.fromNodeId === currentNodeId)
      .map(edge => manifest.nodeMap[edge.toNodeId])
      .filter((node): node is PublishNode => !!node && this.env.getNodeKind(node) === 'html' && !!node.htmlUrl)
      .map(node => node.htmlUrl as string)

    return {
      key: `current-node:${currentNodeId}`,
      urls,
    }
  }

  private runWarmupWhenIdle(task: () => Promise<void>): Promise<void> {
    return new Promise(resolve => {
      const execute = () => {
        task().finally(resolve)
      }

      const browserWindow = globalThis as typeof globalThis & Window
      if (typeof browserWindow.requestIdleCallback === 'function') {
        browserWindow.requestIdleCallback(() => execute(), { timeout: 1200 })
        return
      }

      window.setTimeout(execute, 0)
    })
  }

  private yieldToBrowser(): Promise<void> {
    return new Promise(resolve => {
      window.setTimeout(resolve, 0)
    })
  }

  destroy(): void {
    this.entries.forEach(entry => {
      entry.cleanup()
      entry.iframe.remove()
    })
    this.entries.clear()
  }
}
