/**
 * StructurePanel — left-rail navigation through stages → categories → items.
 *
 * The panel is the operator's mental model of the project. Stages are
 * fixed (上游/中游/下游), categories are the operator's domain structure,
 * items belong to a category.
 *
 * Clicking a row selects it; the canvas and inspector both react.
 */
import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Circle,
  CircleDot,
} from 'lucide-react'
import type {
  GuideProject,
  IndustryStage,
  IndustryCategory,
  IndustryItem,
  CategorySpatialLayout,
  ItemSpatialLayout,
} from '@domain/project-types'
import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react'
import type { Selection } from '../store'

interface Props {
  project: GuideProject
  selection: Selection
  onSelect: (s: Selection) => void
  onAddCategory: (stageKey: IndustryStage['key']) => void
  onRenameCategory: (categoryId: string, title: string) => void
  onDeleteCategory: (categoryId: string) => void
  onAddItem: (categoryId: string) => void
  onRenameItem: (itemId: string, title: string) => void
  onDeleteItem: (itemId: string) => void
  isSaving: boolean
}

export function StructurePanel({
  project,
  selection,
  onSelect,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onAddItem,
  onRenameItem,
  onDeleteItem,
  isSaving,
}: Props): JSX.Element {
  const stages = project.knowledge.stages
  const items = project.knowledge.items
  const catLayouts = project.panorama.categories
  const itemLayouts = project.panorama.items

  return (
    <Box
      as="aside"
      data-testid="structure-panel"
      h="100%"
      bg="bg.raised"
      borderRightWidth="1px"
      borderColor="border"
      overflow="hidden"
      display="flex"
      flexDirection="column"
    >
      <Box
        px="4"
        pt="3.5"
        pb="2.5"
        borderBottomWidth="1px"
        borderColor="border"
        flexShrink="0"
      >
        <Text className="eyebrow">Structure</Text>
        <HStack align="baseline" justify="space-between" mt="0.5">
          <Text fontSize="14px" fontWeight="600" color="ink" m="0">
            项目结构
          </Text>
          <Text
            className="mono"
            fontSize="10px"
            color="ink.faint"
          >
            {countCategories(stages)} cats · {Object.keys(items).length} items
          </Text>
        </HStack>
      </Box>
      <Box flex="1" overflow="auto" px="2" pt="1" pb="4">
        {stages.map((stage) => (
          <StageSection
            key={stage.key}
            stage={stage}
            items={items}
            catLayouts={catLayouts}
            itemLayouts={itemLayouts}
            selection={selection}
            onSelect={onSelect}
            onAddCategory={onAddCategory}
            onRenameCategory={onRenameCategory}
            onDeleteCategory={onDeleteCategory}
            onAddItem={onAddItem}
            onRenameItem={onRenameItem}
            onDeleteItem={onDeleteItem}
            isSaving={isSaving}
          />
        ))}
      </Box>
    </Box>
  )
}

interface StageSectionProps {
  stage: IndustryStage
  items: Record<string, IndustryItem>
  catLayouts: Record<string, CategorySpatialLayout>
  itemLayouts: Record<string, ItemSpatialLayout>
  selection: Selection
  onSelect: (s: Selection) => void
  onAddCategory: (stageKey: IndustryStage['key']) => void
  onRenameCategory: (categoryId: string, title: string) => void
  onDeleteCategory: (categoryId: string) => void
  onAddItem: (categoryId: string) => void
  onRenameItem: (itemId: string, title: string) => void
  onDeleteItem: (itemId: string) => void
  isSaving: boolean
}

