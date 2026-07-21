/**
 * CatalogCanvas — list of categories for the active stage plus
 * inline item tree.
 *
 * This is the operator's authoring surface for the catalog product.
 * It's structured data, not a spatial canvas, so it renders as a
 * collapsible list with the categories and their items nested.
 */
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Circle, CircleDot, Inbox, Plus, Trash2 } from 'lucide-react'
import type {
  GuideProject,
  IndustryStage,
  IndustryCategory,
  IndustryItem,
} from '@domain/project-types'
import type { CatalogSelection } from '../store'
import { EmptyState } from '@chakra-ui/react'
import { localized } from '../../projects/localization'

interface Props {
  project: GuideProject
  activeStage: IndustryStage
  selection: CatalogSelection
  onSelectStage: (stageKey: IndustryStage['key']) => void
  onSelect: (s: CatalogSelection) => void
  onAddCategory: () => void
  onRenameCategory: (categoryId: string, title: string) => void
  onDeleteCategory: (categoryId: string) => void
  onAddItem: (categoryId: string) => void
  onDeleteItem: (itemId: string) => void
  locale: string
}

export function CatalogCanvas({
  project,
  activeStage,
  selection,
  onSelectStage,
  onSelect,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onAddItem,
  onDeleteItem,
  locale,
}: Props): JSX.Element {
  const items = project.knowledge.items
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(activeStage.categories.map(c => c.id)),
  )

  useEffect(() => {
    setExpanded(current => {
      const next = new Set(current)
      for (const category of activeStage.categories) next.add(category.id)
      return next
    })
  }, [activeStage])

  const toggle = (id: string) =>
    setExpanded(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <aside
      data-testid="catalog-canvas"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--ig-colors-paper-raised)',
        borderRight: '1px solid var(--ig-colors-rule)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px 10px',
          borderBottom: '1px solid var(--ig-colors-rule)',
          flexShrink: 0,
        }}
      >
        <nav
          aria-label="产业链阶段"
          data-testid="catalog-editor-stage-tabs"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 4,
            marginBottom: 12,
            padding: 3,
            borderRadius: 5,
            background: 'var(--ig-colors-paper-sunken)',
            border: '1px solid var(--ig-colors-rule)',
          }}
        >
          {project.knowledge.stages.map(stage => {
            const active = stage.key === activeStage.key
            return (
              <button
                key={stage.key}
                type="button"
                data-testid={`catalog-editor-stage-${stage.key}`}
                data-active={active ? 'true' : 'false'}
                aria-pressed={active}
                onClick={() => onSelectStage(stage.key)}
                style={stageButtonStyle(active)}
              >
                {localized(stage.label, locale)}
              </button>
            )
          })}
        </nav>
        <div className="eyebrow">Stage</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginTop: 2,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ig-colors-ink)' }}>
            {localized(activeStage.label, locale)}
          </h2>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ig-colors-ink-faint)' }}>
            {activeStage.categories.length} cats ·{' '}
            {activeStage.categories.reduce((acc, c) => acc + c.itemIds.length, 0)} items
          </span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px 16px' }}>
        {activeStage.categories.length === 0 ? (
          <EmptyState.Root
            borderColor="border.strong"
            borderStyle="dashed"
            borderWidth="2px"
            bg="bg.raised"
            p="6"
          >
            <EmptyState.Indicator>
              <Inbox size={36} strokeWidth={1.25} color="ink.faint" />
            </EmptyState.Indicator>
            <EmptyState.Title>{`${localized(activeStage.label, locale)} 暂无分类`}</EmptyState.Title>
            <EmptyState.Description>点击下方按钮添加第一个分类。</EmptyState.Description>
            <button
              type="button"
              onClick={onAddCategory}
              data-testid={`btn-add-category-empty`}
              style={addRowStyle()}
            >
              <Plus size={11} />
              <span>新增分类</span>
            </button>
          </EmptyState.Root>
        ) : (
          <>
            {activeStage.categories.map(cat => {
              const isSelected = selection?.kind === 'category' && selection.id === cat.id
              const catExpanded = expanded.has(cat.id)
              return (
                <CategoryBlock
                  key={cat.id}
                  cat={cat}
                  items={items}
                  isSelected={isSelected}
                  expanded={catExpanded}
                  onToggle={() => toggle(cat.id)}
                  onSelect={() => onSelect({ kind: 'category', id: cat.id })}
                  onRename={t => onRenameCategory(cat.id, t)}
                  onDelete={() => onDeleteCategory(cat.id)}
                  onAddItem={() => onAddItem(cat.id)}
                  onDeleteItem={itemId => onDeleteItem(itemId)}
                  onSelectItem={itemId => onSelect({ kind: 'item', id: itemId })}
                  selection={selection}
                  locale={locale}
                />
              )
            })}
            <button
              type="button"
              onClick={onAddCategory}
              data-testid={`btn-add-category`}
              style={addRowStyle({ marginTop: 8 })}
            >
              <Plus size={11} />
              <span>新增分类</span>
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

interface CategoryBlockProps {
  cat: IndustryCategory
  items: Record<string, IndustryItem>
  isSelected: boolean
  expanded: boolean
  onToggle: () => void
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
  onAddItem: () => void
  onDeleteItem: (itemId: string) => void
  onSelectItem: (itemId: string) => void
  selection: CatalogSelection
  locale: string
}

function CategoryBlock({
  cat,
  items,
  isSelected,
  expanded,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onAddItem,
  onDeleteItem,
  onSelectItem,
  selection,
  locale,
}: CategoryBlockProps): JSX.Element {
  const title = localized(cat.title, locale)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const commit = () => {
    const t = draft.trim()
    if (t && t !== title) onRename(t)
    setEditing(false)
  }
  return (
    <div
      data-testid={`catalog-category-${cat.id}`}
      data-active={isSelected ? 'true' : 'false'}
      className={`tile tile-button ${isSelected ? '' : ''}`}
      style={{
        border: '1px solid var(--ig-colors-rule)',
        borderRadius: 4,
        marginBottom: 6,
        background: 'var(--ig-colors-paper-raised)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
        }}
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
        <CircleDot
          size={11}
          style={{
            color: cat.itemIds.length > 0 ? 'var(--ig-colors-brand)' : 'var(--ig-colors-ink-faint)',
          }}
        />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="ig-input"
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 500,
              padding: '1px 4px',
              border: '1px solid var(--ig-colors-brand)',
              borderRadius: 3,
              outline: 'none',
              background: 'var(--ig-colors-paper-overlay)',
            }}
          />
        ) : (
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={e => {
              e.stopPropagation()
              setEditing(true)
              setDraft(title)
            }}
            data-interactive="true"
            style={{
              flex: 1,
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--ig-colors-ink)',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 3,
              transition: 'background 150ms',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--ig-colors-paper-sunken)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {title}
          </button>
        )}
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: 'var(--ig-colors-ink-faint)',
          }}
        >
          {cat.itemIds.length}
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="删除分类"
          data-interactive="true"
          className="icon-btn"
          style={{ ...iconButtonStyle(), opacity: 0.5 }}
        >
          <Trash2 size={11} />
        </button>
      </div>
      {expanded && (
        <div
          style={{
            borderTop: '1px solid var(--ig-colors-rule)',
            padding: '4px 8px 6px',
          }}
        >
          {cat.itemIds.map(itemId => {
            const item = items[itemId]
            if (!item) return null
            const selected = selection?.kind === 'item' && selection.id === item.id
            return (
              <div
                key={itemId}
                data-testid={`catalog-item-${itemId}`}
                data-active={selected ? 'true' : 'false'}
                onClick={() => onSelectItem(itemId)}
                data-interactive="true"
                className={`tile tile-button ${selected ? '' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px',
                  borderRadius: 3,
                  background: selected ? 'var(--ig-colors-paper-sunken)' : 'transparent',
                  margin: '1px 0',
                  cursor: 'pointer',
                }}
              >
                <Circle size={9} style={{ color: 'var(--ig-colors-ink-faint)' }} />
                <span style={{ fontSize: 12, color: 'var(--ig-colors-ink)' }}>
                  {localized(item.title, locale)}
                </span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    onDeleteItem(itemId)
                  }}
                  aria-label="删除项目"
                  data-interactive="true"
                  className="icon-btn"
                  style={{ ...iconButtonStyle(), marginLeft: 'auto', opacity: 0.4 }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={onAddItem}
            data-testid={`btn-add-item-${cat.id}`}
            data-interactive="true"
            style={addRowStyle({ marginTop: 2 })}
          >
            <Plus size={11} />
            <span>新增项目</span>
          </button>
        </div>
      )}
    </div>
  )
}

function addRowStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    background: 'transparent',
    border: '1px dashed var(--ig-colors-rule)',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 11,
    color: 'var(--ig-colors-ink-muted)',
    transition: 'background 150ms, color 150ms, border-color 150ms',
    ...extra,
  }
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
  }
}

function stageButtonStyle(active: boolean): React.CSSProperties {
  return {
    minWidth: 0,
    padding: '6px 4px',
    border: 'none',
    borderRadius: 3,
    background: active ? 'var(--ig-colors-paper-raised)' : 'transparent',
    boxShadow: active ? '0 1px 3px rgba(15, 23, 42, .12)' : 'none',
    color: active ? 'var(--ig-colors-ink)' : 'var(--ig-colors-ink-muted)',
    fontSize: 12,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease, box-shadow 150ms ease',
  }
}
