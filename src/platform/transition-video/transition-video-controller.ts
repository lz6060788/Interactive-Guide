/**
 * TransitionVideoController — plays a transition video between route
 * endpoints with the new `transition.policy` semantics:
 *   - `cut`: video must complete; on failure, the navigation is aborted.
 *   - `abort-navigation`: video plays in parallel; navigation proceeds
 *     regardless of video success.
 *
 * Timeouts are enforced per route config; failures are surfaced via
 * the registered listener so the runtime can fall back.
 */
export type TransitionPolicy = 'cut' | 'abort-navigation'

export interface TransitionSpec {
  url: string
  posterUrl?: string
  durationMs?: number
  /** Per-route timeout. Falls back to `durationMs` then 8000ms. */
  timeoutMs?: number
  policy?: TransitionPolicy
}

export type TransitionEvent =
  | { type: 'start'; url: string }
  | { type: 'finish'; url: string }
  | { type: 'timeout'; url: string }
  | { type: 'error'; url: string; error: Error }

export type TransitionListener = (event: TransitionEvent) => void

export interface TransitionVideoControllerOptions {
  mountRoot?: HTMLElement
}

export class TransitionVideoController {
  private readonly listeners: TransitionListener[] = []
  private readonly mountRoot?: HTMLElement
  private active: HTMLVideoElement | null = null
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null
  private cancelled = false
  private activeMount: HTMLElement | null = null

  constructor(opts: TransitionVideoControllerOptions = {}) {
    this.mountRoot = opts.mountRoot
  }

  on(listener: TransitionListener): void {
    this.listeners.push(listener)
  }

  off(listener: TransitionListener): void {
    const i = this.listeners.indexOf(listener)
    if (i >= 0) this.listeners.splice(i, 1)
  }

  /**
   * Plays the transition. Returns a promise that resolves when the video
   * ends (or rejects on timeout/error for `cut` policy).
   */
  async play(spec: TransitionSpec): Promise<void> {
    const timeoutMs = spec.timeoutMs ?? spec.durationMs ?? 8000
    const policy: TransitionPolicy = spec.policy ?? 'cut'

    this.cancelled = false

    let resolve!: () => void
    let reject!: (e: Error) => void
    const done = new Promise<void>((res, rej) => {
      resolve = res
      reject = rej
    })

    this.emit({ type: 'start', url: spec.url })

    const cleanup = (): void => {
      if (this.timeoutHandle) {
        clearTimeout(this.timeoutHandle)
        this.timeoutHandle = null
      }
      if (this.active) {
        this.active.pause()
        this.active.remove()
        this.active = null
      }
      if (this.activeMount) {
        this.activeMount.style.display = 'none'
        this.activeMount.innerHTML = ''
        this.activeMount = null
      }
    }

    const finishTimeout = (): void => {
      if (this.cancelled) return
      cleanup()
      this.emit({ type: 'timeout', url: spec.url })
      if (policy === 'cut') reject(new Error(`transition timeout after ${timeoutMs}ms`))
      else resolve()
    }

    this.timeoutHandle = setTimeout(finishTimeout, timeoutMs)

    if (typeof document !== 'undefined') {
      const video = document.createElement('video')
      video.src = spec.url
      if (spec.posterUrl) video.poster = spec.posterUrl
      video.preload = 'auto'
      video.muted = true
      video.playsInline = true
      video.style.position = 'absolute'
      video.style.inset = '0'
      video.style.width = '100%'
      video.style.height = '100%'
      video.style.objectFit = 'cover'
      video.style.background = '#000'
      if (this.mountRoot) {
        this.mountRoot.style.display = 'block'
        this.mountRoot.innerHTML = ''
        this.mountRoot.appendChild(video)
        this.activeMount = this.mountRoot
      }
      this.active = video

      const finishOk = (): void => {
        if (this.cancelled) return
        cleanup()
        this.emit({ type: 'finish', url: spec.url })
        resolve()
      }
      const finishErr = (error: Error): void => {
        if (this.cancelled) return
        cleanup()
        this.emit({ type: 'error', url: spec.url, error })
        if (policy === 'cut') reject(error)
        else resolve()
      }

      video.addEventListener('ended', finishOk, { once: true })
      video.addEventListener('error', () => finishErr(new Error('video load error')), { once: true })

      try {
        await video.play()
      } catch (err) {
        finishErr(err instanceof Error ? err : new Error(String(err)))
      }
    }

    return done
  }

  cancel(): void {
    if (!this.active) return
    this.cancelled = true
    this.active.pause()
    this.active.remove()
    this.active = null
    if (this.activeMount) {
      this.activeMount.style.display = 'none'
      this.activeMount.innerHTML = ''
      this.activeMount = null
    }
  }

  private emit(event: TransitionEvent): void {
    for (const l of this.listeners) l(event)
  }
}