function StageSection({
  stage,
  items,
  catLayouts,
  itemLayouts,
  selection,
  onSelect,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onAddItem,
  onRenameItem,
  onDeleteItem,
  isSaving,
}: StageSectionProps): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())

  const toggleCat = (id: string) =>
    setExpandedCats((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Box mb="2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        data-interactive="true"
        className="icon-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 8px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--ig-colors-ink)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{stage.label}</span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: 'var(--ig-colors-ink-faint)',
            marginLeft: 'auto',
          }}
        >
          {stage.categories.length}
        </span>
      </button>
      {expanded && (
        <>
          {stage.categories.map((cat) => {
            const layout = catLayouts[cat.id]
            const isSelected = selection?.kind === 'category' && selection.id === cat.id
            const catExpanded = expandedCats.has(cat.id)
            const catItems = cat.itemIds.map((id) => items[id]).filter(Boolean)
            return (
              <Box key={cat.id} mb="0.5">
                <CategoryRow
                  cat={cat}
                  isSelected={isSelected}
                  expanded={catExpanded}
                  hasHotspot={Boolean(layout?.hotspot)}
                  hasHtmlScene={cat.experience.kind === 'html-scene'}
                  onToggle={() => toggleCat(cat.id)}
                  onSelect={() => onSelect({ kind: 'category', id: cat.id })}
                  onRename={(t) => onRenameCategory(cat.id, t)}
                  onDelete={() => onDeleteCategory(cat.id)}
                  isSaving={isSaving}
                />
                {catExpanded && (
                  <Box
                    pl="6"
                    borderLeftWidth="1px"
                    borderColor="border"
                    borderStyle="dashed"
                    ml="3.5"
                    mt="0.5"
                  >
                    {catItems.map((item) => {
                      const itemLayout = itemLayouts[item.id]
                      const itemSelected =
                        selection?.kind === 'item' && selection.id === item.id
                      return (
                        <ItemRow
                          key={item.id}
                          item={item}
                          selected={itemSelected}
                          hasMarker={Boolean(itemLayout?.marker)}
                          hasFocusRect={Boolean(itemLayout?.focusRect)}
                          onSelect={() => onSelect({ kind: 'item', id: item.id })}
                          onRename={(title) => onRenameItem(item.id, title)}
                          onDelete={() => onDeleteItem(item.id)}
                        />
                      )
                    })}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      borderStyle="dashed"
                      color="ink.muted"
                      onClick={() => onAddItem(cat.id)}
                      data-testid={`btn-add-item-${cat.id}`}
                      disabled={isSaving}
                      data-interactive="true"
                      mt="0.5"
                      ml="6"
                      h="7"
                      fontSize="11px"
                    >
                      <HStack gap="1">
                        <Plus size={11} />
                        <span>新增项目</span>
                      </HStack>
                    </Button>
                  </Box>
                )}
              </Box>
            )
          })}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            borderStyle="dashed"
            color="ink.muted"
            onClick={() => onAddCategory(stage.key)}
            data-testid={`btn-add-category-${stage.key}`}
            disabled={isSaving}
            data-interactive="true"
            mt="0.5"
            ml="6"
            h="7"
            fontSize="11px"
          >
            <HStack gap="1">
              <Plus size={11} />
              <span>新增分类</span>
            </HStack>
          </Button>
        </>
      )}
    </Box>
  )
}

