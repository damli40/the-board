// Task 9 — page hygiene: descriptions, unique titles, 404s, robots.txt and
// the web app manifests. Same cross-package pattern netlify-headers.test.ts
// already uses (that file reads packages/panel/netlify.toml from a test
// file that lives under packages/record/src/config): this reads both
// index.html files, both public/404.html files, both public/robots.txt
// files and both public/site.webmanifest files straight off disk, since
// none of them are TypeScript modules any other test file could import.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DEV_PARENT_ORIGIN, DEV_ORIGINS, PROD_PARENT_ORIGIN, PROD_ORIGINS } from './origins';

const here = path.dirname(fileURLToPath(import.meta.url));
// here = packages/record/src/config
const recordRoot = path.join(here, '..', '..'); // packages/record
const panelRoot = path.join(here, '..', '..', '..', 'panel'); // packages/panel

const read = (p: string) => readFileSync(p, 'utf8');

const recordIndexHtml = read(path.join(recordRoot, 'index.html'));
const panelIndexHtml = read(path.join(panelRoot, 'index.html'));

/**
 * Fix round 1, M1: the previous version of the two "does not name an
 * internal task number" tests below asserted a property of a string
 * literal defined two lines above THE TEST ITSELF (`expect(fallback)
 * .not.toMatch(...)` where `fallback` was the test's own hardcoded
 * expected value) — that can never fail regardless of what the real file
 * says, because it never reads the real file for that half of the
 * assertion. This extracts the actual `<div id="root"><p>...</p></div>`
 * text from a real index.html string, so the "no task number" half of the
 * test is checking the file, not the test's own constant.
 */
function extractRootFallbackText(html: string): string {
  const match = html.match(/<div id="root">\s*<p>([\s\S]*?)<\/p>\s*<\/div>/);
  if (!match) throw new Error('could not find <div id="root"><p>...</p></div> in the given HTML');
  return match[1];
}

// Every origin string this repo knows about, dev and prod alike. If any of
// these literally appears in a source index.html, that is a hardcoded
// origin — the thing the brief calls out as forbidden, since the canonical
// URL and the absolute og:image URL are meant to come from
// vite.config.ts's transformIndexHtml hook instead (see that file), reading
// origins.ts at build time, never typed into the HTML by hand.
const ALL_KNOWN_ORIGINS = [
  DEV_PARENT_ORIGIN,
  ...Object.values(DEV_ORIGINS),
  PROD_PARENT_ORIGIN,
  ...Object.values(PROD_ORIGINS),
];

describe('no origin string is hardcoded in either source index.html (task 9)', () => {
  it.each(ALL_KNOWN_ORIGINS)('packages/record/index.html does not contain %s', (origin) => {
    expect(recordIndexHtml).not.toContain(origin);
  });

  it.each(ALL_KNOWN_ORIGINS)('packages/panel/index.html does not contain %s', (origin) => {
    expect(panelIndexHtml).not.toContain(origin);
  });
});

