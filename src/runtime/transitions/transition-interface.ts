// Builtin transition types
export type BuiltinTransitionType = 'pan' | 'flip' | 'zoom'

// Easing functions
export type EasingType = 'ease-in-out' | 'ease-in' | 'ease-out' | 'linear'

export interface NormalizedPoint {
  x: number
  y: number
}

export interface ZoomFocusQuad {
  topLeft: NormalizedPoint
  topRight: NormalizedPoint
  bottomRight: NormalizedPoint
  bottomLeft: NormalizedPoint
}

// Pan transition config
export interface PanTransitionConfig {
  type: 'pan'
  direction: 'left' | 'right' | 'up' | 'down'
  duration: number        // ms, default 600
  easing: EasingType      // default 'ease-in-out'
}

// Flip transition config
export interface FlipTransitionConfig {
  type: 'flip'
  direction: 'horizontal' | 'vertical'  // default 'horizontal'
  flipStyle: 'fade' | 'cut' | 'curl'   // default 'fade'
  duration: number
  easing: EasingType
}

// Zoom transition config
export interface ZoomTransitionConfig {
  type: 'zoom'
  direction: 'in' | 'out'
  scale: number           // default 1.5
  centerX: number        // 0-1, default hotspot x
  centerY: number        // 0-1, default hotspot y
  focusMode?: 'center' | 'quad'
  focusQuad?: ZoomFocusQuad
  duration: number
  easing: EasingType
}

// Union type for all builtin transition configs
export type BuiltinTransitionConfig = PanTransitionConfig | FlipTransitionConfig | ZoomTransitionConfig

export type TransitionPlaybackDirection = 'forward' | 'backward'

// Context passed to transitions and renderers
export interface TransitionContext {
  container: HTMLElement
  fromNodeEl: HTMLElement
  toNodeEl: HTMLElement
  hotspot: { x: number, y: number }  // normalized 0-1
  config: BuiltinTransitionConfig
  playbackDirection?: TransitionPlaybackDirection
}

// Transition logic interface (pure computation, no DOM)
export interface Transition {
  readonly type: BuiltinTransitionType
  play(context: TransitionContext): Promise<void>
  abort(): void
}

// TransitionRenderer interface (pure DOM operations)
export interface TransitionRenderer {
  readonly transitionType: BuiltinTransitionType
  renderSetup(context: TransitionContext): void
  applyAnimation(progress: number): void  // 0-1
  renderCleanup(): void
}

// Default config values
export const DEFAULT_PAN_CONFIG: Partial<PanTransitionConfig> = {
  duration: 600,
  easing: 'ease-in-out',
}

export const DEFAULT_FLIP_CONFIG: Partial<FlipTransitionConfig> = {
  direction: 'horizontal',
  flipStyle: 'fade',
  duration: 600,
  easing: 'ease-in-out',
}

export const DEFAULT_ZOOM_CONFIG: Partial<ZoomTransitionConfig> = {
  direction: 'in',
  scale: 1.5,
  focusMode: 'center',
  duration: 600,
  easing: 'ease-in-out',
}
