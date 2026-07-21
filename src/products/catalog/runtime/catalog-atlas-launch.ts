export const CATALOG_ATLAS_LAUNCH_ICON = `
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M1.40978e-05 4.7424L1.42797e-05 0.5824C1.42864e-05 0.427938 0.0613747 0.279802 0.170596 0.170581C0.279817 0.0613594 0.427952 -4.5649e-07 0.582415 -4.49738e-07L4.74241 -2.67898e-07C4.89688 -2.61147e-07 5.04501 0.0613597 5.15423 0.170581C5.26346 0.279802 5.32482 0.427938 5.32482 0.5824C5.32482 0.736862 5.26346 0.884998 5.15423 0.994219C5.04501 1.10344 4.89688 1.1648 4.74241 1.1648L1.16481 1.1648L1.16481 4.7424C1.16481 4.89686 1.10345 5.045 0.994234 5.15422C0.885012 5.26344 0.736876 5.3248 0.582414 5.3248C0.427952 5.3248 0.279816 5.26344 0.170596 5.15422C0.0613744 5.045 1.40911e-05 4.89686 1.40978e-05 4.7424ZM5.54642 10.2888C5.54642 10.1343 5.60777 9.9862 5.717 9.87698C5.82622 9.76776 5.97435 9.7064 6.12881 9.7064L9.70642 9.7064L9.70642 6.1288C9.70642 5.97434 9.76778 5.8262 9.877 5.71698C9.98622 5.60776 10.1344 5.5464 10.2888 5.5464C10.4433 5.5464 10.5914 5.60776 10.7006 5.71698C10.8099 5.8262 10.8712 5.97434 10.8712 6.1288L10.8712 10.2888C10.8712 10.4433 10.8099 10.5914 10.7006 10.7006C10.5914 10.8098 10.4433 10.8712 10.2888 10.8712L6.12881 10.8712C5.97435 10.8712 5.82622 10.8098 5.717 10.7006C5.60777 10.5914 5.54642 10.4433 5.54642 10.2888Z" fill="white"/>
  </svg>
`

interface CatalogAtlasLaunchButtonOptions {
  url?: string
  onLaunch?: (url: string) => void
}

/** Exact reference-product button shared by runtime and editor surfaces. */
export function createCatalogAtlasLaunchButton({
  url,
  onLaunch,
}: CatalogAtlasLaunchButtonOptions): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'panorama-floating-action'
  button.dataset.testid = 'catalog-atlas-launch'
  button.setAttribute('aria-label', '打开独立产物')
  button.title = url ? '打开全景图' : '请先配置 Atlas 完整地址'
  button.innerHTML = CATALOG_ATLAS_LAUNCH_ICON

  Object.assign(button.style, {
    position: 'absolute',
    right: 'clamp(10px, 3.6%, 16px)',
    bottom: 'calc(clamp(10px, 3.6%, 16px) - 4px)',
    width: '16px',
    height: '16px',
    padding: '0',
    border: 'none',
    background: 'transparent',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '6',
    cursor: 'pointer',
    opacity: '.92',
    transition: 'opacity 180ms ease, transform 180ms ease',
    pointerEvents: 'auto',
  })

  const resetTransform = () => {
    button.style.opacity = '.92'
    button.style.transform = 'scale(1)'
  }
  button.addEventListener('mouseenter', () => {
    button.style.opacity = '1'
    button.style.transform = 'scale(1.06)'
  })
  button.addEventListener('mouseleave', resetTransform)
  button.addEventListener('pointerdown', () => {
    button.style.transform = 'scale(.96)'
  })
  button.addEventListener('pointerup', () => {
    button.style.transform = 'scale(1.06)'
  })
  button.addEventListener('focus', () => {
    button.style.outline = '1px solid rgba(255,255,255,.62)'
    button.style.outlineOffset = '4px'
    button.style.borderRadius = '4px'
  })
  button.addEventListener('blur', () => {
    button.style.outline = 'none'
  })
  button.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    if (url) onLaunch?.(url)
  })

  return button
}
