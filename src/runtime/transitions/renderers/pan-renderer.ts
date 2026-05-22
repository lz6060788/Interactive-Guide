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

    this.fromEl = context.fromNodeEl
    this.fromEl.className = 'transition-pan-from'
    this.fromEl.style.position = 'absolute'
    this.fromEl.style.inset = '0'
    this.fromEl.style.width = '100%'
    this.fromEl.style.height = '100%'
    this.fromEl.style.display = 'block'
    this.fromEl.style.overflow = 'hidden'
    this.fromEl.style.opacity = '1'

    this.toEl = context.toNodeEl
    this.toEl.className = 'transition-pan-to'
    this.toEl.style.position = 'absolute'
    this.toEl.style.inset = '0'
    this.toEl.style.width = '100%'
    this.toEl.style.height = '100%'
    this.toEl.style.display = 'block'
    this.toEl.style.overflow = 'hidden'
    this.toEl.style.opacity = '1'

    // Apply initial offset based on direction
    const offset = this.calculateOffset(context, this.config.direction)

    this.containerEl.appendChild(this.fromEl)
    this.containerEl.appendChild(this.toEl)
    context.container.appendChild(this.containerEl)

    // Position the incoming node just outside the viewport on the opposite side,
    // so both nodes travel in the same direction during the pan.
    this.toEl.style.transform = `translate(${offset.x}px, ${offset.y}px)`
    this.toEl.style.transition = 'none'
  }

  applyAnimation(progress: number): void {
    if (!this.fromEl || !this.toEl || !this.config) return

    const offset = this.calculateOffsetFromProgress(this.fromEl, this.toEl, this.config.direction, progress)

    this.fromEl.style.transform = `translate(${offset.fromX}px, ${offset.fromY}px)`
    this.toEl.style.transform = `translate(${offset.toX}px, ${offset.toY}px)`
  }

  renderCleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl)
    }
    this.containerEl = null
    this.fromEl = null
    this.toEl = null
    this.config = null
    this.styleEl = null
  }

  private calculateOffset(context: TransitionContext, direction: string): { x: number, y: number } {
    const containerRect = context.container.getBoundingClientRect()
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height
    switch (direction) {
      case 'left': return { x: containerWidth, y: 0 }
      case 'right': return { x: -containerWidth, y: 0 }
      case 'up': return { x: 0, y: containerHeight }
      case 'down': return { x: 0, y: -containerHeight }
      default: return { x: 0, y: 0 }
    }
  }

  private calculateOffsetFromProgress(
    fromEl: HTMLElement, toEl: HTMLElement, direction: string, progress: number
  ): { fromX: number, fromY: number, toX: number, toY: number } {
    const fromRect = fromEl.getBoundingClientRect()
    const containerWidth = fromRect.width
    const containerHeight = fromRect.height

    let fromX = 0, fromY = 0, toX = 0, toY = 0

    switch (direction) {
      case 'left':
        fromX = -containerWidth * progress
        toX = containerWidth - containerWidth * progress
        break
      case 'right':
        fromX = containerWidth * progress
        toX = -containerWidth + containerWidth * progress
        break
      case 'up':
        fromY = -containerHeight * progress
        toY = containerHeight - containerHeight * progress
        break
      case 'down':
        fromY = containerHeight * progress
        toY = -containerHeight + containerHeight * progress
        break
    }

    return { fromX, fromY, toX, toY }
  }
}
