import { useState } from 'react'
import * as ctl from '@/controls'
import { HOT_CUE_COLORS } from '@/core/constants'
import { LOOP_BEATS_STEPS } from '@/core/padmodes'
import { customTextOf } from '@/core/hotcues'
import { Button, HintIcon, Pill } from '@/app/components/controls'
import { useStore } from '@/app/state/store'
import type { DeckId, HotCue, PadMode } from '@/core/types'

/** A saved mix-in point (`saveMixEntryHotCue`, v0.4.7) — pressing it re-runs the automatic transition, not just a jump. `kind` (v0.5.3), never the label: a manually renamed plain pad also carries a non-ordinal label now, on purpose. */
const isMixEntry = (cue: HotCue): boolean => cue.kind === 'mixEntry'

/** Same m:ss shape `Deck.tsx`/`Library.tsx`/`TransitionPointsPanel.tsx` each already format independently — no shared formatter exists yet to import instead. */
function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface Props {
  deckId: DeckId
  hotCues: HotCue[]
  padMode: PadMode
  color: string
}

/** Drag payload: the source pad's index, as plain text. */
const HOT_CUE_MIME = 'application/x-soundgrid-hotcue'

const MODES: { mode: PadMode; label: string }[] = [
  { mode: 'hotcue', label: 'Cue' },
  { mode: 'loop', label: 'Loop' },
  { mode: 'beatJump', label: 'Jump' },
  { mode: 'sampler', label: 'Smpl' },
]

/** "¼"-style beat-count label — the notation a DJ already reads on loop-length controls, not a raw decimal. */
function beatsLabel(n: number): string {
  return n < 1 ? `1/${Math.round(1 / n)}` : `${n}`
}

const padClass =
  'group relative h-10 rounded-[var(--radius-sm)] px-1 text-2xs font-bold tabular-nums transition-[transform,box-shadow,background] duration-100 ease-[var(--ease-out)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]'

/**
 * Pad grid (v0.5.0) — one of 4 modes per deck, switched by the row above it.
 * The row above used to just label the grid ("Hot Cues"); it is the mode
 * switch itself now, replacing rather than adding to that row, so the
 * height budget this panel already had (`CLAUDE.md`'s ~710px note) does not
 * grow. `shiftHeld` (global — one physical SHIFT button on the FLX4, not
 * one per deck) rings the whole grid and swaps every pad's label to what
 * SHIFT does right now, so nothing about the remap is color-only.
 */
export function PadGrid({ deckId, hotCues, padMode, color }: Props) {
  const shiftHeld = useStore((s) => s.shiftHeld)
  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <span className="relative inline-flex shrink-0">
          <HintIcon id="deck.padMode" />
        </span>
        <div className="grid flex-1 grid-cols-4 gap-1">
          {MODES.map(({ mode, label }) => (
            <Button
              key={mode}
              variant="toggle"
              size="sm"
              active={padMode === mode}
              tone={color}
              onClick={() => ctl.setPadMode(deckId, mode)}
              aria-label={`Pad mode: ${label}`}
            >
              {label}
            </Button>
          ))}
        </div>
        {/* SHIFT has no persistent on-screen control (keyboard/hardware only)
            — the Pill is its only visible presence while held, and this
            HintIcon is how Hint mode explains it *before* it's ever pressed,
            the same discoverability every other control gets. */}
        {shiftHeld ? <Pill tone="accent" label="SHIFT" /> : <HintIcon id="deck.shift" />}
      </div>
      <div
        className="grid grid-cols-4 gap-1 rounded-[var(--radius-sm)] transition-shadow duration-100"
        style={shiftHeld ? { boxShadow: `0 0 0 2px var(--color-accent)` } : undefined}
      >
        {padMode === 'hotcue' && <HotCuePads deckId={deckId} hotCues={hotCues} />}
        {padMode === 'loop' && <LoopPads deckId={deckId} shiftHeld={shiftHeld} />}
        {padMode === 'beatJump' && <BeatJumpPads deckId={deckId} shiftHeld={shiftHeld} />}
        {padMode === 'sampler' && <SamplerPadsStub deckId={deckId} />}
      </div>
    </div>
  )
}

