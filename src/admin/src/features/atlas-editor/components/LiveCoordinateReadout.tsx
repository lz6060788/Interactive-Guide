/**
 * LiveCoordinateReadout — the floating coordinate readout pinned to the
 * cursor while the canvas is being calibrated.
 *
 * Shows live cursor coords plus the currently active drag handle (so
 * operators always know which focus rect corner, callout pin, or
 * hotspot they're moving).
 */
interface Props {
  coord: { x: number; y: number } | null
  zoom: number
  tool: 'select' | 'marker' | 'callout'
  activeHandle?: string | null
}

const HANDLE_LABELS: Record<string, string> = {
  hotspot: 'hotspot',
  'focus-center': 'focus',
  'focus-corner-nw': 'focus NW',
  'focus-corner-ne': 'focus NE',
  'focus-corner-sw': 'focus SW',
  'focus-corner-se': 'focus SE',
  'callout-target': 'callout',
  'item-marker': 'marker',
}

export function LiveCoordinateReadout({
  coord,
  zoom,
  tool,
  activeHandle = null,
}: Props): JSX.Element {
  const handleLabel = activeHandle ? HANDLE_LABELS[activeHandle] : null
  return (
    <div
      data-testid="live-coord"
      data-tool={tool}
      data-handle={activeHandle ?? undefined}
      className="mono"
      style={readoutStyle()}
    >
      {handleLabel && (
        <>
          <span style={handleStyle()}>{handleLabel}</span>
          <span style={separatorStyle()} />
        </>
      )}
      {coord ? (
        <>
          <span style={valueStyle()}>x {coord.x.toFixed(3)}</span>
          <span style={valueStyle()}>y {coord.y.toFixed(3)}</span>
        </>
      ) : (
        <>
          <span style={labelStyle()}>x —</span>
          <span style={labelStyle()}>y —</span>
        </>
      )}
      <span style={separatorStyle()} />
      <span style={labelStyle()}>z {zoom.toFixed(2)}</span>
    </div>
  )
}

function readoutStyle(): React.CSSProperties {
  return {
    position: 'absolute',
    bottom: 12,
    left: 12,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 12px',
    background: 'rgba(15, 23, 42, 0.78)',
    color: '#e2e8f0',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.04em',
    pointerEvents: 'none',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(4px)',
    zIndex: 50,
  }
}

function valueStyle(): React.CSSProperties {
  return {
    color: '#fbbf24',
    fontVariantNumeric: 'tabular-nums',
  }
}

function labelStyle(): React.CSSProperties {
  return {
    color: '#cbd5e1',
    fontVariantNumeric: 'tabular-nums',
  }
}

function handleStyle(): React.CSSProperties {
  return {
    color: '#fb923c',
    fontVariantNumeric: 'tabular-nums',
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: '0.06em',
    fontWeight: 600,
  }
}

function separatorStyle(): React.CSSProperties {
  return {
    width: 1,
    height: 12,
    background: 'rgba(148, 163, 184, 0.4)',
  }
}