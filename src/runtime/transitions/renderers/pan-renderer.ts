import type { TransitionContext, TransitionRenderer, PanTransitionConfig } from '../transition-interface.js'

const PAN_CSS = `
  .transition-pan-container { position: absolute; inset: 0; overflow: hidden; }
  .transition-pan-from { position: absolute; inset: 0; }
  .transition-pan-to { position: absolute; inset: 0; }
`

export class PanRenderer implements TransitionRenderer {
  readonly transitionType = 'pan' as const

  private containerEl: HTMLElement | null = null
  private fromEl: HTMLElement | null = null
  private toEl: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null
  private config: PanTransitionConfig | null = null

  renderSetup(context: TransitionContext): void {
    // Store config for later use
    this.config = context.config as PanTransitionConfig

    // Inject CSS if not already present
    if (!document.getElementById('transition-pan-styles')) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'transition-pan-styles'
      this.styleEl.textContent = PAN_CSS
      document.head.appendChild(this.styleEl)
    }

    // Create container
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'transition-pan-container'

    // Clone fromNodeEl as fromEl
    this.fromEl = context.fromNodeEl.cloneNode(true) as HTMLElement
    this.fromEl.className = 'transition-pan-from'
    this.fromEl.style.position = 'absolute'
    this.fromEl.style.inset = '0'
    this.fromEl.style.width = '100%'
    this.fromEl.style.height = '100%'
    this.fromEl.style.objectFit = 'contain'

    // Clone toNodeEl as toEl
    this.toEl = context.toNodeEl.cloneNode(true) as HTMLElement
    this.toEl.className = 'transition-pan-to'
    this.toEl.style.position = 'absolute'
    this.toEl.style.inset = '0'
    this.toEl.style.width = '100%'
    this.toEl.style.height = '100%'
    this.toEl.style.objectFit = 'contain'

    // Apply initial offset based on direction
    const offset = this.calculateOffset(context, this.config.direction)

    this.containerEl.appendChild(this.fromEl)
    this.containerEl.appendChild(this.toEl)
    context.container.appendChild(this.containerEl)

    // Apply initial transform and opacity to toEl
    this.toEl.style.transform = `translate(${offset.x}px, ${offset.y}px)`
    this.toEl.style.transition = 'none'
    this.toEl.style.opacity = '0'
  }

  applyAnimation(progress: number): void {
    if (!this.fromEl || !this.toEl || !this.config) return

    const offset = this.calculateOffsetFromProgress(this.fromEl, this.toEl, this.config.direction, progress)

    this.fromEl.style.transform = `translate(${offset.fromX}px, ${offset.fromY}px)`
    this.fromEl.style.opacity = String(1 - progress)
    this.toEl.style.transform = `translate(${offset.toX}px, ${offset.toY}px)`
    this.toEl.style.opacity = String(progress)
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

  private calculateOffset(context: TransitionContext, direction: string): { x: number, y: number } {
    const containerWidth = context.container.offsetWidth
    const containerHeight = context.container.offsetHeight
    const multiplier = 1.5

    switch (direction) {
      case 'left': return { x: -containerWidth * multiplier, y: 0 }
      case 'right': return { x: containerWidth * multiplier, y: 0 }
      case 'up': return { x: 0, y: -containerHeight * multiplier }
      case 'down': return { x: 0, y: containerHeight * multiplier }
      default: return { x: 0, y: 0 }
    }
  }

  private calculateOffsetFromProgress(
    fromEl: HTMLElement, toEl: HTMLElement, direction: string, progress: number
  ): { fromX: number, fromY: number, toX: number, toY: number } {
    const containerWidth = fromEl.offsetWidth
    const containerHeight = fromEl.offsetHeight
    const multiplier = 1.5

    let fromX = 0, fromY = 0, toX = 0, toY = 0

    switch (direction) {
      case 'left':
        fromX = -containerWidth * progress
        toX = -containerWidth * multiplier + containerWidth * multiplier * progress
        break
      case 'right':
        fromX = containerWidth * progress
        toX = containerWidth * multiplier - containerWidth * multiplier * progress
        break
      case 'up':
        fromY = -containerHeight * progress
        toY = -containerHeight * multiplier + containerHeight * multiplier * progress
        break
      case 'down':
        fromY = containerHeight * progress
        toY = containerHeight * multiplier - containerHeight * multiplier * progress
        break
    }

    return { fromX, fromY, toX, toY }
  }
}