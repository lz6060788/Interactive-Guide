/**
 * editor-theme — visual design tokens for the admin workbench.
 *
 * These tokens are deliberately separated from PROJECT_DEFAULTS so that
 * business defaults (e.g. zoom range) are never entangled with visual style.
 *
 * Design parameters (per docs/plans/2026-06-29 §8.6):
 *   DESIGN_VARIANCE  = 6
 *   MOTION_INTENSITY = 4
 *   VISUAL_DENSITY   = 5
 */
export const EDITOR_THEME = {
  design: {
    variance: 6,
    motion: 4,
    density: 5,
  },
  color: {
    bg: '#0e1116',
    surface: '#161a22',
    surfaceAlt: '#1d2230',
    border: '#262d3a',
    text: '#e6e8ee',
    textMuted: '#8a93a4',
    accent: '#3b82f6',
    accentMuted: '#1d4ed8',
    danger: '#ef4444',
    success: '#10b981',
    warning: '#f59e0b',
  },
  radius: {
    container: 10,
    input: 8,
    chip: 6,
  },
  shadow: {
    floating: '0 8px 24px rgba(0, 0, 0, 0.32)',
    drag: '0 12px 32px rgba(0, 0, 0, 0.42)',
  },
  font: {
    sans: '"Geist", -apple-system, "Helvetica Neue", "Microsoft YaHei", sans-serif',
    mono: '"Geist Mono", "JetBrains Mono", ui-monospace, monospace',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  motion: {
    durationShort: 160,
    durationMedium: 200,
    durationLong: 240,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const

export type EditorTheme = typeof EDITOR_THEME
