// ============================================================
// Interactive Guide - Panorama Runtime State Machine
// ============================================================

import type {
  PanoramaFocusRect,
  PanoramaGroup,
  PanoramaHtmlProduct,
  PanoramaItem,
  PanoramaRuntimeState,
  PanoramaSection,
  PanoramaViewport,
} from '../shared/panorama-types.js'

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

function getDefaultItem(group: PanoramaGroup): PanoramaItem {
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

export function resolveViewportForItem(group: PanoramaGroup, item: PanoramaItem): PanoramaViewport {
  return item.viewportOverride ?? group.defaultViewport
}

export function resolveFocusRectForItem(item: PanoramaItem): PanoramaFocusRect {
  return item.focusRect
}

export function resolveInitialPanoramaRuntimeState(product: PanoramaHtmlProduct): PanoramaRuntimeState {
  const section = getDefaultSection(product)
  const group = getDefaultGroup(section)
  const item = getDefaultItem(group)
  return {
    activeSectionId: section.id,
    activeGroupId: group.id,
    activeItemId: item.id,
    activeViewport: resolveViewportForItem(group, item),
    activeFocusRect: resolveFocusRectForItem(item),
    activeMarkerId: item.id,
    interactionMode: 'idle',
  }
}

export function transitionToItem(
  state: PanoramaRuntimeState,
  group: PanoramaGroup,
  item: PanoramaItem,
  interactionMode: PanoramaRuntimeState['interactionMode'],
): PanoramaRuntimeState {
  return {
    ...state,
    activeGroupId: group.id,
    activeItemId: item.id,
    activeViewport: resolveViewportForItem(group, item),
    activeFocusRect: resolveFocusRectForItem(item),
    activeMarkerId: item.id,
    interactionMode,
  }
}

export function transitionToGroup(
  state: PanoramaRuntimeState,
  section: PanoramaSection,
  group: PanoramaGroup,
): PanoramaRuntimeState {
  const item = getDefaultItem(group)
  return {
    ...state,
    activeSectionId: section.id,
    activeGroupId: group.id,
    activeItemId: item.id,
    activeViewport: resolveViewportForItem(group, item),
    activeFocusRect: resolveFocusRectForItem(item),
    activeMarkerId: item.id,
    interactionMode: 'group-switch',
  }
}

export function transitionToSection(
  _state: PanoramaRuntimeState,
  section: PanoramaSection,
): PanoramaRuntimeState {
  const group = getDefaultGroup(section)
  const item = getDefaultItem(group)
  return {
    activeSectionId: section.id,
    activeGroupId: group.id,
    activeItemId: item.id,
    activeViewport: resolveViewportForItem(group, item),
    activeFocusRect: resolveFocusRectForItem(item),
    activeMarkerId: item.id,
    interactionMode: 'tab-switch',
  }
}
