/**
 * Design tokens for the admin workbench.
 *
 * Aesthetic: Cartographer's Desk (light, modern, engineering-instrument feel).
 * All color/space/radius/shadow/typography values flow from here.
 * Never hardcode hex / px / weight in business components — go through these tokens.
 */
import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'
import { buttonRecipe } from './button-recipe'

const customConfig = defineConfig({
  cssVarsPrefix: 'ig',
  theme: {
    tokens: {
      colors: {
        // Surfaces
        paper: { value: '#F6F4EE' },
        'paper.raised': { value: '#FBFAF6' },
        'paper.overlay': { value: '#FFFFFF' },
        'paper.sunken': { value: '#EDEAE2' },

        // Rules / dividers
        rule: { value: '#D6CFBC' },
        'rule.strong': { value: '#C5BDA6' },

        // Text
        ink: { value: '#1A1F2C' },
        'ink.muted': { value: '#5C6172' },
        'ink.faint': { value: '#8A8E99' },
        'ink.inverse': { value: '#FBFAF6' },

        // Atlas brand (oxidized iron)
        brand: { value: '#B54318' },
        'brand.muted': { value: 'rgba(181, 67, 24, 0.10)' },
        'brand.hover': { value: '#9A3614' },
        'brand.subtle': { value: 'rgba(181, 67, 24, 0.06)' },

        // Catalog accent (cartographic olive)
        accent: { value: '#5C6B3A' },
        'accent.muted': { value: 'rgba(92, 107, 58, 0.10)' },
        'accent.hover': { value: '#475529' },
        'accent.subtle': { value: 'rgba(92, 107, 58, 0.06)' },

        // State
        'state.warn': { value: '#B5781A' },
        'state.warn.muted': { value: 'rgba(181, 120, 26, 0.10)' },
        'state.error': { value: '#A33232' },
        'state.error.muted': { value: 'rgba(163, 50, 50, 0.10)' },
        'state.ok': { value: '#3F6B3A' },
        'state.ok.muted': { value: 'rgba(63, 107, 58, 0.10)' },
      },
      fonts: {
        body: {
          value:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        heading: {
          value:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
        },
        mono: {
          value:
            "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', Consolas, monospace",
        },
      },
      radii: {
        xs: { value: '2px' },
        sm: { value: '4px' },
        md: { value: '6px' },
        lg: { value: '10px' },
        pill: { value: '999px' },
      },
      spacing: {
        '0.5': { value: '2px' },
        1: { value: '4px' },
        2: { value: '8px' },
        3: { value: '12px' },
        4: { value: '16px' },
        5: { value: '20px' },
        6: { value: '24px' },
        8: { value: '32px' },
        10: { value: '40px' },
        12: { value: '48px' },
        16: { value: '64px' },
      },
      shadows: {
        xs: { value: '0 1px 2px rgba(26, 31, 44, 0.06)' },
        sm: { value: '0 2px 4px rgba(26, 31, 44, 0.08)' },
        md: { value: '0 4px 12px rgba(26, 31, 44, 0.10)' },
        lg: { value: '0 12px 32px rgba(26, 31, 44, 0.14)' },
      },
      durations: {
        fast: { value: '150ms' },
        base: { value: '200ms' },
        slow: { value: '300ms' },
      },
      easings: {
        standard: { value: 'cubic-bezier(0.4, 0, 0.2, 1)' },
        emphasized: { value: 'cubic-bezier(0.2, 0, 0, 1)' },
      },
      zIndex: {
        base: { value: '0' },
        sticky: { value: '10' },
        dropdown: { value: '100' },
        overlay: { value: '500' },
        modal: { value: '1000' },
        toast: { value: '2000' },
      },
    },
    semanticTokens: {
      colors: {
        bg: { value: '{colors.paper}' },
        'bg.raised': { value: '{colors.paper.raised}' },
        'bg.overlay': { value: '{colors.paper.overlay}' },
        'bg.sunken': { value: '{colors.paper.sunken}' },
        fg: { value: '{colors.ink}' },
        'fg.muted': { value: '{colors.ink.muted}' },
        'fg.faint': { value: '{colors.ink.faint}' },
        border: { value: '{colors.rule}' },
        'border.strong': { value: '{colors.rule.strong}' },
      },
    },
    recipes: {
      button: buttonRecipe,
    },
  },
})

export const system = createSystem(defaultConfig, customConfig)
