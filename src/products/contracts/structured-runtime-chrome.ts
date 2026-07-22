const SCROLLBAR_STYLE_ID = 'ig-structured-horizontal-tabs-style'
const SCROLLBAR_CLASS = 'ig-structured-horizontal-tabs'

export function configureHorizontalTabs(element: HTMLElement): () => void {
  Object.assign(element.style, {
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    overscrollBehaviorX: 'contain',
    scrollBehavior: 'smooth',
    touchAction: 'pan-x',
    whiteSpace: 'nowrap',
  })
  if (element.classList?.add) {
    element.classList.add(SCROLLBAR_CLASS)
  } else {
    element.className = `${element.className ?? ''} ${SCROLLBAR_CLASS}`.trim()
  }
  const ownerDocument = element.ownerDocument ?? globalThis.document
  if (ownerDocument) ensureScrollbarStyle(ownerDocument)

  const handleWheel = (event: WheelEvent): void => {
    if (
      element.scrollWidth <= element.clientWidth ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX)
    ) {
      return
    }
    element.scrollLeft += event.deltaY
    event.preventDefault()
  }
  element.addEventListener('wheel', handleWheel, { passive: false })
  return () => element.removeEventListener('wheel', handleWheel)
}

export function revealHorizontalTab(element: HTMLElement | null): void {
  element?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })
}

export function styleCenteredRuntimeHint(element: HTMLElement, hasCornerAction: boolean): void {
  const sideInset = hasCornerAction ? '64px' : '16px'
  Object.assign(element.style, {
    left: sideInset,
    right: sideInset,
    textAlign: 'center',
  })
}

function ensureScrollbarStyle(document: Document): void {
  if (!document.getElementById || !document.createElement || !document.head?.appendChild) return
  if (document.getElementById(SCROLLBAR_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SCROLLBAR_STYLE_ID
  style.textContent = `.${SCROLLBAR_CLASS}::-webkit-scrollbar{display:none;width:0;height:0}`
  document.head?.appendChild(style)
}
