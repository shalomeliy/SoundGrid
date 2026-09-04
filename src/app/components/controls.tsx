import { useCallback, useRef, useState } from 'react'
import { useSettings } from '@/app/hooks/useSettings'
import { hint as hintText, type HintId } from '@/core/hints'

/* ------------------------------------------------------------------ *
 * Pill — a named, visible degraded/status state (moved here in       *
 * v0.3.0 so Deck.tsx can flag an unconfirmed beat grid the same way   *
 * TopBar already flags a lost scratch engine or MIDI status — one     *
 * idiom for "something is degraded or worth knowing," not two).       *
 * ------------------------------------------------------------------ */

const TONES = {
  live: 'var(--color-live)',
  warn: 'var(--color-warn)',
  danger: 'var(--color-danger)',
  idle: 'var(--color-grid-dim)',
} as const

export type PillTone = keyof typeof TONES

export function Pill({ tone, label }: { tone: PillTone; label: string }) {
  const c = TONES[tone]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-semibold"
      style={{ background: `color-mix(in srgb, ${c}, transparent 86%)`, color: c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * HintIcon — Hint mode's "?" badge (v0.4.8). Unmounted entirely, not  *
 * just hidden, while the setting is off — zero DOM, zero layout cost, *
 * zero Tab stop during real mixing.                                   *
 * ------------------------------------------------------------------ */

export function HintIcon({ id, className = 'relative' }: { id: HintId; className?: string }) {
  const hintMode = useSettings().hintMode
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState<{ h: 'left' | 'right' | 'center'; v: 'down' | 'up' }>({
    h: 'center',
    v: 'down',
  })
  const showTimer = useRef(0)
  const wrapRef = useRef<HTMLSpanElement>(null)

  if (!hintMode) return null

  const show = () => {
    window.clearTimeout(showTimer.current)
    showTimer.current = window.setTimeout(() => {
      const r = wrapRef.current?.getBoundingClientRect()
      if (r) {
        setFlip({
          h: r.left < 100 ? 'left' : r.right + 110 > window.innerWidth ? 'right' : 'center',
          v: r.bottom + 90 > window.innerHeight ? 'up' : 'down',
        })
      }
      setOpen(true)
    }, 150)
  }
  const hide = () => {
    window.clearTimeout(showTimer.current)
    setOpen(false)
  }

  const text = hintText(id)
  const tooltipId = `hint-${id}`

  return (
    <span ref={wrapRef} className={`inline-flex ${className}`}>
      {/* span[role=button], not a real <button> — it needs its own keyboard
          focus (unlike PadGrid's mouse-only delete badge, which has no
          tabindex and can afford to nest inside its pad). That tabIndex is
          exactly why HintIcon must never be rendered as a DOM *child* of a
          real <button>: the HTML spec forbids any tabindex-bearing
          descendant of one, not just nested interactive elements. Every call
          site renders it as a sibling instead — see Deck.tsx, TopBar.tsx,
          Library.tsx for the wrapping pattern. */}
      <span
        role="button"
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        title={text}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') hide()
        }}
        className="grid h-4 w-4 shrink-0 cursor-help place-items-center rounded-full border border-hairline-strong bg-surface-3 text-[9px] font-bold normal-case leading-none text-grid-dim outline-none transition-colors hover:text-grid-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
      >
        ?
      </span>
      {open && (
        <span
          role="tooltip"
          id={tooltipId}
          className={`pointer-events-none absolute z-50 w-[200px] rounded-[var(--radius-sm)] border border-hairline-strong bg-surface-3 px-2 py-1.5 text-2xs normal-case leading-snug text-grid-text shadow-[var(--shadow-pop)] ${
            flip.v === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'
          } ${flip.h === 'left' ? 'left-0' : flip.h === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}
        >
          {text}
        </span>
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Button — transport / toggle / ghost with explicit idle→active state *
 * ------------------------------------------------------------------ */

type ButtonVariant = 'transport' | 'toggle' | 'ghost'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** toggle/transport: drives fill + a11y pressed state */
  active?: boolean
  /** cocked-but-not-firing look (e.g. CUE held) */
  armed?: boolean
  /** accent colour for the active fill */
  tone?: string
  size?: 'sm' | 'md'
}

export function Button({
  variant = 'ghost',
  active = false,
  armed = false,
  tone = 'var(--color-accent)',
  size = 'md',
  className = '',
  style,
  children,
  ...rest
}: ButtonProps) {
  const base =
    'relative inline-flex select-none items-center justify-center rounded-[var(--radius-sm)] ' +
    'font-semibold uppercase tracking-wide transition-[background,box-shadow,transform,color] ' +
    'duration-150 ease-[var(--ease-out)] active:translate-y-px ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ' +
    'disabled:cursor-not-allowed disabled:opacity-40'
  const sizing = size === 'sm' ? 'px-2 py-1 text-2xs' : 'px-3 py-2 text-xs'

  let look = ''
  if (variant === 'transport') {
    look = active
      ? 'text-black shadow-[var(--shadow-control)]'
      : 'text-grid-text bg-surface-3 shadow-[var(--shadow-control)] hover:bg-[color-mix(in_srgb,var(--color-surface-3),white_6%)]'
  } else if (variant === 'toggle') {
    look = active
      ? 'text-black shadow-[var(--shadow-control)]'
      : armed
        ? 'text-grid-text bg-surface-3 ring-1 ring-inset'
        : 'text-grid-muted bg-surface-2 hover:text-grid-text hover:bg-surface-3'
  } else {
    look =
      'text-grid-text bg-surface-2 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] ' +
      'hover:bg-surface-3'
  }

  const activeStyle: React.CSSProperties =
    (variant === 'transport' || variant === 'toggle') && active
      ? { background: tone, boxShadow: `0 0 0 1px ${tone}, 0 0 16px -4px ${tone}` }
      : armed && variant === 'toggle'
        ? { boxShadow: `inset 0 0 0 1px ${tone}` }
        : {}

  return (
    <button
      {...rest}
      aria-pressed={variant === 'toggle' ? active : undefined}
      className={`${base} ${sizing} ${look} ${className}`}
      style={{ ...activeStyle, ...style }}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * useDrag — shared vertical/scalar pointer drag with capture          *
 * ------------------------------------------------------------------ */

function useDrag(value: number, onChange: (v: number) => void, apply: (dx: number, dy: number, start: number) => number) {
  const start = useRef({ x: 0, y: 0, v: 0 })
  const [dragging, setDragging] = useState(false)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      start.current = { x: e.clientX, y: e.clientY, v: value }
      setDragging(true)
    },
    [value],
  )
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!(e.buttons & 1)) return
      onChange(apply(e.clientX - start.current.x, e.clientY - start.current.y, start.current.v))
    },
    [apply, onChange],
  )
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    setDragging(false)
  }, [])

  return { dragging, onPointerDown, onPointerMove, onPointerUp }
}

/* ------------------------------------------------------------------ *
 * Knob — SVG arc, value indicator, hover/drag readout                 *
 * ------------------------------------------------------------------ */

interface KnobProps {
  label: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  onReset?: () => void
  size?: number
  tone?: string
  format?: (v: number) => string
  hint?: HintId
}

const ARC = 270
const START = -135

export function Knob({
  label,
  value,
  min = -1,
  max = 1,
  onChange,
  onReset,
  size = 42,
  tone = 'var(--color-grid-text)',
  format,
  hint,
}: KnobProps) {
  const [hover, setHover] = useState(false)
  const bipolar = min < 0 && max > 0
  const norm = (value - min) / (max - min)
  const clamp = (v: number) => (v < min ? min : v > max ? max : v)

  const drag = useDrag(value, onChange, (_dx, dy, sv) =>
    clamp(sv - (dy / 130) * (max - min)),
  )

  const angle = START + norm * ARC
  const r = size / 2
  const cx = r
  const cy = r
  const rr = r - 3
  const polar = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return [cx + rr * Math.cos(rad), cy + rr * Math.sin(rad)]
  }
  const arcPath = (a0: number, a1: number) => {
    const [x0, y0] = polar(a0)
    const [x1, y1] = polar(a1)
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0
    const sweep = a1 > a0 ? 1 : 0
    return `M ${x0} ${y0} A ${rr} ${rr} 0 ${large} ${sweep} ${x1} ${y1}`
  }
  const valueFrom = bipolar ? START + ARC / 2 : START
  const readout = format ? format(value) : bipolar ? value.toFixed(2) : Math.round(norm * 100) + '%'

  return (
    <div
      className="relative flex flex-col items-center gap-1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {(hover || drag.dragging) && (
        <span className="tnum pointer-events-none absolute -top-4 rounded-[var(--radius-xs)] bg-surface-3 px-1 py-px text-2xs text-grid-text shadow-[var(--shadow-pop)]">
          {readout}
        </span>
      )}
      <svg
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        tabIndex={0}
        width={size}
        height={size}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onDoubleClick={() => (onReset ? onReset() : onChange(bipolar ? 0 : min))}
        onKeyDown={(e) => {
          const step = (max - min) / 40
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step))
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step))
        }}
        className="cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}
      >
        <circle cx={cx} cy={cy} r={r - 1} fill="var(--color-surface-3)" stroke="var(--color-hairline-strong)" />
        <circle cx={cx} cy={cy} r={r - 5} fill="var(--color-surface-2)" />
        <path d={arcPath(START, START + ARC)} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={2.5} strokeLinecap="round" />
        {Math.abs(norm - (bipolar ? 0.5 : 0)) > 0.001 && (
          <path
            d={arcPath(valueFrom, angle)}
            fill="none"
            stroke={tone}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        )}
        <line
          x1={cx}
          y1={cy}
          x2={polar(angle)[0]}
          y2={polar(angle)[1]}
          stroke={tone}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={2} fill={tone} />
      </svg>
      <span className="label">{label}</span>
      {hint && <HintIcon id={hint} className="absolute -top-1 -right-1 z-10" />}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Fader — grooved track, tick marks, centre detent, grip cap          *
 * ------------------------------------------------------------------ */

interface FaderProps {
  label?: string
  value: number
  min?: number
  max?: number
  vertical?: boolean
  onChange: (v: number) => void
  color?: string
  /** track length in px */
  length?: number
  /** draw a centre notch + snap toward it */
  detent?: boolean
  format?: (v: number) => string
  hint?: HintId
}

export function Fader({
  label,
  value,
  min = 0,
  max = 1,
  vertical = true,
  onChange,
  color = 'var(--color-grid-text)',
  length = 130,
  detent = false,
  format,
  hint,
}: FaderProps) {
  const [hover, setHover] = useState(false)
  const range = max - min
  const clamp = (v: number) => (v < min ? min : v > max ? max : v)
  const snap = (v: number) => {
    if (!detent) return v
    const mid = (min + max) / 2
    return Math.abs(v - mid) < range * 0.03 ? mid : v
  }

  const drag = useDrag(value, onChange, (dx, dy, sv) => {
    const travel = vertical ? -dy : dx
    return snap(clamp(sv + (travel / length) * range))
  })

  const norm = (value - min) / range
  const thickness = 26
  const capLen = 22
  const trackW = 6

  // cap offset along the track (0 = start end)
  const pos = vertical ? (1 - norm) * (length - capLen) : norm * (length - capLen)
  const readout = format ? format(value) : (norm * 100).toFixed(0)

  const ticks = Array.from({ length: 9 }, (_, i) => i / 8)

  return (
    <div
      className="relative flex flex-col items-center gap-1.5"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hint && <HintIcon id={hint} className="absolute -top-1 -right-1 z-10" />}
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 1000) / 1000}
        tabIndex={0}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onKeyDown={(e) => {
          const step = range / 50
          const up = vertical ? 'ArrowUp' : 'ArrowRight'
          const down = vertical ? 'ArrowDown' : 'ArrowLeft'
          if (e.key === up) onChange(clamp(value + step))
          else if (e.key === down) onChange(clamp(value - step))
        }}
        className="relative touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        style={{
          width: vertical ? thickness : length,
          height: vertical ? length : thickness,
          cursor: vertical ? 'ns-resize' : 'ew-resize',
        }}
      >
        {/* groove */}
        <div
          className="absolute rounded-full bg-surface-0"
          style={{
            boxShadow: 'inset 0 0 0 1px var(--color-hairline), inset 0 2px 4px rgba(0,0,0,0.7)',
            ...(vertical
              ? { left: '50%', top: 0, width: trackW, height: length, transform: 'translateX(-50%)' }
              : { top: '50%', left: 0, height: trackW, width: length, transform: 'translateY(-50%)' }),
          }}
        />
        {/* filled portion */}
        <div
          className="absolute rounded-full"
          style={{
            background: `linear-gradient(${vertical ? 0 : 90}deg, ${color}, color-mix(in srgb, ${color}, black 35%))`,
            opacity: 0.9,
            ...(vertical
              ? {
                  left: '50%',
                  bottom: 0,
                  width: trackW,
                  height: `${norm * 100}%`,
                  transform: 'translateX(-50%)',
                }
              : {
                  top: '50%',
                  left: 0,
                  height: trackW,
                  width: `${norm * 100}%`,
                  transform: 'translateY(-50%)',
                }),
          }}
        />
        {/* tick marks */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute bg-hairline"
            style={
              vertical
                ? { right: 1, top: `${t * (length - 1)}px`, width: 5, height: 1 }
                : { top: 1, left: `${t * (length - 1)}px`, height: 5, width: 1 }
            }
          />
        ))}
        {detent && (
          <div
            className="absolute bg-grid-muted"
            style={
              vertical
                ? { left: '50%', top: '50%', width: 12, height: 2, transform: 'translate(-50%,-50%)' }
                : { top: '50%', left: '50%', height: 12, width: 2, transform: 'translate(-50%,-50%)' }
            }
          />
        )}
        {/* cap */}
        <div
          className="absolute rounded-[3px]"
          style={{
            background: 'linear-gradient(180deg, #3a3f4c, #1a1d25)',
            boxShadow: 'var(--shadow-control)',
            ...(vertical
              ? { left: '50%', top: pos, width: thickness, height: capLen, transform: 'translateX(-50%)' }
              : { top: '50%', left: pos, height: thickness, width: capLen, transform: 'translateY(-50%)' }),
          }}
        >
          {/* grip line + accent */}
          <div
            className="absolute rounded-full"
            style={{
              background: color,
              ...(vertical
                ? { left: 3, right: 3, top: '50%', height: 2, transform: 'translateY(-50%)' }
                : { top: 3, bottom: 3, left: '50%', width: 2, transform: 'translateX(-50%)' }),
            }}
          />
        </div>
        {(hover || drag.dragging) && label && (
          <span className="tnum pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 rounded-[var(--radius-xs)] bg-surface-3 px-1 py-px text-2xs shadow-[var(--shadow-pop)]">
            {readout}
          </span>
        )}
      </div>
      {label && <span className="label">{label}</span>}
    </div>
  )
}
