// ============================================================
// Interactive Guide - Panorama Renderer Inputs
// ============================================================

import type {
  PanoramaGroup,
  PanoramaHtmlProduct,
  PanoramaItem,
  PanoramaRuntimeState,
  PanoramaSection,
} from '../shared/panorama-types.js'

export interface PanoramaRenderModel {
  product: PanoramaHtmlProduct
  section: PanoramaSection
  group: PanoramaGroup
  item: PanoramaItem
  state: PanoramaRuntimeState
}

export function buildPanoramaRenderModel(
  product: PanoramaHtmlProduct,
  state: PanoramaRuntimeState,
): PanoramaRenderModel {
  const section = product.sections.find(item => item.id === state.activeSectionId)
  if (!section) throw new Error(`Missing active section "${state.activeSectionId}"`)
  const group = section.groups.find(item => item.id === state.activeGroupId)
  if (!group) throw new Error(`Missing active group "${state.activeGroupId}"`)
  const item = group.items.find(entry => entry.id === state.activeItemId)
  if (!item) throw new Error(`Missing active item "${state.activeItemId}"`)
  return {
    product,
    section,
    group,
    item,
    state,
  }
}
