import { useEffect, useRef } from 'react'
import type { DeckId, HotCue } from '../types'

interface Props {
  deckId: DeckId
  peaks: Float32Array | null
  positionSec: number
  durationSec: number
  bpm: number | null
  hotCues: HotCue[]
  color: string
  onSeek: (sec: number) => void
}

/**
 * Scrolling waveform: the playhead stays centred and the audio moves under it,
 * with a beat grid and hot-cue markers overlaid.
 */
export function Waveform({
  deckId,
  peaks,
  positionSec,
  durationSec,
  bpm,
  hotCues,
  color,
  onSeek,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

    ctx.fillStyle = '#0a0b0f'
    ctx.fillRect(0, 0, w, h)

    if (!peaks || durationSec === 0) {
      ctx.fillStyle = '#2a2e3a'
      ctx.fillRect(0, h / 2 - 1, w, 2)
      return
    }

    const pxPerSec = 140 // zoom
    const mid = h / 2
    const buckets = peaks.length / 2
    const bucketsPerSec = buckets / durationSec
    const centerBucket = positionSec * bucketsPerSec
    const bucketsPerPx = bucketsPerSec / pxPerSec

    // beat grid
    if (bpm && bpm > 0) {
      const beatSec = 60 / bpm
      const firstBeat = Math.floor((positionSec - w / 2 / pxPerSec) / beatSec)
      const lastBeat = Math.ceil((positionSec + w / 2 / pxPerSec) / beatSec)
      for (let b = firstBeat; b <= lastBeat; b++) {
        if (b < 0) continue
        const x = w / 2 + (b * beatSec - positionSec) * pxPerSec
        ctx.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'
        ctx.fillRect(x, 0, 1, h)
      }
    }

    // waveform
    for (let x = 0; x < w; x++) {
      const bucket = centerBucket + (x - w / 2) * bucketsPerPx
      const bi = Math.floor(bucket)
      if (bi < 0 || bi >= buckets) continue
      const min = peaks[bi * 2]
      const max = peaks[bi * 2 + 1]
      const y1 = mid + min * mid * 0.95
      const y2 = mid + max * mid * 0.95
      const played = x <= w / 2
      ctx.fillStyle = played ? color : dim(color)
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
    }

    // hot cues
    for (const c of hotCues) {
      const x = w / 2 + (c.positionSec - positionSec) * pxPerSec
      if (x < 0 || x > w) continue
      ctx.fillStyle = c.color
      ctx.fillRect(x - 1, 0, 2, h)
      ctx.fillRect(x - 1, 0, 12, 12)
      ctx.fillStyle = '#000'
      ctx.font = '9px ui-monospace, monospace'
      ctx.fillText(c.label, x + 1, 9)
    }

    // playhead
    ctx.fillStyle = '#fff'
    ctx.fillRect(w / 2 - 1, 0, 2, h)
  }, [peaks, positionSec, durationSec, bpm, hotCues, color])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || durationSec === 0) return
    const rect = canvas.getBoundingClientRect()
    const dx = e.clientX - rect.left - rect.width / 2
    const pxPerSec = 140
    onSeek(Math.max(0, Math.min(durationSec, positionSec + dx / pxPerSec)))
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="h-24 w-full cursor-crosshair rounded"
      data-deck={deckId}
    />
  )
}

function dim(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},0.4)`
}
