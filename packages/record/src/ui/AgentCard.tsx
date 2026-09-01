// Task 2a, Part 1 — the card chrome around each panel iframe.
//
// Before this, the four frames were visually identical dark rectangles: no
// name, no state, no role, and — the one that matters — no origin line.
// "Four agents, in four separate frames, each one on its own web address"
// (copy-final.md's beliefs block) is the claim the whole page rests on, and
// it was printed nowhere. `AgentCard` wraps each `<iframe>` with exactly the
// design's chrome (the-board.dc.html, lines 262-285): a 4px hue bar, the
// agent's name, a state chip, a role line, and `frame {origin}` in mono.
//
// Reuses the established tokens (`ui/theme.ts`'s `ACTOR_ACCENT`/`ACTOR_LABEL`,
// `config/origins.ts`'s `ORIGIN`) rather than inventing a second palette or a
// second origin table — CLAUDE.md's own method and this task's brief both
// say so explicitly.
import type { ReactNode } from 'react';
import type { Actor } from '../model/types';
import { ORIGIN } from '../config/origins';
import { ACTOR_ACCENT, ACTOR_LABEL } from './theme';

/**
 * The record's honest vocabulary for a card's state — and deliberately not
 * the design's full set. The design's own mock script computes `running`
 * from a panel's in-flight call (the-board.dc.html, line 847), but that is a
 * CLIENT-side, mid-turn fact: the record only ever hears about a tool call
 * after Chrome's cross-origin WebMCP machinery has already resolved it (see
 * `App.tsx`'s `ledger.subscribe` comment). It cannot see a call in flight,
 * so it cannot honestly claim one is running — rendering `running` here
 * would be the page asserting something it has no way to check, which is
 * exactly the kind of claim this project's whole pitch argues against.
 * `AgentCardState` excludes it at the type level, not just by convention.
 *
 * Fix round 1, M3: `done` claimed the same kind of unknowable finality —
 * the record knows "has acted at least once," never "has finished." `acted`
 * is the honest word. M2: `refused once` named a count the record does not
 * track (a third refusal would still read "once"); `refused` drops the
 * count word rather than assert one.
 *
 * `broke` (finish task): `ok: false` used to mean only one thing here —
 * "refused" — but the ledger writes `ok: false` for BOTH a deliberate
 * refusal and an ordinary crash (a bug, a malformed input, the cross-origin
 * bridge itself failing). Collapsing both into `refused` means a bug during
 * a filmed run puts the word "refused" on an agent's card — the product
 * asserting its central claim about an event that never actually happened.
 * `broke` is the same honest word `panel/src/agent/loop.ts` already uses
 * for the identical distinction on the OTHER side of the boundary, so the
 * two origins share one vocabulary for "this is not the product working."
 */
export type AgentCardState = 'no tools' | 'refused' | 'broke' | 'acted' | 'idle';

/**
 * Task 2a's own ruling on role lines (not the design's per-actor prose,
 * which differs and is not this task's copy to use): both advocates get an
 * adversarial one-liner, both seats share the identical assessor line —
 * seat1 and seat2 do the same job, they just do it independently.
 */
const ROLE_LINE: Record<Actor, string> = {
  A: 'Argues one side of the case.',
  B: 'Argues the other side.',
  seat1: 'Reads both sides and assesses.',
  seat2: 'Reads both sides and assesses.',
};

/**
 * The state chip's derivation. Fix round 1, C1 — the FIRST cut checked
 * `grantedCount === 0` unconditionally, first, so it read "holds nothing
 * right now" for an actor whose refusal is sitting three sections below in
 * the ledger. That is true only WITHIN a phase; it is false the instant a
 * lifetime closes (`PhaseMachine.enter('CONFIRMED')` empties every actor's
 * `granted`, and a spent appeal empties one actor's mid-VERDICT) — and the
 * false version is exactly what a viewer sees at the end of a filmed run,
 * when all four cards would have read `no tools` regardless of what any of
 * them actually did.
 *
 * Corrected order, matching the design's own priority (`refused` before
 * `no tools`, the-board.dc.html lines 846-851, minus the two client-side
 * states this record cannot honestly claim): a refusal in the ledger wins
 * over an empty hand, and an actor that has ever acted keeps that history
 * even after its tools are later revoked. `no tools` now means "never held
 * anything AND never acted" — the one case it is still true to claim.
 *
 * Pure and DOM-free so it is testable without a `Ledger`/`ToolRegistry` in
 * the loop — `grantedCount` and `entries` are the only two facts the
 * derivation actually needs.
 *
 * `entries[].failure` (finish task): `webmcp/ledger.ts`'s `LedgerEntry` now
 * carries this alongside `ok`, decided once, at the point `Ledger.wrap`
 * caught the real exception (`instanceof Refusal`) — never re-derived here
 * from anything about the entry's text. A `!ok` entry with no `failure` at
 * all (defensive: the real ledger always sets one, but this function's own
 * contract does not require a caller to) is treated as a crash, not a
 * refusal — under-claiming a refusal is the safe direction, the same
 * asymmetry `Refusal`'s own doc comment argues for on the panel side.
 *
 * Priority when an actor's history holds both kinds: a real refusal still
 * outranks everything (unchanged from fix round 1 — it is this project's
 * central claim and must not be buried), then a crash outranks a quiet
 * `acted`/`no tools` — a bug that happened is also worth surfacing, just
 * never AS a refusal.
 */
