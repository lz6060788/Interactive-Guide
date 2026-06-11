// ============================================================
// Interactive Guide - Panorama Renderer Inputs
// ============================================================

import type {
  PanoramaGroup,
  PanoramaHtmlGroup,
  PanoramaHtmlProduct,
  PanoramaItem,
  PanoramaPanoramaGroup,
  PanoramaRuntimeState,
  PanoramaSection,
} from '../shared/panorama-types.js'
import { isPanoramaGroup } from '../shared/panorama-types.js'

interface PanoramaRenderModelBase {
  product: PanoramaHtmlProduct
  section: PanoramaSection
  group: PanoramaGroup
  state: PanoramaRuntimeState
}

export interface PanoramaSceneRenderModel extends PanoramaRenderModelBase {
  group: PanoramaPanoramaGroup
  item: PanoramaItem
}

export interface PanoramaHtmlRenderModel extends PanoramaRenderModelBase {
  group: PanoramaHtmlGroup
  item: null
}

export type PanoramaRenderModel = PanoramaSceneRenderModel | PanoramaHtmlRenderModel

export function buildPanoramaRenderModel(
  product: PanoramaHtmlProduct,
  state: PanoramaRuntimeState,
): PanoramaRenderModel {
  const section = product.sections.find(item => item.id === state.activeSectionId)
  if (!section) throw new Error(`Missing active section "${state.activeSectionId}"`)
  const group = section.groups.find(item => item.id === state.activeGroupId)
  if (!group) throw new Error(`Missing active group "${state.activeGroupId}"`)

  if (!isPanoramaGroup(group)) {
    return {
      product,
      section,
      group,
      item: null,
      state,
    }
  }

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
