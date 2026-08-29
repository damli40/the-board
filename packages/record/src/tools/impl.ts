// Task 9: the bodies that connect the WebMCP registry to the stores. Every
// tool named in webmcp/tools.ts gets a real implementation here, keyed by
// name, in the exact `Record<string, ToolRun>` shape `ToolRegistry`'s
// constructor expects.
//
// RULING 1 (controller): the map is built through ONE factory —
// `withTruncation` below — so a tool cannot be added to this file without
// its output passing through Chrome's 1.5K budget. `createToolImpl` never
// spreads a raw body directly into the object it returns; every entry goes
// through `withTruncation`. impl.test.ts enumerates the real map's keys
// (not a hand-written list) and proves every one of them truncates.
//
// RULING 3 (controller): every body below may throw, and throwing is the
// design — the ledger records the refusal and the panel shows it. Nothing
// here catches an error to make a body "safe."
import type { Actor, ExhibitKind, Seat, Side } from '../model/types';
import { ORIGIN } from '../config/origins';
import type { ExhibitStore } from '../model/exhibits';
import type { FactStore } from '../model/facts';
import type { Receipts, AssessmentStore } from '../model/receipts';
import type { DisputeStore } from '../model/disputes';
import type { VerdictStore } from '../model/verdict';
import type { PhaseMachine } from '../webmcp/phases';
import type { ToolRun } from '../webmcp/ledger';
import { truncateForTool } from '../shared/truncate';
import { extractPages } from '../pdf/extract';
import { searchExhibits } from '../search/search';

// ---------------------------------------------------------------------------
// Actor identity: origin is the only forgery-proof signal (see ledger.ts's
// comment on ToolRun). This is the reverse of config/origins.ts's ORIGIN
// table — the same pattern Docket.tsx already builds ad hoc as ORIGIN_ACTOR.
// ---------------------------------------------------------------------------
const ACTOR_BY_ORIGIN: Record<string, Actor> = Object.fromEntries(
  (Object.entries(ORIGIN) as [Actor, string][]).map(([actor, origin]) => [origin, actor])
);

function actorFor(origin: string): Actor {
  const actor = ACTOR_BY_ORIGIN[origin];
  if (!actor) throw new Error(`unrecognised origin: ${origin}`);
  return actor;
}

function requireSide(actor: Actor): Side {
  if (actor !== 'A' && actor !== 'B') throw new Error(`${actor} is not a party and cannot do this`);
  return actor;
}

function requireSeat(actor: Actor): Seat {
  if (actor !== 'seat1' && actor !== 'seat2') throw new Error(`${actor} is not a seat and cannot do this`);
  return actor;
}

