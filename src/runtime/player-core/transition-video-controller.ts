export interface VideoTransitionPlaybackCallbacks {
  onStart: () => void
  onEnded: () => void
  onError: () => void
}

export class TransitionVideoController {
  private video: HTMLVideoElement
  private boundVideoUrl: string | null = null
  private preloadedVideoUrl: string | null = null
  private preloadCleanup: (() => void) | null = null
  private preloadRequestId = 0
  private playbackCleanup: (() => void) | null = null

  constructor(video: HTMLVideoElement) {
    this.video = video
    this.prepareVideoElement()
  }

  updateVideoElement(video: HTMLVideoElement): void {
    if (this.video === video) {
      this.prepareVideoElement()
      return
    }

    this.clear()
    this.video = video
    this.boundVideoUrl = null
    this.prepareVideoElement()
  }

  async prime(url: string | null): Promise<void> {
    if (!url) {
      this.clearPreloadState()
      this.preloadedVideoUrl = null
      return
    }

    const resolvedUrl = this.resolveVideoUrl(url)
    this.prepareVideoElement()

    if (this.preloadedVideoUrl === resolvedUrl && this.isVideoReadyForUrl(resolvedUrl)) {
      return
    }

    const requestId = ++this.preloadRequestId
    this.clearPreloadState()

    const settle = (ready: boolean) => {
      if (requestId !== this.preloadRequestId) return
      this.clearPreloadState()
      this.preloadedVideoUrl = ready ? resolvedUrl : null
    }

    const handleReady = () => settle(true)
    const handleError = () => settle(false)
    this.video.addEventListener('loadeddata', handleReady)
    this.video.addEventListener('canplay', handleReady)
    this.video.addEventListener('error', handleError)

    this.preloadCleanup = () => {
      this.video.removeEventListener('loadeddata', handleReady)
      this.video.removeEventListener('canplay', handleReady)
      this.video.removeEventListener('error', handleError)
    }

    if (!this.isVideoBoundToUrl(resolvedUrl)) {
      this.video.pause()
      this.video.style.opacity = '0'
      this.video.src = url
      this.boundVideoUrl = resolvedUrl
      this.video.load()
      return
    }

    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      && this.video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      this.video.load()
    }
  }

  play(url: string, callbacks: VideoTransitionPlaybackCallbacks): void {
    const resolvedUrl = this.resolveVideoUrl(url)
    let started = false
    const canReuseReadyVideo = this.isVideoReadyForUrl(resolvedUrl)

    this.prepareVideoElement()
    this.clearPreloadState()
    this.clearPlaybackState()
    if (canReuseReadyVideo) {
      this.preloadedVideoUrl = resolvedUrl
    }

    const startPlayback = () => {
      if (started) return
      started = true

      try {
        this.video.currentTime = 0
      } catch {
        // Some browsers reject seeks before the media pipeline is fully ready.
      }

      this.video.style.opacity = '1'
      callbacks.onStart()

      this.video.play().catch(() => {
        this.clear()
        callbacks.onError()
      })
    }

    const handleEnded = () => {
      callbacks.onEnded()
    }

    const handleError = () => {
      this.clear()
      callbacks.onError()
    }

    this.video.onloadeddata = startPlayback
    this.video.oncanplay = startPlayback
    this.video.onended = handleEnded
    this.video.onerror = handleError

    this.playbackCleanup = () => {
      this.video.onloadeddata = null
      this.video.oncanplay = null
      this.video.onended = null
      this.video.onerror = null
      this.video.style.opacity = '0'
    }

    if (canReuseReadyVideo) {
      this.video.pause()
      startPlayback()
      return
    }

    this.video.pause()
    if (!this.isVideoBoundToUrl(resolvedUrl)) {
      this.video.src = url
      this.boundVideoUrl = resolvedUrl
    }
    this.video.load()
  }

  clear(): void {
    this.clearPreloadState()
    this.clearPlaybackState()
    this.video.pause()
    this.video.removeAttribute('src')
    this.video.load()
    this.video.style.opacity = '0'
    this.boundVideoUrl = null
    this.preloadedVideoUrl = null
  }

  private prepareVideoElement(): void {
    this.video.preload = 'auto'
    this.video.muted = true
    this.video.playsInline = true
    this.video.setAttribute('playsinline', '')
    this.video.setAttribute('webkit-playsinline', 'true')
  }

  private resolveVideoUrl(url: string): string {
    return new URL(url, window.location.href).href
  }

  private isVideoBoundToUrl(resolvedUrl: string): boolean {
    return this.boundVideoUrl === resolvedUrl
  }

  private isVideoReadyForUrl(resolvedUrl: string): boolean {
    return this.isVideoBoundToUrl(resolvedUrl)
      && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  }

  private clearPreloadState(): void {
    this.preloadCleanup?.()
    this.preloadCleanup = null
  }

  private clearPlaybackState(): void {
    this.playbackCleanup?.()
    this.playbackCleanup = null
  }
}
