// Shared visual identity for the four actors. One accent per actor is a
// storyboard rule ("Four agents, four visual identities... distinct colour
// and frame chrome each, with the origin printed on the panel") — centralised
// here so Manifest, Hand, Docket and the panel's own App all draw the same
// actor the same colour. No hex literals: every value is a Tailwind v4
// utility class name, so the palette tracks whatever theme Tailwind resolves.
//
// Cross-package import note: packages/panel/src/App.tsx imports this file by
// relative path (`../../record/src/ui/theme`), the same pattern
// packages/panel/vite.config.ts already uses for PARENT_ORIGIN. Both
// packages share one tsconfig.json (`include: ["packages/*/src", ...]`), so
// this is a supported, already-established convention, not a new one.
import type { Actor } from '../model/types';

export const ACTORS: Actor[] = ['A', 'B', 'seat1', 'seat2'];

export const ACTOR_LABEL: Record<Actor, string> = {
  A: 'ADVOCATE A',
  B: 'ADVOCATE B',
  seat1: 'SEAT 1',
  seat2: 'SEAT 2',
};

export interface ActorAccent {
  /**
   * Fix round 1 (Task 2a): was a fixed Tailwind step (`text-cyan-300`, ...)
   * — a real colour regardless of theme, computing ~1.25-1.5:1 against the
   * LIGHT ground (`ui/Hand.tsx`'s actor labels were the reported case, at
   * cyan 1.25 / amber 1.23 / violet 1.49 / emerald 1.29:1; every consumer
   * of this field inherited the same defect, since it was the same fixed
   * class everywhere). Now a Tailwind ARBITRARY-VALUE class
   * (`text-[var(--tb-actor-a-text)]`) pointing at a custom property
   * `theme.css` defines twice — once per theme, both clearing 4.5:1, see
   * that file's own comment for the full ratio table. Still a plain
   * `className` string, so every existing call site (`Hand.tsx`,
   * `VerdictPanel.tsx`, `ExhibitList.tsx`) is fixed with no change of its
   * own — this is the one field the fix could not leave a bare Tailwind
   * step, because "the same class resolves to the same colour in every
   * theme" is exactly the bug.
   */
  text: string;
  border: string;
  bg: string;
  dot: string;
  ring: string;
  /**
   * Task 2a, card chrome: the four hex hues the design's "Four agents, four
   * frames" panel chrome draws directly (the-board.dc.html, line 529-532,
   * and the 4px bar/state-chip border at lines 272/276). Kept as a bare hex
   * string, not a Tailwind class like every other field on this record — the
   * design uses these as raw CSS `background`/`color`/`border` values
   * (`{{ p.hue }}`), never as a class name, so a Tailwind utility here would
   * be dead weight with no selector to attach to. One definition site: any
   * component that needs the actor's colour as a real paintable value reads
   * `.hue`, so it cannot drift from what AgentCard renders.
   */
  hue: string;
}

export const ACTOR_ACCENT: Record<Actor, ActorAccent> = {
  A: { text: 'text-[var(--tb-actor-a-text)]', border: 'border-cyan-500/50', bg: 'bg-cyan-500/10', dot: 'bg-cyan-400', ring: 'ring-cyan-400/40', hue: '#4FD1E0' },
  B: { text: 'text-[var(--tb-actor-b-text)]', border: 'border-amber-500/50', bg: 'bg-amber-500/10', dot: 'bg-amber-400', ring: 'ring-amber-400/40', hue: '#E8618C' },
  seat1: { text: 'text-[var(--tb-actor-seat1-text)]', border: 'border-violet-500/50', bg: 'bg-violet-500/10', dot: 'bg-violet-400', ring: 'ring-violet-400/40', hue: '#A78BFA' },
  seat2: { text: 'text-[var(--tb-actor-seat2-text)]', border: 'border-emerald-500/50', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400', ring: 'ring-emerald-400/40', hue: '#5FD08A' },
};
