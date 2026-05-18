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

  renderSetup(context: TransitionContext): void {
    if (!document.getElementById('transition-zoom-styles')) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'transition-zoom-styles'
      this.styleEl.textContent = ZOOM_CSS
      document.head.appendChild(this.styleEl)
    }

    const config = context.config as ZoomTransitionConfig
    const centerX = config.centerX ?? context.hotspot.x
    const centerY = config.centerY ?? context.hotspot.y

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
    if (!this.fromEl || !this.toEl) return

    const config = this.getConfig()
    const scale = config.scale ?? 1.5
    const centerX = config.centerX ?? 0.5
    const centerY = config.centerY ?? 0.5

    if (config.direction === 'in') {
      // Zoom in: fromNode scales down, toNode fades in
      const scaleVal = 1 - (1 - 1/scale) * progress
      const tx = (centerX - 0.5) * (1 - scaleVal) * 100
      const ty = (centerY - 0.5) * (1 - scaleVal) * 100

      this.fromEl.style.transform = `scale(${scaleVal}) translate(${tx}%, ${ty}%)`
      this.toEl.style.opacity = String(progress > 0.3 ? (progress - 0.3) / 0.7 : 0)
    } else {
      // Zoom out: fromNode scales up, toNode fades in
      const scaleVal = 1 + (scale - 1) * progress
      const tx = (0.5 - centerX) * (scaleVal - 1) * 100
      const ty = (0.5 - centerY) * (scaleVal - 1) * 100

      this.fromEl.style.transform = `scale(${scaleVal}) translate(${tx}%, ${ty}%)`
      this.toEl.style.opacity = String(progress > 0.3 ? (progress - 0.3) / 0.7 : 0)
    }
  }

  renderCleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl)
    }
    this.containerEl = null
    this.fromEl = null
    this.toEl = null
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl)
      this.styleEl = null
    }
  }

  private getConfig(): ZoomTransitionConfig {
    return {
      type: 'zoom',
      direction: 'in',
      scale: 1.5,
      centerX: 0.5,
      centerY: 0.5,
      duration: 600,
      easing: 'ease-in-out',
    }
  }
}