import type { TransitionContext, TransitionRenderer, ZoomTransitionConfig } from '../transition-interface.js'

const ZOOM_CSS = `
  .transition-zoom-container { position: absolute; inset: 0; overflow: hidden; }
  .transition-zoom-from { position: absolute; inset: 0; transform-origin: var(--zoom-origin-x, 50%) var(--zoom-origin-y, 50%); }
  .transition-zoom-to { position: absolute; inset: 0; opacity: 0; }
`

export class ZoomRenderer implements TransitionRenderer {
  readonly transitionType = 'zoom' as const

  private containerEl: HTMLElement | null = null
  private fromEl: HTMLElement | null = null
  private toEl: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null
  private config: ZoomTransitionConfig | null = null

  renderSetup(context: TransitionContext): void {
    // Store config for later use
    this.config = context.config as ZoomTransitionConfig

    if (!document.getElementById('transition-zoom-styles')) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'transition-zoom-styles'
      this.styleEl.textContent = ZOOM_CSS
      document.head.appendChild(this.styleEl)
    }

    const centerX = this.config.centerX ?? context.hotspot.x
    const centerY = this.config.centerY ?? context.hotspot.y

    // Container
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'transition-zoom-container'

    // From element
    this.fromEl = context.fromNodeEl.cloneNode(true) as HTMLElement
    this.fromEl.className = 'transition-zoom-from'
    this.fromEl.style.position = 'absolute'
    this.fromEl.style.inset = '0'
    this.fromEl.style.width = '100%'
    this.fromEl.style.height = '100%'
    this.fromEl.style.objectFit = 'contain'
    this.fromEl.style.setProperty('--zoom-origin-x', `${centerX * 100}%`)
    this.fromEl.style.setProperty('--zoom-origin-y', `${centerY * 100}%`)

    // To element (initially invisible)
    this.toEl = context.toNodeEl.cloneNode(true) as HTMLElement
    this.toEl.className = 'transition-zoom-to'
    this.toEl.style.position = 'absolute'
    this.toEl.style.inset = '0'
    this.toEl.style.width = '100%'
    this.toEl.style.height = '100%'
    this.toEl.style.objectFit = 'contain'

    this.containerEl.appendChild(this.fromEl)
    this.containerEl.appendChild(this.toEl)
    context.container.appendChild(this.containerEl)

    // Initial transform
    this.fromEl.style.transform = 'scale(1) translate(0, 0)'
    this.fromEl.style.transition = 'none'
  }

  applyAnimation(progress: number): void {
    if (!this.fromEl || !this.toEl || !this.config) return

    const scale = this.config.scale ?? 1.5
    const centerX = this.config.centerX ?? 0.5
    const centerY = this.config.centerY ?? 0.5

    if (this.config.direction === 'in') {
      // Zoom in: fromNode scales UP (1 to scale), toNode fades in
      const scaleVal = 1 + (scale - 1) * progress
      const tx = (centerX - 0.5) * (1 - scaleVal) * 100
      const ty = (centerY - 0.5) * (1 - scaleVal) * 100

      this.fromEl.style.transform = `scale(${scaleVal}) translate(${tx}%, ${ty}%)`
      this.fromEl.style.opacity = '1'
      this.toEl.style.opacity = String(progress)
    } else {
      // Zoom out: fromNode scales DOWN (scale to 1), toNode fades in
      const scaleVal = scale - (scale - 1) * progress
      const tx = (centerX - 0.5) * (1 - scaleVal) * 100
      const ty = (centerY - 0.5) * (1 - scaleVal) * 100

      this.fromEl.style.transform = `scale(${scaleVal}) translate(${tx}%, ${ty}%)`
      this.fromEl.style.opacity = String(1 - progress)
      this.toEl.style.opacity = String(progress)
    }
  }

  renderCleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl)
    }
    this.containerEl = null
    this.fromEl = null
    this.toEl = null
    this.config = null
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl)
      this.styleEl = null
    }
  }
}