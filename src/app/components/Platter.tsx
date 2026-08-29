interface Props {
  positionSec: number
  durationSec: number
  playing: boolean
  color: string
  size?: number
}

/**
 * Circular platter: a progress ring for track position plus a spinning
 * marker so playback state reads at a glance. Groundwork for the v0.2 jog.
 */
export function Platter({ positionSec, durationSec, playing, color, size = 60 }: Props) {
  const r = size / 2
  const ring = r - 4
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0
  const circ = 2 * Math.PI * ring
  // 1⅓ s per revolution ≈ 45 rpm feel; frozen when paused
  const spin = ((positionSec / 1.333) % 1) * 360

  return (
    <svg width={size} height={size} className="shrink-0" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))' }}>
      <defs>
        <radialGradient id="platter-face" cx="38%" cy="34%">
          <stop offset="0%" stopColor="#2b2f3a" />
          <stop offset="70%" stopColor="#15171e" />
          <stop offset="100%" stopColor="#0c0d12" />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r} r={r - 1} fill="url(#platter-face)" stroke="var(--color-hairline-strong)" />
      {/* position ring */}
      <circle cx={r} cy={r} r={ring} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
      <circle
        cx={r}
        cy={r}
        r={ring}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - progress)}
        transform={`rotate(-90 ${r} ${r})`}
        style={{ transition: 'stroke-dashoffset 120ms linear' }}
      />
      {/* spinning marker */}
      <g transform={`rotate(${spin} ${r} ${r})`} style={{ opacity: playing ? 1 : 0.55 }}>
        <line x1={r} y1={r} x2={r} y2={r - ring + 5} stroke={color} strokeWidth={2} strokeLinecap="round" />
        <circle cx={r} cy={r - ring + 9} r={2.5} fill={color} />
      </g>
      <circle cx={r} cy={r} r={4} fill="#0c0d12" stroke="var(--color-hairline-strong)" />
    </svg>
  )
}
