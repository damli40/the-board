// Which of the four seats this panel frame is, decided in exactly one place.
//
// Task 2b review, I3: there used to be TWO answers to that question and
// they disagreed. App.tsx's `actorFromQuery` validated `?actor=` against
// the `ACTORS` allowlist and fell back to 'A'; loop.ts's `panelActor` did
// not — it returned `.get('actor') ?? 'A'` raw. So on `?actor=` (present
// but empty) or `?actor=bogus`, App.tsx stored the delivered model config
// under 'A' and its readout said a provider was configured, while loop.ts
// looked up `configs['']`, found nothing, and ran every turn scripted
// saying no key existed. Nothing crashed; the panel simply told the user
// the opposite of what it was doing.
//
// Those are not exotic inputs — `main.test.tsx` has dedicated tests for
// both query strings, so this codebase treats them as supported. The fix is
// not "validate in the second place too", which would leave two
// implementations to drift again; it is one function both files import.
//
// It lives in `panel/src/` rather than beside the React component because
// loop.ts must not depend on a component file, and reads `globalThis` (not
// `window`) with a try/catch because loop.ts already runs in contexts where
// `location` can be stubbed away or throw.
import { ACTORS } from '../../record/src/ui/theme';
import type { Actor } from '../../record/src/model/types';

/**
 * This frame's actor from its own `?actor=` query param, validated against
 * the `ACTORS` allowlist. Anything not on that list — absent, empty,
 * misspelled, or a `__proto__`-shaped probe — resolves to `'A'`, which is
 * the seat the record opens first and the only safe default.
 *
 * Returning a real `Actor` rather than a bare string is the point: it is
 * what makes `loadConfigs()[panelActor()]` a lookup that can only ever hit
 * a key App.tsx could also have written.
 */
export function panelActor(): Actor {
  try {
    const value = new URLSearchParams(globalThis.location?.search ?? '').get('actor');
    return (ACTORS as readonly string[]).includes(value ?? '') ? (value as Actor) : 'A';
  } catch {
    return 'A';
  }
}
