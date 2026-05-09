import { createSystem, defaultConfig } from '@chakra-ui/react'

// Note: 'bg' and 'border' collide with Chakra v3 defaultConfig built-in tokens.
// We use 'base' and 'border-default' to avoid the conflict.
export const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      colors: {
        base: { value: '#0a0b0f' },
        surface: { value: '#12131a' },
        'surface-raised': { value: '#1a1b23' },
        'surface-overlay': { value: '#21222d' },
        'border-default': { value: '#2a2d3a' },
        'border-subtle': { value: '#1e2030' },
        'text-primary': { value: '#e4e4e7' },
        'text-secondary': { value: '#8b8fa3' },
        'text-tertiary': { value: '#5c5f77' },
        brand: { value: '#6366f1' },
        'brand-hover': { value: '#818cf8' },
        'brand-subtle': { value: 'rgba(99, 102, 241, 0.12)' },
        success: { value: '#22c55e' },
        'success-subtle': { value: 'rgba(34, 197, 94, 0.12)' },
        warning: { value: '#f59e0b' },
        'warning-subtle': { value: 'rgba(245, 158, 11, 0.12)' },
        error: { value: '#ef4444' },
        'error-subtle': { value: 'rgba(239, 68, 68, 0.12)' },
        info: { value: '#3b82f6' },
        'info-subtle': { value: 'rgba(59, 130, 246, 0.12)' },
      },
      fonts: {
        body: {
          value:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        mono: {
          value: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        },
      },
      radii: {
        sm: { value: '4px' },
        md: { value: '6px' },
        lg: { value: '8px' },
      },
      shadows: {
        sm: { value: '0 1px 3px rgba(0, 0, 0, 0.3)' },
        md: { value: '0 4px 16px rgba(0, 0, 0, 0.4)' },
        lg: { value: '0 8px 32px rgba(0, 0, 0, 0.5)' },
      },
    },
  },
})
