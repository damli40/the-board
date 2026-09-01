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
//
// Task 5, fix round 1 (C1/C2): every one of these throws IS one of the
// deliberate guards RULING 3 describes — a business rule this file chose to
// enforce, never an unanticipated crash — so every `throw` in this file now
// constructs `Refusal`, not a plain `Error`. `Ledger.wrap` (webmcp/ledger.ts)
// is the only code that reads the difference: it marks a `Refusal`'s message
// before it crosses the cross-origin boundary, so `loop.ts` on the panel
// side can tell "the record refused this on purpose" apart from "the
// machinery broke," and default anything unmarked — including any error
// this file's own dependencies (the model-layer stores under `../model/`)
// throw without going through `Refusal` — to the honest, conservative
// "broke." A model-layer throw staying unmarked is not a decision that it
// IS a crash; it is this file declining to guess at something it cannot see
// from here.
import type { Actor, ExhibitKind, Seat, Side } from '../model/types';
import { ORIGIN } from '../config/origins';
import type { ExhibitStore } from '../model/exhibits';
// `otherSide` (a value import, not `type`) is `facts.ts`'s own self-dealing
// recovery-clause helper, reused here so `dispute`'s pre-check below and
// `FactStore.dispute`'s guard stay byte-identical by construction rather
// than by two people remembering to match wording.
import { otherSide, type FactStore } from '../model/facts';
import type { Receipts, AssessmentStore } from '../model/receipts';
import type { DisputeStore } from '../model/disputes';
import type { VerdictStore } from '../model/verdict';
import type { PhaseMachine } from '../webmcp/phases';
import { Refusal, type ToolRun } from '../webmcp/ledger';
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
  // Recovery-clause round (scope extension): left state-only, on purpose.
  // This does not name a wrong ACTOR the way requireSide/requireSeat below
  // do — `origin` failed to resolve to any actor at all, so there is no
  // actor identity here to reason a next move for, and no legitimate caller
  // (a real registration always carries one of the four known origins) ever
  // reaches this in practice. Under-claiming a recovery clause is safe;
  // inventing one for an identity that does not exist is not.
  if (!actor) throw new Refusal(`unrecognised origin: ${origin}`);
  return actor;
}

function requireSide(actor: Actor): Side {
  // The wrong-actor shape: `actor` is a real, origin-derived identity (never
  // caller-supplied text — see ledger.ts's own comment on why origin is the
  // one forgery-proof signal), but the wrong KIND of actor for this tool. No
  // tool is named — a seat calling this holds none of the party-only tools
  // in any phase — so the next move names who CAN act instead: A or B, by
  // the same letters `webmcp/tools.ts`'s own `actors` arrays use.
  if (actor !== 'A' && actor !== 'B') throw new Refusal(`${actor} is not a party and cannot do this; only A or B can`);
  return actor;
}

function requireSeat(actor: Actor): Seat {
  if (actor !== 'seat1' && actor !== 'seat2') throw new Refusal(`${actor} is not a seat and cannot do this; only seat1 or seat2 can`);
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
  /**
   * Final review, Blocker 3: fires once the DEFERRED half of `spend_appeal`
   * has finished (see that body below). Everything else on this page
   * re-renders off `Ledger.subscribe`, which fires in a microtask when the
   * call's receipt lands, and React schedules its render ahead of a clamped
   * zero-delay timer. So the hand, the manifest and the phase ribbon all
   * render while the appeal is still held and the phase is still VERDICT,
   * and the abort then lands with nobody listening. Nothing re-renders
   * afterwards, because VERDICT has no next-phase button to press.
   *
   * The deferral itself cannot go: it is what stops `spend_appeal` aborting
   * the registration it is executing under, which on Chrome 152 and earlier
   * cancels an in-flight execution. So the deferred work is made OBSERVABLE
   * instead. `App.tsx` passes its `refresh` here.
   *
   * Optional, and a no-op by default, so a test or a caller that does not
   * care about re-rendering needs no change.
   */
  onStateChange?: () => void;
}

