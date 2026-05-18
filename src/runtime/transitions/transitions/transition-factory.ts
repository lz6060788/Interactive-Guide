import type { Transition, BuiltinTransitionType, BuiltinTransitionConfig } from '../transition-interface.js'
import { PanTransition } from './pan-transition.js'
import { FlipTransition } from './flip-transition.js'
import { ZoomTransition } from './zoom-transition.js'

export function createTransition(type: BuiltinTransitionType, _config: BuiltinTransitionConfig): Transition {
  switch (type) {
    case 'pan':
      return new PanTransition()
    case 'flip':
      return new FlipTransition()
    case 'zoom':
      return new ZoomTransition()
    default:
      throw new Error(`Unknown transition type: ${type}`)
  }
}