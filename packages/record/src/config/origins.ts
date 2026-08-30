// Single source of truth for every origin string in this repo, for BOTH dev
// and production. Every other module imports the resolved PARENT_ORIGIN /
// ORIGIN from here rather than writing an origin string of its own.
//
// The actor union (`A` | `B` | `seat1` | `seat2`) has exactly one definition
// site: `Actor` in `../model/types.ts` (built from `Side | Seat`). Indexing
// ORIGIN with a new actor that types.ts doesn't know about now fails to
// compile instead of silently returning undefined at runtime.
//
// `import type` here is erased at compile time, so this does not create a
// runtime circular dependency even though types.ts re-exports ORIGIN /
// PARENT_ORIGIN (values) from this file — verified with `tsc --noEmit` and
// by the dev server starting clean (see task-2-report.md, fix round 1).
import type { Actor } from '../model/types';

// ---- Dev: five localhost ports, one per Vite dev server (scripts/dev-origins.mjs) ----
export const DEV_PARENT_ORIGIN = 'http://localhost:8080';

export const DEV_ORIGINS: Record<Actor, string> = {
  A: 'http://localhost:8081',
  B: 'http://localhost:8082',
  seat1: 'http://localhost:8083',
  seat2: 'http://localhost:8084',
};

// ---- Prod: the five real Netlify sites (docs/evidence/deploy.md) ----
export const PROD_PARENT_ORIGIN = 'https://theboard-record.netlify.app';

export const PROD_ORIGINS: Record<Actor, string> = {
  A: 'https://theboard-a.netlify.app',
  B: 'https://theboard-b.netlify.app',
  seat1: 'https://theboard-seat1.netlify.app',
  seat2: 'https://theboard-seat2.netlify.app',
};

// ---- Resolve which set is live ----
//
// This file loads in three different contexts, and each one exposes
// `import.meta.env` differently:
//
//   1. Vite's production browser build (`vite build`). This file sits in the
//      app's own module graph (App.tsx -> model/types.ts -> here), so Vite
//      statically replaces `import.meta.env.PROD` with the literal `true`.
//      This is the only context that should resolve to the production
//      origins above.
//   2. The Vite dev server serving the browser (`vite` / `npm run dev`).
//      Same module graph, but `import.meta.env.PROD` is `false`.
//   3. Plain Node. Two sub-cases land here: Vite's own config loader
//      importing this file from `vite.config.ts` to compute dev-server
//      headers (that import runs through Vite's config bundler, not the
//      app's module graph, so it never gets the `import.meta.env` define),
//      and vitest importing this file from a `*.test.ts` file. Neither is
//      guaranteed to have `import.meta.env` populated the way the app's own
//      bundle does.
//
// The `vite/client` ambient types declare `import.meta.env.PROD` as a
// non-optional `boolean`, which is true for context 1 and 2 but not
// something context 3 actually guarantees at runtime. Rather than trust that
// type, this reads `import.meta.env` defensively (optional chaining) and
// requires an explicit `=== true` to opt into production. Every other case,
// whether `undefined` because `.env` isn't there at all or `false` because
// it is, falls back to dev, which is the correct default for a config
// loader and for tests, and the safe default in general: failing to detect
// "production" here just means Node tooling computes dev values, never
// something a judge or user sees.
const isProdBuild = import.meta.env?.PROD === true;

export const PARENT_ORIGIN = isProdBuild ? PROD_PARENT_ORIGIN : DEV_PARENT_ORIGIN;

export const ORIGIN: Record<Actor, string> = isProdBuild ? PROD_ORIGINS : DEV_ORIGINS;
