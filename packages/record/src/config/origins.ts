// Dev origins. The five real values are localhost ports, standing in for the
// five theboard.app subdomains this project will eventually deploy to. When
// it's time to go live, the production swap happens IN THIS FILE ONLY — every
// other module imports PARENT_ORIGIN / ORIGIN from here rather than writing
// an origin string of its own.
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

export const PARENT_ORIGIN = 'http://localhost:8080';

export const ORIGIN: Record<Actor, string> = {
  A: 'http://localhost:8081',
  B: 'http://localhost:8082',
  seat1: 'http://localhost:8083',
  seat2: 'http://localhost:8084',
};
