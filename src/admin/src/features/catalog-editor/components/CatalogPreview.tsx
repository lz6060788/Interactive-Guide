/**
 * CatalogPreview — list rendering of the current stage's categories.
 *
 * This is a lightweight in-page preview. The full catalog runtime lives
 * in @products/catalog/runtime; mounting it would require the full
 * runtime asset loader. For the editor's WYSIWYG, a faithful list is
 * enough.
 */
import type {
  GuideProject,
  IndustryCategory,
} from '@domain/project-types'

interface Props {
  project: GuideProject
}

export function CatalogPreview({ project }: Props): JSX.Element {
  const cfg = project.products.catalog
  const width = cfg.viewport.width
  const height = Math.min(cfg.viewport.height, 720)
  const stages = project.knowledge.stages as unknown as Array<{
    key: string
    label: string
    categories: IndustryCategory[]
  }>

  return (
    <div
      data-testid="catalog-preview-host"
      style={{
        height: '100%',
        background: 'var(--ig-colors-paper-sunken)',
        display: 'flex',
        flexDirection: 'column',
        padding: 12,
        gap: 12,
        overflow: 'auto',
      }}
    >
      <h4
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--ig-colors-ink-muted)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        实时预览
      </h4>
      <div
        style={{
          width,
          height,
          margin: '0 auto',
          background: cfg.viewport.backgroundColor ?? '#ffffff',
          borderRadius: 6,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflow: 'hidden',
        }}
      >
        {cfg.hintText && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--ig-colors-ink-muted)',
              padding: '6px 0',
              borderBottom: '1px solid var(--ig-colors-rule)',
            }}
          >
            {cfg.hintText}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 4,
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--ig-colors-ink-faint)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {stages.map((s) => (
            <span
              key={s.key}
              style={{
                padding: '2px 8px',
                borderRadius: 3,
                background: 'var(--ig-colors-paper-sunken)',
              }}
            >
              {s.label} · {s.categories.length}
            </span>
          ))}
        </div>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: cfg.theme.listDensity === 'compact' ? 6 : 12,
          }}
        >
          {stages.flatMap((s) =>
            s.categories.map((c) => (
              <PreviewCategoryCard key={c.id} cat={c} project={project} />
            )),
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewCategoryCard({
  cat,
  project,
}: {
  cat: IndustryCategory
  project: GuideProject
}): JSX.Element {
  const items = cat.itemIds
    .map((id) => project.knowledge.items[id])
    .filter(Boolean)
  return (
    <div
      style={{
        background: 'var(--ig-colors-paper-raised)',
        border: '1px solid var(--ig-colors-rule)',
        borderRadius: 6,
        padding: 12,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--ig-colors-ink)',
          marginBottom: 4,
        }}
      >
        {cat.title}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--ig-colors-ink-muted)',
          marginBottom: 8,
        }}
      >
        {items.length} 个项目
      </div>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {items.slice(0, 6).map((item) => (
            <span
              key={item.id}
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--ig-colors-ink-muted)',
                padding: '2px 6px',
                background: 'var(--ig-colors-paper-sunken)',
                border: '1px solid var(--ig-colors-rule)',
                borderRadius: 3,
              }}
            >
              {item.title}
            </span>
          ))}
          {items.length > 6 && (
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--ig-colors-ink-faint)',
              }}
            >
              +{items.length - 6}
            </span>
          )}
        </div>
      )}
    </div>
  )
}