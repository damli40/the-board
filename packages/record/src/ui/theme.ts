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
  text: string;
  border: string;
  bg: string;
  dot: string;
  ring: string;
}

export const ACTOR_ACCENT: Record<Actor, ActorAccent> = {
  A: { text: 'text-cyan-300', border: 'border-cyan-500/50', bg: 'bg-cyan-500/10', dot: 'bg-cyan-400', ring: 'ring-cyan-400/40' },
  B: { text: 'text-amber-300', border: 'border-amber-500/50', bg: 'bg-amber-500/10', dot: 'bg-amber-400', ring: 'ring-amber-400/40' },
  seat1: { text: 'text-violet-300', border: 'border-violet-500/50', bg: 'bg-violet-500/10', dot: 'bg-violet-400', ring: 'ring-violet-400/40' },
  seat2: { text: 'text-emerald-300', border: 'border-emerald-500/50', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400', ring: 'ring-emerald-400/40' },
};
