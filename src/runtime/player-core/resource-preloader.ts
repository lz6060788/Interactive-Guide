import type { PublishManifest } from '../../shared/types.js'

type PreloadEntry = {
  status: 'pending' | 'fulfilled' | 'rejected'
  promise: Promise<void>
}

export class RuntimeResourcePreloader {
  private imageEntries = new Map<string, PreloadEntry>()
  private videoEntries = new Map<string, PreloadEntry>()
  private fullPreloadPromise: Promise<void> | null = null

  preloadImage(url?: string): Promise<void> {
    if (!url) return Promise.resolve()
    const existing = this.imageEntries.get(url)
    if (existing) return existing.promise

    const promise = new Promise<void>((resolve) => {
      const img = new Image()

      const cleanup = () => {
        img.onload = null
        img.onerror = null
      }

      img.onload = async () => {
        cleanup()
        try {
          if (typeof img.decode === 'function') {
            await img.decode()
          }
        } catch {
          // decode() may reject even when the image is already usable.
        }
        const entry = this.imageEntries.get(url)
        if (entry) entry.status = 'fulfilled'
        resolve()
      }

      img.onerror = () => {
        cleanup()
        const entry = this.imageEntries.get(url)
        if (entry) entry.status = 'rejected'
        resolve()
      }

      img.src = url
      if (img.complete) {
        void img.onload?.(new Event('load'))
      }
    })

    this.imageEntries.set(url, { status: 'pending', promise })
    return promise
  }

  preloadVideo(url?: string): Promise<void> {
    if (!url) return Promise.resolve()
    const existing = this.videoEntries.get(url)
    if (existing) return existing.promise

    const promise = new Promise<void>((resolve) => {
      const video = document.createElement('video')
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true

      const cleanup = () => {
        video.onloadeddata = null
        video.oncanplay = null
        video.onerror = null
      }

      const finish = (status: 'fulfilled' | 'rejected') => {
        cleanup()
        const entry = this.videoEntries.get(url)
        if (entry) entry.status = status
        resolve()
      }

      video.onloadeddata = () => finish('fulfilled')
      video.oncanplay = () => finish('fulfilled')
      video.onerror = () => finish('rejected')

      video.src = url
      video.load()
    })

    this.videoEntries.set(url, { status: 'pending', promise })
    return promise
  }

  preloadAllResources(manifest: PublishManifest): Promise<void> {
    if (this.fullPreloadPromise) return this.fullPreloadPromise

    const imageJobs: Promise<void>[] = []
    for (const node of manifest.nodes) {
      imageJobs.push(this.preloadImage(node.imageUrl))
    }

    const videoJobs: Promise<void>[] = []
    for (const edge of manifest.edges) {
      if (edge.videoUrl) {
        videoJobs.push(this.preloadVideo(edge.videoUrl))
      }
    }

    this.fullPreloadPromise = Promise.allSettled([...imageJobs, ...videoJobs]).then(() => {
      this.fullPreloadPromise = null
    })

    return this.fullPreloadPromise
  }

  clear(): void {
    this.fullPreloadPromise = null
    this.imageEntries.clear()
    this.videoEntries.clear()
  }
}
