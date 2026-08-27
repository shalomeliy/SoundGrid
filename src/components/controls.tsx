import { useRef } from 'react'

interface KnobProps {
  label: string
  value: number // -1..1 or 0..1
  min?: number
  max?: number
  onChange: (v: number) => void
  onReset?: () => void
  size?: number
}

/** Vertical-drag rotary knob. Double-click resets. */
export function Knob({
  label,
  value,
  min = -1,
  max = 1,
  onChange,
  onReset,
  size = 44,
}: KnobProps) {
  const startY = useRef(0)
  const startVal = useRef(0)

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    startY.current = e.clientY
    startVal.current = value
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!(e.buttons & 1)) return
    const dy = startY.current - e.clientY
    const range = max - min
    const next = clamp(startVal.current + (dy / 120) * range, min, max)
    onChange(next)
  }

  const norm = (value - min) / (max - min)
  const angle = -135 + norm * 270

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100) / 100}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onDoubleClick={() => (onReset ? onReset() : onChange((min + max) / 2))}
        className="relative cursor-ns-resize rounded-full border border-grid-border bg-grid-panel-2"
        style={{ width: size, height: size }}
      >
        <div
          className="absolute left-1/2 top-1/2 h-1/2 w-0.5 -translate-x-1/2 origin-bottom bg-grid-text"
          style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
        />
      </div>
      <span className="text-[10px] uppercase tracking-wide text-grid-muted">{label}</span>
    </div>
  )
}

interface FaderProps {
  label?: string
  value: number
  min?: number
  max?: number
  step?: number
  vertical?: boolean
  onChange: (v: number) => void
  color?: string
  length?: number
}

export function Fader({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.001,
  vertical = true,
  onChange,
  color = '#e7e9ee',
  length = 120,
}: FaderProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className={vertical ? 'fader-v' : ''}
        style={
          vertical
            ? { writingMode: 'vertical-lr', direction: 'rtl', width: 24, height: length, accentColor: color }
            : { width: length, accentColor: color }
        }
      />
      {label && (
        <span className="text-[10px] uppercase tracking-wide text-grid-muted">{label}</span>
      )}
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
