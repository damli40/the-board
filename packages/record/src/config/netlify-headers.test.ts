// TOML can't import TypeScript, so the two netlify.toml files carry their own
// copy of the origin strings that origins.ts defines. This test is the thing
// that catches the drift a type-checker cannot: someone changes an origin in
// origins.ts, forgets to update packages/record/netlify.toml or
// packages/panel/netlify.toml, and production ends up advertising a stale
// Permissions-Policy — a NotAllowedError on registerTool() that no other test
// would notice, because origins.test.ts only checks origins.ts against
// itself.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PARENT_ORIGIN, ORIGIN } from './origins';

const here = path.dirname(fileURLToPath(import.meta.url));
// here = packages/record/src/config
const recordTomlPath = path.join(here, '..', '..', 'netlify.toml'); // packages/record/netlify.toml
const panelTomlPath = path.join(here, '..', '..', '..', 'panel', 'netlify.toml'); // packages/panel/netlify.toml

const recordToml = readFileSync(recordTomlPath, 'utf8');
const panelToml = readFileSync(panelTomlPath, 'utf8');

/** Pulls the raw right-hand side of `KEY = ...` off its own line in a netlify.toml. */
function headerValue(toml: string, key: 'Origin-Agent-Cluster' | 'Permissions-Policy'): string {
  const match = toml.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm'));
  if (!match) throw new Error(`${key} not found in netlify.toml`);
  return match[1].trim();
}

describe('netlify.toml headers stay in sync with origins.ts', () => {
  it('packages/record/netlify.toml sets Origin-Agent-Cluster to ?1', () => {
    expect(headerValue(recordToml, 'Origin-Agent-Cluster')).toBe('"?1"');
  });

  it('packages/record/netlify.toml Permissions-Policy names exactly the four panel origins', () => {
    const value = headerValue(recordToml, 'Permissions-Policy');
    for (const origin of Object.values(ORIGIN)) {
      expect(value).toContain(`"${origin}"`);
    }
    // Also catches a stale extra origin left behind after a rename/removal.
    const quoted = [...value.matchAll(/"(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(quoted.sort()).toEqual(Object.values(ORIGIN).sort());
  });

  it('packages/panel/netlify.toml sets Origin-Agent-Cluster to ?1', () => {
    expect(headerValue(panelToml, 'Origin-Agent-Cluster')).toBe('"?1"');
  });

  it('packages/panel/netlify.toml Permissions-Policy names exactly the parent origin', () => {
    const value = headerValue(panelToml, 'Permissions-Policy');
    const quoted = [...value.matchAll(/"(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(quoted).toEqual([PARENT_ORIGIN]);
  });
});
