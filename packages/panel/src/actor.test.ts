// Fix round 1, I3. The bug this file exists to prevent was not a crash: it
// was App.tsx and loop.ts quietly disagreeing about which of the four seats
// a panel frame is, so the config was written under one key and read under
// another. The panel then showed a configured provider while running every
// turn scripted and announcing that no key was set.
//
// These tests are about the ALLOWLIST behaviour specifically, because that
// is the half loop.ts used to be missing.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { panelActor } from './actor';
import { ACTORS } from '../../record/src/ui/theme';
import { loadConfigs, CONFIG_STORAGE_KEY } from '../../record/src/model/agentConfig';

describe('panelActor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.sessionStorage.removeItem(CONFIG_STORAGE_KEY);
  });

  it('returns each of the four real actors when its own url names one', () => {
    for (const actor of ACTORS) {
      vi.stubGlobal('location', { search: `?actor=${actor}` });
      expect(panelActor()).toBe(actor);
    }
  });

  it('falls back to A when ?actor= is absent entirely', () => {
    vi.stubGlobal('location', { search: '' });
    expect(panelActor()).toBe('A');
  });

  // The two inputs main.test.tsx already treats as supported, and the two
  // that used to make the old unvalidated lookup return '' and 'bogus'.
  it('falls back to A when ?actor= is present but empty', () => {
    vi.stubGlobal('location', { search: '?actor=' });
    expect(panelActor()).toBe('A');
  });

  it('falls back to A when ?actor= is not one of the four', () => {
    vi.stubGlobal('location', { search: '?actor=not-a-real-actor' });
    expect(panelActor()).toBe('A');
  });

  it('falls back to A for a prototype-shaped probe rather than returning it as a lookup key', () => {
    for (const probe of ['__proto__', 'constructor', 'toString']) {
      vi.stubGlobal('location', { search: `?actor=${probe}` });
      expect(panelActor()).toBe('A');
    }
  });

  it('returns A rather than throwing when reading location throws', () => {
    vi.stubGlobal('location', {
      get search(): never {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    expect(panelActor()).toBe('A');
  });

  // -----------------------------------------------------------------
  // THE REGRESSION ITSELF, stated as the property that was violated: the
  // seat this resolves to must always be a seat a config can actually be
  // stored under. Before the fix, `?actor=` resolved to '' here and to 'A'
  // in App.tsx, so a config written under 'A' was looked up under '' and
  // silently never found.
  // -----------------------------------------------------------------
  it('always resolves to a seat that a stored config can be found under, for every url that used to diverge', () => {
    globalThis.sessionStorage.setItem(
      CONFIG_STORAGE_KEY,
      // Exactly what App.tsx writes for these urls: under 'A', because 'A'
      // is what its own (already validated) lookup returns for all of them.
      JSON.stringify({ A: { provider: 'anthropic', model: '', key: 'sk-ant-real' } })
    );
    for (const search of ['', '?actor=', '?actor=A', '?actor=bogus', '?actor=__proto__']) {
      vi.stubGlobal('location', { search });
      expect(loadConfigs()[panelActor()]?.key).toBe('sk-ant-real');
    }
  });
});