export function deriveAgentState(
  grantedCount: number,
  entries: { ok: boolean; failure?: 'refusal' | 'crash' }[]
): AgentCardState {
  const failed = entries.filter((e) => !e.ok);
  if (failed.some((e) => e.failure === 'refusal')) return 'refused';
  if (failed.some((e) => e.failure !== 'refusal')) return 'broke';
  if (grantedCount === 0 && entries.length === 0) return 'no tools';
  if (entries.length > 0) return 'acted';
  return 'idle';
}

interface AgentCardProps {
  actor: Actor;
  state: AgentCardState;
  children: ReactNode;
}

export function AgentCard({ actor, state, children }: AgentCardProps) {
  const accent = ACTOR_ACCENT[actor];

  return (
    <div
      data-testid={`agent-card-${actor}`}
      // Fix round 1, I9: this used to add `accent.border` (a Tailwind class)
      // on top of the hue bar, and for Advocate B those disagree —
      // `theme.ts` keeps B's Tailwind accent amber (it also drives other
      // components this task does not own) while the design's hue for B is
      // pink, so the card drew a pink bar inside an amber frame, with B's
      // amber colliding with `--tb-amber`, the page's own brand/action
      // colour. The border now reads from the SAME `accent.hue` the bar and
      // chip already use — one colour per card, the actual actor colour,
      // not a second, disagreeing one. `border` alone (no Tailwind colour
      // utility) just sets a 1px width; `borderColor` below supplies it.
      className="rounded border"
      style={{
        display: 'flex',
        flexDirection: 'column',
        // Fix round 1, M5: was a fixed `height: 440` (the design's own
        // panel is `min-height:440px`, the-board.dc.html line 271). A fixed
        // height cannot grow, so a header that wraps to two lines at a
        // narrow viewport ate into the iframe's own space instead of
        // growing the card — `minHeight` lets the card (and, since these
        // sit in one CSS grid row with the default `align-items: stretch`,
        // every card beside it) grow to fit whichever header is tallest.
        minHeight: 440,
        background: 'var(--tb-panel)',
        overflow: 'hidden',
        boxSizing: 'border-box',
        minWidth: 0,
        borderColor: accent.hue,
      }}
    >
      <div style={{ height: 4, flex: 'none', background: accent.hue }} aria-hidden="true" />

      <div
        style={{
          padding: '13px 16px 12px',
          // Fix round 1, M6: exact-value tokenised. `--color-panel-rule` is
          // this SAME rgba(243,242,242,.18) — the theme layer already names
          // it, this component just wasn't reading it. `--color-panel-ink`
          // (below, on the name) is likewise the literal, already-named
          // token for this literal value; both panel colours are
          // deliberately the SAME in light and dark mode (the four agent
          // panels stay visually dark regardless of page theme — theme.css's
          // own comment), which is why a bare hex was "safe today" and also
          // why a named token for it already existed to reach for.
          borderBottom: '1px solid var(--color-panel-rule)',
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          flex: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-panel-ink)' }}>{ACTOR_LABEL[actor]}</h3>
          <span
            data-testid={`agent-card-state-${actor}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: accent.hue,
              border: `1px solid ${accent.hue}`,
              padding: '2px 6px',
              whiteSpace: 'nowrap',
            }}
          >
            {state}
          </span>
        </div>
        {/*
          Fix round 1, M6, the two lines left literal: the role line's .62
          and the origin line's .5 have no EXACT-matching token in
          theme.css's --color-panel-* family (the closest are --color-
          panel-dim at .6 and --color-panel-faint at .45) — and the review
          that flagged M6 also computed and passed this exact card's
          contrast at every alpha value it carries today (origin line
          thinnest at 4.92:1 dark / 4.83:1 light). Snapping either to its
          nearest token changes the value, which would re-open a contrast
          question this review just closed on a component I do not get to
          re-verify by eye without another round. theme.css itself is also
          outside this task's file list this round. Left literal on purpose,
          not missed.
        */}
        <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'rgba(243,242,242,.62)' }}>{ROLE_LINE[actor]}</span>
        <span
          data-testid={`agent-card-origin-${actor}`}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'rgba(243,242,242,.5)', wordBreak: 'break-all' }}
        >
          frame {ORIGIN[actor]}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{children}</div>
    </div>
  );
}
