import type { Transition, TransitionContext, ZoomTransitionConfig, EasingType } from '../transition-interface.js'
import { createRenderer } from '../renderers/renderer-factory.js'

function getEasing(easing: EasingType): (t: number) => number {
  switch (easing) {
    case 'ease-in': return t => t * t
    case 'ease-out': return t => t * (2 - t)
    case 'linear': return t => t
    case 'ease-in-out':
    default: return t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }
}

export class ZoomTransition implements Transition {
  readonly type = 'zoom' as const

  private aborted = false
  private animationId: number | null = null

  async play(context: TransitionContext): Promise<void> {
    const config = context.config as ZoomTransitionConfig
    const duration = config.duration ?? 600
    const easingFn = getEasing(config.easing ?? 'ease-in-out')

    const renderer = createRenderer('zoom')
    renderer.renderSetup(context)

    return new Promise((resolve) => {
      const startTime = performance.now()

      const animate = (currentTime: number) => {
        if (this.aborted) {
          renderer.renderCleanup()
          resolve()
          return
        }

        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const easedProgress = easingFn(progress)

        renderer.applyAnimation(easedProgress)

        if (progress < 1) {
          this.animationId = requestAnimationFrame(animate)
        } else {
          resolve()
        }
      }

      this.animationId = requestAnimationFrame(animate)
    })
  }

  abort(): void {
    this.aborted = true
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
}
