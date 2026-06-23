import type { PlayerHostRefs } from './player-host.js'

export interface ChromeElements {
  chromeRoot: HTMLElement
  headerBackdropEl: HTMLElement
  backControlEl: HTMLElement
  backButtonEl: HTMLElement
  headerCenterEl: HTMLElement
  packageTitleEl: HTMLElement
  infoButtonEl: HTMLElement
  shareButtonEl: HTMLElement
  bottomSheetEl: HTMLElement
  bottomSheetHeaderEl: HTMLElement
  bottomSheetBreadcrumbEl: HTMLElement
  bottomSheetActionsEl: HTMLElement
  bottomSheetResetButtonEl: HTMLElement
  bottomSheetCloseButtonEl: HTMLElement
  bottomSheetCardsEl: HTMLElement
  infoSheetBackdropEl: HTMLElement
  infoSheetEl: HTMLElement
  infoSheetHeaderEl: HTMLElement
  infoSheetTitleEl: HTMLElement
  infoSheetCloseButtonEl: HTMLElement
  infoSheetContentEl: HTMLElement
  dragHintBackdropEl: HTMLElement
  dragHintEl: HTMLElement
}

export function ensureChromeAnimationStyle(): void {
  const styleId = 'player-host-chrome-animations'
  if (document.getElementById(styleId)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes drag-hint-arrow-glow {
      0%, 100% {
        opacity: 0.28;
        transform: translateX(0);
        text-shadow: none;
      }
      35% {
        opacity: 0.52;
        transform: translateX(0);
        text-shadow: none;
      }
      55% {
        opacity: 1;
        transform: translateX(var(--drag-hint-shift, 1px));
        text-shadow: 0 0 10px rgba(255, 255, 255, 0.7);
      }
      75% {
        opacity: 0.42;
        transform: translateX(0);
        text-shadow: none;
      }
    }
  `
  document.head.appendChild(style)
}

export function applyBaseStyles(
  refs: PlayerHostRefs,
  els: ChromeElements,
  htmlIframeLayer: HTMLElement,
  mountChrome: () => void,
  applyManagedIframeBaseStyle: (iframe: HTMLIFrameElement) => void,
): void {
  const { viewport, stage, container, nodeImage, nodeIframe, video, hotspots } = refs

  Object.assign(viewport.style, {
    position: 'relative',
    overflow: 'hidden',
    background: '#000',
  })

  Object.assign(stage.style, {
    position: 'absolute',
    overflow: 'hidden',
    background: '#000',
  })

  Object.assign(htmlIframeLayer.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '1',
    pointerEvents: 'none',
  })

  mountChrome()

  Object.assign(els.chromeRoot.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    zIndex: '50',
    overflow: 'hidden',
    pointerEvents: 'none',
    fontFamily: '"Noto Sans SC", "Noto Sans S Chinese", "PingFang SC", "Microsoft YaHei", sans-serif',
  })
  els.chromeRoot.style.setProperty('--player-safe-area-top', 'env(safe-area-inset-top, 0px)')
  els.chromeRoot.style.setProperty('--player-header-content-height', '44px')
  els.chromeRoot.style.setProperty('--player-header-backdrop-height', 'calc(var(--player-safe-area-top) + var(--player-header-content-height))')
  els.chromeRoot.style.setProperty('--player-header-control-top', 'calc(var(--player-safe-area-top) + 10px)')
  els.chromeRoot.style.setProperty('--player-back-control-top', 'calc(var(--player-safe-area-top) + 6px)')

  Object.assign(els.headerBackdropEl.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    top: '0',
    height: 'var(--player-header-backdrop-height)',
    display: 'none',
    background: 'rgba(255, 255, 255, 0.96)',
    borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 220ms ease',
    zIndex: '0',
  })

  Object.assign(els.backControlEl.style, {
    position: 'absolute',
    left: '16px',
    top: 'var(--player-back-control-top)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    pointerEvents: 'auto',
    opacity: '0',
    transition: 'opacity 220ms ease',
  })

  Object.assign(els.backButtonEl.style, {
    width: '32px',
    height: '32px',
    minWidth: '32px',
    borderRadius: '0',
    border: 'none',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    cursor: 'pointer',
    pointerEvents: 'auto',
  })
  const backIcon = els.backButtonEl.querySelector('svg')
  if (backIcon) {
    ;(backIcon as SVGElement).style.width = '24px'
    ;(backIcon as SVGElement).style.height = '24px'
    ;(backIcon as SVGElement).style.display = 'block'
  }

  Object.assign(els.headerCenterEl.style, {
    position: 'absolute',
    left: '50%',
    top: 'var(--player-header-control-top)',
    transform: 'translateX(-50%)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    maxWidth: 'calc(100% - 120px)',
    pointerEvents: 'auto',
    opacity: '0',
    transition: 'opacity 220ms ease',
  })

  Object.assign(els.packageTitleEl.style, {
    minHeight: '24px',
    maxWidth: '220px',
    fontStyle: 'normal',
    fontWeight: '700',
    fontSize: '17px',
    lineHeight: '24px',
    color: 'rgba(0, 0, 0, 0.84)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none',
  })

  const topIconButtonStyle = {
    width: '24px',
    height: '24px',
    minWidth: '24px',
    borderRadius: '0',
    border: 'none',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    cursor: 'pointer',
    pointerEvents: 'auto',
  } as const
  Object.assign(els.infoButtonEl.style, topIconButtonStyle)
  Object.assign(els.shareButtonEl.style, {
    ...topIconButtonStyle,
    position: 'absolute',
    right: '16px',
    top: 'var(--player-header-control-top)',
    display: 'none',
    opacity: '0',
    transition: 'opacity 220ms ease',
  })
  for (const iconButton of [els.infoButtonEl, els.shareButtonEl]) {
    const svg = iconButton.querySelector('svg')
    if (svg) {
      ;(svg as SVGElement).style.width = iconButton === els.shareButtonEl ? '24px' : '14px'
      ;(svg as SVGElement).style.height = iconButton === els.shareButtonEl ? '24px' : '14px'
      ;(svg as SVGElement).style.display = 'block'
    }
  }
  Object.assign(els.bottomSheetEl.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: '0',
    display: 'none',
    flexDirection: 'column',
    gap: '14px',
    padding: '14px 16px 18px',
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
    borderBottomLeftRadius: '0',
    borderBottomRightRadius: '0',
    background: 'linear-gradient(360deg, #F5F5F5 0%, rgba(255, 255, 255, 0.64) 100%)',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 -10px 36px rgba(15, 23, 42, 0.12)',
    pointerEvents: 'none',
    opacity: '0',
    transform: 'translateY(calc(100% + 20px))',
    transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease',
    willChange: 'transform, opacity',
    zIndex: '2',
  })
  Object.assign(els.bottomSheetHeaderEl.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  })
  Object.assign(els.bottomSheetBreadcrumbEl.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flex: '1',
    minWidth: '0',
    fontSize: '14px',
    lineHeight: '18px',
    fontWeight: '400',
    color: 'rgba(0, 0, 0, 0.6)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  })
  Object.assign(els.bottomSheetActionsEl.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: '0',
  })
  Object.assign(els.bottomSheetResetButtonEl.style, {
    position: 'absolute',
    right: '16px',
    bottom: '210px',
    width: '32px',
    height: '32px',
    minWidth: '32px',
    border: 'none',
    borderRadius: '6.85714px',
    background: 'rgba(255, 255, 255, 0.8)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    cursor: 'pointer',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'bottom 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease',
    zIndex: '3',
  })
  const sheetBackIcon = els.bottomSheetResetButtonEl.querySelector('svg')
  if (sheetBackIcon) {
    ;(sheetBackIcon as SVGElement).style.width = '16px'
    ;(sheetBackIcon as SVGElement).style.height = '13px'
    ;(sheetBackIcon as SVGElement).style.display = 'block'
  }
  Object.assign(els.bottomSheetCloseButtonEl.style, {
    width: '28px',
    height: '28px',
    minWidth: '28px',
    border: 'none',
    borderRadius: '999px',
    background: 'transparent',
    color: 'rgba(0, 0, 0, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    fontSize: '26px',
    lineHeight: '1',
    cursor: 'pointer',
  })
  Object.assign(els.bottomSheetCardsEl.style, {
    display: 'flex',
    flexDirection: 'row',
    gap: '12px',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollSnapType: 'x proximity',
    paddingBottom: '4px',
    scrollbarWidth: 'none',
    pointerEvents: 'auto',
  })
  Object.assign(els.infoSheetBackdropEl.style, {
    position: 'absolute',
    inset: '0',
    display: 'none',
    background: 'rgba(0, 0, 0, 0.8)',
    opacity: '0',
    transition: 'opacity 220ms ease',
    pointerEvents: 'none',
    zIndex: '2',
  })
  Object.assign(els.infoSheetEl.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: '0',
    display: 'none',
    flexDirection: 'column',
    gap: '16px',
    padding: '18px 22px 24px',
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
    background: '#FFFFFF',
    boxShadow: '0 -10px 36px rgba(15, 23, 42, 0.12)',
    pointerEvents: 'auto',
    opacity: '0',
    transition: 'opacity 220ms ease',
    maxHeight: '50vh',
    overflow: 'hidden',
    boxSizing: 'border-box',
    zIndex: '3',
  })
  Object.assign(els.infoSheetHeaderEl.style, {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '28px',
    flexShrink: '0',
  })
  Object.assign(els.infoSheetTitleEl.style, {
    fontFamily: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
    fontStyle: 'normal',
    fontWeight: '600',
    fontSize: '16px',
    lineHeight: '22px',
    color: 'rgba(0, 0, 0, 0.84)',
    textAlign: 'center',
  })
  Object.assign(els.infoSheetCloseButtonEl.style, {
    position: 'absolute',
    right: '0',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '28px',
    height: '28px',
    minWidth: '28px',
    border: 'none',
    borderRadius: '999px',
    background: 'transparent',
    color: 'rgba(0, 0, 0, 0.36)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    cursor: 'pointer',
    fontSize: '24px',
    lineHeight: '1',
  })
  Object.assign(els.infoSheetContentEl.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    overflowY: 'auto',
    minHeight: '0',
    paddingRight: '2px',
  })

  Object.assign(els.dragHintBackdropEl.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: '0',
    height: '86px',
    display: 'none',
    background: 'linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 100%)',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 220ms ease',
    zIndex: '0',
  })

  Object.assign(els.dragHintEl.style, {
    position: 'absolute',
    left: '50%',
    bottom: '24px',
    transform: 'translateX(-50%)',
    display: 'none',
    fontFamily: '"MiSans", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontStyle: 'normal',
    fontWeight: '500',
    fontSize: '13px',
    lineHeight: '18px',
    textAlign: 'center',
    color: '#FFFFFF',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 220ms ease',
    zIndex: '1',
  })
  els.dragHintEl.innerHTML = [
    '<span data-drag-hint-arrow="left-1" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.28)">&lt;</span>',
    '<span data-drag-hint-arrow="left-2" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.48)">&lt;</span>',
    '<span data-drag-hint-arrow="left-3" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.78)">&lt;</span>',
    '<span style="display:inline-block;padding:0 8px;color:#FFFFFF;letter-spacing:0.2px;">左右滑动查看完整场景</span>',
    '<span data-drag-hint-arrow="right-1" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.78)">&gt;</span>',
    '<span data-drag-hint-arrow="right-2" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.48)">&gt;</span>',
    '<span data-drag-hint-arrow="right-3" style="display:inline-block;min-width:10px;color:rgba(255,255,255,0.28)">&gt;</span>',
  ].join('')
  ensureChromeAnimationStyle()
  const arrowDelayMap: Record<string, string> = {
    'left-3': '0ms',
    'right-1': '0ms',
    'left-2': '180ms',
    'right-2': '180ms',
    'left-1': '360ms',
    'right-3': '360ms',
  }
  const arrowShiftMap: Record<string, string> = {
    'left-1': '-3px',
    'left-2': '-2px',
    'left-3': '-1px',
    'right-1': '1px',
    'right-2': '2px',
    'right-3': '3px',
  }
  Array.from(els.dragHintEl.querySelectorAll<HTMLElement>('[data-drag-hint-arrow]')).forEach(arrowEl => {
    const arrowKey = arrowEl.dataset.dragHintArrow ?? ''
    arrowEl.style.setProperty('--drag-hint-shift', arrowShiftMap[arrowKey] ?? '0px')
    arrowEl.style.animation = `drag-hint-arrow-glow 1.8s ease-in-out ${arrowDelayMap[arrowKey] ?? '0ms'} infinite`
  })

  container.style.position = 'relative'
  container.style.width = '100%'
  container.style.height = '100%'
  container.style.overflow = 'hidden'

  Object.assign(nodeImage.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    background: '#000',
    userSelect: 'none',
    visibility: 'visible',
    opacity: '1',
    pointerEvents: 'auto',
    willChange: 'transform',
  })

  applyManagedIframeBaseStyle(nodeIframe)

  Object.assign(video.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    zIndex: '20',
    opacity: '0',
    pointerEvents: 'none',
  })

  Object.assign(hotspots.style, {
    position: 'absolute',
    zIndex: '10',
    left: '0px',
    top: '0px',
    width: '100%',
    height: '100%',
    opacity: '1',
    pointerEvents: 'none',
    transition: 'opacity 180ms ease',
    willChange: 'transform,left,top,width,height',
  })

  if (htmlIframeLayer.parentElement !== container) {
    htmlIframeLayer.remove()
    container.appendChild(htmlIframeLayer)
  }
  if (nodeIframe.parentElement !== htmlIframeLayer) {
    htmlIframeLayer.appendChild(nodeIframe)
  }
}
