import { useEffect, useRef, useState } from 'react'
import type { DeckId, HotCue } from '../types'

interface Props {
  deckId: DeckId
  peaks: Float32Array | null
  positionSec: number
  durationSec: number
  bpm: number | null
  hotCues: HotCue[]
  color: string
  loading?: boolean
  onSeek: (sec: number) => void
}

const PX_PER_SEC = 150

/**
 * Scrolling waveform: playhead stays centred, audio moves under it.
 * Filled mirrored body with a depth gradient, beat grid, cue flags, glow playhead.
 */
export function Waveform({
  deckId,
  peaks,
  positionSec,
  durationSec,
  bpm,
  hotCues,
  color,
  loading = false,
  onSeek,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => setSize((n) => n + 1))
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const mid = h / 2

    // background — faint vertical depth
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#0d0f15')
    bg.addColorStop(0.5, '#090a0e')
    bg.addColorStop(1, '#0d0f15')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    const resolve = (hex: string) =>
      hex.startsWith('var(')
        ? getComputedStyle(canvas).getPropertyValue(hex.slice(4, -1)).trim() || '#29c5ff'
        : hex
    const c = resolve(color)

    if (!peaks || durationSec === 0) {
      // idle rail
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, mid)
      ctx.lineTo(w, mid)
      ctx.stroke()
      if (loading) {
        const t = (Date.now() % 1200) / 1200
        const gx = t * w
        const g = ctx.createLinearGradient(gx - 80, 0, gx + 80, 0)
        g.addColorStop(0, 'transparent')
        g.addColorStop(0.5, c + '55')
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.fillRect(0, mid - 1, w, 2)
      }
      return
    }

    const buckets = peaks.length / 2
    const bucketsPerSec = buckets / durationSec
    const centerBucket = positionSec * bucketsPerSec
    const bucketsPerPx = bucketsPerSec / PX_PER_SEC

    // beat grid
    if (bpm && bpm > 0) {
      const beatSec = 60 / bpm
      const halfSpanSec = w / 2 / PX_PER_SEC
      const firstBeat = Math.floor((positionSec - halfSpanSec) / beatSec)
      const lastBeat = Math.ceil((positionSec + halfSpanSec) / beatSec)
      for (let b = firstBeat; b <= lastBeat; b++) {
        if (b < 0) continue
        const x = w / 2 + (b * beatSec - positionSec) * PX_PER_SEC
        const bar = b % 4 === 0
        ctx.fillStyle = bar ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)'
        ctx.fillRect(x, bar ? 0 : h * 0.12, 1, bar ? h : h * 0.76)
      }
    }

    // waveform body — mirrored fill with depth gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, c + 'cc')
    grad.addColorStop(0.5, c + '66')
    grad.addColorStop(1, c + 'cc')
    const played = ctx.createLinearGradient(0, 0, 0, h)
    played.addColorStop(0, c)
    played.addColorStop(0.5, c + 'aa')
    played.addColorStop(1, c)

    ctx.beginPath()
    ctx.moveTo(0, mid)
    for (let x = 0; x < w; x++) {
      const bi = Math.floor(centerBucket + (x - w / 2) * bucketsPerPx)
      if (bi < 0 || bi >= buckets) {
        ctx.lineTo(x, mid)
        continue
      }
      ctx.lineTo(x, mid + peaks[bi * 2 + 1] * mid * 0.96)
    }
    for (let x = w - 1; x >= 0; x--) {
      const bi = Math.floor(centerBucket + (x - w / 2) * bucketsPerPx)
      ctx.lineTo(x, bi < 0 || bi >= buckets ? mid : mid + peaks[bi * 2] * mid * 0.96)
    }
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    // played half brighter
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w / 2, h)
    ctx.clip()
    ctx.fillStyle = played
    ctx.fill()
    ctx.restore()

    // centre spine
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fillRect(0, mid - 0.5, w, 1)

    // hot cue flags
    for (const cue of hotCues) {
      const x = w / 2 + (cue.positionSec - positionSec) * PX_PER_SEC
      if (x < -8 || x > w + 8) continue
      ctx.fillStyle = cue.color
      ctx.fillRect(x - 0.5, 0, 1.5, h)
      ctx.beginPath()
      ctx.roundRect(x - 0.5, 0, 14, 12, [0, 3, 3, 0])
      ctx.fill()
      ctx.fillStyle = '#000'
      ctx.font = '700 9px Inter Variable, sans-serif'
      ctx.fillText(cue.label.slice(0, 2), x + 2, 9)
    }

    // playhead + glow
    ctx.save()
    ctx.shadowColor = '#fff'
    ctx.shadowBlur = 8
    ctx.fillStyle = '#fff'
    ctx.fillRect(w / 2 - 1, 0, 2, h)
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(w / 2 - 4, 0)
    ctx.lineTo(w / 2 + 4, 0)
    ctx.lineTo(w / 2, 5)
    ctx.closePath()
    ctx.fillStyle = '#fff'
    ctx.fill()
  }, [peaks, positionSec, durationSec, bpm, hotCues, color, loading, size])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || durationSec === 0) return
    const rect = canvas.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    onSeek(Math.max(0, Math.min(durationSec, positionSec + dx / PX_PER_SEC)))
  }

  return (
    <div className="relative min-h-[104px] flex-1 overflow-hidden rounded-[var(--radius-md)] shadow-[inset_0_0_0_1px_var(--color-hairline)]">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="block h-full w-full cursor-crosshair"
        data-deck={deckId}
      />
      {!peaks && durationSec === 0 && !loading && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-grid-dim">
          Load a track to see its waveform
        </span>
      )}
    </div>
  )
}
