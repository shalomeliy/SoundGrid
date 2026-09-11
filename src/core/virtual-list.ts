/**
 * Windowed-row math for the library table (v0.8.0). Row height is fixed and
 * already known (`Library.tsx`'s 36px rows), which turns "what's visible"
 * into arithmetic — the reason this is hand-rolled here instead of pulling
 * in `react-window`/`react-virtual`: `package.json` carries three runtime
 * dependencies today and this doesn't earn a fourth.
 *
 * Pure — no DOM, no React. `app/hooks/useVirtualRows.ts` is the only thing
 * that reads a real scroll position and calls this.
 */
export interface VirtualRange {
  /** first index to render, inclusive */
  start: number
  /** index to stop before, exclusive */
  end: number
  /** height (px) of the empty space to leave above `start` */
  padTop: number
  /** height (px) of the empty space to leave below `end` */
  padBottom: number
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * `overscan` extra rows rendered on each side of the viewport so a fast
 * scroll doesn't flash blank rows before the next frame catches up.
 */
export function visibleRange(
  scrollTop: number,
  viewportH: number,
  rowH: number,
  total: number,
  overscan = 6,
): VirtualRange {
  if (total <= 0 || rowH <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }

  const safeScroll = Math.max(0, scrollTop)
  const safeViewport = Math.max(0, viewportH)
  const firstVisible = Math.floor(safeScroll / rowH)
  const visibleCount = Math.ceil(safeViewport / rowH) + 1

  const start = clamp(firstVisible - overscan, 0, total)
  const end = clamp(firstVisible + visibleCount + overscan, start, total)

  return { start, end, padTop: start * rowH, padBottom: (total - end) * rowH }
}
