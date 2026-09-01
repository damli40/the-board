// Task 9 fix round 1, I4 + M2 — the most breakable new machinery had no
// test at all. `canonicalAndOgImagePlugin()` (packages/record/vite.config.ts)
// is the only thing producing <link rel="canonical"> and
// <meta property="og:image"> in the shipped HTML; deleting it from the
// plugins array left the rest of the suite green while the record would
// ship with no canonical URL and a summary_large_image card pointing at
// nothing. Likewise, nothing verified that packages/*/public/ actually
// reaches packages/*/dist/ — the previous coverage only checked that the
// SOURCE public/ files exist, which a `publicDir: false` misconfiguration
// would not touch at all.
//
// Both are fixed the same way: run Vite's own `build()` for real, against
// each package's own vite.config.ts (no mocking, no re-implementing what
// Vite does), then read the actual dist/ output off disk. If someone
// deletes the plugin from the plugins array, or sets `publicDir: false`, or
// removes a public/ file, this test fails — the earlier page-hygiene tests
// checking the source files could not have caught any of the three.
//
// Fix round 2 (kept deliberately, not walked back): this couples the suite
// to two real `vite build` calls against source trees other agents are
// actively editing concurrently. A build failure here during concurrent
// editing is someone else's in-flight source, not a regression in the
// canonical/og:image tags this file guards — check what actually changed
// before assuming this file broke something. The alternative is no test at
// all for the one thing standing between that plugin and silent removal,
// and two real builds cost well under half a second.
import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PROD_PARENT_ORIGIN } from './origins';

const here = path.dirname(fileURLToPath(import.meta.url));
// here = packages/record/src/config
const recordRoot = path.join(here, '..', '..'); // packages/record
const panelRoot = path.join(here, '..', '..', '..', 'panel'); // packages/panel

describe('real build output (task 9 fix round 1, I4 + M2)', () => {
  beforeAll(async () => {
    // logLevel: 'silent' — Vite's own build progress/warning lines would
    // otherwise print into the test run; the assertions below are the
    // actual verification, not the console output.
    await build({ root: recordRoot, logLevel: 'silent' });
    await build({ root: panelRoot, logLevel: 'silent' });
  }, 60_000);

  describe('I4 — canonicalAndOgImagePlugin() actually runs', () => {
    it('injects <link rel="canonical"> pointing at PROD_PARENT_ORIGIN into dist/index.html', () => {
      const html = readFileSync(path.join(recordRoot, 'dist', 'index.html'), 'utf8');
      expect(html).toContain(`<link rel="canonical" href="${PROD_PARENT_ORIGIN}/">`);
    });

    it('injects an absolute <meta property="og:image"> pointing at the shipped lockup image', () => {
      const html = readFileSync(path.join(recordRoot, 'dist', 'index.html'), 'utf8');
      expect(html).toContain(`<meta property="og:image" content="${PROD_PARENT_ORIGIN}/the-board-lockup.jpg">`);
    });
  });

  describe('M2 — public/ actually reaches dist/, for both packages', () => {
    it.each(['404.html', 'robots.txt', 'site.webmanifest'])('record dist/%s exists', (file) => {
      expect(existsSync(path.join(recordRoot, 'dist', file))).toBe(true);
    });

    it.each(['404.html', 'robots.txt', 'site.webmanifest'])('panel dist/%s exists', (file) => {
      expect(existsSync(path.join(panelRoot, 'dist', file))).toBe(true);
    });

    it('the record OG image lands in dist/, not just in source public/', () => {
      expect(existsSync(path.join(recordRoot, 'dist', 'the-board-lockup.jpg'))).toBe(true);
    });

    it('the built record 404.html still carries the required copy (survives the copy step unmodified)', () => {
      const html = readFileSync(path.join(recordRoot, 'dist', '404.html'), 'utf8');
      expect(html).toContain('<h1>That page is not part of the record.</h1>');
    });

    it('the built panel 404.html still carries the required copy (survives the copy step unmodified)', () => {
      const html = readFileSync(path.join(panelRoot, 'dist', '404.html'), 'utf8');
      expect(html).toContain("<h1>That page is not part of this agent's frame.</h1>");
    });
  });

  it('the record blocking theme script still precedes the stylesheet link in the built head (never regress this order)', () => {
    const html = readFileSync(path.join(recordRoot, 'dist', 'index.html'), 'utf8');
    const scriptIndex = html.indexOf('localStorage.getItem');
    const stylesheetIndex = html.indexOf('rel="stylesheet"');
    expect(scriptIndex).toBeGreaterThan(-1);
    expect(stylesheetIndex).toBeGreaterThan(-1);
    expect(scriptIndex).toBeLessThan(stylesheetIndex);
  });
});
