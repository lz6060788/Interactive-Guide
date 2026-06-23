import type {
  PublishHotspot,
  PublishNode,
  SurfaceCard,
  SurfaceHotspot,
} from '../../shared/types.js'
import { resolveVisibleSurfaceAnnotations, type SurfaceCameraLayout } from './surface-camera.js'
import {
  ensureHotspotAnimationStyle,
  createAnchoredAnnotationRoot,
  createAnnotationMarker,
  appendMarkerAndButton,
  applyAnnotationChipStyles,
  resolveMarkerConfig,
  positionSurfaceAnnotations,
} from './player-host-annotations.js'
import type PlayerCore from './player-core.js'

export interface AnnotationRendererEnv {
  refs: {
    hotspots: HTMLElement
    container: HTMLElement
    nodeImage: HTMLImageElement
    nodeIframe: HTMLIFrameElement
    stage: HTMLElement
  }
  engine: PlayerCore
  getNodeKind: (node: PublishNode | null | undefined) => 'surface' | 'image' | 'html'
  getCurrentSurfaceCamera: () => { centerX: number; centerY: number; zoom: number } | null
  getActiveSurfaceLayout: () => SurfaceCameraLayout | null
  getActiveSurfaceCardId: () => string | null
  getActiveContentType: () => 'image' | 'html'
  focusSurfaceCard: (cardId: string, moveCamera: boolean) => void
  handleSurfaceHotspotNavigation: (hotspot: SurfaceHotspot, currentNode: PublishNode) => void
  handleHotspotNavigation: (hotspot: PublishHotspot) => void
  requestHotspotViewportUpdate: () => void
}

export class AnnotationRenderer {
  hotspotViewportFrameId: number | null = null

  constructor(private env: AnnotationRendererEnv) {}

  renderAnnotations(currentNode: PublishNode | null, transitioning: boolean): void {
    this.env.refs.hotspots.innerHTML = ''
    if (!currentNode) return

    if (this.env.getNodeKind(currentNode) === 'surface') {
      const currentCamera = this.env.getCurrentSurfaceCamera()
      const annotations = resolveVisibleSurfaceAnnotations(
        currentNode.surfaceLayers,
        currentCamera ?? currentNode.surfaceConfig?.initialCamera ?? { centerX: 0.5, centerY: 0.5, zoom: 1 },
      )
      for (const hotspot of annotations.hotspots) {
        this.env.refs.hotspots.appendChild(this.createSurfaceHotspotButton(hotspot, currentNode))
      }
      if (!transitioning) {
        for (const card of annotations.cards) {
          this.env.refs.hotspots.appendChild(this.createSurfaceCard(card))
        }
      }
      requestAnimationFrame(() => {
        this.updateHotspotViewport()
      })
      return
    }

    for (const hotspot of currentNode.hotspots ?? []) {
      this.env.refs.hotspots.appendChild(this.createHotspotButton(hotspot, currentNode))
    }
    requestAnimationFrame(() => {
      this.updateHotspotViewport()
    })
  }

  updateHotspotViewport(): void {
    const { container, nodeImage, nodeIframe, hotspots, stage } = this.env.refs
    if (stage.hidden) return

    const currentNode = this.env.engine.getCurrentNode()
    const activeSurfaceLayout = this.env.getActiveSurfaceLayout()
    if (currentNode && this.env.getNodeKind(currentNode) === 'surface' && activeSurfaceLayout) {
      hotspots.style.left = '0px'
      hotspots.style.top = '0px'
      hotspots.style.width = '100%'
      hotspots.style.height = '100%'
      hotspots.style.clipPath = ''
      positionSurfaceAnnotations(hotspots, activeSurfaceLayout)
      return
    }

    const mediaRect = container.getBoundingClientRect()
    const contentEl = this.env.getActiveContentType() === 'html' ? nodeIframe : nodeImage
    const contentRect = contentEl.getBoundingClientRect()

    if (!mediaRect.width || !mediaRect.height || !contentRect.width || !contentRect.height) {
      return
    }

    hotspots.style.left = `${contentRect.left - mediaRect.left}px`
    hotspots.style.top = `${contentRect.top - mediaRect.top}px`
    hotspots.style.width = `${contentRect.width}px`
    hotspots.style.height = `${contentRect.height}px`
    hotspots.style.clipPath = ''
  }

