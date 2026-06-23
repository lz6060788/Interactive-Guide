import type { PublishNode } from '../../shared/types.js'
import type PlayerCore from './player-core.js'
import { toAbsoluteUrl } from './player-host-routing.js'

export async function ensureExternalScriptLoaded(
  scriptAttr: string,
  src: string,
): Promise<void> {
  await new Promise<void>(resolve => {
    const complete = () => resolve()
    const existingScript = document.querySelector(
      `script[${scriptAttr}="true"]`,
    ) as HTMLScriptElement | null
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true' || existingScript.dataset.failed === 'true') {
        complete()
        return
      }
      existingScript.addEventListener('load', complete, { once: true })
      existingScript.addEventListener('error', complete, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.setAttribute(scriptAttr, 'true')
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      complete()
    }, { once: true })
    script.addEventListener('error', () => {
      script.dataset.failed = 'true'
      complete()
    }, { once: true })
    document.head.appendChild(script)
  })
}

export function confirmHostVisualCommitIfReady(
  reason: string,
  engine: PlayerCore,
  nodeImage: HTMLImageElement,
  getNodeKind: (node: PublishNode | null | undefined) => 'surface' | 'image' | 'html',
  isActiveHtmlIframeReady: () => boolean,
  getNodeImageSource: (node: PublishNode | null | undefined) => string | undefined,
): void {
  const currentNode = engine.getCurrentNode()
  if (!currentNode) return

  const pendingKind = engine.getPendingVisualCommitKind()
  if (engine.isTransitioning() && !pendingKind) return
  if (
    pendingKind === 'builtin'
    && reason !== 'node-image:onLoad:next-frame'
    && reason !== 'node-iframe:onLoad:next-frame'
  ) {
    if (getNodeKind(currentNode) !== 'html' || !isActiveHtmlIframeReady()) {
      return
    }
  }

  if (getNodeKind(currentNode) === 'html') {
    if (!isActiveHtmlIframeReady()) return
  } else {
    const expectedSrc = toAbsoluteUrl(getNodeImageSource(currentNode) ?? '')
    const actualSrc = nodeImage.currentSrc || nodeImage.src
    if (!nodeImage.complete || actualSrc !== expectedSrc) return
  }

  engine.confirmHostVisualCommitted()
}
