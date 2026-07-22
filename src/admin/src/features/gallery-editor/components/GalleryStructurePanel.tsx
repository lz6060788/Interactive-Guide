import { useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  EmptyState,
  Grid,
  HStack,
  IconButton,
  Stack,
  Text,
} from '@chakra-ui/react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ImagePlus,
  Inbox,
  Plus,
  Trash2,
} from 'lucide-react'
import type { GuideProject, IndustryStage, IndustryStageKey } from '@domain/project-types'
import { readLocalizedText } from '@domain/localization'
import type { GalleryEditorSelection } from '../types'

interface GalleryStructurePanelProps {
  project: GuideProject
  activeStage: IndustryStage
  selection: GalleryEditorSelection
  locale: string
  isSaving: boolean
  onSelectStage: (stageKey: IndustryStageKey) => void
  onSelect: (selection: GalleryEditorSelection) => void
  onAddCategory: () => void
  onDeleteCategory: (categoryId: string) => void
  onAddItem: (categoryId: string) => void
  onDeleteItem: (itemId: string) => void
}

export function GalleryStructurePanel({
  project,
  activeStage,
  selection,
  locale,
  isSaving,
  onSelectStage,
  onSelect,
  onAddCategory,
  onDeleteCategory,
  onAddItem,
  onDeleteItem,
}: GalleryStructurePanelProps): JSX.Element {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(activeStage.categories.map(category => category.id)),
  )

  useEffect(() => {
    setExpanded(current => {
      const next = new Set(current)
      for (const category of activeStage.categories) next.add(category.id)
      return next
    })
  }, [activeStage])

  const toggle = (categoryId: string) => {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  return (
    <Box
      as="aside"
      data-testid="gallery-structure-panel"
      h="100%"
      display="flex"
      flexDirection="column"
      overflow="hidden"
      bg="bg.raised"
      borderRightWidth="1px"
      borderColor="border"
    >
      <Box px="4" pt="3.5" pb="3" borderBottomWidth="1px" borderColor="border">
        <Text className="eyebrow">Structure</Text>
        <HStack mt="0.5" align="baseline" justify="space-between">
          <Text fontSize="14px" fontWeight="600" color="ink">
            产业链结构
          </Text>
          <Text className="mono" fontSize="10px" color="ink.faint">
            {activeStage.categories.length} cats ·{' '}
            {activeStage.categories.reduce((sum, category) => sum + category.itemIds.length, 0)}{' '}
            items
          </Text>
        </HStack>
        <Grid
          mt="3"
          templateColumns="repeat(3, minmax(0, 1fr))"
          gap="1"
          p="1"
          bg="bg.sunken"
          borderWidth="1px"
          borderColor="border"
          borderRadius="md"
        >
          {project.knowledge.stages.map(stage => {
            const active = activeStage.key === stage.key
            return (
              <Button
                key={stage.key}
                size="sm"
                variant={active ? 'accent' : 'ghost'}
                minW="0"
                px="1"
                aria-pressed={active}
                data-testid={`gallery-stage-${stage.key}`}
                onClick={() => onSelectStage(stage.key)}
              >
                {readLocalizedText(stage.label, locale)}
              </Button>
            )
          })}
        </Grid>
      </Box>

      <Box flex="1" overflowY="auto" p="2">
        {activeStage.categories.length === 0 ? (
          <EmptyState.Root
            borderWidth="1px"
            borderStyle="dashed"
            borderColor="border.strong"
            borderRadius="md"
            p="6"
          >
            <EmptyState.Indicator>
              <Inbox size={34} strokeWidth={1.25} color="var(--ig-colors-ink-faint)" />
            </EmptyState.Indicator>
            <EmptyState.Title>当前阶段暂无二级节点</EmptyState.Title>
            <EmptyState.Description>
              新增节点后可继续添加三级节点并绑定图片。
            </EmptyState.Description>
            <Button size="sm" variant="secondary" borderStyle="dashed" onClick={onAddCategory}>
              <Plus size={12} /> 新增二级节点
            </Button>
          </EmptyState.Root>
        ) : (
          <Stack gap="1.5">
            {activeStage.categories.map(category => {
              const categorySelected =
                selection?.kind === 'category' && selection.id === category.id
              const isExpanded = expanded.has(category.id)
              const boundInCategory = category.itemIds.filter(itemId =>
                Boolean(project.products.gallery.itemImageAssetIds[itemId]),
              ).length
              return (
                <Box
                  key={category.id}
                  className="tile"
                  data-testid={`gallery-category-${category.id}`}
                  data-active={categorySelected ? 'true' : 'false'}
                  borderWidth="1px"
                  borderColor="border"
                  borderRadius="sm"
                  bg="bg.raised"
                  overflow="hidden"
                >
                  <HStack gap="1" px="1.5" py="1.5">
                    <IconButton
                      aria-label={isExpanded ? '折叠二级节点' : '展开二级节点'}
                      variant="ghost"
                      size="sm"
                      minW="7"
                      h="7"
                      onClick={() => toggle(category.id)}
                    >
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </IconButton>
                    <CircleDot
                      size={12}
                      color={
                        boundInCategory === category.itemIds.length && category.itemIds.length > 0
                          ? 'var(--ig-colors-accent)'
                          : 'var(--ig-colors-ink-faint)'
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      justifyContent="flex-start"
                      flex="1"
                      minW="0"
                      px="1.5"
                      color={categorySelected ? 'ink' : 'ink.muted'}
                      fontWeight={categorySelected ? '600' : '500'}
                      onClick={() => onSelect({ kind: 'category', id: category.id })}
                    >
                      <Text truncate>{readLocalizedText(category.title, locale)}</Text>
                    </Button>
                    <Badge variant="subtle" colorPalette="gray" fontFamily="mono" fontSize="9px">
                      {boundInCategory}/{category.itemIds.length}
                    </Badge>
                    <IconButton
                      aria-label="删除二级节点"
                      title="删除二级节点及其全部三级节点"
                      variant="ghost"
                      size="sm"
                      minW="7"
                      h="7"
                      color="state.error"
                      disabled={isSaving}
                      onClick={() => onDeleteCategory(category.id)}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </HStack>

                  {isExpanded && (
                    <Box borderTopWidth="1px" borderColor="border" px="2" py="1.5">
                      <Stack gap="0.5">
                        {category.itemIds.map(itemId => {
                          const item = project.knowledge.items[itemId]
                          if (!item) return null
                          const selected = selection?.kind === 'item' && selection.id === itemId
                          const bound = Boolean(project.products.gallery.itemImageAssetIds[itemId])
                          return (
                            <HStack
                              key={itemId}
                              className="tile"
                              data-active={selected ? 'true' : 'false'}
                              data-testid={`gallery-item-${itemId}`}
                              gap="1"
                              borderWidth="1px"
                              borderColor="transparent"
                              borderRadius="xs"
                              px="1"
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                flex="1"
                                minW="0"
                                justifyContent="flex-start"
                                px="1"
                                onClick={() => onSelect({ kind: 'item', id: itemId })}
                              >
                                {bound ? (
                                  <Check size={12} color="var(--ig-colors-state-ok)" />
                                ) : (
                                  <ImagePlus size={12} color="var(--ig-colors-state-warn)" />
                                )}
                                <Text truncate color={selected ? 'ink' : 'ink.muted'}>
                                  {readLocalizedText(item.title, locale)}
                                </Text>
                              </Button>
                              <IconButton
                                aria-label="删除三级节点"
                                variant="ghost"
                                size="sm"
                                minW="6"
                                h="6"
                                color="state.error"
                                disabled={isSaving}
                                onClick={() => onDeleteItem(itemId)}
                              >
                                <Trash2 size={10} />
                              </IconButton>
                            </HStack>
                          )
                        })}
                        <Button
                          size="sm"
                          variant="secondary"
                          borderStyle="dashed"
                          color="ink.muted"
                          alignSelf="flex-start"
                          mt="1"
                          onClick={() => onAddItem(category.id)}
                          disabled={isSaving}
                          data-testid={`gallery-add-item-${category.id}`}
                        >
                          <Plus size={11} /> 新增三级节点
                        </Button>
                      </Stack>
                    </Box>
                  )}
                </Box>
              )
            })}
            <Button
              size="sm"
              variant="secondary"
              borderStyle="dashed"
              alignSelf="flex-start"
              color="ink.muted"
              mt="1"
              onClick={onAddCategory}
              disabled={isSaving}
              data-testid="gallery-add-category"
            >
              <Plus size={11} /> 新增二级节点
            </Button>
          </Stack>
        )}
      </Box>
    </Box>
  )
}
