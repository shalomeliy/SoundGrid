import * as ctl from '@/controls'
import { useStore } from '@/app/state/store'
import { Button, Pill } from '@/app/components/controls'
import type { DeckId } from '@/core/types'

const DECK_COLOR: Record<DeckId, string> = { A: 'var(--color-deck-a)', B: 'var(--color-deck-b)' }

/**
 * v0.5.5's natural-language input, in the same conditional-height strip
 * idiom as `App.tsx`'s `notice` bar and `TransitionRatingPrompt` — mounted
 * only while `ai.enabled` (the TopBar toggle), so it costs nothing in the
 * DOM while off. No chat transcript and no confidence percentage: only the
 * current command's state, since that is the question a DJ mid-mix
 * actually needs answered ("did it understand, is it about to happen").
 *
 * Every real action stops at `confirm` — Go/Cancel — never fires on its
 * own, and an unconfirmed proposal expires on its own
 * (`controls.ts`'s `AI_PROPOSAL_EXPIRY_MS`) rather than sitting stale.
 */
export function AiControlBar() {
  const ai = useStore((s) => s.ai)
  if (!ai.enabled) return null

  return (
    <div className="flex shrink-0 items-center gap-2 bg-surface-2 px-4 py-1.5 text-2xs">
      {(ai.phase === 'idle' || ai.phase === 'typing') && (
        <>
          <span className="text-grid-dim">AI</span>
          <input
            value={ai.input}
            onChange={(e) => ctl.setAiInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ctl.submitAiCommand(ai.input)
            }}
            placeholder="Type a command — e.g. “loop 8 beats on deck A”"
            className="min-w-0 flex-1 rounded-[var(--radius-xs)] border border-hairline bg-surface-1 px-2 py-1 text-2xs text-grid-text outline-none focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          />
        </>
      )}

      {ai.phase === 'thinking' && <span className="text-grid-muted">AI is thinking…</span>}

      {ai.phase === 'model-loading' && (
        <>
          <Pill tone="warn" label="AI" />
          <span className="text-grid-muted">
            Loading the local model{ai.loadProgressPct != null ? ` — ${Math.round(ai.loadProgressPct)}%` : '…'}
          </span>
        </>
      )}

      {ai.phase === 'model-error' && (
        <>
          <Pill tone="danger" label="AI" />
          <span className="min-w-0 flex-1 truncate">Local model failed to load — {ai.loadError}</span>
        </>
      )}

      {ai.phase === 'confirm' && ai.proposal && (
        <>
          <Pill tone="idle" label="AI" />
          <span
            className="min-w-0 flex-1 truncate"
            style={ai.proposal.deckId ? { color: DECK_COLOR[ai.proposal.deckId] } : undefined}
          >
            {ai.proposal.summary} — run it?
          </span>
          <Button variant="ghost" size="sm" onClick={() => ctl.cancelAiProposal()}>
            Cancel
          </Button>
          <Button variant="toggle" size="sm" active tone="var(--color-live)" onClick={() => ctl.confirmAiProposal()}>
            Go
          </Button>
        </>
      )}

      {ai.phase === 'clarify' && (
        <>
          <Pill tone="warn" label="AI" />
          <span className="min-w-0 flex-1 truncate">{ai.clarifyQuestion}</span>
          <Button variant="ghost" size="sm" onClick={() => ctl.cancelAiProposal()}>
            Dismiss
          </Button>
        </>
      )}

      {ai.phase === 'decline' && (
        <>
          <Pill tone="warn" label="AI" />
          <span className="min-w-0 flex-1 truncate">{ai.declineReason}</span>
        </>
      )}
    </div>
  )
}
