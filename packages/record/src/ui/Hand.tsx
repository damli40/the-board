// Storyboard component 3 (the phase ribbon), the card half of it: "each
// side's currently-granted tools as face-up cards... the exit animation is
// the 1:51 beat — file_fact leaving both hands at the same instant — so it
// must be legible at 1x speed, not a fade."
//
// Deviation from the brief's Step 6 ("use `motion` for enter and exit"):
// no animation library is installed in this repo and none of Tasks 1-7
// needed one, so this hand-rolls the same effect with a plain CSS
// transition instead of adding a new dependency for a single component.
// The exit is NOT a fade: the card holds its layout for one animation
// frame, then dims, desaturates and drops out over ~420ms (`useVanishing`
// below), matching the storyboard's "dim, desaturate, and drop out" —
// legible at 1x speed, not a cross-fade a viewer could blink through.
//
// Fix round 2, I2: this component pre-dates the `--tb-*` port and used raw
// Tailwind neutral classes (`text-neutral-100`, `bg-neutral-900`, ...).
// Those compile to `color: var(--color-neutral-100)` etc against TAILWIND'S
// OWN default palette (light-to-dark, 100=near-white through 900=near-black,
// in every theme) wherever `theme.css` had not remapped that specific step —
// which was true of exactly -100 and -900, the two this file leaned on for
// its highest-contrast text. `text-neutral-100` therefore stayed near-white
// even in the LIGHT theme, against a live chip's tinted fill over
// `--tb-ground` (near-white too there) — about 1.1:1 on the tool names,
// which are the only thing this strip exists to show. `theme.css` now fills
// that gap for anyone who reaches for those two classes again, but this file
// moves onto `--tb-*` tokens directly (inline styles, same convention every
// other ported component in this task uses) rather than depend on getting a
// theme-relative numeric ramp's direction right by memory. Verified in a
// real Chrome tab, light theme — see task-4-report.md.
//
// Also Minor: the sort below used `localeCompare`, which depends on the
// runtime's own locale/ICU build; `ui/Manifest.tsx`'s merged list sorts by a
// bare code-unit comparator for the same reason (matches Chrome's own
// `getTools()` ordering, docs/WEBMCP-NOTES.md §1) and this strip now sits directly
// beneath that grid, so the two lists of tool names use the same ordering
// rule rather than two different ones side by side.
import { useEffect, useRef, useState } from 'react';
import type { Manifest } from '../webmcp/registry';
import { ACTOR_ACCENT, ACTOR_LABEL } from './theme';

type Card = { tool: string; used: number; lends: boolean };
type Slot = { card: Card; vanishing: boolean };

const VANISH_MS = 420;

/**
 * Tracks the current granted set plus a trailing "vanishing" set: a tool that
 * drops out of `granted` is not removed immediately — it is flagged
 * `vanishing` for one CSS transition, THEN removed. Without this, a
 * withdrawal is invisible: the chip is just gone on the next render, which
 * reads as a redraw rather than an event (exactly what CLAUDE.md's
 * "transition indicators for invisible work" rule warns against).
 */
