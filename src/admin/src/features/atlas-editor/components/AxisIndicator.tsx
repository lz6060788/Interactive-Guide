/**
 * AxisIndicator — fixed compass-rose + ruler overlay that sits in the top-left
 * corner of the canvas. It encodes:
 *   - panorama extent (full square = 0..1 in normalized coords)
 *   - viewport center crosshair (where the runtime will snap to)
 *   - 8 cardinal directions so the operator never gets disoriented
 *
 * Functional signature: this is the operator's "where am I on the panorama"
 * reference. Without it, dropping a hotspot on a featureless patch of image
 * leaves the operator guessing where exactly on the underlying canvas they
 * clicked. With it, every click is grounded in absolute normalized space.
 */
interface Props {
  zoom: number
  centerX: number
  centerY: number
}

const SIZE = 88
const HALF = SIZE / 2
const TICK = 6

export function AxisIndicator({ zoom, centerX, centerY }: Props): JSX.Element {
  return (
    <div
      data-testid="axis-indicator"
      data-zoom={zoom.toFixed(2)}
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        width: SIZE,
        height: SIZE,
        background: 'rgba(15, 23, 42, 0.78)',
        borderRadius: 4,
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(4px)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        style={{ display: 'block' }}
      >
        {/* Concentric zoom rings */}
        {[0.25, 0.5, 0.75].map((r) => (
          <circle
            key={r}
            cx={HALF}
            cy={HALF}
            r={HALF * r}
            fill="none"
            stroke="rgba(148, 163, 184, 0.3)"
            strokeWidth={0.5}
          />
        ))}
        {/* Center crosshair (current viewport center) */}
        <line
          x1={HALF}
          y1={HALF - TICK}
          x2={HALF}
          y2={HALF + TICK}
          stroke="#fbbf24"
          strokeWidth={1}
        />
        <line
          x1={HALF - TICK}
          y1={HALF}
          x2={HALF + TICK}
          y2={HALF}
          stroke="#fbbf24"
          strokeWidth={1}
        />
        {/* Cardinal directions */}
        {(['N', 'E', 'S', 'W'] as const).map((d, i) => {
          const angles: Record<typeof d, [number, number]> = {
            N: [HALF, 8],
            E: [SIZE - 12, HALF],
            S: [HALF, SIZE - 8],
            W: [12, HALF],
          }
          const [x, y] = angles[d]
          return (
            <text
              key={d}
              x={x}
              y={y + (i % 2 === 0 ? 3 : 4)}
              textAnchor="middle"
              fontSize={9}
              fontFamily="ui-monospace, monospace"
              fontWeight={500}
              fill="#cbd5e1"
              letterSpacing="0.05em"
            >
              {d}
            </text>
          )
        })}
        {/* Tiny crosshair tracking centerX/centerY */}
        <circle
          cx={HALF + (centerX - 0.5) * HALF}
          cy={HALF + (centerY - 0.5) * HALF}
          r={1.5}
          fill="#fbbf24"
          opacity={0.7}
        />
      </svg>
      <div
        className="mono"
        style={{
          position: 'absolute',
          bottom: 4,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 9,
          color: '#cbd5e1',
          letterSpacing: '0.05em',
        }}
      >
        zoom {zoom.toFixed(2)}× center {centerX.toFixed(2)},{centerY.toFixed(2)}
      </div>
    </div>
  )
}