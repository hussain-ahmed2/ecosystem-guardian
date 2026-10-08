import { cn } from '@/components/ui/cn'

export type SparklineProps = {
  /** oldest first */
  values: number[]
  /** SVG stroke color, e.g. a theme CSS variable */
  stroke: string
  className?: string
  /** accessible name */
  label: string
}

/**
 * Tiny hand-rolled SVG line chart — no chart library.
 * Normalises to the local min/max so flat series stay visible.
 */
export default function Sparkline({ values, stroke, className, label }: SparklineProps) {
  const width = 100
  const height = 24
  const pad = 2

  if (values.length === 0) {
    return (
      <div
        className={cn('flex h-6 items-center justify-center text-[10px] text-bark-500', className)}
        role="img"
        aria-label={`${label}: no data yet`}
      >
        no data
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0

  const points = values.map((value, i) => {
    const x = pad + i * stepX
    const y = height - pad - ((value - min) / span) * (height - pad * 2)
    return { x, y, value }
  })

  const polyline = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const latest = points[points.length - 1]

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-6 w-full', className)}
      role="img"
      aria-label={`${label}: ${values.map((v) => Math.round(v)).join(', ')}`}
    >
      <line
        x1={0}
        y1={height - 0.5}
        x2={width}
        y2={height - 0.5}
        stroke="var(--color-bark-700)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {values.length > 1 && (
        <circle
          cx={latest.x}
          cy={latest.y}
          r={1.6}
          fill={stroke}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
