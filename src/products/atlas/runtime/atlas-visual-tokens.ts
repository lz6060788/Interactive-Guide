export const ATLAS_MARKER_SIZE_PX = 21
export const ATLAS_CALLOUT_GAP_PX = 6
export const ATLAS_HOTSPOT_MIN_WIDTH_PX = 80
export const ATLAS_ITEM_CHIP_MIN_WIDTH_PX = 88
export const ATLAS_ITEM_CHIP_MAX_WIDTH_PX = 240
export const ATLAS_CHIP_HEIGHT_PX = 36
export const ATLAS_CHIP_RADIUS_PX = 30
export const ATLAS_CHIP_PADDING = '8px 12px'
export const ATLAS_CHIP_FONT_FAMILY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
export const ATLAS_CHIP_FONT_SIZE_PX = 16
export const ATLAS_CHIP_LINE_HEIGHT_PX = 20
export const ATLAS_CHIP_FONT_WEIGHT = 600
export const ATLAS_CHIP_TEXT = 'rgba(0, 0, 0, 0.84)'
export const ATLAS_CHIP_BG = 'rgba(255, 255, 255, 0.8)'
export const ATLAS_CHIP_BORDER = '1px solid rgba(255, 255, 255, 0.36)'
export const ATLAS_CHIP_ACTIVE_BG = '#3366FF'
export const ATLAS_CHIP_SHADOW = '0 8px 24px rgba(0, 0, 0, 0.08)'
export const ATLAS_DRAWER_GAP_PX = 14
export const ATLAS_DRAWER_PADDING = '14px 16px 18px'
export const ATLAS_DRAWER_TOP_RADIUS_PX = 8
export const ATLAS_DRAWER_BG = 'linear-gradient(360deg, #F5F5F5 0%, rgba(255, 255, 255, 0.64) 100%)'
export const ATLAS_DRAWER_BACKDROP_BLUR = 'blur(6px)'
export const ATLAS_DRAWER_SHADOW = '0 -10px 36px rgba(15, 23, 42, 0.12)'
export const ATLAS_DRAWER_TRANSITION_MS = 280
export const ATLAS_DRAWER_OPACITY_MS = 220
export const ATLAS_DRAWER_CARD_WIDTH_PX = 260
export const ATLAS_DRAWER_CARD_MIN_HEIGHT_PX = 108
export const ATLAS_DRAWER_CARD_PADDING = '14px 16px'
export const ATLAS_DRAWER_CARD_RADIUS_PX = 12
export const ATLAS_DRAWER_CARD_GAP_PX = 12
export const ATLAS_DRAWER_CARD_BORDER = '1px solid rgba(15, 23, 42, 0.08)'
export const ATLAS_DRAWER_CARD_ACTIVE_BORDER = '2px solid #3366FF'
export const ATLAS_DRAWER_CARD_ACTIVE_BG = 'rgba(51, 102, 255, 0.10)'
export const ATLAS_DRAWER_SCROLL_SETTLE_MS = 140
export const ATLAS_DRAWER_SCROLL_LOCK_MS = 420
export const ATLAS_MARKER_ANIMATION = 'atlas-marker-breathe 2.8s ease-in-out infinite'
export const ATLAS_BOTTOM_HINT_GRADIENT =
  'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 100%)'
export const ATLAS_MARKER_CLASSIC_SVG =
  '<svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10.5" cy="10.5" r="10.25" fill="white" fill-opacity="0.1" stroke="white" stroke-width="0.5"/><circle cx="10.5" cy="10.5" r="4.5" fill="white"/></svg>'
export const ATLAS_MARKER_SELECTED_SVG =
  '<svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10.5" cy="10.5" r="10.25" fill="#FF2436" fill-opacity="0.1" stroke="#FF2436" stroke-width="0.5"/><circle cx="10.5" cy="10.5" r="5.5" fill="#FF2436" stroke="white" stroke-width="1"/></svg>'

const STYLE_ID = 'atlas-visual-tokens'

export function ensureAtlasVisualStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes atlas-marker-breathe {
      0%, 100% { transform: scale(1); opacity: 0.96; }
      50% { transform: scale(1.06); opacity: 1; }
    }

    [data-testid="atlas-card-drawer-list"] {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }

    [data-testid="atlas-card-drawer-list"]::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
  `
  doc.head?.appendChild(style)
}

export function getAtlasMarkerSvg(active: boolean): string {
  return active ? ATLAS_MARKER_SELECTED_SVG : ATLAS_MARKER_CLASSIC_SVG
}

export function getAtlasChipStyle(active: boolean, minWidthPx: number, maxWidthPx?: number): Partial<CSSStyleDeclaration> {
  return {
    minWidth: `${minWidthPx}px`,
    maxWidth: maxWidthPx ? `${maxWidthPx}px` : '',
    height: `${ATLAS_CHIP_HEIGHT_PX}px`,
    padding: ATLAS_CHIP_PADDING,
    borderRadius: `${ATLAS_CHIP_RADIUS_PX}px`,
    border: active ? 'none' : ATLAS_CHIP_BORDER,
    background: active ? ATLAS_CHIP_ACTIVE_BG : ATLAS_CHIP_BG,
    color: active ? '#FFFFFF' : ATLAS_CHIP_TEXT,
    boxShadow: ATLAS_CHIP_SHADOW,
    fontFamily: ATLAS_CHIP_FONT_FAMILY,
    fontSize: `${ATLAS_CHIP_FONT_SIZE_PX}px`,
    lineHeight: `${ATLAS_CHIP_LINE_HEIGHT_PX}px`,
    fontWeight: `${ATLAS_CHIP_FONT_WEIGHT}`,
  }
}

export function getAtlasDrawerCardStyle(active: boolean): Partial<CSSStyleDeclaration> {
  return {
    width: `${ATLAS_DRAWER_CARD_WIDTH_PX}px`,
    minHeight: `${ATLAS_DRAWER_CARD_MIN_HEIGHT_PX}px`,
    padding: ATLAS_DRAWER_CARD_PADDING,
    borderRadius: `${ATLAS_DRAWER_CARD_RADIUS_PX}px`,
    border: active ? ATLAS_DRAWER_CARD_ACTIVE_BORDER : ATLAS_DRAWER_CARD_BORDER,
    background: active ? ATLAS_DRAWER_CARD_ACTIVE_BG : '#FFFFFF',
    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)',
  }
}
