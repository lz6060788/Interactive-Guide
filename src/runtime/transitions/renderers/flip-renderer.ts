import type { TransitionContext, TransitionRenderer, FlipTransitionConfig } from '../transition-interface.js'

const FLIP_CSS = `
  .transition-flip-container { position: absolute; inset: 0; perspective: 1000px; overflow: hidden; }
  .transition-flip-scene { position: absolute; inset: 0; transform-style: preserve-3d; will-change: transform; }
  .transition-flip-from { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .transition-flip-to { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
`

export class FlipRenderer implements TransitionRenderer {
  readonly transitionType = 'flip' as const

  private containerEl: HTMLElement | null = null
  private sceneEl: HTMLElement | null = null
  private fromEl: HTMLElement | null = null
  private toEl: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null
  private config: FlipTransitionConfig | null = null

  renderSetup(context: TransitionContext): void {
    // Store config for later use
    this.config = context.config as FlipTransitionConfig

    if (!document.getElementById('transition-flip-styles')) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'transition-flip-styles'
      this.styleEl.textContent = FLIP_CSS
      document.head.appendChild(this.styleEl)
    }

    const isHorizontal = this.config.direction === 'horizontal'

    // Container with perspective
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'transition-flip-container'

    // Scene element for 3D transforms
    this.sceneEl = document.createElement('div')
    this.sceneEl.className = 'transition-flip-scene'

    // From element (front face)
    this.fromEl = context.fromNodeEl.cloneNode(true) as HTMLElement
    this.fromEl.className = 'transition-flip-from'
    this.fromEl.style.position = 'absolute'
    this.fromEl.style.inset = '0'
    this.fromEl.style.width = '100%'
    this.fromEl.style.height = '100%'
    this.fromEl.style.display = 'block'
    this.fromEl.style.overflow = 'hidden'
    this.fromEl.style.opacity = '1'

    // To element (back face)
    this.toEl = context.toNodeEl.cloneNode(true) as HTMLElement
    this.toEl.className = 'transition-flip-to'
    this.toEl.style.position = 'absolute'
    this.toEl.style.inset = '0'
    this.toEl.style.width = '100%'
    this.toEl.style.height = '100%'
    this.toEl.style.display = 'block'
    this.toEl.style.overflow = 'hidden'
    this.toEl.style.opacity = '1'

    this.sceneEl.appendChild(this.fromEl)
    this.sceneEl.appendChild(this.toEl)
    this.containerEl.appendChild(this.sceneEl)
    context.container.appendChild(this.containerEl)

    const axis = isHorizontal ? 'Y' : 'X'
    this.fromEl.style.transform = `rotate${axis}(0deg)`
    this.toEl.style.transform = `rotate${axis}(180deg)`
    this.sceneEl.style.transform = `rotate${axis}(0deg)`
    this.sceneEl.style.transition = 'none'
  }

  applyAnimation(progress: number): void {
    if (!this.sceneEl || !this.fromEl || !this.toEl || !this.config) return

    const isHorizontal = this.config.direction === 'horizontal'
    const axis = isHorizontal ? 'Y' : 'X'
    const maxAngle = 180

    const rotateAngle = progress * maxAngle
    this.sceneEl.style.transform = `rotate${axis}(${rotateAngle}deg)`
  }

  renderCleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl)
    }
    this.containerEl = null
    this.sceneEl = null
    this.fromEl = null
    this.toEl = null
    this.config = null
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl)
      this.styleEl = null
    }
  }
}
