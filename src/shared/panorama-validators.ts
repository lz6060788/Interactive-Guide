// ============================================================
// Interactive Guide - Panorama HTML Validators
// ============================================================

import type {
  PanoramaHtmlAssetRef,
  PanoramaHtmlBridgeConfig,
  PanoramaHtmlMessage,
  PanoramaConnectorTarget,
  PanoramaEditorDocument,
  PanoramaFocusRect,
  PanoramaGroup,
  PanoramaHtmlProduct,
  PanoramaItem,
  PanoramaMarker,
  PanoramaMetadata,
  PanoramaSection,
  PanoramaViewport,
} from './panorama-types.js'
import { isHtmlGroup, isPanoramaGroup } from './panorama-types.js'

export interface PanoramaValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function validateNormalizedNumber(value: unknown, label: string, errors: string[]) {
  if (typeof value !== 'number' || value < 0 || value > 1) {
    errors.push(`${label} must be a number in 0~1, got ${String(value)}`)
  }
}

function validateNonEmptyString(value: unknown, label: string, errors: string[]) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label} must be a non-empty string`)
  }
}

function validateHtmlAsset(asset: PanoramaHtmlAssetRef | undefined, label: string, errors: string[]) {
  if (!asset) {
    errors.push(`${label} is required`)
    return
  }
  validateNonEmptyString(asset.assetId, `${label}.assetId`, errors)
  validateNonEmptyString(asset.entryUrl, `${label}.entryUrl`, errors)
}

function validateHtmlMessage(message: PanoramaHtmlMessage | undefined, label: string, errors: string[]) {
  if (!message) return
  validateNonEmptyString(message.type, `${label}.type`, errors)
  if (
    message.payload != null
    && (typeof message.payload !== 'object' || Array.isArray(message.payload))
  ) {
    errors.push(`${label}.payload must be an object when provided`)
  }
}

function validateHtmlBridge(bridge: PanoramaHtmlBridgeConfig | undefined, label: string, errors: string[]) {
  if (!bridge) return
  if (bridge.targetOrigin != null && typeof bridge.targetOrigin !== 'string') {
    errors.push(`${label}.targetOrigin must be a string when provided`)
  }
  if (bridge.namespace != null && typeof bridge.namespace !== 'string') {
    errors.push(`${label}.namespace must be a string when provided`)
  }
  if (bridge.readyEventType != null && typeof bridge.readyEventType !== 'string') {
    errors.push(`${label}.readyEventType must be a string when provided`)
  }
}

function validateViewport(viewport: PanoramaViewport | undefined, label: string, errors: string[]) {
  if (!viewport) {
    errors.push(`${label} is required`)
    return
  }
  validateNormalizedNumber(viewport.centerX, `${label}.centerX`, errors)
  validateNormalizedNumber(viewport.centerY, `${label}.centerY`, errors)
  if (typeof viewport.zoom !== 'number' || viewport.zoom <= 0) {
    errors.push(`${label}.zoom must be > 0, got ${String(viewport.zoom)}`)
  }
}

function validateOptionalViewport(viewport: PanoramaViewport | undefined, label: string, errors: string[]) {
  if (!viewport) return
  validateViewport(viewport, label, errors)
}

function validateMarker(marker: PanoramaMarker | undefined, label: string, errors: string[]) {
  if (!marker) {
    errors.push(`${label} is required`)
    return
  }
  validateNormalizedNumber(marker.x, `${label}.x`, errors)
  validateNormalizedNumber(marker.y, `${label}.y`, errors)
  if (marker.style != null && !['default', 'highlight'].includes(marker.style)) {
    errors.push(`${label}.style must be 'default' or 'highlight', got ${String(marker.style)}`)
  }
}

function validateFocusRect(focusRect: PanoramaFocusRect | undefined, label: string, errors: string[]) {
  if (!focusRect) {
    errors.push(`${label} is required`)
    return
  }
  validateNormalizedNumber(focusRect.x, `${label}.x`, errors)
  validateNormalizedNumber(focusRect.y, `${label}.y`, errors)
  validateNormalizedNumber(focusRect.width, `${label}.width`, errors)
  validateNormalizedNumber(focusRect.height, `${label}.height`, errors)
  if (focusRect.radius != null && (typeof focusRect.radius !== 'number' || focusRect.radius < 0)) {
    errors.push(`${label}.radius must be >= 0 when provided`)
  }
  if (
    focusRect.maskOpacity != null
    && (typeof focusRect.maskOpacity !== 'number' || focusRect.maskOpacity < 0 || focusRect.maskOpacity > 1)
  ) {
    errors.push(`${label}.maskOpacity must be 0~1 when provided`)
  }
}

function validateConnectorTarget(
  connectorTarget: PanoramaConnectorTarget | undefined,
  label: string,
  errors: string[],
) {
  if (!connectorTarget) return
  if (connectorTarget.mode !== 'divider-left') {
    errors.push(`${label}.mode must be 'divider-left'`)
  }
  if (connectorTarget.offsetX != null && typeof connectorTarget.offsetX !== 'number') {
    errors.push(`${label}.offsetX must be a number when provided`)
  }
  if (connectorTarget.offsetY != null && typeof connectorTarget.offsetY !== 'number') {
    errors.push(`${label}.offsetY must be a number when provided`)
  }
}

function validateMetadata(metadata: PanoramaMetadata | undefined, errors: string[]) {
  if (!metadata) {
    errors.push('metadata is required')
    return
  }
  if (metadata.schemaVersion !== '1.0.0') {
    errors.push(`metadata.schemaVersion must be '1.0.0', got ${String(metadata.schemaVersion)}`)
  }
}

function validatePanoramaItem(item: PanoramaItem | undefined, label: string, errors: string[]) {
  if (!item) {
    errors.push(`${label} is required`)
    return
  }
  validateNonEmptyString(item.id, `${label}.id`, errors)
  validateNonEmptyString(item.title, `${label}.title`, errors)
  validateNonEmptyString(item.description, `${label}.description`, errors)
  if (typeof item.order !== 'number') {
    errors.push(`${label}.order must be a number`)
  }
  validateMarker(item.marker, `${label}.marker`, errors)
  validateFocusRect(item.focusRect, `${label}.focusRect`, errors)
  validateOptionalViewport(item.viewportOverride, `${label}.viewportOverride`, errors)
  validateConnectorTarget(item.connectorTarget, `${label}.connectorTarget`, errors)
  if (
    item.detailBehavior?.expandMode != null
    && item.detailBehavior.expandMode !== 'active-only'
  ) {
    errors.push(`${label}.detailBehavior.expandMode must be 'active-only'`)
  }
  if (
    item.detailBehavior?.collapsedLines != null
    && (typeof item.detailBehavior.collapsedLines !== 'number' || item.detailBehavior.collapsedLines <= 0)
  ) {
    errors.push(`${label}.detailBehavior.collapsedLines must be > 0 when provided`)
  }
}

function validatePanoramaGroup(group: PanoramaGroup | undefined, label: string, errors: string[]) {
  if (!group) {
    errors.push(`${label} is required`)
    return
  }
  validateNonEmptyString(group.id, `${label}.id`, errors)
  validateNonEmptyString(group.title, `${label}.title`, errors)
  if (typeof group.order !== 'number') {
    errors.push(`${label}.order must be a number`)
  }

  if (isHtmlGroup(group)) {
    validateHtmlAsset(group.htmlAsset, `${label}.htmlAsset`, errors)
    validateHtmlBridge(group.htmlBridge, `${label}.htmlBridge`, errors)
    validateHtmlMessage(group.activationMessage, `${label}.activationMessage`, errors)
    return
  }

  if (group.renderMode != null && group.renderMode !== 'panorama') {
    errors.push(`${label}.renderMode must be 'panorama' or 'html'`)
  }
  if (!group.panoramaAsset || typeof group.panoramaAsset !== 'object') {
    errors.push(`${label}.panoramaAsset is required`)
  } else {
    validateNonEmptyString(group.panoramaAsset.assetId, `${label}.panoramaAsset.assetId`, errors)
    validateNonEmptyString(group.panoramaAsset.imageUrl, `${label}.panoramaAsset.imageUrl`, errors)
  }
  validateViewport(group.defaultViewport, `${label}.defaultViewport`, errors)
  if (!Array.isArray(group.items) || group.items.length === 0) {
    errors.push(`${label}.items must be a non-empty array`)
    return
  }
  const itemIds = new Set<string>()
  for (const [index, item] of group.items.entries()) {
    validatePanoramaItem(item, `${label}.items[${index}]`, errors)
    if (itemIds.has(item.id)) {
      errors.push(`${label}.items has duplicate id "${item.id}"`)
    }
    itemIds.add(item.id)
  }
  if (group.defaultItemId != null && !itemIds.has(group.defaultItemId)) {
    errors.push(`${label}.defaultItemId "${group.defaultItemId}" does not exist in items`)
  }
}

function validatePanoramaSection(section: PanoramaSection | undefined, label: string, errors: string[]) {
  if (!section) {
    errors.push(`${label} is required`)
    return
  }
  validateNonEmptyString(section.id, `${label}.id`, errors)
  validateNonEmptyString(section.label, `${label}.label`, errors)
  if (typeof section.order !== 'number') {
    errors.push(`${label}.order must be a number`)
  }
  if (!Array.isArray(section.groups) || section.groups.length === 0) {
    errors.push(`${label}.groups must be a non-empty array`)
    return
  }
  const groupIds = new Set<string>()
  for (const [index, group] of section.groups.entries()) {
    validatePanoramaGroup(group, `${label}.groups[${index}]`, errors)
    if (groupIds.has(group.id)) {
      errors.push(`${label}.groups has duplicate id "${group.id}"`)
    }
    groupIds.add(group.id)
  }
  if (section.defaultGroupId != null && !groupIds.has(section.defaultGroupId)) {
    errors.push(`${label}.defaultGroupId "${section.defaultGroupId}" does not exist in groups`)
  }
}

export function validatePanoramaHtmlProduct(product: PanoramaHtmlProduct): PanoramaValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  validateNonEmptyString(product.id, 'product.id', errors)
  validateNonEmptyString(product.packageId, 'product.packageId', errors)
  validateNonEmptyString(product.version, 'product.version', errors)
  validateNonEmptyString(product.title, 'product.title', errors)
  validateNonEmptyString(product.hintText, 'product.hintText', errors)
  if (product.globalPanoramaAsset) {
    validateNonEmptyString(product.globalPanoramaAsset.assetId, 'product.globalPanoramaAsset.assetId', errors)
    validateNonEmptyString(product.globalPanoramaAsset.imageUrl, 'product.globalPanoramaAsset.imageUrl', errors)
  }
  if (product.productType !== 'panorama-html') {
    errors.push(`product.productType must be 'panorama-html', got ${String(product.productType)}`)
  }
  validateMetadata(product.metadata, errors)
  if (!Array.isArray(product.sections) || product.sections.length === 0) {
    errors.push('product.sections must be a non-empty array')
  } else {
    const sectionIds = new Set<string>()
    for (const [index, section] of product.sections.entries()) {
      validatePanoramaSection(section, `product.sections[${index}]`, errors)
      if (sectionIds.has(section.id)) {
        errors.push(`product.sections has duplicate id "${section.id}"`)
      }
      sectionIds.add(section.id)
    }
  }
  return { valid: errors.length === 0, errors, warnings }
}

export function validatePanoramaEditorDocument(document: PanoramaEditorDocument): PanoramaValidationResult {
  const result = validatePanoramaHtmlProduct(document.product)
  const errors = [...result.errors]
  const warnings = [...result.warnings]
  const sectionIds = new Set(document.product.sections.map(section => section.id))
  const groupIds = new Set(document.product.sections.flatMap(section => section.groups.map(group => group.id)))
  const itemIds = new Set(
    document.product.sections.flatMap(section =>
      section.groups.flatMap(group =>
        isPanoramaGroup(group) ? group.items.map(item => item.id) : [])),
  )

  if (document.draftState.selectedSectionId && !sectionIds.has(document.draftState.selectedSectionId)) {
    errors.push(`draftState.selectedSectionId "${document.draftState.selectedSectionId}" does not exist`)
  }
  if (document.draftState.selectedGroupId && !groupIds.has(document.draftState.selectedGroupId)) {
    errors.push(`draftState.selectedGroupId "${document.draftState.selectedGroupId}" does not exist`)
  }
  if (document.draftState.selectedItemId && !itemIds.has(document.draftState.selectedItemId)) {
    errors.push(`draftState.selectedItemId "${document.draftState.selectedItemId}" does not exist`)
  }

  return { valid: errors.length === 0, errors, warnings }
}
