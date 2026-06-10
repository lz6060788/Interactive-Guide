import type {
  KnowledgePackage,
  SurfaceCard,
  SurfaceFocusLayer,
} from '../../../shared/types'
import type {
  PanoramaEditorDocument,
  PanoramaFocusRect,
  PanoramaGroup,
  PanoramaHtmlProduct,
  PanoramaItem,
  PanoramaSection,
  PanoramaViewport,
} from '../../../shared/panorama-types'
import { validatePanoramaEditorDocument } from '../../../shared/panorama-validators'

interface SurfaceHierarchyCatalogItem {
  title: string
  description?: string
}

interface SurfaceHierarchyCatalogSection {
  primaryCategory: string
  secondaryCategories: Array<{
    title: string
    items: SurfaceHierarchyCatalogItem[]
  }>
}

function normalizeViewport(viewport?: Partial<PanoramaViewport>): PanoramaViewport {
  return {
    centerX: viewport?.centerX ?? 0.5,
    centerY: viewport?.centerY ?? 0.5,
    zoom: viewport?.zoom ?? 3.6,
  }
}

function createFocusRectFromAnchor(x: number, y: number): PanoramaFocusRect {
  const width = 0.22
  const height = 0.18
  return {
    x: Math.min(1 - width, Math.max(0, x - width / 2)),
    y: Math.min(1 - height, Math.max(0, y - height / 2)),
    width,
    height,
    radius: 12,
    maskOpacity: 0.48,
  }
}

function createItemFromCard(card: SurfaceCard, index: number): PanoramaItem {
  return {
    id: card.id,
    title: card.title,
    description: card.description ?? '',
    order: index + 1,
    marker: {
      x: card.anchor.x,
      y: card.anchor.y,
      style: 'default',
    },
    focusRect: createFocusRectFromAnchor(card.anchor.x, card.anchor.y),
    connectorTarget: { mode: 'divider-left' },
    detailBehavior: { expandMode: 'active-only', collapsedLines: 2 },
  }
}

function createFallbackGroup(
  layer: SurfaceFocusLayer,
  imageUrl: string,
): PanoramaGroup | null {
  if (!layer.cards.length) return null
  const items = layer.cards.map(createItemFromCard)
  return {
    id: layer.id,
    title: layer.title,
    order: layer.order ?? 0,
    panoramaAsset: {
      assetId: `${layer.id}-asset`,
      imageUrl,
    },
    defaultViewport: normalizeViewport(layer.cameraPreset),
    defaultItemId: items[0]?.id,
    items,
  }
}

function buildGroupFromCatalog(
  layer: SurfaceFocusLayer | undefined,
  secondary: SurfaceHierarchyCatalogSection['secondaryCategories'][number],
  imageUrl: string,
  index: number,
): PanoramaGroup {
  const layerCards = layer?.cards ?? []
  const items = secondary.items.map((item, itemIndex) => {
    const card = layerCards.find(entry => entry.title === item.title) ?? layerCards[itemIndex]
    if (!card) {
      const anchorX = 0.2 + (itemIndex % 3) * 0.18
      const anchorY = 0.35 + Math.floor(itemIndex / 3) * 0.18
      return {
        id: `${layer?.id ?? secondary.title}-${itemIndex + 1}`,
        title: item.title,
        description: item.description ?? '',
        order: itemIndex + 1,
        marker: { x: anchorX, y: anchorY, style: 'default' },
        focusRect: createFocusRectFromAnchor(anchorX, anchorY),
        connectorTarget: { mode: 'divider-left' },
        detailBehavior: { expandMode: 'active-only', collapsedLines: 2 },
      }
    }
    return {
      ...createItemFromCard(card, itemIndex),
      title: item.title,
      description: item.description ?? card.description ?? '',
    }
  })

  return {
    id: layer?.id ?? `group-${index + 1}`,
    title: secondary.title,
    order: index + 1,
    panoramaAsset: {
      assetId: `${layer?.id ?? secondary.title}-asset`,
      imageUrl,
    },
    defaultViewport: normalizeViewport(layer?.cameraPreset),
    defaultItemId: items[0]?.id,
    items,
  }
}

