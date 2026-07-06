/**
 * CatalogStageTabs — three-up tabs across the top.
 *
 * Operators live in one stage at a time when browsing the catalog. The
 * tab shows the count so they always know what's in each stage.
 */
import type { IndustryStage } from '@domain/project-types'
import type { IndustryStageKey } from '@domain/project-types'

interface Props {
  stages: IndustryStage[]
  activeStageKey: IndustryStageKey
  onChange: (key: IndustryStageKey) => void
  stats: Array<{ key: IndustryStageKey; count: number }>
}

export function CatalogStageTabs({ stages, activeStageKey, onChange, stats }: Props): JSX.Element {
  return (
    <div
      data-testid="catalog-stage-tabs"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: 'var(--ig-colors-paper-raised)',
        borderBottom: '1px solid var(--ig-colors-rule)',
        padding: '0 24px',
        flexShrink: 0,
      }}
    >
      {stages.map((stage) => {
        const active = stage.key === activeStageKey
        const count = stats.find((s) => s.key === stage.key)?.count ?? stage.categories.length
        return (
          <button
            type="button"
            key={stage.key}
            data-testid={`stage-tab-${stage.key}`}
            data-active={active ? 'true' : 'false'}
            data-interactive="true"
            className="tab-btn"
            onClick={() => onChange(stage.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 16px',
              fontSize: 14,
            }}
          >
            <span>{stage.label}</span>
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: active ? 'var(--ig-colors-brand)' : 'var(--ig-colors-ink-faint)',
                fontWeight: 600,
              }}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}