export function createToolImpl(deps: ToolImplDeps): Record<string, ToolRun> {
  const { exhibits, facts, receipts, assessments, disputes, verdicts, getPhaseMachine } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const onStateChange = deps.onStateChange ?? (() => {});

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
      // Byte-identical to FactStore's own "no such fact"/"cannot dispute
      // your own fact" (model/facts.ts) — same guard, same actor set (A/B),
      // reached one layer earlier here so `disputes.record` never writes an
      // orphan row (see this block's own comment above). `otherSide` is
      // imported from facts.ts, not re-derived, so the two cannot drift.
      if (!fact) throw new Refusal(`no such fact: ${args?.factId}; use a fact id that was actually filed`);
      if (fact.side === by) throw new Refusal(`cannot dispute your own fact; only ${otherSide(by)} can dispute it`);
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
      // Recovery-clause round (scope extension): judged already-compliant,
      // left unchanged. "Needs text" already states the fix, not just the
      // state — there is nothing a second clause would add beyond repeating
      // "provide some" — the same shape as `extract_text requires a
      // 1-based page number`, below, judged the same way.
      if (!text) throw new Refusal('an objection needs text');
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
      // Byte-identical to DisputeStore/AssessmentStore's own "no such
      // exhibit" (model/disputes.ts, model/receipts.ts) — one canonical
      // missing-exhibit message across every store AND this tool body, not
      // a fourth spelling of the same refusal. Reachable by all four
      // actors (open_exhibit is granted to A/B in filing and seat1/seat2
      // in boardRead), so the clause still names no tool.
      if (!exhibit) throw new Refusal(`no such exhibit: ${exhibitId}; use an exhibit id that was actually filed`);
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
      // Byte-identical to AssessmentStore's own "has not opened"
      // (model/receipts.ts) — same guard (seat, boardRead), and open_exhibit
      // is held by ['seat1','seat2'] in boardRead, so it is safe to name.
      if (!receipts.hasOpened(seat, exhibitId)) {
        throw new Refusal(`${seat} has not opened ${exhibitId}; call open_exhibit first`);
      }
      const exhibit = exhibits.get(exhibitId);
      // Same canonical "no such exhibit" string as open_exhibit's own guard,
      // above, and the model-layer stores — see that guard's comment.
      if (!exhibit) throw new Refusal(`no such exhibit: ${exhibitId}; use an exhibit id that was actually filed`);
      if (exhibit.kind !== 'pdf') throw new Refusal(`${exhibit.id} is not a pdf; extract_text only reads pdf exhibits`);
      const page = typeof args?.page === 'number' ? args.page : Number(args?.page);
      // Recovery-clause round (scope extension): judged already-compliant,
      // left unchanged — "requires a 1-based page number" already states
      // the fix (supply one), not just the state.
      if (!Number.isInteger(page) || page < 1) throw new Refusal('extract_text requires a 1-based page number');
      const text = exhibit.pages?.[page - 1];
      // Not the same call site as quote.ts's page-locator error (that one
      // guards a `{ page }` LOCATOR object on dispute/record_assessment;
      // this guards extract_text's own bare `page` argument) — worded to
      // match its own schema (`pageProp`, webmcp/tools.ts: "page number to
      // extract text from"), not forced to quote.ts's "locator" language for
      // an argument this tool does not have.
      if (text === undefined) throw new Refusal(`${exhibit.id} has no page ${page}; check the page number against the exhibit`);
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
      // Final review, Blocker 3: the deferral stays (see above), but it can
      // no longer be invisible. Nothing else on the page re-renders after
      // this timer fires. The ledger's own notify already ran, in a
      // microtask, back when the call's receipt landed and before any of
      // this happened, so the hand, the manifest and the phase ribbon all
      // painted while the appeal was still held and the phase was still
      // VERDICT. `onStateChange` is what tells the page to look again.
      //
      // It fires in `finally`, not only on success: `spendAppeal` has
      // already mutated the phase machine by the time `enter` can fail, so
      // a failed transition still leaves the screen showing something that
      // is no longer true. A render is the right answer either way.
      setTimeout(() => {
        void (async () => {
          try {
            phaseMachine.spendAppeal(side);
            await phaseMachine.enter('REVIEW');
          } catch (err) {
            console.error('spend_appeal: deferred phase transition failed after the appeal was already recorded as spent', err);
          } finally {
            // Guarded separately: a throw from `finally` escapes the `catch`
            // above and, inside this detached async call, becomes an
            // unhandled rejection with no stack pointing back here. A render
            // callback that blows up is a UI bug, not evidence about the
            // case, so it is logged and contained.
            try {
              onStateChange();
            } catch (err) {
              console.error('spend_appeal: onStateChange threw; the phase transition itself already completed', err);
            }
          }
        })();
      }, 0);
      return result;
    }
  };

  return withTruncation(bodies);
}
