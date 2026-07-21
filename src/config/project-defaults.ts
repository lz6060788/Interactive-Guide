/**
 * PROJECT_DEFAULTS — single source of truth for business defaults.
 *
 * This module is the only place where generic, project-agnostic defaults
 * (viewport size, zoom range, focus-rect shape, default hint text) live.
 * No component or compiler may duplicate these values. New projects apply
 * these defaults through the domain normalizer (see src/domain/project-normalizer.ts).
 *
 * Rules:
 *   - Only generic, stable, project-agnostic defaults belong here.
 *   - No project name (e.g. "商业航天"), no business labels (e.g. "火箭"), no asset paths.
 *   - Visual tokens (color, spacing, font) live in editor-theme.ts instead.
 */
export const PROJECT_DEFAULTS = {
  viewport: {
    width: 375,
    height: 808,
  },
  panorama: {
    minZoom: 1,
    maxZoom: 4,
    categoryZoom: 3.6,
    focusRect: {
      width: 0.22,
      height: 0.18,
      radius: 12,
      maskOpacity: 0.48,
    },
  },
  products: {
    atlas: {
      hintText: {
        'zh-CN': '拖动或缩放探索全景图',
        'en-US': 'Drag or zoom to explore the panorama',
      },
    },
    catalog: {
      hintText: {
        'zh-CN': '点击或滑动文字查看简介',
        'en-US': 'Tap or swipe through the list to view details',
      },
      viewportAnimationMs: 360,
    },
  },
} as const

export type ProjectDefaults = typeof PROJECT_DEFAULTS