function useVanishingSlots(cards: Card[]): Slot[] {
  const [slots, setSlots] = useState<Slot[]>(() => cards.map((card) => ({ card, vanishing: false })));
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  function scheduleRemoval(tool: string) {
    const t = setTimeout(() => {
      // Guarded on `vanishing` too: if the tool came back before this
      // fired, the diffing effect below already flipped it to
      // `vanishing: false`, and this must not delete a now-live card.
      setSlots((s) => s.filter((x) => !(x.card.tool === tool && x.vanishing)));
      timers.current.delete(tool);
    }, VANISH_MS);
    timers.current.set(tool, t);
  }

  // Fix round 1, Important 4: timers must survive across every diffing pass
  // below — they are only ever cleared when they fire, when their card
  // comes back live, or when this component genuinely unmounts. The
  // previous version put the "clear every timer" cleanup on the SAME effect
  // that re-runs on every card-set change, so it ran on every re-run too,
  // not just on unmount: two card-changing renders inside VANISH_MS (which
  // ConfirmBar's confirm path — refresh(), then a second refresh() after
  // phaseMachine.enter('CONFIRMED') resolves — produces) killed a still-
  // vanishing card's timer moments before the diff loop's "already
  // vanishing, timer already scheduled" branch assumed that timer would
  // still be there to remove it. No timer was ever rescheduled, so the
  // opacity-0 card stayed in `slots` forever, showing as a mysterious gap
  // in the hand. This effect now owns ONLY the true-unmount cleanup.
  useEffect(() => {
    const currentTimers = timers.current;
    return () => { for (const t of currentTimers.values()) clearTimeout(t); currentTimers.clear(); };
  }, []);

  useEffect(() => {
    const liveNames = new Set(cards.map((c) => c.tool));
    setSlots((prev) => {
      const next: Slot[] = [];
      // Keep every still-live card (refresh its count), and any not-yet-vanished
      // card that just dropped out — marked vanishing instead of deleted.
      for (const slot of prev) {
        if (liveNames.has(slot.card.tool)) {
          // A tool that reappears before its own vanish timer fired (a
          // lifetime closing and reopening faster than VANISH_MS) is
          // un-vanished here; clearing the pending timer too avoids a
          // leaked reference (it would otherwise still fire harmlessly,
          // since the removal inside it is itself guarded on `vanishing`).
          const pending = timers.current.get(slot.card.tool);
          if (pending) { clearTimeout(pending); timers.current.delete(slot.card.tool); }
          const fresh = cards.find((c) => c.tool === slot.card.tool)!;
          next.push({ card: fresh, vanishing: false });
        } else if (!slot.vanishing) {
          next.push({ card: slot.card, vanishing: true });
          scheduleRemoval(slot.card.tool);
        } else if (!timers.current.has(slot.card.tool)) {
          // Defensive, self-healing branch: a slot marked vanishing with NO
          // scheduled timer would otherwise never leave `slots` — this is
          // exactly the class of bug fixed above. Kept in case some other
          // ordering strands a timer in the future.
          next.push(slot);
          scheduleRemoval(slot.card.tool);
        } else {
          next.push(slot); // already vanishing, timer already scheduled
        }
      }
      // Any newly granted card not already tracked.
      for (const card of cards) {
        if (!next.some((s) => s.card.tool === card.tool)) next.push({ card, vanishing: false });
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.map((c) => `${c.tool}:${c.used}`).join(',')]);

  return slots;
}

export function Hand({ manifest }: { manifest: Manifest }) {
  const accent = ACTOR_ACCENT[manifest.actor];
  // Code-unit comparator, not `localeCompare` — matches `ui/Manifest.tsx`'s
  // merged-list sort and Chrome's own `getTools()` ASCII ordering
  // (docs/WEBMCP-NOTES.md §1), so this strip and the manifest grid directly above
  // it never disagree on how two tool names order.
  const cards = [...manifest.granted].sort((a, b) => (a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0));
  const slots = useVanishingSlots(cards);

  return (
    <div data-testid={`hand-${manifest.actor}`} className="flex flex-col gap-1 min-w-[9rem]">
      {/*
        Fix round 1 (Task 2a): `opacity-80` used to sit here alongside
        `accent.text`. `theme.ts`/`theme.css` now give `accent.text` a
        theme-aware value chosen to clear 4.5:1 in BOTH themes on its own —
        but an element's own `opacity` blends its rendered colour toward
        whatever is BEHIND it, and on the light ground that blend pulls a
        dark, high-contrast token most of the way back toward white: three
        of the four picks (cyan-800, amber-800, emerald-800) measured
        4.26-4.41:1 at 80% opacity against `--tb-ground` light, back under
        the 4.5:1 floor the token was chosen to clear — the exact kind of
        compounding effect a token-only fix can miss on paper. Removing the
        opacity here makes the rendered colour the token's own value,
        exactly the ratio `theme.css`'s comment documents, with nothing
        left to erode it. Dark mode only gets MORE legible without it (the
        `-300` steps blended-at-.8 were already fine, 6.49-8.14:1; unblended
        they are 9.48-12.19:1).
      */}
      <div className={`text-[10px] uppercase tracking-widest ${accent.text}`}>{ACTOR_LABEL[manifest.actor]}</div>
      <div className="flex flex-wrap gap-1.5 min-h-[1.75rem]">
        {slots.length === 0 && (
          <span className="text-xs italic" style={{ color: 'var(--tb-ink-3)' }}>empty hand</span>
        )}
        {slots.map(({ card, vanishing }) => (
          <span
            key={card.tool}
            data-testid={`chip-${manifest.actor}-${card.tool}`}
            data-state={vanishing ? 'vanishing' : 'live'}
            className={[
              'font-mono text-xs px-2 py-1 rounded border transition-all duration-[420ms] ease-out',
              vanishing ? 'opacity-0 saturate-0 -translate-y-1 scale-90' : `opacity-100 saturate-100 translate-y-0 scale-100 ${accent.border} ${accent.bg}`,
            ].join(' ')}
            style={
              vanishing
                ? { borderColor: 'var(--tb-rule-3)', background: 'var(--tb-ground-3)', color: 'var(--tb-ink-3)' }
                : { color: 'var(--tb-ink)' }
            }
          >
            {card.tool}
            {card.used > 0 && <span className="ml-1" style={{ color: 'var(--tb-ink-3)' }}>×{card.used}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The appeal socket. Unlike an ordinary chip, a spent appeal is drawn as a
 * permanently empty slot rather than simply disappearing — "the appeal chip,
 * once spent, leaves a permanently empty socket" is the one card in this
 * project whose ABSENCE has its own fixed layout position, because it never
 * comes back (PhaseMachine.appealSpent is permanent, unlike a lifetime that
 * merely isn't open yet).
 */
export function AppealSocket({ held, spent }: { held: boolean; spent: boolean }) {
  if (spent) {
    return (
      <span
        data-testid="appeal-socket-spent"
        className="font-mono text-xs px-2 py-1 rounded border border-dashed border-red-900/60 text-red-900/70 italic"
      >
        appeal — spent
      </span>
    );
  }
  if (!held) return null;
  return (
    <span data-testid="appeal-socket-held" className="font-mono text-xs px-2 py-1 rounded border" style={{ borderColor: 'var(--tb-rule-2)', background: 'var(--tb-ground-3)', color: 'var(--tb-ink)' }}>
      spend_appeal ×1
    </span>
  );
}
