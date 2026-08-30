// The signature image (storyboard component 1). Two columns per actor,
// rendered from ONE registry call (`ToolRegistry.manifest(actor)`) so GRANTED
// and NOT GRANTED cannot disagree with reality — the NOT GRANTED half is a
// projection of the same registry, never a hard-coded list.
//
// Ruling 3 (controller, task 8): `registry.registered()` builds `granted`
// from Map insertion order of opened lifetimes, then TOOLS declaration
// order — NOT alphabetical. Chrome's own `getTools()` guarantees alphabetical
// order (CLAUDE.md sec. 1); this component re-sorts so the rendered manifest
// matches that expectation and never reshuffles between renders of the same
// state (a reshuffle mid-take would make the signature image look flaky on
// camera). `notGranted` is sorted the same way for the same reason, even
// though it happens to already read in a stable (if non-alphabetical) order
// from `ALL_TOOL_NAMES`.
import type { Manifest as ManifestData } from '../webmcp/registry';
import { ACTOR_ACCENT, ACTOR_LABEL } from './theme';

function byName<T>(items: T[], name: (t: T) => string): T[] {
  return [...items].sort((a, b) => name(a).localeCompare(name(b)));
}

/**
 * Strikes through a withheld tool's name, per the storyboard mockup.
 *
 * This used to render ONE SPAN PER CHARACTER with an absolutely positioned
 * border. Inline spans let the browser break a line between any two of them,
 * so `record_assessment` wrapped as `record_asse` / `ssment` and orphaned the
 * bullet on its own line, shifting every row below it. Observed in Chrome on
 * 30 Aug 2026. A real text-decoration draws the same line and keeps the name a
 * word.
 */
function strike(name: string) {
  return <span className="line-through decoration-red-400/70 break-words">{name}</span>;
}

export function Manifest({ manifest }: { manifest: ManifestData }) {
  const granted = byName(manifest.granted, (g) => g.tool);
  const notGranted = byName(manifest.notGranted, (t) => t);
  const accent = ACTOR_ACCENT[manifest.actor];

  return (
    <section
      data-testid={`manifest-${manifest.actor}`}
      className={`font-mono text-xs bg-neutral-950 border ${accent.border} rounded-md overflow-hidden`}
    >
      <header className={`flex items-baseline justify-between px-3 py-2 border-b ${accent.border} ${accent.bg}`}>
        <span className={`text-sm uppercase tracking-widest font-semibold ${accent.text}`}>{ACTOR_LABEL[manifest.actor]}</span>
        <span className="text-neutral-500 text-xs">⌁ frame: {manifest.origin}</span>
      </header>

      {/*
        Not an even split. NOT GRANTED carries the longest names in the
        catalogue (`record_assessment`, `return_with_note`); GRANTED carries
        short ones plus a narrow count. At an even split the longest name
        needed 155.7px in a 150px column and wrapped, orphaning its bullet and
        shifting every row below it (measured in Chrome, 30 Aug 2026).
      */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-neutral-800">
        <div className="p-2">
          <h3 className="text-neutral-400 text-xs uppercase tracking-wider mb-1">Granted</h3>
          <table className="w-full border-collapse">
            <tbody>
              {granted.map((g) => (
                <tr key={g.tool} data-testid={`row-${g.tool}`} className="align-top">
                  <td className="relative pl-4 pr-1 py-0.5 text-neutral-200 break-words">
                    <span className={`absolute left-0 top-0.5 ${accent.text}`} aria-hidden>●</span>
                    {g.tool}
                    {g.lends && <span className="text-neutral-500"> (page lends)</span>}
                  </td>
                  <td data-testid={`used-${g.tool}`} className="pl-2 text-right tabular-nums text-neutral-500 py-0.5">
                    {g.used}
                  </td>
                </tr>
              ))}
              {granted.length === 0 && (
                <tr><td className="text-neutral-600 italic py-1">nothing granted</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-2">
          <h3 className="text-red-400/80 text-xs uppercase tracking-wider mb-1">Not granted</h3>
          <table className="w-full border-collapse">
            <tbody>
              {notGranted.map((t) => (
                <tr key={t} data-testid={`notgranted-${t}`} className="align-top opacity-80">
                  <td className="relative pl-4 pr-1 py-0.5 text-neutral-500">
                    <span className="absolute left-0 top-0.5" aria-hidden>○</span>
                    {strike(t)}
                    {/*
                      This row used to carry a visible "NOT GRANTED" badge, which
                      said the same thing the column heading and the strikethrough
                      already said — and, being whitespace-nowrap inside an
                      overflow-hidden section, was clipped to a red "NO" on every
                      row of the project's signature image. The badge is gone; the
                      words stay for screen readers, where the strikethrough and
                      the ○ carry nothing.
                    */}
                    <span className="sr-only"> NOT GRANTED</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