  scheduleHotspotViewportUpdate(): void {
    if (this.hotspotViewportFrameId !== null) return
    this.hotspotViewportFrameId = requestAnimationFrame(() => {
      this.hotspotViewportFrameId = null
      this.updateHotspotViewport()
    })
  }

  private createHotspotButton(
    hotspot: PublishHotspot,
    _node?: PublishNode | null,
    onClick?: () => void,
  ): HTMLElement {
    ensureHotspotAnimationStyle()

    const root = createAnchoredAnnotationRoot(hotspot.normalizedX, hotspot.normalizedY)
    const button = document.createElement('button')
    const label = document.createElement('span')

    button.type = 'button'
    button.title = hotspot.label
    applyAnnotationChipStyles(button, false)

    label.textContent = hotspot.label
    label.style.display = 'block'
    label.style.overflow = 'hidden'
    label.style.textOverflow = 'ellipsis'
    label.style.fontFamily = '"PingFang SC", "Noto Sans SC", "Noto Sans S Chinese", "Microsoft YaHei", sans-serif'
    label.style.fontStyle = 'normal'
    label.style.fontWeight = '600'
    label.style.fontSize = '16px'
    label.style.lineHeight = '20px'
    label.style.textAlign = 'center'
    label.style.color = 'inherit'
    button.appendChild(label)

    if (hotspot.style?.trim()) {
      button.style.cssText += `;${hotspot.style}`
    }

    const markerConfig = resolveMarkerConfig(hotspot.style)
    appendMarkerAndButton(root, button, createAnnotationMarker(false), markerConfig)

    button.addEventListener('click', () => {
      if (onClick) {
        onClick()
      } else {
        this.env.handleHotspotNavigation(hotspot)
      }
    })

    return root
  }

  private createSurfaceCard(card: SurfaceCard): HTMLDivElement {
    const root = createAnchoredAnnotationRoot(card.anchor.x, card.anchor.y)
    const button = document.createElement('button')
    const label = document.createElement('span')
    const selected = this.env.getActiveSurfaceCardId() === card.id

    root.dataset.surfaceCard = 'true'

    applyAnnotationChipStyles(button, selected)
    button.type = 'button'
    button.style.minWidth = '88px'
    button.style.maxWidth = '240px'
    button.style.height = '36px'
    button.style.minHeight = '36px'
    button.style.whiteSpace = 'nowrap'
    button.style.contain = 'layout paint style'
    button.style.willChange = 'left,top'

    label.textContent = card.title
    label.style.display = 'block'
    label.style.maxWidth = '100%'
    label.style.overflow = 'hidden'
    label.style.textOverflow = 'ellipsis'
    label.style.fontFamily = '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif'
    label.style.fontStyle = 'normal'
    label.style.fontWeight = '600'
    label.style.fontSize = '16px'
    label.style.lineHeight = '20px'
    label.style.textAlign = 'center'
    label.style.color = 'inherit'
    label.style.whiteSpace = 'nowrap'
    button.appendChild(label)

    appendMarkerAndButton(root, button, createAnnotationMarker(selected), {
      visible: true,
      position: 'top',
      gapPx: 6,
    })
    root.style.zIndex = selected ? '3' : '2'

    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      this.env.focusSurfaceCard(card.id, false)
    })
    return root
  }

  private createSurfaceHotspotButton(hotspot: SurfaceHotspot, currentNode: PublishNode): HTMLElement {
    const manifest = this.env.engine.getManifest()
    const button = this.createHotspotButton({
      edgeId: hotspot.target.type === 'edge' ? hotspot.target.edgeId : hotspot.id,
      targetNodeId: hotspot.target.type === 'edge'
        ? manifest?.edgeMap[hotspot.target.edgeId]?.toNodeId ?? currentNode.id
        : currentNode.id,
      label: hotspot.label,
      normalizedX: hotspot.anchor.x,
      normalizedY: hotspot.anchor.y,
      radius: 12,
      markerType: 'dot',
      style: hotspot.style,
    }, currentNode, () => this.env.handleSurfaceHotspotNavigation(hotspot, currentNode))
    ;(button as HTMLElement).dataset.surfaceAnchorX = String(hotspot.anchor.x)
    ;(button as HTMLElement).dataset.surfaceAnchorY = String(hotspot.anchor.y)
    return button
  }
}
