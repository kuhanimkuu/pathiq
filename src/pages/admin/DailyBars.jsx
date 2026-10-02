import { useState } from 'react'
import { dayLabel } from './adminUtils'

// One series of daily bars. Small multiples rather than one chart with
// three scales; each has a per-bar hover/focus tooltip.
function DailyBars({ title, data, field, totalLabel }) {
  const [hover, setHover] = useState(null)
  const values = data.map((d) => d[field])
  const total = values.reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...values)
  const W = 280
  const H = 96
  const gap = 2
  const bw = (W - gap * (data.length - 1)) / data.length
  const h = (v) => (v / max) * (H - 4)
  // Bar with a 4px rounded top, square on the baseline.
  const bar = (x, v) => {
    const bh = h(v)
    if (bh <= 0) return null
    const r = Math.min(4, bh, bw / 2)
    const y = H - bh
    return `M${x},${H} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H} Z`
  }

  return (
    <figure className="admin-chart">
      <figcaption>
        <span className="admin-chart-title">{title}</span>
        <span className="admin-chart-total">{totalLabel ? totalLabel(total) : `${total} in ${data.length} days`}</span>
      </figcaption>
      <div className="admin-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title}: ${total} over the last ${data.length} days`}>
          <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="admin-chart-base" />
          {data.map((d, i) => {
            const x = i * (bw + gap)
            return (
              <g key={d.day}>
                <path d={bar(x, d[field])} className={'admin-chart-bar' + (hover === i ? ' hover' : '')} />
                <rect
                  x={x - gap / 2}
                  y="0"
                  width={bw + gap}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${dayLabel(d.day)}: ${d[field]}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            )
          })}
        </svg>
        {hover != null && (
          <div className="admin-chart-tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
            <strong>{data[hover][field]}</strong> {dayLabel(data[hover].day)}
          </div>
        )}
      </div>
      <div className="admin-chart-axis">
        <span>{dayLabel(data[0].day, { day: 'numeric', month: 'short' })}</span>
        <span>{hover == null ? 'Today' : ''}</span>
      </div>
    </figure>
  )
}

export default DailyBars
