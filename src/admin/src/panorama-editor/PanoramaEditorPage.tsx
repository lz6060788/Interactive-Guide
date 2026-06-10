import { useMemo, useState } from 'react'
import { Badge, Box, Button, Flex, HStack, Stack, Text, VStack } from '@chakra-ui/react'
import { Download, Eye, Layers3, RotateCcw, Save } from 'lucide-react'
import type {
  PanoramaEditorDocument,
  PanoramaFocusRect,
  PanoramaGroup,
  PanoramaItem,
  PanoramaMarker,
  PanoramaRuntimeState,
  PanoramaSection,
  PanoramaViewport,
} from '../../../shared/panorama-types'
import {
  resolveFocusRectForItem,
  resolveInitialPanoramaRuntimeState,
  resolveViewportForItem,
  transitionToGroup,
  transitionToItem,
  transitionToSection,
} from '../../../panorama-runtime/panorama-state-machine'
import { PanoramaCanvas } from './PanoramaCanvas'
import { PanoramaInspectorPanel } from './PanoramaInspectorPanel'
import { PanoramaStructurePanel } from './PanoramaStructurePanel'

interface PanoramaEditorPageProps {
  document: PanoramaEditorDocument
  saving?: boolean
  packaging?: boolean
  lastSavedLabel?: string | null
  saveFeedbackLabel?: string | null
  saveFeedbackTone?: 'success' | 'error'
  packageFeedbackLabel?: string | null
  packageFeedbackTone?: 'success' | 'error' | 'info'
  onSave?: (document: PanoramaEditorDocument) => void | Promise<void>
  onPreview?: (document: PanoramaEditorDocument) => void
  onPackage?: (document: PanoramaEditorDocument) => void | Promise<void>
}

function createDraftId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function createDefaultItem(index: number): PanoramaItem {
  return {
    id: createDraftId('item'),
    title: `三级项 ${index}`,
    description: '',
    order: index,
    marker: { x: 0.5, y: 0.5, style: 'default' },
    focusRect: {
      x: 0.35,
      y: 0.35,
      width: 0.24,
      height: 0.2,
      radius: 12,
      maskOpacity: 0.48,
    },
    connectorTarget: { mode: 'divider-left' },
    detailBehavior: { expandMode: 'active-only', collapsedLines: 2 },
  }
}

function createDefaultGroup(index: number): PanoramaGroup {
  const firstItem = createDefaultItem(1)
  return {
    id: createDraftId('group'),
    title: `二级标题 ${index}`,
    order: index,
    panoramaAsset: {
      assetId: createDraftId('asset'),
      imageUrl: '',
    },
    defaultViewport: {
      centerX: 0.5,
      centerY: 0.5,
      zoom: 3.6,
    },
    defaultItemId: firstItem.id,
    items: [firstItem],
  }
}

