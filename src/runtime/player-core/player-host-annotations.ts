import { projectSurfacePoint, type SurfaceCameraLayout } from './surface-camera.js'
import { SURFACE_MARKER_SVG, SURFACE_MARKER_SELECTED_SVG } from './player-host-chrome-constants.js'

export function ensureHotspotAnimationStyle(): void {
  const styleId = 'hotspot-pulse-animation'
  if (document.getElementById(styleId)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes annotation-marker-breathe {
      0%, 100% {
        transform: scale(1);
        opacity: 0.96;
      }
      50% {
        transform: scale(1.06);
        opacity: 1;
      }
    }
  `
  document.head.appendChild(style)
}

export function createAnchoredAnnotationRoot(normalizedX: number, normalizedY: number): HTMLDivElement {
  const root = document.createElement('div')
  root.style.position = 'absolute'
  root.style.left = `${normalizedX * 100}%`
  root.style.top = `${normalizedY * 100}%`
  root.style.transform = 'translate(-50%, -50%)'
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.style.alignItems = 'center'
  root.style.justifyContent = 'center'
  root.style.gap = '6px'
  root.style.pointerEvents = 'none'
  root.style.zIndex = '2'
  root.dataset.surfaceAnchorX = String(normalizedX)
  root.dataset.surfaceAnchorY = String(normalizedY)
  return root
}

export function createAnnotationMarker(selected: boolean): HTMLSpanElement {
  const marker = document.createElement('span')
  marker.style.display = 'inline-flex'
  marker.style.alignItems = 'center'
  marker.style.justifyContent = 'center'
  marker.style.width = '21px'
  marker.style.height = '21px'
  marker.style.pointerEvents = 'none'
  marker.style.willChange = 'transform, opacity'
  marker.style.animation = 'annotation-marker-breathe 2.8s ease-in-out infinite'
  marker.innerHTML = selected ? SURFACE_MARKER_SELECTED_SVG : SURFACE_MARKER_SVG
  return marker
}

export function appendMarkerAndButton(
  root: HTMLDivElement,
  button: HTMLButtonElement,
  marker: HTMLSpanElement,
  config: { visible: boolean, position: 'top' | 'bottom', gapPx: number },
): void {
  root.style.gap = `${config.gapPx}px`
  if (config.visible && config.position === 'top') {
    root.appendChild(marker)
  }
  root.appendChild(button)
  if (config.visible && config.position === 'bottom') {
    root.appendChild(marker)
  }
}

export function applyAnnotationChipStyles(button: HTMLButtonElement, selected: boolean): void {
  button.style.display = 'flex'
  button.style.flexDirection = 'row'
  button.style.alignItems = 'center'
  button.style.justifyContent = 'center'
  button.style.minWidth = '80px'
  button.style.height = '36px'
  button.style.padding = '8px 12px'
  button.style.borderRadius = '30px'
  button.style.border = selected ? 'none' : '1px solid rgba(255, 255, 255, 0.36)'
  button.style.background = selected ? '#3366FF' : 'rgba(255, 255, 255, 0.8)'
  button.style.color = selected ? '#FFFFFF' : 'rgba(0, 0, 0, 0.84)'
  button.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.08)'
  button.style.cursor = 'pointer'
  button.style.pointerEvents = 'auto'
  button.style.whiteSpace = 'nowrap'
  button.style.zIndex = '1'
}

export function resolveMarkerConfig(styleText?: string): { visible: boolean, position: 'top' | 'bottom', gapPx: number } {
  const markerDisplay = styleText?.match(/--hotspot-marker-display\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase()
  const markerPosition = styleText?.match(/--hotspot-marker-position\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase()
  const markerGapRaw = styleText?.match(/--hotspot-marker-gap\s*:\s*([^;]+)/i)?.[1]?.trim().toLowerCase() ?? ''
  const markerGapParsed = Number.parseFloat(markerGapRaw.replace(/px$/i, '').trim())
  return {
    visible: markerDisplay !== 'none',
    position: markerPosition === 'bottom' ? 'bottom' : 'top',
    gapPx: Number.isFinite(markerGapParsed) ? Math.max(markerGapParsed, 0) : 6,
  }
}

export function positionSurfaceAnnotations(
  hotspots: HTMLElement,
  layout: SurfaceCameraLayout,
): void {
  hotspots.querySelectorAll<HTMLElement>('[data-surface-anchor-x]').forEach(el => {
    const x = Number(el.dataset.surfaceAnchorX ?? '0')
    const y = Number(el.dataset.surfaceAnchorY ?? '0')
    const point = projectSurfacePoint({ x, y }, layout)
    el.style.left = `${point.x}px`
    el.style.top = `${point.y}px`
    el.style.transform = 'translate(-50%, -50%)'
  })
}
