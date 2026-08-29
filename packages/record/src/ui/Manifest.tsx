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

/** Strikes through a withheld tool's name, literally, per the storyboard mockup. */
function strike(name: string) {
  return [...name].map((ch, i) => (
    <span key={i} className="relative">
      {ch}
      <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-red-400/70" />
    </span>
  ));
}

export function Manifest({ manifest }: { manifest: ManifestData }) {
  const granted = byName(manifest.granted, (g) => g.tool);
  const notGranted = byName(manifest.notGranted, (t) => t);
  const accent = ACTOR_ACCENT[manifest.actor];

  return (
    <section
      data-testid={`manifest-${manifest.actor}`}
      className={`font-mono text-sm bg-neutral-950 border ${accent.border} rounded-md overflow-hidden`}
    >
      <header className={`flex items-baseline justify-between px-3 py-2 border-b ${accent.border} ${accent.bg}`}>
        <span className={`uppercase tracking-widest font-semibold ${accent.text}`}>{ACTOR_LABEL[manifest.actor]}</span>
        <span className="text-neutral-500 text-xs">⌁ frame: {manifest.origin}</span>
      </header>

      <div className="grid grid-cols-2 divide-x divide-neutral-800">
        <div className="p-2">
          <h3 className="text-neutral-400 text-xs uppercase tracking-wider mb-1">Granted</h3>
          <table className="w-full border-collapse">
            <tbody>
              {granted.map((g) => (
                <tr key={g.tool} data-testid={`row-${g.tool}`} className="align-top">
                  <td className="pr-2 py-0.5 text-neutral-200">
                    <span className={`inline-block mr-1 ${accent.text}`} aria-hidden>●</span>
                    {g.tool}
                    {g.lends && <span className="text-neutral-500"> (page lends)</span>}
                  </td>
                  <td data-testid={`used-${g.tool}`} className="text-right tabular-nums text-neutral-500 py-0.5">
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
                  <td className="pr-2 py-0.5 text-neutral-500">
                    <span className="inline-block mr-1" aria-hidden>○</span>
                    {strike(t)}
                  </td>
                  <td className="text-right text-red-400/70 text-xs py-0.5 whitespace-nowrap">NOT GRANTED</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