function createDefaultSection(index: number): PanoramaSection {
  const firstGroup = createDefaultGroup(1)
  return {
    id: createDraftId('section'),
    label: `一级标签 ${index}`,
    order: index,
    defaultGroupId: firstGroup.id,
    groups: [firstGroup],
  }
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function resequenceSections(sections: PanoramaSection[]): PanoramaSection[] {
  return sections.map((section, index) => ({
    ...section,
    order: index + 1,
    groups: section.groups.map((group, groupIndex) => ({
      ...group,
      order: groupIndex + 1,
      items: group.items.map((item, itemIndex) => ({
        ...item,
        order: itemIndex + 1,
      })),
    })),
  }))
}

function alignRuntimeState(
  nextDocument: PanoramaEditorDocument,
  previousState: PanoramaRuntimeState,
): PanoramaRuntimeState {
  const section = nextDocument.product.sections.find(item => item.id === previousState.activeSectionId)
  if (!section) {
    return resolveInitialPanoramaRuntimeState(nextDocument.product)
  }
  const group = section.groups.find(item => item.id === previousState.activeGroupId)
  if (!group) {
    return transitionToSection(previousState, section)
  }
  const item = group.items.find(entry => entry.id === previousState.activeItemId)
  if (!item) {
    return transitionToGroup(previousState, section, group)
  }
  return {
    ...previousState,
    activeSectionId: section.id,
    activeGroupId: group.id,
    activeItemId: item.id,
    activeViewport: resolveViewportForItem(group, item),
    activeFocusRect: resolveFocusRectForItem(item),
    activeMarkerId: item.id,
  }
}

export function PanoramaEditorPage({
  document,
  saving = false,
  packaging = false,
  lastSavedLabel = null,
  saveFeedbackLabel = null,
  saveFeedbackTone = 'success',
  packageFeedbackLabel = null,
  packageFeedbackTone = 'info',
  onSave,
  onPreview,
  onPackage,
}: PanoramaEditorPageProps) {
  const [editorDocument, setEditorDocument] = useState<PanoramaEditorDocument>(() => structuredClone(document))
  const [runtimeState, setRuntimeState] = useState(() => resolveInitialPanoramaRuntimeState(document.product))
  const [viewportMode, setViewportMode] = useState<'group-default' | 'item-override'>(
    document.draftState.viewportMode ?? 'group-default',
  )

  const activeSection = useMemo((): PanoramaSection | null => {
    return editorDocument.product.sections.find(section => section.id === runtimeState.activeSectionId) ?? null
  }, [editorDocument.product.sections, runtimeState.activeSectionId])

  const activeGroup = useMemo((): PanoramaGroup | null => {
    return activeSection?.groups.find(group => group.id === runtimeState.activeGroupId) ?? null
  }, [activeSection, runtimeState.activeGroupId])

  const activeItem = useMemo((): PanoramaItem | null => {
    return activeGroup?.items.find(item => item.id === runtimeState.activeItemId) ?? null
  }, [activeGroup, runtimeState.activeItemId])

  const effectiveViewport = useMemo((): PanoramaViewport | null => {
    if (!activeGroup || !activeItem) return null
    if (viewportMode === 'item-override') {
      return activeItem.viewportOverride ?? activeGroup.defaultViewport
    }
    return activeGroup.defaultViewport
  }, [activeGroup, activeItem, viewportMode])

  const globalPanoramaImageUrl = useMemo(() => {
    return editorDocument.product.globalPanoramaAsset?.imageUrl ?? activeGroup?.panoramaAsset.imageUrl ?? ''
  }, [activeGroup?.panoramaAsset.imageUrl, editorDocument.product.globalPanoramaAsset?.imageUrl])

  const updateDocument = (
    updater: (current: PanoramaEditorDocument) => PanoramaEditorDocument,
    nextStateResolver?: (nextDocument: PanoramaEditorDocument, previousState: PanoramaRuntimeState) => PanoramaRuntimeState,
  ) => {
    setEditorDocument(current => {
      const next = updater(current)
      setRuntimeState(previous => nextStateResolver ? nextStateResolver(next, previous) : alignRuntimeState(next, previous))
      return next
    })
  }

  const handleSelectSection = (sectionId: string) => {
    const section = editorDocument.product.sections.find(item => item.id === sectionId)
    if (!section) return
    setViewportMode('group-default')
    setRuntimeState(previous => transitionToSection(previous, section))
  }

  const handleSelectGroup = (sectionId: string, groupId: string) => {
    const section = editorDocument.product.sections.find(item => item.id === sectionId)
    const group = section?.groups.find(item => item.id === groupId)
    if (!section || !group) return
    setViewportMode('group-default')
    setRuntimeState(previous => transitionToGroup(previous, section, group))
  }

  const handleSelectItem = (sectionId: string, groupId: string, itemId: string) => {
    const section = editorDocument.product.sections.find(item => item.id === sectionId)
    const group = section?.groups.find(entry => entry.id === groupId)
    const item = group?.items.find(entry => entry.id === itemId)
    if (!group || !item) return
    setViewportMode(item.viewportOverride ? 'item-override' : 'group-default')
    setRuntimeState(previous => transitionToItem(previous, group, item, 'scroll-sync'))
  }

  const handleUpdateGroup = (updater: (group: PanoramaGroup) => PanoramaGroup) => {
    if (!activeSection || !activeGroup) return
    updateDocument(current => ({
      ...current,
      product: {
        ...current.product,
        sections: current.product.sections.map(section => {
          if (section.id !== activeSection.id) return section
          return {
            ...section,
            groups: section.groups.map(group => group.id === activeGroup.id ? updater(group) : group),
          }
        }),
      },
    }))
  }

  const handleUpdateItem = (updater: (item: PanoramaItem) => PanoramaItem) => {
    if (!activeSection || !activeGroup || !activeItem) return
    updateDocument(current => ({
      ...current,
      product: {
        ...current.product,
        sections: current.product.sections.map(section => {
          if (section.id !== activeSection.id) return section
          return {
            ...section,
            groups: section.groups.map(group => {
              if (group.id !== activeGroup.id) return group
              return {
                ...group,
                items: group.items.map(item => item.id === activeItem.id ? updater(item) : item),
              }
            }),
          }
        }),
      },
    }))
  }

  const handleUpdateMarker = (marker: PanoramaMarker) => {
    handleUpdateItem(item => ({
      ...item,
      marker,
    }))
  }

  const handleUpdateFocusRect = (focusRect: PanoramaFocusRect) => {
    handleUpdateItem(item => ({
      ...item,
      focusRect,
    }))
  }

  const handleResetView = () => {
    setRuntimeState(resolveInitialPanoramaRuntimeState(editorDocument.product))
    setViewportMode('group-default')
  }

  const handleGlobalPanoramaAssetUrlChange = (imageUrl: string) => {
    updateDocument(current => ({
      ...current,
      product: {
        ...current.product,
        globalPanoramaAsset: {
          assetId: current.product.globalPanoramaAsset?.assetId ?? `${current.product.id}-global-panorama`,
          imageUrl,
        },
        sections: current.product.sections.map(section => ({
          ...section,
          groups: section.groups.map(group => ({
            ...group,
            panoramaAsset: {
              ...group.panoramaAsset,
              imageUrl,
            },
          })),
        })),
      },
    }))
  }

  const handleUpdateViewportMode = (mode: 'group-default' | 'item-override') => {
    if (!activeGroup || !activeItem) return
    if (mode === 'item-override' && !activeItem.viewportOverride) {
      handleUpdateItem(item => ({
        ...item,
        viewportOverride: activeGroup.defaultViewport,
      }))
    }
    setViewportMode(mode)
  }

  const handleClearViewportOverride = () => {
    handleUpdateItem(item => ({
      ...item,
      viewportOverride: undefined,
    }))
    setViewportMode('group-default')
  }

  const handleUpdateViewport = (viewport: PanoramaViewport) => {
    if (viewportMode === 'item-override') {
      handleUpdateItem(item => ({
        ...item,
        viewportOverride: viewport,
      }))
      return
    }
    handleUpdateGroup(group => ({
      ...group,
      defaultViewport: viewport,
    }))
  }

  const handleAddSection = () => {
    updateDocument(current => {
      const nextSection = createDefaultSection(current.product.sections.length + 1)
      return {
        ...current,
        product: {
          ...current.product,
          sections: resequenceSections([...current.product.sections, nextSection]),
        },
      }
    }, (nextDocument, previousState) => {
      const section = nextDocument.product.sections[nextDocument.product.sections.length - 1]
      return transitionToSection(previousState, section)
    })
  }

  const handleDeleteSection = (sectionId: string) => {
    if (editorDocument.product.sections.length <= 1) return
    if (!window.confirm('确认删除该一级标签吗？')) return
    updateDocument(current => ({
      ...current,
      product: {
        ...current.product,
        sections: resequenceSections(current.product.sections.filter(section => section.id !== sectionId)),
      },
    }))
  }

  const handleMoveSection = (sectionId: string, direction: -1 | 1) => {
    updateDocument(current => {
      const fromIndex = current.product.sections.findIndex(section => section.id === sectionId)
      const nextSections = resequenceSections(moveArrayItem(current.product.sections, fromIndex, fromIndex + direction))
      return {
        ...current,
        product: {
          ...current.product,
          sections: nextSections,
        },
      }
    })
  }

  const handleAddGroup = (sectionId: string) => {
    updateDocument(current => {
      const nextSections = current.product.sections.map(section => {
        if (section.id !== sectionId) return section
        const nextGroup = createDefaultGroup(section.groups.length + 1)
        return {
          ...section,
          defaultGroupId: section.defaultGroupId ?? nextGroup.id,
          groups: section.groups
            .concat(nextGroup)
            .map((group, index) => ({ ...group, order: index + 1 })),
        }
      })
      return {
        ...current,
        product: {
          ...current.product,
          sections: nextSections,
        },
      }
    }, (nextDocument, previousState) => {
      const section = nextDocument.product.sections.find(item => item.id === sectionId)
      const group = section?.groups[section.groups.length - 1]
      if (!section || !group) return previousState
      return transitionToGroup(previousState, section, group)
    })
  }

  const handleDeleteGroup = (sectionId: string, groupId: string) => {
    const section = editorDocument.product.sections.find(item => item.id === sectionId)
    if (!section || section.groups.length <= 1) return
    if (!window.confirm('确认删除该二级标题吗？')) return
    updateDocument(current => ({
      ...current,
      product: {
        ...current.product,
        sections: current.product.sections.map(entry => {
          if (entry.id !== sectionId) return entry
          const nextGroups = entry.groups
            .filter(group => group.id !== groupId)
            .map((group, index) => ({ ...group, order: index + 1 }))
          return {
            ...entry,
            defaultGroupId: nextGroups[0]?.id,
            groups: nextGroups,
          }
        }),
      },
    }))
  }

  const handleMoveGroup = (sectionId: string, groupId: string, direction: -1 | 1) => {
    updateDocument(current => ({
      ...current,
      product: {
        ...current.product,
        sections: current.product.sections.map(section => {
          if (section.id !== sectionId) return section
          const fromIndex = section.groups.findIndex(group => group.id === groupId)
          return {
            ...section,
            groups: moveArrayItem(section.groups, fromIndex, fromIndex + direction)
              .map((group, index) => ({ ...group, order: index + 1 })),
          }
        }),
      },
    }))
  }

  const handleAddItem = (sectionId: string, groupId: string) => {
    updateDocument(current => ({
      ...current,
      product: {
        ...current.product,
        sections: current.product.sections.map(section => {
          if (section.id !== sectionId) return section
          return {
            ...section,
            groups: section.groups.map(group => {
              if (group.id !== groupId) return group
              const nextItem = createDefaultItem(group.items.length + 1)
              return {
                ...group,
                defaultItemId: group.defaultItemId ?? nextItem.id,
                items: group.items
                  .concat(nextItem)
                  .map((item, index) => ({ ...item, order: index + 1 })),
              }
            }),
          }
        }),
      },
    }), (nextDocument, previousState) => {
      const section = nextDocument.product.sections.find(item => item.id === sectionId)
      const group = section?.groups.find(item => item.id === groupId)
      const item = group?.items[group.items.length - 1]
      if (!group || !item) return previousState
      return transitionToItem(previousState, group, item, 'scroll-sync')
    })
  }

  const handleDeleteItem = (sectionId: string, groupId: string, itemId: string) => {
    const section = editorDocument.product.sections.find(item => item.id === sectionId)
    const group = section?.groups.find(item => item.id === groupId)
    if (!group || group.items.length <= 1) return
    if (!window.confirm('确认删除该三级项吗？')) return
    updateDocument(current => ({
      ...current,
      product: {
        ...current.product,
        sections: current.product.sections.map(entry => {
          if (entry.id !== sectionId) return entry
          return {
            ...entry,
            groups: entry.groups.map(groupEntry => {
              if (groupEntry.id !== groupId) return groupEntry
              const nextItems = groupEntry.items
                .filter(item => item.id !== itemId)
                .map((item, index) => ({ ...item, order: index + 1 }))
              return {
                ...groupEntry,
                defaultItemId: nextItems[0]?.id,
                items: nextItems,
              }
            }),
          }
        }),
      },
    }))
  }

  const handleMoveItem = (sectionId: string, groupId: string, itemId: string, direction: -1 | 1) => {
    updateDocument(current => ({
      ...current,
      product: {
        ...current.product,
        sections: current.product.sections.map(section => {
          if (section.id !== sectionId) return section
          return {
            ...section,
            groups: section.groups.map(group => {
              if (group.id !== groupId) return group
              const fromIndex = group.items.findIndex(item => item.id === itemId)
              return {
                ...group,
                items: moveArrayItem(group.items, fromIndex, fromIndex + direction)
                  .map((item, index) => ({ ...item, order: index + 1 })),
              }
            }),
          }
        }),
      },
    }))
  }

  return (
    <Stack h="100%" gap="5" minH="640px">
      <Flex
        justify="space-between"
        align="flex-start"
        gap="4"
        p="5"
        borderRadius="xl"
        border="1px solid"
        borderColor="border-default"
        bg="linear-gradient(180deg, rgba(18,19,26,0.98) 0%, rgba(18,19,26,0.86) 100%)"
        boxShadow="lg"
        wrap="wrap"
      >
        <Flex gap="4" align="flex-start">
          <Flex
            w="44px"
            h="44px"
            borderRadius="lg"
            bg="brand-subtle"
            color="brand"
            align="center"
            justify="center"
            border="1px solid"
            borderColor="rgba(99, 102, 241, 0.24)"
            flexShrink={0}
          >
            <Layers3 size={18} />
          </Flex>
          <VStack align="flex-start" gap="2">
            <Box>
              <Text fontSize="lg" fontWeight="800" color="text-primary" letterSpacing="0.02em">
                Panorama Workspace
              </Text>
              <Text fontSize="sm" color="text-secondary" mt="1">
                在管理端内直接编辑全景结构、视口、聚焦框与标点定位。
              </Text>
            </Box>
            <HStack gap="2" flexWrap="wrap">
              <Badge bg="brand-subtle" color="brand">本地持久化</Badge>
              <Badge bg="surface-raised" color="text-secondary">
                {editorDocument.product.sections.length} 个一级分组
              </Badge>
              <Badge bg="surface-raised" color="text-secondary">
                {editorDocument.product.sections.reduce((count, section) => count + section.groups.length, 0)} 个二级
              </Badge>
              <Badge bg="surface-raised" color="text-secondary">
                {editorDocument.product.sections.reduce((count, section) => count + section.groups.reduce((inner, group) => inner + group.items.length, 0), 0)} 个三级
              </Badge>
              {lastSavedLabel ? (
                <Badge bg="surface-raised" color="text-secondary">
                  {lastSavedLabel}
                </Badge>
              ) : null}
              {saveFeedbackLabel ? (
                <Badge
                  bg={saveFeedbackTone === 'error' ? 'error-subtle' : 'success-subtle'}
                  color={saveFeedbackTone === 'error' ? 'error' : 'success'}
                >
                  {saveFeedbackLabel}
                </Badge>
              ) : null}
              {packageFeedbackLabel ? (
                <Badge
                  bg={
                    packageFeedbackTone === 'error'
                      ? 'error-subtle'
                      : packageFeedbackTone === 'success'
                        ? 'success-subtle'
                        : 'info-subtle'
                  }
                  color={
                    packageFeedbackTone === 'error'
                      ? 'error'
                      : packageFeedbackTone === 'success'
                        ? 'success'
                        : 'info'
                  }
                >
                  {packageFeedbackLabel}
                </Badge>
              ) : null}
            </HStack>
          </VStack>
        </Flex>
        <HStack gap="2" flexWrap="wrap" justify="flex-end">
          <Button
            size="sm"
            variant="outline"
            bg="surface-raised"
            color="text-primary"
            borderColor="border-default"
            _hover={{ bg: 'surface-overlay' }}
            onClick={handleResetView}
          >
            <RotateCcw size={14} style={{ marginRight: 6 }} />
            重置视图
          </Button>
          <Button
            size="sm"
            variant="outline"
            bg="surface-raised"
            color="text-primary"
            borderColor="border-default"
            _hover={{ bg: 'surface-overlay' }}
            onClick={() => onPreview?.(editorDocument)}
          >
            <Eye size={14} style={{ marginRight: 6 }} />
            运行时预览
          </Button>
          <Button
            size="sm"
            variant="outline"
            bg="surface-raised"
            color="text-primary"
            borderColor="border-default"
            _hover={{ bg: 'surface-overlay' }}
            isLoading={packaging}
            loadingText="打包中"
            onClick={() => onPackage?.(editorDocument)}
          >
            <Download size={14} style={{ marginRight: 6 }} />
            独立打包
          </Button>
          <Button
            size="sm"
            bg="brand"
            color="white"
            _hover={{ bg: 'brand-hover' }}
            isLoading={saving}
            loadingText="保存中"
            onClick={() => onSave?.(editorDocument)}
          >
            <Save size={14} style={{ marginRight: 6 }} />
            保存
          </Button>
        </HStack>
      </Flex>
      <Flex h="100%" gap="5" minH="620px" align="stretch">
        <PanoramaStructurePanel
          sections={editorDocument.product.sections}
          activeSectionId={runtimeState.activeSectionId}
          activeGroupId={runtimeState.activeGroupId}
          activeItemId={runtimeState.activeItemId}
          onAddSection={handleAddSection}
          onDeleteSection={handleDeleteSection}
          onMoveSection={handleMoveSection}
          onAddGroup={handleAddGroup}
          onDeleteGroup={handleDeleteGroup}
          onMoveGroup={handleMoveGroup}
          onAddItem={handleAddItem}
          onDeleteItem={handleDeleteItem}
          onMoveItem={handleMoveItem}
          onSelectSection={handleSelectSection}
          onSelectGroup={handleSelectGroup}
          onSelectItem={handleSelectItem}
        />
        <PanoramaCanvas
          backgroundImageUrl={globalPanoramaImageUrl}
          group={activeGroup}
          item={activeItem}
          viewport={effectiveViewport}
          marker={activeItem?.marker ?? null}
          focusRect={runtimeState.activeFocusRect}
          onMarkerChange={handleUpdateMarker}
          onFocusRectChange={handleUpdateFocusRect}
          onViewportChange={handleUpdateViewport}
        />
        <PanoramaInspectorPanel
          section={activeSection}
          group={activeGroup}
          item={activeItem}
          globalPanoramaImageUrl={globalPanoramaImageUrl}
          viewport={effectiveViewport}
          focusRect={runtimeState.activeFocusRect}
          viewportMode={viewportMode}
          onViewportModeChange={handleUpdateViewportMode}
          onClearViewportOverride={handleClearViewportOverride}
          onGroupTitleChange={title => handleUpdateGroup(group => ({ ...group, title }))}
          onGlobalPanoramaImageUrlChange={handleGlobalPanoramaAssetUrlChange}
          onItemTitleChange={title => handleUpdateItem(item => ({ ...item, title }))}
          onItemDescriptionChange={description => handleUpdateItem(item => ({ ...item, description }))}
          onViewportChange={handleUpdateViewport}
          onFocusRectChange={handleUpdateFocusRect}
        />
      </Flex>
    </Stack>
  )
}
