/**
 * Button recipe for the admin workbench.
 *
 * Overrides the default Chakra button recipe with six project-specific
 * variants: primary / secondary / ghost / brand / accent / danger. The
 * shape mirrors the legacy `Button.tsx` (deleted in Phase 3) so existing
 * call sites can be migrated with a straight `<Button variant="brand">`
 * substitution without changing the visual language.
 *
 * Token references resolve against the Cartographer's Desk palette in
 * `theme/system.ts` (e.g. `ink` → `--ig-colors-ink`).
 *
 * The `declare module '@chakra-ui/react'` block at the bottom of this
 * file widens Chakra's `ButtonProps` / `ButtonBaseProps` / `IconButtonProps`
 * so TypeScript accepts the custom variant values; Chakra's built-in
 * types otherwise restrict `variant` to `solid | ghost | outline | subtle
 * | surface | plain`.
 */
import { defineRecipe, type ConditionalValue } from '@chakra-ui/react'

export const buttonRecipe = defineRecipe({
  className: 'ig-button',
  base: {
    display: 'inline-flex',
    appearance: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.5',
    borderRadius: 'sm',
    fontWeight: 500,
    letterSpacing: '0.01em',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
    borderWidth: '1px',
    borderColor: 'transparent',
    transitionProperty: 'background, color, border-color, box-shadow, transform',
    transitionDuration: 'fast',
    transitionTimingFunction: 'standard',
    _active: {
      transform: 'translateY(0.5px)',
    },
    _disabled: {
      cursor: 'not-allowed',
      opacity: 0.45,
    },
  },
  variants: {
    variant: {
      primary: {
        bg: 'ink',
        color: 'ink.inverse',
        borderColor: 'ink',
        _hover: { bg: 'ink.muted', borderColor: 'ink.muted' },
        _active: { bg: 'ink' },
      },
      secondary: {
        bg: 'paper.raised',
        color: 'ink',
        borderColor: 'rule.strong',
        _hover: {
          bg: 'paper.overlay',
          borderColor: 'ink.faint',
          boxShadow: 'xs',
        },
        _active: { bg: 'paper.sunken' },
      },
      ghost: {
        bg: 'transparent',
        color: 'ink.muted',
        borderColor: 'transparent',
        _hover: { bg: 'paper.sunken', color: 'ink' },
        _active: { bg: 'paper.sunken', color: 'ink' },
      },
      brand: {
        bg: 'brand',
        color: 'paper.raised',
        borderColor: 'brand',
        _hover: {
          bg: 'brand.hover',
          borderColor: 'brand.hover',
          boxShadow: '0 2px 6px rgba(181, 67, 24, 0.18)',
        },
        _active: { bg: 'brand', boxShadow: 'none' },
      },
      accent: {
        bg: 'accent',
        color: 'paper.raised',
        borderColor: 'accent',
        _hover: {
          bg: 'accent.hover',
          borderColor: 'accent.hover',
          boxShadow: '0 2px 6px rgba(92, 107, 58, 0.18)',
        },
        _active: { bg: 'accent' },
      },
      danger: {
        bg: 'transparent',
        color: 'state.error',
        borderColor: 'state.error',
        _hover: { bg: 'state.error.muted' },
        _active: { bg: 'state.error.muted' },
      },
    },
    size: {
      sm: {
        h: '7',
        px: '2.5',
        fontSize: '12px',
        gap: '1.5',
      },
      md: {
        h: '8',
        px: '3.5',
        fontSize: '13px',
        gap: '1.5',
      },
    },
  },
  defaultVariants: {
    variant: 'secondary',
    size: 'md',
  },
})

declare module '@chakra-ui/react' {
  type IgButtonVariant = 'primary' | 'secondary' | 'ghost' | 'brand' | 'accent' | 'danger'
  type IgButtonSize = 'sm' | 'md'

  interface ButtonBaseProps {
    variant?: ConditionalValue<IgButtonVariant>
    size?: ConditionalValue<IgButtonSize>
  }

  interface ButtonProps {
    variant?: ConditionalValue<IgButtonVariant>
    size?: ConditionalValue<IgButtonSize>
  }

  interface IconButtonProps {
    variant?: ConditionalValue<IgButtonVariant>
    size?: ConditionalValue<IgButtonSize>
  }
}
