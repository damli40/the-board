// Task 9: the panel's runtime <title>, <meta name="description"> and hidden
// <h1>, set once per `?actor=` before the app mounts.
//
// This imports the entrypoint module itself (not just named exports),
// because the module's own top level IS the code under test — the head
// update and the mount both run as a side effect of import, same as they do
// on a real page load. Each test resets the module registry and re-imports
// fresh (`vi.resetModules()` + a dynamic `import('./main')`), since
// main.tsx runs its setup exactly once per module instance, the same way a
// real page runs it exactly once per navigation.
//
// `modelContext` is deliberately left unset throughout, the same starting
// state App.test.tsx's own first test uses ("renders the WebMCP-unavailable
// reason ... when modelContext is missing"): App then takes its early
// `!status.available` branch, which registers no interval and needs no
// cleanup, so mounting the real App here (rather than a mock) is safe and
// exercises the actual wiring between main.tsx and App.tsx.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { ACTORS, ACTOR_LABEL } from '../../record/src/ui/theme';
import type { Actor } from '../../record/src/model/types';

const EXPECTED_NAME: Record<Actor, string> = {
  A: 'Advocate A',
  B: 'Advocate B',
  seat1: 'Seat 1',
  seat2: 'Seat 2',
};

const EXPECTED_DESCRIPTION: Record<Actor, string> = {
  A: 'Argues one side of the case. Holds only the tools the record handed to this origin.',
  B: 'Argues one side of the case. Holds only the tools the record handed to this origin.',
  seat1: 'Reads both sides and assesses. Holds only the tools the record handed to this origin.',
  seat2: 'Reads both sides and assesses. Holds only the tools the record handed to this origin.',
};

async function mountForActor(actorParam: string | null): Promise<void> {
  document.head.innerHTML = '<meta name="description" content="static fallback" />';
  document.body.innerHTML = '<div id="root"></div>';
  window.history.pushState({}, '', actorParam === null ? '/' : `/?actor=${actorParam}`);
  vi.resetModules();
  await act(async () => {
    await import('./main');
  });
}

afterEach(() => {
  delete (document as unknown as { modelContext?: unknown }).modelContext;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  window.history.pushState({}, '', '/');
});

describe('panel entrypoint head (task 9)', () => {
  it.each(ACTORS)('sets document.title from ACTOR_LABEL, title-cased, for actor %s', async (actor) => {
    await mountForActor(actor);
    expect(document.title).toBe(`${EXPECTED_NAME[actor]} — The Board`);
  });

  it.each(ACTORS)('sets the meta description by role for actor %s', async (actor) => {
    await mountForActor(actor);
    const meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toBe(EXPECTED_DESCRIPTION[actor]);
  });

  it.each(ACTORS)('renders a visually-hidden <h1> carrying the actor name for %s', async (actor) => {
    await mountForActor(actor);
    const h1 = document.querySelector('h1');
    expect(h1?.textContent).toBe(EXPECTED_NAME[actor]);
    expect(h1?.className).toContain('sr-only');
  });

  it('falls back to actor A when ?actor= is absent, the same default App.tsx uses', async () => {
    await mountForActor(null);
    expect(document.title).toBe('Advocate A — The Board');
  });

  it('falls back to actor A when ?actor= is not one of the four', async () => {
    await mountForActor('not-a-real-actor');
    expect(document.title).toBe('Advocate A — The Board');
  });

  it('fix round 1, M7: falls back to actor A when ?actor= is present but empty', async () => {
    // Distinct from the absent-entirely case two tests above: `?actor=` with no
    // value gives URLSearchParams an empty string, not null/undefined, and
    // an empty string is not in the ACTORS allowlist either.
    await mountForActor('');
    expect(document.title).toBe('Advocate A — The Board');
  });

  it('every runtime title name is exactly ACTOR_LABEL title-cased — catches drift if theme.ts ever renames a badge', () => {
    for (const actor of ACTORS) {
      const titleCased = ACTOR_LABEL[actor]
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      expect(titleCased).toBe(EXPECTED_NAME[actor]);
    }
  });
});
