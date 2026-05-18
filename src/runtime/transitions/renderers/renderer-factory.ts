import type { TransitionRenderer, BuiltinTransitionType } from '../transition-interface.js'
import { PanRenderer } from './pan-renderer.js'
import { FlipRenderer } from './flip-renderer.js'
import { ZoomRenderer } from './zoom-renderer.js'

export function createRenderer(type: BuiltinTransitionType): TransitionRenderer {
  switch (type) {
    case 'pan':
      return new PanRenderer()
    case 'flip':
      return new FlipRenderer()
    case 'zoom':
      return new ZoomRenderer()
    default:
      throw new Error(`Unknown transition renderer type: ${type}`)
  }
}