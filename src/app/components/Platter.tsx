import { useEffect, useRef, useState } from 'react'
import * as ctl from '@/controls'
import { scratchRateFromDrag } from '@/core/scratch'
import { secPerRev } from '@/core/settings'
import { useSettings } from '@/app/hooks/useSettings'
import type { DeckId } from '@/core/types'

interface Props {
  deckId: DeckId
  positionSec: number
  durationSec: number
  playing: boolean
  scratching: boolean
  hasTrack: boolean
  color: string
  size?: number
}

/**
 * If the finger stops moving we stop getting events — but a finger resting on a
 * record holds it still, it does not let it run. Without this the last non-zero
 * rate would keep playing under a stationary hand.
 */
const HOLD_TIMEOUT_MS = 60

/**
 * Circular platter: a progress ring, a spinning marker, and a grab handle.
 *
 * Dragging it sideways scratches — horizontal travel, not swept angle. Cover
 * the rim's circumference in one revolution's worth of audio and the rate is 1, so the track
 * plays forward at normal speed and the platter feels connected. The maths and
 * the reason the angle was wrong are in `core/scratch.ts`.
 */
export function Platter({
  deckId,
  positionSec,
  durationSec,
  playing,
  scratching,
  hasTrack,
  color,
  size = 60,
}: Props) {
  const r = size / 2
  const ring = r - 4
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0
  const circ = 2 * Math.PI * ring
  const { platterRpm, jogSmoothing } = useSettings()
  const secPerRevolution = secPerRev(platterRpm)
  const spin = ((positionSec / secPerRevolution) % 1) * 360

  const drag = useRef<{ x: number; time: number; rate: number } | null>(null)
  const holdTimer = useRef(0)
  const [grabbed, setGrabbed] = useState(false)

  const stopHoldTimer = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = 0
    }
  }

  // A pointer that goes up outside the platter still has to release it.
  useEffect(() => stopHoldTimer, [])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!hasTrack) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, time: performance.now(), rate: 0 }
    setGrabbed(true)
    ctl.beginScratch(deckId)
    ctl.scratchRate(deckId, 0)
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    const dt = (now - d.time) / 1000
    // Leave the anchor alone when dt is unusable — two events can share a
    // millisecond, and resetting `x` would drop that travel instead of letting
    // it count toward the next event.
    if (dt <= 0) return
    const rate = scratchRateFromDrag(e.clientX - d.x, dt, size, d.rate, secPerRevolution, jogSmoothing)
    drag.current = { x: e.clientX, time: now, rate }
    ctl.scratchRate(deckId, rate)

    stopHoldTimer()
    holdTimer.current = window.setTimeout(() => {
      if (!drag.current) return
      drag.current.rate = 0
      ctl.scratchRate(deckId, 0)
    }, HOLD_TIMEOUT_MS)
  }

  const onPointerUp = () => {
    if (!drag.current) return
    drag.current = null
    stopHoldTimer()
    setGrabbed(false)
    ctl.endScratch(deckId)
  }

  const live = scratching || grabbed

  return (
    <svg
      width={size}
      height={size}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`shrink-0 touch-none select-none ${
        hasTrack ? (live ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
      }`}
      style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.5))' }}
    >
      <defs>
        <radialGradient id={`platter-face-${deckId}`} cx="38%" cy="34%">
          <stop offset="0%" stopColor="#2b2f3a" />
          <stop offset="70%" stopColor="#15171e" />
          <stop offset="100%" stopColor="#0c0d12" />
        </radialGradient>
      </defs>
      <circle
        cx={r}
        cy={r}
        r={r - 1}
        fill={`url(#platter-face-${deckId})`}
        stroke={live ? color : 'var(--color-hairline-strong)'}
        strokeWidth={live ? 1.5 : 1}
      />
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
        // No transition while a hand is on it: the ring has to track the finger
        // exactly, and 120ms of easing reads as lag under a scratch.
        style={{ transition: live ? 'none' : 'stroke-dashoffset 120ms linear' }}
      />
      {/* spinning marker */}
      <g transform={`rotate(${spin} ${r} ${r})`} style={{ opacity: playing || live ? 1 : 0.55 }}>
        <line x1={r} y1={r} x2={r} y2={r - ring + 5} stroke={color} strokeWidth={2} strokeLinecap="round" />
        <circle cx={r} cy={r - ring + 9} r={2.5} fill={color} />
      </g>
      <circle cx={r} cy={r} r={4} fill="#0c0d12" stroke="var(--color-hairline-strong)" />
    </svg>
  )
}