function CategoryRow({
  cat,
  isSelected,
  expanded,
  hasHotspot,
  hasHtmlScene,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  isSaving,
}: {
  cat: IndustryCategory
  isSelected: boolean
  expanded: boolean
  hasHotspot: boolean
  hasHtmlScene: boolean
  onToggle: () => void
  onSelect: () => void
  onRename: (t: string) => void
  onDelete: () => void
  isSaving: boolean
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(cat.title)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== cat.title) onRename(trimmed)
    setEditing(false)
  }

  const kindHint = hasHtmlScene ? 'HTML Scene' : 'Panorama'

  return (
    <Box
      data-testid={`structure-category-${cat.id}`}
      data-active={isSelected ? 'true' : 'false'}
      data-interactive="true"
      className="tile tile-button"
      display="flex"
      alignItems="center"
      gap="1"
      px="1.5"
      py="1"
      ml="2"
      borderRadius="sm"
      bg={isSelected ? 'bg.sunken' : 'transparent'}
      borderWidth="1px"
      borderColor="transparent"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={expanded ? '折叠' : '展开'}
        data-interactive="true"
        className="icon-btn"
        style={iconButtonStyle()}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      <button
        type="button"
        onClick={onSelect}
        data-interactive="true"
        className="icon-btn"
        style={{
          ...iconButtonStyle(),
          color: hasHotspot ? 'var(--ig-colors-accent)' : 'var(--ig-colors-ink-faint)',
        }}
        title={hasHotspot ? '已放置 hotspot' : '未放置 hotspot'}
      >
        {hasHotspot ? <CircleDot size={12} /> : <Circle size={12} />}
      </button>
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setEditing(true)
          setDraft(cat.title)
        }}
        data-interactive="true"
        style={{
          flex: 1,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          fontSize: 13,
          color: 'var(--ig-colors-ink)',
          padding: '2px 4px',
          cursor: 'pointer',
          fontWeight: isSelected ? 600 : 400,
          borderRadius: 3,
        }}
      >
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            size="xs"
            h="7"
            fontSize="13px"
            borderColor="brand"
            borderRadius="xs"
            bg="bg.overlay"
          />
        ) : (
          cat.title
        )}
      </button>
      <Badge
        title={kindHint}
        variant="subtle"
        size="xs"
        colorPalette={
          hasHtmlScene ? 'green' : hasHotspot ? 'brand' : 'gray'
        }
        fontFamily="mono"
        fontSize="9px"
        px="1.5"
        py="0"
        borderRadius="xs"
      >
        {hasHtmlScene ? 'HTML' : hasHotspot ? 'PANO' : 'empty'}
      </Badge>
      <Text className="mono" fontSize="10px" color="ink.faint">
        {cat.itemIds.length}
      </Text>
      <button
        type="button"
        onClick={onDelete}
        disabled={isSaving}
        aria-label="删除分类"
        data-interactive="true"
        className="icon-btn"
        style={{
          ...iconButtonStyle(),
          opacity: isSaving ? 0.4 : 0.6,
        }}
      >
        <Trash2 size={11} />
      </button>
    </Box>
  )
}

function ItemRow({
  item,
  selected,
  hasMarker,
  hasFocusRect,
  onSelect,
  onRename,
  onDelete,
}: {
  item: IndustryItem
  selected: boolean
  hasMarker: boolean
  hasFocusRect: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.title) onRename(trimmed)
    setEditing(false)
  }

  return (
    <Box
      data-testid={`structure-item-${item.id}`}
      data-active={selected ? 'true' : 'false'}
      data-interactive="true"
      className="tile tile-button"
      onClick={onSelect}
      display="flex"
      alignItems="center"
      gap="1.5"
      px="1.5"
      py="0.5"
      borderRadius="xs"
      bg={selected ? 'bg.sunken' : 'transparent'}
      borderWidth="1px"
      borderColor="transparent"
      my="0.5"
    >
      <CircleDot
        size={9}
        color={hasMarker ? 'brand' : 'ink.faint'}
      />
      <Box flex="1" minW="0">
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            size="xs"
            h="6"
            fontSize="12px"
            borderColor="brand"
            borderRadius="xs"
            bg="bg.overlay"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <Text
            fontSize="12px"
            color="ink"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditing(true)
              setDraft(item.title)
            }}
          >
            {item.title}
          </Text>
        )}
      </Box>
      {hasFocusRect && (
        <Badge
          title="已设聚焦矩形"
          variant="subtle"
          size="xs"
          colorPalette="green"
          fontFamily="mono"
          fontSize="8px"
          px="1"
          borderRadius="xs"
        >
          FOCUS
        </Badge>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="删除项目"
        data-interactive="true"
        className="icon-btn"
        style={{
          ...iconButtonStyle(),
          marginLeft: 'auto',
          opacity: 0.5,
        }}
      >
        <Trash2 size={10} />
      </button>
    </Box>
  )
}

function iconButtonStyle(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    padding: 0,
    borderRadius: 3,
    color: 'var(--ig-colors-ink-muted)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  }
}

function countCategories(stages: IndustryStage[]): number {
  return stages.reduce((acc, s) => acc + s.categories.length, 0)
}
