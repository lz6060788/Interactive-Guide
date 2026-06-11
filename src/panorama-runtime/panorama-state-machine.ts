// ============================================================
// Interactive Guide - Panorama Runtime State Machine
// ============================================================

import type {
  PanoramaFocusRect,
  PanoramaGroup,
  PanoramaHtmlProduct,
  PanoramaPanoramaGroup,
  PanoramaItem,
  PanoramaRuntimeState,
  PanoramaSection,
  PanoramaViewport,
} from '../shared/panorama-types.js'
import { isPanoramaGroup } from '../shared/panorama-types.js'

function getDefaultSection(product: PanoramaHtmlProduct): PanoramaSection {
  const [section] = [...product.sections].sort((a, b) => a.order - b.order)
  if (!section) {
    throw new Error('PanoramaHtmlProduct must contain at least one section')
  }
  return section
}

function getDefaultGroup(section: PanoramaSection): PanoramaGroup {
  if (section.defaultGroupId) {
    const matched = section.groups.find(group => group.id === section.defaultGroupId)
    if (matched) return matched
  }
  const [group] = [...section.groups].sort((a, b) => a.order - b.order)
  if (!group) {
    throw new Error(`PanoramaSection "${section.id}" must contain at least one group`)
  }
  return group
}

function getDefaultItem(group: PanoramaGroup): PanoramaItem | null {
  if (!isPanoramaGroup(group)) {
    return null
  }
  if (group.defaultItemId) {
    const matched = group.items.find(item => item.id === group.defaultItemId)
    if (matched) return matched
  }
  const [item] = [...group.items].sort((a, b) => a.order - b.order)
  if (!item) {
    throw new Error(`PanoramaGroup "${group.id}" must contain at least one item`)
  }
  return item
}

export function resolveViewportForItem(group: PanoramaPanoramaGroup, item: PanoramaItem): PanoramaViewport {
  return item.viewportOverride ?? group.defaultViewport
}

export function resolveFocusRectForItem(item: PanoramaItem): PanoramaFocusRect {
  return item.focusRect
}

export function resolveInitialPanoramaRuntimeState(product: PanoramaHtmlProduct): PanoramaRuntimeState {
  const section = getDefaultSection(product)
  const group = getDefaultGroup(section)
  return createRuntimeStateForGroup(section, group, 'idle')
}

export function transitionToItem(
  state: PanoramaRuntimeState,
  group: PanoramaPanoramaGroup,
  item: PanoramaItem,
  interactionMode: PanoramaRuntimeState['interactionMode'],
): PanoramaRuntimeState {
  return {
    ...state,
    activeGroupId: group.id,
    activeGroupRenderMode: 'panorama',
    activeItemId: item.id,
    activeViewport: resolveViewportForItem(group, item),
    activeFocusRect: resolveFocusRectForItem(item),
    activeMarkerId: item.id,
    activeHtmlMessage: undefined,
    interactionMode,
  }
}

export function transitionToGroup(
  state: PanoramaRuntimeState,
  section: PanoramaSection,
  group: PanoramaGroup,
): PanoramaRuntimeState {
  return {
    ...createRuntimeStateForGroup(section, group, 'group-switch'),
    scrollingItemId: state.scrollingItemId,
  }
}

export function transitionToSection(
  _state: PanoramaRuntimeState,
  section: PanoramaSection,
): PanoramaRuntimeState {
  const group = getDefaultGroup(section)
  return createRuntimeStateForGroup(section, group, 'tab-switch')
}

function createRuntimeStateForGroup(
  section: PanoramaSection,
  group: PanoramaGroup,
  interactionMode: PanoramaRuntimeState['interactionMode'],
): PanoramaRuntimeState {
  if (!isPanoramaGroup(group)) {
    return {
      activeSectionId: section.id,
      activeGroupId: group.id,
      activeGroupRenderMode: 'html',
      activeHtmlMessage: group.activationMessage,
      interactionMode,
    }
  }

  const item = getDefaultItem(group)
  if (!item) {
    throw new Error(`PanoramaGroup "${group.id}" must contain at least one item`)
  }

  return {
    activeSectionId: section.id,
    activeGroupId: group.id,
    activeGroupRenderMode: 'panorama',
    activeItemId: item.id,
    activeViewport: resolveViewportForItem(group, item),
    activeFocusRect: resolveFocusRectForItem(item),
    activeMarkerId: item.id,
    activeHtmlMessage: undefined,
    interactionMode,
  }
}