export function buildPanoramaEditorDocumentFromGuide(pkg: KnowledgePackage): PanoramaEditorDocument {
  if (pkg.panoramaEditorDocument) {
    const validation = validatePanoramaEditorDocument(pkg.panoramaEditorDocument)
    if (validation.valid) {
      return structuredClone(pkg.panoramaEditorDocument)
    }
  }

  const rootSurfaceNode = pkg.nodes.find(node => node.nodeKind === 'surface' || node.id === 'root')
  if (!rootSurfaceNode) {
    throw new Error('当前知识包缺少可用于初始化全景编辑器的 root surface 节点')
  }

  const catalog = (rootSurfaceNode.extensions?.surfaceHierarchyCatalog ?? []) as SurfaceHierarchyCatalogSection[]
  const layers = rootSurfaceNode.surfaceLayers ?? []
  const imageUrl = rootSurfaceNode.surfaceConfig?.sourceImageUrl || rootSurfaceNode.imageUrl || ''

  const layersByTitle = new Map<string, SurfaceFocusLayer>()
  const groupedLayers = new Map<string, SurfaceFocusLayer[]>()

  for (const layer of layers) {
    if (layer.id === 'overview') continue
    layersByTitle.set(layer.title, layer)
    if (!layer.primaryCategory) continue
    const list = groupedLayers.get(layer.primaryCategory) ?? []
    list.push(layer)
    groupedLayers.set(layer.primaryCategory, list)
  }

  const sections: PanoramaSection[] = catalog
    .filter(section => section.primaryCategory !== '上游')
    .map((section, sectionIndex) => {
      const groups = section.secondaryCategories.map((secondary, groupIndex) =>
        buildGroupFromCatalog(
          layersByTitle.get(secondary.title),
          secondary,
          imageUrl,
          groupIndex,
        ))

      return {
        id: `section-${sectionIndex + 1}`,
        label: section.primaryCategory,
        order: sectionIndex + 1,
        defaultGroupId: groups[0]?.id,
        groups,
      }
    })
    .filter(section => section.groups.length > 0)

  if (sections.length === 0) {
    const fallbackSections = [...groupedLayers.entries()]
      .filter(([primaryCategory]) => primaryCategory !== '上游')
      .map(([primaryCategory, primaryLayers], sectionIndex) => {
        const groups = primaryLayers
          .map(layer => createFallbackGroup(layer, imageUrl))
          .filter((group): group is PanoramaGroup => !!group)
          .map((group, groupIndex) => ({ ...group, order: groupIndex + 1 }))

        return {
          id: `section-${sectionIndex + 1}`,
          label: primaryCategory,
          order: sectionIndex + 1,
          defaultGroupId: groups[0]?.id,
          groups,
        }
      })
      .filter(section => section.groups.length > 0)

    if (!fallbackSections.length) {
      throw new Error('当前知识包缺少可用于初始化全景编辑器的中游/下游 surface 图层数据')
    }

    const product: PanoramaHtmlProduct = {
      id: `${pkg.id}-panorama`,
      packageId: pkg.id,
      version: pkg.version,
      title: `${pkg.title} - 全景编辑草稿`,
      productType: 'panorama-html',
      hintText: '点击或滑动文字查看简介',
      globalPanoramaAsset: imageUrl
        ? {
            assetId: `${pkg.id}-global-panorama`,
            imageUrl,
          }
        : undefined,
      sections: fallbackSections,
      metadata: { schemaVersion: '1.0.0' },
    }

    return {
      product,
      draftState: {
        selectedSectionId: fallbackSections[0]?.id,
        selectedGroupId: fallbackSections[0]?.groups[0]?.id,
        selectedItemId: fallbackSections[0]?.groups[0]?.items[0]?.id,
        viewportMode: 'group-default',
        overlayMode: 'focusRect',
      },
    }
  }

  const product: PanoramaHtmlProduct = {
    id: `${pkg.id}-panorama`,
    packageId: pkg.id,
    version: pkg.version,
    title: `${pkg.title} - 全景编辑草稿`,
    productType: 'panorama-html',
    hintText: '点击或滑动文字查看简介',
    globalPanoramaAsset: imageUrl
      ? {
          assetId: `${pkg.id}-global-panorama`,
          imageUrl,
        }
      : undefined,
    sections,
    metadata: { schemaVersion: '1.0.0' },
  }

  return {
    product,
    draftState: {
      selectedSectionId: sections[0]?.id,
      selectedGroupId: sections[0]?.groups[0]?.id,
      selectedItemId: sections[0]?.groups[0]?.items[0]?.id,
      viewportMode: 'group-default',
      overlayMode: 'focusRect',
    },
  }
}
