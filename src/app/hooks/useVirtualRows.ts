import { useEffect, useRef, useState } from 'react'
import { visibleRange, type VirtualRange } from '@/core/virtual-list'

/**
 * Thin React glue over `core/virtual-list.ts` (v0.8.0) — no windowing
 * logic lives here, only a scroll container ref and the listeners that
 * feed it real numbers. `ResizeObserver` covers the panel being resized
 * (e.g. the window itself), `scroll` covers the obvious case.
 */
export function useVirtualRows(total: number, rowH: number, overscan = 6) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [range, setRange] = useState<VirtualRange>(() => visibleRange(0, 0, rowH, total, overscan))

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setRange(visibleRange(el.scrollTop, el.clientHeight, rowH, total, overscan))
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [total, rowH, overscan])

  return { containerRef, ...range }
}