// content arrives as a data URL ("data:<mime>;base64,<b64>") or a bare
// base64 string for pdf/image kinds, and as plain text for everything else
// — asking a model to base64-encode ordinary prose would be exactly the
// kind of arithmetic-on-the-model CLAUDE.md's schema rules warn against.
function decodeExhibitBytes(content: string, kind: ExhibitKind): ArrayBuffer {
  if (kind === 'pdf' || kind === 'image') {
    const base64 = content.includes(',') ? content.slice(content.indexOf(',') + 1) : content;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  return new TextEncoder().encode(content).buffer;
}

/**
 * RULING 1's seam. Wraps every raw body so its stringified result passes
 * through `truncateForTool` before it reaches the registry. A silent
 * truncation would let a seat quote text it never actually received —
 * exactly the failure `checkQuote` exists to catch — so this is the one
 * place that guarantee is enforced, for every tool, unconditionally.
 */
export function withTruncation(bodies: Record<string, ToolRun>): Record<string, ToolRun> {
  const wrapped: Record<string, ToolRun> = {};
  for (const [name, body] of Object.entries(bodies)) {
    wrapped[name] = async (args: any, origin: string) => {
      const result = await body(args, origin);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      return truncateForTool(text);
    };
  }
  return wrapped;
}

export interface ToolImplDeps {
  exhibits: ExhibitStore;
  facts: FactStore;
  receipts: Receipts;
  assessments: AssessmentStore;
  disputes: DisputeStore;
  verdicts: VerdictStore;
  /**
   * A thunk, not a direct reference. `PhaseMachine` needs a fully
   * constructed `ToolRegistry` to build; `ToolRegistry` needs this whole
   * impl map at construction time to build. The two are circularly
   * ordered, and reading through a function breaks the cycle: App.tsx
   * supplies this once `PhaseMachine` exists, and only `spend_appeal`
   * below calls it — lazily, at execution time, long after wiring is done.
   */
  getPhaseMachine: () => PhaseMachine;
  /**
   * Fix round 1, MINOR 3 (adversarial review): `file_exhibit` used to call
   * `new Date().toISOString()` directly. That is correct for a LIVE filing
   * — a real filing genuinely happens at a real wall-clock instant — but it
   * meant the "byte-identical" claim scenario.ts makes only actually held
   * for the pre-seeded fixture, not for anything filed live through this
   * body, and nothing in the type signature said so. Injected the same way
   * `Ledger`'s own `clock` is (a constructor/factory parameter defaulting
   * to wall clock), so a caller CAN pin it — e.g. a future test of
   * `file_exhibit` itself that wants a fixed `filedAt` — without every
   * other caller needing to change. Defaults to wall clock, so this is a
   * no-op for App.tsx's real wiring.
   */
  now?: () => string;
}

export function createToolImpl(deps: ToolImplDeps): Record<string, ToolRun> {
  const { exhibits, facts, receipts, assessments, disputes, verdicts, getPhaseMachine } = deps;
  const now = deps.now ?? (() => new Date().toISOString());

  const bodies: Record<string, ToolRun> = {
    file_exhibit: async (args, origin) => {
      const side = requireSide(actorFor(origin));
      const kind = args?.kind as ExhibitKind;
      const bytes = decodeExhibitBytes(String(args?.content ?? ''), kind);
      const pages = kind === 'pdf' ? await extractPages(bytes) : undefined;
      const exhibit = await exhibits.add({
        side,
        kind,
        name: String(args?.name ?? ''),
        bytes,
        filedAt: now(),
        sourceUrl: args?.sourceUrl,
        captured: args?.sourceUrl ? 'party-supplied' : undefined,
        pages
      });
      return { id: exhibit.id, name: exhibit.name, kind: exhibit.kind, sha256: exhibit.sha256 };
    },

    file_fact: async (args, origin) => {
      const side = requireSide(actorFor(origin));
      return facts.file({
        side,
        text: String(args?.text ?? ''),
        points: { exhibitId: args?.exhibitId, locator: args?.locator ?? {} },
        counters: args?.counters
      });
    },

    concede: async (args, origin) => {
      const by = requireSide(actorFor(origin));
      return facts.concede(args?.factId, by);
    },

    // Layer-1 guard (spec v3, §7): disputing costs a read and a real quote.
    // Pre-checks the self-dealing rule before recording, rather than letting
    // `facts.attachDispute` catch it after `disputes.record` has already
    // written a Dispute row — an orphan record nothing else would ever
    // clean up.
    dispute: async (args, origin) => {
      const by = requireSide(actorFor(origin));
      const fact = facts.get(args?.factId);
      if (!fact) throw new Error(`no such fact: ${args?.factId}`);
      if (fact.side === by) throw new Error('cannot dispute your own fact');
      const d = disputes.record({
        factId: args?.factId,
        by,
        exhibitId: args?.exhibitId,
        locator: args?.locator ?? {},
        quote: args?.quote,
        because: args?.because
      });
      facts.attachDispute(args?.factId, d.id, by);
      return d;
    },

    // No ObjectionStore exists (spec v3 §5: "Recorded, not adjudicated") —
    // the ledger itself is the record of every `object` call. This body has
    // nothing to write to beyond that, so it only validates and echoes.
    object: async (args, _origin) => {
      const text = String(args?.text ?? '').trim();
      if (!text) throw new Error('an objection needs text');
      return { recorded: true, text };
    },

    // RULING 2 (controller): refuse a phantom exhibit id BEFORE writing a
    // read receipt. `Receipts.markOpened` performs no existence check of
    // its own — this is the validating caller (see its one-line comment).
    // Without this, a nonexistent id could ride into `Verdict.opened` and
    // then into `computeSplit`'s `differingInput`, printing a fabricated
    // "differing input" exhibit on the split table.
    open_exhibit: async (args, origin) => {
      const actor = actorFor(origin);
      const exhibitId = String(args?.exhibitId ?? '');
      const exhibit = exhibits.get(exhibitId);
      if (!exhibit) throw new Error(`no such exhibit: ${exhibitId}`);
      receipts.markOpened(actor, exhibitId);
      return exhibit;
    },

    // readOnly: true in the schema (writes nothing) — but per CLAUDE.md §2,
    // it MUST refuse on an exhibit this seat has not opened, mirroring the
    // read-receipt chain `record_assessment` already enforces. Text is
    // already extracted at filing time (file_exhibit calls extractPages
    // once) — the page lends the capability, the agent parses no bytes.
    extract_text: async (args, origin) => {
      const seat = requireSeat(actorFor(origin));
      const exhibitId = String(args?.exhibitId ?? '');
      if (!receipts.hasOpened(seat, exhibitId)) {
        throw new Error(`${seat} has not opened ${exhibitId}`);
      }
      const exhibit = exhibits.get(exhibitId);
      if (!exhibit) throw new Error(`no such exhibit: ${exhibitId}`);
      if (exhibit.kind !== 'pdf') throw new Error(`${exhibit.id} is not a pdf; extract_text only reads pdf exhibits`);
      const page = typeof args?.page === 'number' ? args.page : Number(args?.page);
      if (!Number.isInteger(page) || page < 1) throw new Error('extract_text requires a 1-based page number');
      const text = exhibit.pages?.[page - 1];
      if (text === undefined) throw new Error(`${exhibit.id} has no page ${page}`);
      return text;
    },

    // No receipt gate — search is the exploratory tool a seat reaches for
    // BEFORE deciding what to open, per spec v3 §8. Skips exhibits with no
    // extracted text (images) rather than pretending to have searched them.
    search_exhibits: async (args, _origin) => {
      return searchExhibits(exhibits.all(), String(args?.query ?? ''));
    },

    record_assessment: async (args, origin) => {
      const seat = requireSeat(actorFor(origin));
      return assessments.record({
        seat,
        factId: args?.factId,
        exhibitId: args?.exhibitId,
        locator: args?.locator ?? {},
        finding: args?.finding,
        quote: args?.quote,
        because: args?.because
      });
    },

    cite: async (args, origin) => {
      const seat = requireSeat(actorFor(origin));
      return verdicts.cite(seat, args?.factId);
    },

    draft_verdict: async (args, origin) => {
      const seat = requireSeat(actorFor(origin));
      const allExhibitIds = exhibits.all().map((e) => e.id);
      return verdicts.draft(seat, args?.outcome, args?.reasoning, allExhibitIds, args?.basisFactId);
    },

    // The registry only ever grants this to the side it belongs to
    // (appealA -> A, appealB -> B in phases.ts), so `side` here is always
    // that side's own — spending never needs to name whose appeal it is.
    //
    // Gap found wiring this for real: design spec v3 §9 says spending an
    // appeal "re-opens REVIEW; the board must re-open and re-cite" —
    // `PhaseMachine.spendAppeal` only aborts that side's own appeal
    // lifetime, it never calls `enter('REVIEW')`. phases.test.ts's own
    // comment ("the appeal re-opens review") is true only because the TEST
    // calls `phases.enter('REVIEW')` itself right after `spendAppeal` — no
    // production caller ever did. Nothing in App.tsx's `NEXT_PHASE` map
    // offers a VERDICT->REVIEW advance button either (VERDICT's only exit
    // in the UI is the confirm control), so without this line, spending an
    // appeal left the phase stuck at VERDICT with no way to re-open review
    // through the shipped UI at all. This is the one part of the design
    // this tool body is now responsible for completing.
    //
    // Fix round 1, MINOR 4 (adversarial review): `spendAppeal(side)` aborts
    // the exact AbortController THIS call is registered under — this body
    // is running as an execution of the `spend_appeal` tool whose signal
    // is `appealA`/`appealB`'s own. CLAUDE.md §1: Chrome 152 and earlier
    // cancel an execution already in flight when its registration signal
    // aborts; 153+ does not; we must not write logic that depends on
    // either. So the mutation is deferred past a MACROTASK boundary, not
    // just an `await` — the promise chain that delivers this call's own
    // result back to whatever invoked it (`Ledger.wrap`'s `await
    // run(...)`, then Chrome's own `executeTool` resolution) is itself a
    // run of microtasks, so only a `setTimeout` boundary guarantees all of
    // that has already completed before the abort (and the `enter`
    // re-registration it triggers) ever runs. The visible result is
    // unchanged: the card still leaves the hand and the phase still moves
    // to REVIEW — just after this call has already resolved as a success,
    // never while it is still the "in-flight execution" that could be cut
    // short depending on which Chrome version is filming.
    spend_appeal: async (args, origin) => {
      const side = requireSide(actorFor(origin));
      const phaseMachine = getPhaseMachine();
      const result = { spent: true, side, reason: args?.reason, contests: args?.contests };
      setTimeout(() => {
        try {
          phaseMachine.spendAppeal(side);
          phaseMachine.enter('REVIEW').catch((err) => {
            console.error('spend_appeal: phaseMachine.enter("REVIEW") failed after the appeal was already recorded as spent', err);
          });
        } catch (err) {
          console.error('spend_appeal: deferred phase transition failed', err);
        }
      }, 0);
      return result;
    }
  };

  return withTruncation(bodies);
}
