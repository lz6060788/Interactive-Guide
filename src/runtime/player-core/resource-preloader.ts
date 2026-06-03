import type { PublishManifest } from '../../shared/types.js'

type PreloadEntry = {
  status: 'pending' | 'fulfilled' | 'rejected'
  promise: Promise<void>
}

export interface PreloadedImageMetadata {
  naturalWidth: number
  naturalHeight: number
}

export class RuntimeResourcePreloader {
  private imageEntries = new Map<string, PreloadEntry>()
  private htmlEntries = new Map<string, PreloadEntry>()
  private imageMetadata = new Map<string, PreloadedImageMetadata>()
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
        this.imageMetadata.set(url, {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        })
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

  preloadHtml(url?: string): Promise<void> {
    if (!url) return Promise.resolve()
    const existing = this.htmlEntries.get(url)
    if (existing) return existing.promise

    const promise = new Promise<void>((resolve) => {
      fetch(url)
        .then(response => {
          const entry = this.htmlEntries.get(url)
          if (entry) entry.status = response.ok ? 'fulfilled' : 'rejected'
          resolve()
        })
        .catch(() => {
          const entry = this.htmlEntries.get(url)
          if (entry) entry.status = 'rejected'
          resolve()
        })
    })

    this.htmlEntries.set(url, { status: 'pending', promise })
    return promise
  }

  preloadAllResources(manifest: PublishManifest): Promise<void> {
    if (this.fullPreloadPromise) return this.fullPreloadPromise

    const imageJobs: Promise<void>[] = []
    const htmlJobs: Promise<void>[] = []
    for (const node of manifest.nodes) {
      const nodeKind = node.nodeKind ?? (node.contentType === 'html' ? 'html' : 'image')
      if (nodeKind === 'html') {
        htmlJobs.push(this.preloadHtml(node.htmlUrl))
      } else if (nodeKind === 'region') {
        const sourceNode = node.regionViewport
          ? manifest.nodeMap[node.regionViewport.sourceNodeId]
          : undefined
        imageJobs.push(this.preloadImage(sourceNode?.imageUrl))
      } else {
        imageJobs.push(this.preloadImage(node.imageUrl))
      }
    }

    this.fullPreloadPromise = Promise.allSettled([...imageJobs, ...htmlJobs]).then(() => {
      this.fullPreloadPromise = null
    })

    return this.fullPreloadPromise
  }

  clear(): void {
    this.fullPreloadPromise = null
    this.imageEntries.clear()
    this.htmlEntries.clear()
    this.imageMetadata.clear()
  }

  getImageMetadata(url?: string): PreloadedImageMetadata | null {
    if (!url) return null
    return this.imageMetadata.get(url) ?? null
  }
}
