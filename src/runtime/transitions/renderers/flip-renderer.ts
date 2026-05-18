import type { TransitionContext, TransitionRenderer, FlipTransitionConfig } from '../transition-interface.js'

const FLIP_CSS = `
  .transition-flip-container { position: absolute; inset: 0; perspective: 1000px; overflow: hidden; }
  .transition-flip-scene { position: absolute; inset: 0; transform-style: preserve-3d; }
  .transition-flip-from { position: absolute; inset: 0; backface-visibility: hidden; }
  .transition-flip-to { position: absolute; inset: 0; backface-visibility: hidden; }
`

export class FlipRenderer implements TransitionRenderer {
  readonly transitionType = 'flip' as const

  private containerEl: HTMLElement | null = null
  private sceneEl: HTMLElement | null = null
  private fromEl: HTMLElement | null = null
  private toEl: HTMLElement | null = null
  private styleEl: HTMLStyleElement | null = null

  renderSetup(context: TransitionContext): void {
    if (!document.getElementById('transition-flip-styles')) {
      this.styleEl = document.createElement('style')
      this.styleEl.id = 'transition-flip-styles'
      this.styleEl.textContent = FLIP_CSS
      document.head.appendChild(this.styleEl)
    }

    const config = context.config as FlipTransitionConfig
    const isHorizontal = config.direction === 'horizontal'

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
    this.fromEl.style.objectFit = 'contain'

    // To element (back face, initially hidden)
    this.toEl = context.toNodeEl.cloneNode(true) as HTMLElement
    this.toEl.className = 'transition-flip-to'
    this.toEl.style.position = 'absolute'
    this.toEl.style.inset = '0'
    this.toEl.style.width = '100%'
    this.toEl.style.height = '100%'
    this.toEl.style.objectFit = 'contain'
    this.toEl.style.opacity = '0'

    this.sceneEl.appendChild(this.fromEl)
    this.sceneEl.appendChild(this.toEl)
    this.containerEl.appendChild(this.sceneEl)
    context.container.appendChild(this.containerEl)

    // Set initial rotate
    const axis = isHorizontal ? 'Y' : 'X'
    this.sceneEl.style.transform = `rotate${axis}(0deg)`
    this.sceneEl.style.transition = 'none'
  }

  applyAnimation(progress: number): void {
    if (!this.sceneEl || !this.fromEl || !this.toEl) return

    const config = this.getConfig()
    const isHorizontal = config.direction === 'horizontal'
    const axis = isHorizontal ? 'Y' : 'X'
    const maxAngle = 90

    // Rotate scene
    const rotateAngle = progress * maxAngle
    this.sceneEl.style.transform = `rotate${axis}(${rotateAngle}deg)`

    // Fade in toEl as flip progresses (after 50%)
    if (progress > 0.5) {
      const toOpacity = (progress - 0.5) * 2  // 0 to 1 in the second half
      this.toEl!.style.opacity = String(toOpacity)
    }
  }

  renderCleanup(): void {
    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl)
    }
    this.containerEl = null
    this.sceneEl = null
    this.fromEl = null
    this.toEl = null
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl)
      this.styleEl = null
    }
  }

  private getConfig(): FlipTransitionConfig {
    return {
      type: 'flip',
      direction: 'horizontal',
      flipStyle: 'fade',
      duration: 600,
      easing: 'ease-in-out',
    }
  }
}