describe('record index.html — title, description, OG/Twitter, no-JS fallback', () => {
  it('has the exact required <title>', () => {
    expect(recordIndexHtml).toContain('<title>The Board — when my agent and your agent disagree</title>');
  });

  it('has the exact required meta description', () => {
    expect(recordIndexHtml).toContain(
      'content="People are starting to send AI agents to act for them. The Board is a shared page where two agents argue one case, and the browser — not the app — decides what each of them may do."'
    );
  });

  it('carries og:title, og:description, og:type and twitter:card', () => {
    expect(recordIndexHtml).toContain('property="og:title" content="The Board — when my agent and your agent disagree"');
    expect(recordIndexHtml).toContain('property="og:type" content="website"');
    expect(recordIndexHtml).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('does NOT set og:image or canonical statically — those come from the build-time plugin', () => {
    // If either literal shows up here, someone hand-typed an absolute URL
    // into the HTML instead of using vite.config.ts's transformIndexHtml
    // hook — exactly the mistake the ALL_KNOWN_ORIGINS check above exists
    // to catch, restated for these two tags specifically.
    expect(recordIndexHtml).not.toContain('property="og:image"');
    expect(recordIndexHtml).not.toContain('rel="canonical"');
  });

  it('has the exact required no-JS fallback text inside #root, read from the real file, and it does not name an internal task number', () => {
    const fallback = extractRootFallbackText(recordIndexHtml);
    expect(fallback).toBe(
      'The Board needs JavaScript. It runs four AI agents in four separate browser origins and shows what each one was allowed to do, which is not something that can be rendered ahead of time.'
    );
    // The file's own dev COMMENTS legitimately say "Task 9" throughout
    // (this repo's own commenting convention) — scoped to just the
    // extracted visible text so that doesn't false-positive here.
    expect(fallback).not.toMatch(/[Tt]ask \d/);
  });

  it('references the web app manifest', () => {
    expect(recordIndexHtml).toContain('<link rel="manifest" href="/site.webmanifest" />');
  });

  it('keeps the blocking theme script before the stylesheet link (fix round 1, I3 — never regress this order)', () => {
    const scriptIndex = recordIndexHtml.indexOf('<script>');
    const stylesheetIndex = recordIndexHtml.indexOf('<link rel="stylesheet" href="/src/styles.css" />');
    expect(scriptIndex).toBeGreaterThan(-1);
    expect(stylesheetIndex).toBeGreaterThan(-1);
    expect(scriptIndex).toBeLessThan(stylesheetIndex);
  });

  it('fix round 1, I2: never re-cites CLAUDE.md §0 for the origin-string rule — it does not contain one', () => {
    expect(recordIndexHtml).not.toMatch(/CLAUDE\.md §0[^.]*origin/i);
  });
});

describe('panel index.html — static fallback title/description, robots, no-JS fallback', () => {
  it('has the exact required static <title>', () => {
    expect(panelIndexHtml).toContain('<title>Agent panel — The Board</title>');
  });

  it('has the exact required static meta description', () => {
    expect(panelIndexHtml).toContain(
      'content="One agent\'s frame. It holds only the tools the record handed to this origin, and it is meant to be opened inside the record page."'
    );
  });

  it('has the exact required no-JS fallback text inside #root, read from the real file, and it does not name an internal task number', () => {
    const fallback = extractRootFallbackText(panelIndexHtml);
    expect(fallback).toBe(
      "This is one agent's frame. It needs JavaScript, and it is meant to be opened inside the record page, which is where the case file and the tool registry live."
    );
    // See the equivalent record-page test above for why this is extracted
    // from the real file rather than checked against a local constant.
    expect(fallback).not.toMatch(/[Tt]ask \d/);
  });

  it('references the web app manifest', () => {
    expect(panelIndexHtml).toContain('<link rel="manifest" href="/site.webmanifest" />');
  });

  // Fix round 1, I5: this used to also assert a `noindex` meta tag here.
  // Pulled — the reviewer found it inert (robots.txt's `Disallow: /` stops
  // the crawler from ever fetching this page, so it never reads a meta tag
  // on it either), and the fix pulled the tag itself back to the brief
  // rather than keep dead markup with a caveat. `robots.txt` is what
  // actually does this job — see that describe block below.
});

describe('public/ assets exist for both packages (task 9)', () => {
  const recordPublic = path.join(recordRoot, 'public');
  const panelPublic = path.join(panelRoot, 'public');
  const requiredFiles = ['404.html', 'robots.txt', 'site.webmanifest'];

  it.each(requiredFiles)('packages/record/public/%s exists', (file) => {
    expect(existsSync(path.join(recordPublic, file))).toBe(true);
  });

  it.each(requiredFiles)('packages/panel/public/%s exists', (file) => {
    expect(existsSync(path.join(panelPublic, file))).toBe(true);
  });

  it('the record OG image referenced by the vite plugin exists in packages/record/public', () => {
    expect(existsSync(path.join(recordPublic, 'the-board-lockup.jpg'))).toBe(true);
  });

  it('fix round 1, M6: the OG image is re-encoded, not the original 1.23MB brand asset', () => {
    // Was 1,234,912 bytes (2816x1536) straight from docs/brand/. Re-encoded
    // with `sips` to 1200x654, ~34KB. Pinned generously under 250KB so a
    // future replacement image has room without silently regressing back to
    // shipping a multi-megabyte file on every record deploy.
    const stats = statSync(path.join(recordPublic, 'the-board-lockup.jpg'));
    expect(stats.size).toBeLessThan(250_000);
  });
});

describe('record 404.html (task 9)', () => {
  const html = read(path.join(recordRoot, 'public', '404.html'));

  it('has the exact required <title>, <h1> and body copy', () => {
    expect(html).toContain('<title>Not found — The Board</title>');
    expect(html).toContain('<h1>That page is not part of the record.</h1>');
    expect(html).toContain(
      'The Board is one page, not a site. Everything is at the root: the case file, the four agents, and the record of what each one did.'
    );
  });

  it('links back to the record root with the exact required link text', () => {
    expect(html).toContain('<a href="/">Go to the record</a>');
  });

  it('paints body explicitly in both a dark default and a light override (never a transparent body)', () => {
    expect(html).toMatch(/body\s*\{[^}]*background:\s*var\(--bg\)/s);
    expect(html).toContain('@media (prefers-color-scheme: light)');
  });

  it('does not hardcode any known origin string', () => {
    for (const origin of ALL_KNOWN_ORIGINS) expect(html).not.toContain(origin);
  });

  it('fix round 1, I1: syncs the theme-color meta from the pinned-theme script, matching index.html', () => {
    // The bug: a static <meta name="theme-color"> never changes, so a
    // pinned-light (or OS-light) viewer on a missing path sees a light page
    // with dark mobile browser chrome. index.html's own blocking script
    // fixes this for the real page; this 404 needs the identical fix, not
    // just the data-theme half.
    expect(html).toMatch(/document\.querySelector\('meta\[name="theme-color"\]'\)/);
    expect(html).toMatch(/meta\.setAttribute\('content', isLight \? '#f3f2f2' : '#191919'\)/);
  });

  it('fix round 1, I1: no longer claims there is nothing to sync (the old comment was proven false by line 9 of the same file)', () => {
    expect(html).not.toMatch(/nothing else to sync/);
  });
});

describe('panel 404.html (task 9)', () => {
  const html = read(path.join(panelRoot, 'public', '404.html'));

  it('has the exact required <title>, <h1> and body copy', () => {
    expect(html).toContain('<title>Not found — The Board</title>');
    expect(html).toContain("<h1>That page is not part of this agent's frame.</h1>");
    expect(html).toContain(
      'This origin holds one agent panel and nothing else. It is meant to be opened inside the record page, which is where the case file and the tool registry live.'
    );
    expect(html).toContain('Open the record page and this frame appears inside it.');
  });

  it('does NOT link to the record — the record\'s address is not knowable from a static file shared across four origins', () => {
    expect(html).not.toContain('href="/"');
    expect(html).not.toMatch(/<a\s/);
  });

  it('paints body explicitly in both a dark default and a light override (never a transparent body)', () => {
    expect(html).toMatch(/body\s*\{[^}]*background:\s*var\(--bg\)/s);
    expect(html).toContain('@media (prefers-color-scheme: light)');
  });

  it('does not hardcode any known origin string', () => {
    for (const origin of ALL_KNOWN_ORIGINS) expect(html).not.toContain(origin);
  });
});

describe('robots.txt (task 9)', () => {
  it('record robots.txt allows indexing', () => {
    const txt = read(path.join(recordRoot, 'public', 'robots.txt'));
    expect(txt).toMatch(/User-agent:\s*\*/);
    expect(txt).toMatch(/Allow:\s*\//);
    expect(txt).not.toMatch(/^Disallow:\s*\//m);
  });

  it('fix round 1, I6: record robots.txt does not advertise withheld material on the one origin meant to be indexed', () => {
    // The old comment said the naming rule "already keeps anything
    // unshareable off the page itself" (verified verbatim against the
    // pre-fix file) — true, but robots.txt is fetched by anyone, and the
    // review (task-9-findings-r1.md, I6) put it well: shipping a breadcrumb
    // that effectively says there is unshareable material and a rule for
    // withholding it is the wrong instinct under a rule whose whole premise
    // is that a public artefact can't be un-published. Cut to the first two
    // sentences per the finding.
    const txt = read(path.join(recordRoot, 'public', 'robots.txt'));
    expect(txt).not.toMatch(/unshareable/i);
    expect(txt).not.toMatch(/CLAUDE\.md/i);
    const commentLines = txt.split('\n').filter((line) => line.startsWith('#'));
    expect(commentLines.length).toBeLessThanOrEqual(3);
  });

  it('panel robots.txt disallows indexing entirely, with reasoning in a comment', () => {
    const txt = read(path.join(panelRoot, 'public', 'robots.txt'));
    expect(txt).toMatch(/User-agent:\s*\*/);
    expect(txt).toMatch(/Disallow:\s*\/\s*$/m);
    expect(txt.trim().startsWith('#')).toBe(true);
  });
});

describe('site.webmanifest (task 9)', () => {
  it('record manifest parses and matches --tb-ground (#191919), referencing existing icons', () => {
    const manifest = JSON.parse(read(path.join(recordRoot, 'public', 'site.webmanifest')));
    expect(manifest.theme_color).toBe('#191919');
    expect(manifest.background_color).toBe('#191919');
    expect(typeof manifest.name).toBe('string');
    expect(typeof manifest.short_name).toBe('string');
    const iconSrcs = manifest.icons.map((i: { src: string }) => i.src);
    expect(iconSrcs).toContain('/favicon.svg');
    expect(iconSrcs).toContain('/icon-512.png');
    for (const src of iconSrcs) {
      expect(existsSync(path.join(recordRoot, 'public', path.basename(src)))).toBe(true);
    }
  });

  it('panel manifest parses and matches --tb-ground (#191919), referencing existing icons', () => {
    const manifest = JSON.parse(read(path.join(panelRoot, 'public', 'site.webmanifest')));
    expect(manifest.theme_color).toBe('#191919');
    expect(manifest.background_color).toBe('#191919');
    expect(typeof manifest.name).toBe('string');
    expect(typeof manifest.short_name).toBe('string');
    const iconSrcs = manifest.icons.map((i: { src: string }) => i.src);
    expect(iconSrcs).toContain('/favicon.svg');
    expect(iconSrcs).toContain('/icon-512.png');
    for (const src of iconSrcs) {
      expect(existsSync(path.join(panelRoot, 'public', path.basename(src)))).toBe(true);
    }
  });
});