/**
 * Hot Cue pads (v0.4.0, unchanged by v0.5.0's mode switch). Click sets/jumps
 * a plain pad, or re-runs the automatic transition for a pad saved from the
 * Mix Assist panel (`ctl.pressHotCue`, v0.4.7) — the distinction is
 * `isMixEntry`, not a separate button. Delete is two ways to the same
 * action, on purpose — a hover-revealed `×` (discoverable) and `Shift`+click
 * (existing muscle memory, kept). Dragging an occupied pad onto an empty one
 * relocates the cue; onto another occupied pad, it swaps them — never a
 * silent overwrite. The `×` is a `span[role=button]`, not a nested
 * `<button>`, because the whole pad is already one.
 *
 * `Alt`+click (v0.5.3) opens a rename box in place of the label — the
 * owner's own request: any pad, mix-entry or plain, can carry free text, and
 * whatever is saved always keeps the cue's own position visible in the name
 * (`renameHotCue`, `controls.ts` — `<text> · m:ss`, or bare `m:ss` if left
 * blank), so a renamed pad never turns into an unlabeled mystery once the
 * custom text scrolls out of memory. `Enter` saves; `Escape` or clicking away
 * cancels without writing anything — a stray `Alt`+click should never be able
 * to relabel a pad by accident.
 */
