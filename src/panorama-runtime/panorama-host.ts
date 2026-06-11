// ============================================================
// Interactive Guide - Panorama Runtime Host
// ============================================================

import type {
  PanoramaGroup,
  PanoramaHtmlProduct,
  PanoramaItem,
  PanoramaPanoramaGroup,
  PanoramaRuntimeState,
  PanoramaSection,
} from '../shared/panorama-types.js'
import { isPanoramaGroup } from '../shared/panorama-types.js'
import {
  resolveInitialPanoramaRuntimeState,
  transitionToGroup,
  transitionToItem,
  transitionToSection,
} from './panorama-state-machine.js'

export interface PanoramaHostRefs {
  container: HTMLElement
}

export class PanoramaHost {
  private product: PanoramaHtmlProduct | null = null
  private state: PanoramaRuntimeState | null = null

  constructor(
    private refs: PanoramaHostRefs,
    private onStateChange?: (state: PanoramaRuntimeState) => void,
  ) {}

  loadProduct(product: PanoramaHtmlProduct): void {
    this.product = product
    this.state = resolveInitialPanoramaRuntimeState(product)
    this.emitState()
  }

  getState(): PanoramaRuntimeState | null {
    return this.state
  }

  selectSection(section: PanoramaSection): void {
    if (!this.state) return
    this.state = transitionToSection(this.state, section)
    this.emitState()
  }

  selectGroup(section: PanoramaSection, group: PanoramaGroup): void {
    if (!this.state) return
    this.state = transitionToGroup(this.state, section, group)
    this.emitState()
  }

  selectItem(group: PanoramaGroup, item: PanoramaItem, mode: PanoramaRuntimeState['interactionMode'] = 'scroll-sync'): void {
    if (!this.state) return
    if (!isPanoramaGroup(group)) return
    this.state = transitionToItem(this.state, group as PanoramaPanoramaGroup, item, mode)
    this.emitState()
  }

  render(): void {
    if (!this.product || !this.state) {
      this.refs.container.textContent = ''
      return
    }
    this.refs.container.dataset.panoramaProductType = this.product.productType
    this.refs.container.dataset.panoramaActiveSectionId = this.state.activeSectionId
    this.refs.container.dataset.panoramaActiveGroupId = this.state.activeGroupId
    this.refs.container.dataset.panoramaActiveItemId = this.state.activeItemId ?? ''
  }

  private emitState(): void {
    if (!this.state) return
    this.render()
    this.onStateChange?.(this.state)
  }
}