function HotCuePads({ deckId, hotCues }: { deckId: DeckId; hotCues: HotCue[] }) {
  const [renaming, setRenaming] = useState<{ index: number; text: string } | null>(null)
  const commitRename = (cue: HotCue) => {
    const text = renaming!.text.trim()
    ctl.renameHotCue(deckId, cue.index, text ? `${text} · ${fmt(cue.positionSec)}` : fmt(cue.positionSec))
    setRenaming(null)
  }
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => {
        const cue = hotCues.find((c) => c.index === i)
        const color = cue?.color ?? HOT_CUE_COLORS[i]
        const occupiedStyle = {
          background: color,
          color: '#000',
          boxShadow: `0 0 0 1px ${color}, 0 0 14px -3px ${color}`,
        }
        const dot = (
          <span
            className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full"
            style={{ background: cue ? '#0007' : color, opacity: cue ? 1 : 0.5 }}
          />
        )

        // Rename mode swaps the pad's root element from `<button>` to
        // `<div>` entirely, rather than nesting the `<input>` inside the
        // button — an `<input>` is itself interactive, and HTML forbids
        // interactive descendants of a `<button>` (the same reason the
        // delete affordance below is a `span[role=button]`, never a nested
        // `<button>`).
        if (renaming?.index === i && cue) {
          return (
            <div key={i} className={padClass} style={occupiedStyle}>
              {dot}
              <input
                autoFocus
                value={renaming.text}
                aria-label={`Rename hot cue ${i + 1}`}
                onChange={(e) => setRenaming({ index: i, text: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') commitRename(cue)
                  else if (e.key === 'Escape') setRenaming(null)
                }}
                onBlur={() => setRenaming(null)}
                className="block w-full truncate bg-transparent px-0.5 text-center outline-none"
              />
            </div>
          )
        }

        return (
          <button
            key={i}
            draggable={!!cue}
            onDragStart={(e) => {
              e.dataTransfer.setData(HOT_CUE_MIME, String(i))
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(HOT_CUE_MIME)) e.preventDefault()
            }}
            onDrop={(e) => {
              if (!e.dataTransfer.types.includes(HOT_CUE_MIME)) return
              e.preventDefault()
              const from = Number(e.dataTransfer.getData(HOT_CUE_MIME))
              ctl.moveHotCue(deckId, from, i)
            }}
            onClick={(e) => {
              if (e.shiftKey && cue) ctl.deleteHotCue(deckId, i)
              else if (e.altKey && cue) setRenaming({ index: i, text: customTextOf(cue) })
              else ctl.pressHotCue(deckId, i)
            }}
            aria-label={
              cue
                ? isMixEntry(cue)
                  ? `Start mix from ${cue.label}`
                  : `Jump to hot cue ${cue.label}`
                : `Set hot cue ${i + 1}`
            }
            className={padClass}
            style={
              cue
                ? occupiedStyle
                : {
                    background: 'var(--color-surface-2)',
                    color: 'var(--color-grid-dim)',
                    boxShadow: `inset 0 0 0 1px ${color}33`,
                  }
            }
          >
            {dot}
            {/* Plain manually-set cues carry a label that's already just the
                slot number (`setHotCue`, `controls.ts`) — this renders the
                same as `{i + 1}` always did. A v0.4.7 auto-saved mix-in cue,
                or any manually renamed pad (v0.5.3), carries a short
                descriptive label instead; `truncate` keeps it from
                overflowing the pad rather than wrapping/clipping
                mid-character. */}
            <span className="block truncate px-0.5">{cue ? cue.label : i + 1}</span>
            {cue && (
              // A hover-revealed `span[role=button]`, not a nested
              // `<button>` (the pad is already one, and HTML forbids
              // interactive descendants of a button). Mouse-only by design
              // — `Shift`+click above reaches this same delete without a
              // pointer resting on the pad, so this adds no keyboard gap
              // beyond what the pad's own drag gesture already has.
              <span
                role="button"
                aria-label={`Delete hot cue ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation()
                  ctl.deleteHotCue(deckId, i)
                }}
                className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full text-[10px] leading-none text-black opacity-0 transition-opacity duration-100 hover:bg-black/20 group-hover:opacity-100"
              >
                ×
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}

/**
 * Loop pads (v0.5.0): plain press starts/stops a loop of that pad's beat
 * length (`ctl.pressLoopPad` inside `ctl.pressPad`). SHIFT+press is Loop
 * Roll — momentary, catches up on release — so every pad is pressed the
 * same way (`onPointerDown`/window `pointerup`, same shape as the Cue
 * button's hold-to-preview in `Deck.tsx`) whether or not this particular
 * press turns out to need a release: `ctl.pressPad` always returns a
 * closure, a no-op for the plain-toggle case.
 */
function LoopPads({ deckId, shiftHeld }: { deckId: DeckId; shiftHeld: boolean }) {
  return (
    <>
      {LOOP_BEATS_STEPS.map((beats, i) => (
        <button
          key={i}
          onPointerDown={() => {
            const release = ctl.pressPad(deckId, i)
            const up = () => {
              release()
              window.removeEventListener('pointerup', up)
            }
            window.addEventListener('pointerup', up)
          }}
          aria-label={shiftHeld ? `Loop roll ${beatsLabel(beats)} beats` : `Loop ${beatsLabel(beats)} beats`}
          className={padClass}
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-grid-text)',
            boxShadow: 'inset 0 0 0 1px var(--color-hairline-strong)',
          }}
        >
          <span className="block truncate px-0.5">{shiftHeld ? `R·${beatsLabel(beats)}` : beatsLabel(beats)}</span>
        </button>
      ))}
    </>
  )
}

/**
 * Beat Jump pads (v0.5.0): a plain click jumps forward by that pad's beat
 * distance; SHIFT+click jumps backward the same distance (`ctl.pressPad`).
 * Not a hold gesture — `ctl.pressPad`'s release closure is always a no-op
 * here, so a plain `onClick` is enough, no pointerup dance needed.
 */
function BeatJumpPads({ deckId, shiftHeld }: { deckId: DeckId; shiftHeld: boolean }) {
  return (
    <>
      {LOOP_BEATS_STEPS.map((beats, i) => (
        <button
          key={i}
          onClick={() => ctl.pressPad(deckId, i)}
          aria-label={
            shiftHeld ? `Jump back ${beatsLabel(beats)} beats` : `Jump forward ${beatsLabel(beats)} beats`
          }
          className={padClass}
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-grid-text)',
            boxShadow: 'inset 0 0 0 1px var(--color-hairline-strong)',
          }}
        >
          <span className="block truncate px-0.5">
            {shiftHeld ? `←${beatsLabel(beats)}` : `→${beatsLabel(beats)}`}
          </span>
        </button>
      ))}
    </>
  )
}

/**
 * Sampler pads (v0.5.0) — a visible stub. The real sampler engine is
 * `ROADMAP.md`'s v0.6.0; every pad here is grayed out and pressing one
 * shows the "not built yet" notice from `ctl.pressPad` rather than doing
 * nothing silently, per this project's central rule.
 */
function SamplerPadsStub({ deckId }: { deckId: DeckId }) {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <button
          key={i}
          onClick={() => ctl.pressPad(deckId, i)}
          aria-label={`Sampler pad ${i + 1} — not built yet`}
          className={padClass}
          style={{
            background: 'var(--color-surface-1)',
            color: 'var(--color-grid-dim)',
            boxShadow: 'inset 0 0 0 1px var(--color-hairline)',
          }}
        >
          <span className="block truncate px-0.5">—</span>
        </button>
      ))}
    </>
  )
}
