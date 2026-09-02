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
import type { Actor, ExhibitKind, Finding, Locator, Outcome, Phase, Seat, Side } from '../model/types';
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
import type { ObjectionStore } from '../model/objections';
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

/**
 * The part of the page that is NOT in the stores: which phase we are in, who
 * was handed what, and the ledger. `App.tsx` is the only scope that can see
 * all three, so it supplies them; this file only reads them.
 */
export interface BoardSnapshot {
  phase: Phase;
  agents: { actor: Actor; granted: { tool: string }[] }[];
  ledger: { origin: string; tool: string; at: string; ok: boolean }[];
}

export interface ToolImplDeps {
  exhibits: ExhibitStore;
  facts: FactStore;
  receipts: Receipts;
  assessments: AssessmentStore;
  disputes: DisputeStore;
  verdicts: VerdictStore;
  /**
   * Fable F5: `object` used to validate its text and then drop it, on the
   * reasoning that the ledger already counted the call. A count is not a
   * record — the page could say an objection HAPPENED and never what it
   * said, which is the same silence this project exists to answer. The
   * words are kept here instead.
   */
  objections: ObjectionStore;
  /** Read at CALL time, never captured: the page as it is now. */
  readBoard: () => BoardSnapshot;
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

  // -------------------------------------------------------------------
  // Task 5 (F6, F7, F8): `inputSchema` is a hint the model reads, not a gate
  // the browser enforces — Chrome hands arguments through exactly as the
  // model wrote them, `required` included. Every argument these bodies read
  // is therefore checked HERE or nowhere. The failures this closes were not
  // crashes: a missing `text` filed an empty fact, an unfiled `exhibitId`
  // attached a claim to nothing, and both landed on the record looking like
  // ordinary filings.
  //
  // `model/types.ts` exports ExhibitKind as a union type only, with no
  // runtime array to import, so the members are listed once here.
  // -------------------------------------------------------------------
  const EXHIBIT_KINDS: ExhibitKind[] = ['text', 'pdf', 'image', 'capture', 'rule'];
  const FINDINGS = ['supported', 'contradicted', 'not-addressed', 'cannot-tell'];
  const nonEmpty = (value: unknown) => String(value ?? '').trim();
  // Fix round 1: hoisted out of `read_board`, where it used to live, so
  // `open_exhibit` bounds its own `name` with the SAME rule rather than a
  // second one that could drift. Cuts at `max`, ellipsis included, so the
  // clipped string is never longer than the number it was given.
  const clip = (value: unknown, max: number) => {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  };
  // A locator is the one argument whose SHAPE matters: `quote.ts` reads
  // `.page` and `.lines` off it. A model that sends the string "page 4"
  // would otherwise reach the quote checker with a value that has neither,
  // and be told its quote was not found — a true statement about the wrong
  // thing. Omitted still means the whole document.
  const requireLocator = (value: unknown): Locator => {
    if (value === undefined) return {};
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Refusal('locator must be an object like {"page":4} or {"lines":[10,12]}; omit it to mean the whole document');
    }
    return value as Locator;
  };

  const bodies: Record<string, ToolRun> = {
    file_exhibit: async (args, origin) => {
      const side = requireSide(actorFor(origin));
      // F7: lower-cased BEFORE the membership check, not after. A model that
      // writes "Text" or "PDF" used to sail past the check with its own
      // spelling intact, and `decodeExhibitBytes`/`ExhibitStore` both switch
      // on the exact lowercase string — so a "PDF" was stored as a document
      // with no extracted text at all, and every quote against it silently
      // downgraded to 'human-check'.
      const kind = nonEmpty(args?.kind).toLowerCase() as ExhibitKind;
      if (!EXHIBIT_KINDS.includes(kind)) throw new Refusal(`unknown exhibit kind: ${kind || '(none)'}; use text, pdf, image, capture or rule`);
      const name = nonEmpty(args?.name);
      if (!name) throw new Refusal('an exhibit needs a name; give it a short label');
      const content = String(args?.content ?? '');
      if (!content.trim()) throw new Refusal('an exhibit needs content; pass the text, or a data URL for pdf, image and capture kinds');
      // Fix round 1: `atob` throws a raw DOMException on malformed base64,
      // and a raw throw is not a `Refusal` — so `Ledger.wrap` leaves it
      // unmarked and the panel renders "the machinery broke" for what is
      // really a party sending a bad data URL. The party's own input is a
      // business rule, so it refuses like every other one.
      let bytes: ArrayBuffer;
      try {
        bytes = decodeExhibitBytes(content, kind);
      } catch {
        throw new Refusal(`the content is not valid base64 for a ${kind} exhibit; pass a data URL, or plain text for a text exhibit`);
      }
      const pages = kind === 'pdf' ? await extractPages(bytes) : undefined;
      const exhibit = await exhibits.add({
        side,
        kind,
        name,
        bytes,
        filedAt: now(),
        sourceUrl: args?.sourceUrl,
        captured: args?.sourceUrl ? 'party-supplied' : undefined,
        pages
      });
      return { id: exhibit.id, name: exhibit.name, kind: exhibit.kind, sha256: exhibit.sha256 };
    },

    // F8: a fact is a claim that POINTS at something. An empty claim, or one
    // pointing at an exhibit nobody filed, is not a weak filing — it is a row
    // on the shared record that looks like every other row and refers to
    // nothing. Both are refused before anything is written.
    file_fact: async (args, origin) => {
      const side = requireSide(actorFor(origin));
      const text = nonEmpty(args?.text);
      if (!text) throw new Refusal('a fact needs text; state the claim in one sentence');
      const exhibitId = nonEmpty(args?.exhibitId);
      // Same canonical missing-exhibit string as open_exhibit and the stores.
      if (!exhibits.get(exhibitId)) throw new Refusal(`no such exhibit: ${exhibitId || '(none)'}; use an exhibit id that was actually filed`);
      const locator = requireLocator(args?.locator);
      // A rebuttal that answers a fact nobody filed is the same phantom, one
      // field over: `counters` is rendered as a link between two rows. The
      // CHECKED id is what gets stored, never the raw argument — validating
      // `" F1 "` and then filing `" F1 "` would leave a link that passed
      // every guard here and still resolves to nothing downstream.
      let counters: string | undefined;
      if (args?.counters !== undefined) {
        counters = nonEmpty(args.counters);
        if (!facts.get(counters)) throw new Refusal(`no such fact: ${counters || '(none)'}; use a fact id that was actually filed`);
      }
      return facts.file({ side, text, points: { exhibitId, locator }, counters });
    },

    concede: async (args, origin) => {
      const by = requireSide(actorFor(origin));
      const factId = nonEmpty(args?.factId);
      if (!factId) throw new Refusal('concede needs a factId; use a fact id that was actually filed');
      return facts.concede(factId, by);
    },

    // Layer-1 guard (spec v3, §7): disputing costs a read and a real quote.
    // Pre-checks the self-dealing rule before recording, rather than letting
    // `facts.attachDispute` catch it after `disputes.record` has already
    // written a Dispute row — an orphan record nothing else would ever
    // clean up.
    dispute: async (args, origin) => {
      const by = requireSide(actorFor(origin));
      const factId = nonEmpty(args?.factId);
      if (!factId) throw new Refusal('dispute needs a factId; use a fact id that was actually filed');
      // Checked here rather than left to the store, which never reads it: a
      // dispute with no reasoning is a row saying "this is wrong" and nothing
      // else, which is the shape of exactly the thing this page refuses.
      if (!nonEmpty(args?.because)) throw new Refusal('a dispute needs a because; say in one sentence why the quote contradicts the fact');
      const exhibitId = nonEmpty(args?.exhibitId);
      const fact = facts.get(factId);
      // Byte-identical to FactStore's own "no such fact"/"cannot dispute
      // your own fact" (model/facts.ts) — same guard, same actor set (A/B),
      // reached one layer earlier here so `disputes.record` never writes an
      // orphan row (see this block's own comment above). `otherSide` is
      // imported from facts.ts, not re-derived, so the two cannot drift.
      if (!fact) throw new Refusal(`no such fact: ${factId}; use a fact id that was actually filed`);
      if (fact.side === by) throw new Refusal(`cannot dispute your own fact; only ${otherSide(by)} can dispute it`);
      // Fix round 1: checked HERE, not left to `DisputeStore`. Without an
      // exhibitId the store's first guard is the read-receipt one, which
      // reported `A has not opened ; call open_exhibit first` — a confident
      // sentence about the wrong problem, aimed at a party who had opened
      // everything. Same template `file_fact` uses, so there is still one
      // spelling of the missing-exhibit refusal.
      if (!exhibitId) throw new Refusal(`no such exhibit: ${exhibitId || '(none)'}; use an exhibit id that was actually filed`);
      const d = disputes.record({
        factId,
        by,
        exhibitId,
        locator: requireLocator(args?.locator),
        // F6: `checkQuote` already refuses an empty quote with its own
        // wording; `undefined` crashed it on `.length` instead, and a crash
        // reads on the panel as "the machinery broke", not "the record
        // refused this". Coerced so the real guard is the one that fires.
        quote: String(args?.quote ?? ''),
        because: String(args?.because ?? '')
      });
      facts.attachDispute(factId, d.id, by);
      return d;
    },

    // Task 4: the scoped read of the public record — the parties' at first,
    // and the seats' as well since the rehearsal. Same name as the
    // observer's `read_board`, and deliberately NOT the same payload — this
    // one is scoped to the calling origin (`youHold` is the caller's hand,
    // never anyone else's) and sectioned, because every tool result is
    // capped at 1,500 characters and one undivided board comes back cut in
    // half.
    //
    // Fix round 1 — TWO bounds, not one. Clipping each FIELD was not enough:
    // the payload was still proportional to how much had been filed, so ten
    // full-length facts ran past the budget and `withTruncation` cut the JSON
    // mid-string. A party asking to read the record got back something that
    // would not parse at all, and the demo seeds seven facts — the tenth
    // would have broken it on camera. Every list section is now bounded by
    // ROW COUNT as well, by construction, so no amount of filing can make
    // this tool return a fragment.
    //
    // F4, decided: this never returns exhibit TEXT or pages. Reading a
    // document costs an `open_exhibit` receipt, and a read that bypassed the
    // receipt would quietly delete the one guarantee the whole record rests
    // on. That is why `disputes` returns no `quote`: a dispute's quote is
    // verbatim exhibit text, machine-checked against the document, so
    // handing it back here would have been the receipt-free read this
    // section exists to refuse — for the exact passage somebody thought was
    // worth fighting over. It DOES return assessment findings and draft
    // outcomes — the page already shows those to anyone looking at it, and a
    // party deciding whether to spend its appeal has to be able to read them.
    read_board: async (args, origin) => {
      // `actorFor` is the whole gate: one of the four panel origins, or a
      // refusal. Deliberately NOT `requireSide` any more — the seats hold
      // this now, under their own `boardRead` lifetime. A seat's other four
      // tools return no fact id and no fact list, while `record_assessment`
      // requires a `factId`, so a seat had to infer the ids from the exhibits
      // and hope. Everything below is already per-actor: `youHold` reads the
      // CALLING actor's own grants out of the snapshot, so a seat sees a
      // seat's hand and never a party's.
      const actor = actorFor(origin);
      // Lower-cased for the same reason `file_exhibit` lower-cases `kind`
      // (F7): a model that writes "Facts" means the facts section, and
      // refusing it would be this tool being pedantic about spelling rather
      // than about what it is allowed to hand over.
      const section = String(args?.section ?? 'summary').toLowerCase();
      // The LAST n rows, never the first: the newest state is the state a
      // party is asking about. `more` says how many were left out, so a
      // partial view can never pass for a complete one — the same reason
      // `truncateForTool` refuses to cut silently.
      const page = <T>(rows: T[], n: number) => ({ rows: rows.slice(-n), more: Math.max(0, rows.length - n) });
      const board = deps.readBoard();
      // A ledger line can carry an origin this file cannot name — the
      // observer's, which is not an origin at all. Say so rather than
      // throwing: this is a read, and a read must not fail because somebody
      // else's call is in the log.
      const who = (o: string) => { try { return actorFor(o); } catch { return 'visiting agent'; } };
      const line = (e: BoardSnapshot['ledger'][number]) => `${e.at} ${who(e.origin)} ${e.tool} ${e.ok ? 'ok' : 'refused'}`;
      switch (section) {
        case 'summary':
          return {
            phase: board.phase,
            youHold: (board.agents.find((a) => a.actor === actor)?.granted ?? []).map((g) => g.tool),
            counts: { exhibits: exhibits.all().length, facts: facts.all().length, assessments: assessments.all().length, verdicts: verdicts.all().length },
            latest: board.ledger.slice(-5).map(line)
          };
        // Each row count is the worst case that fits 1,500 characters with
        // margin, measured against a row of maximum-length clipped fields:
        // facts 161 chars a row, assessments 167, objections 155, disputes
        // 113, exhibits 97.
        case 'facts':
          return page(facts.all().map((f) => ({ id: f.id, side: f.side, status: f.status, text: clip(f.text, 100) })), 7);
        case 'exhibits':
          return page(exhibits.all().map((e) => ({ id: e.id, side: e.side, kind: e.kind, name: clip(e.name, 40) })), 12);
        // No `quote`. It is verbatim exhibit text — see this body's own
        // header on why that cannot come back through a read with no receipt.
        // `exhibitId` says WHERE to look instead, which is what a party needs
        // in order to go and open it and pay for the read.
        case 'disputes':
          return page(disputes.all().map((d) => ({ id: d.id, factId: d.factId, by: d.by, exhibitId: d.points.exhibitId })), 10);
        case 'objections':
          return page(deps.objections.all().map((o) => ({ id: o.id, by: o.by, text: clip(o.text, 120) })), 8);
        // A SEAT SEES ONLY ITS OWN ASSESSMENTS, for the same reason the
        // `verdicts` case below filters: two INDEPENDENT readers is the whole
        // claim of a two-seat panel, and handing seat 2 the findings seat 1
        // already recorded is the influence the second seat exists to rule
        // out. An assessment is the working step a draft verdict is built
        // from, so leaving it open was the same leak one phase earlier. The
        // parties are being judged rather than judging, so they still read
        // all of them. `counts.assessments` in the summary stays whole for
        // both: knowing that assessments exist is the phase working; knowing
        // what the other seat FOUND is not.
        case 'assessments': {
          const all = assessments.all();
          const rows = actor === 'seat1' || actor === 'seat2' ? all.filter((a) => a.seat === actor) : all;
          return page(rows.map((a) => ({ seat: a.seat, factId: a.factId, finding: a.finding, because: clip(a.because, 90) })), 7);
        }
        // Two seats, so at most two rows — but `reasoning` is a seat's own
        // free text, and two long ones together would not fit. Paged like
        // every other list rather than trusted to stay small.
        //
        // A SEAT SEES ONLY ITS OWN DRAFT. The seats hold this read through
        // DRAFT VERDICT, and the whole claim of a two-seat panel is two
        // INDEPENDENT readers: handing seat 2 the outcome and grounds seat 1
        // already drafted is precisely the influence the second seat exists
        // to rule out. The parties are being judged rather than judging, so
        // they still read both — a party deciding whether to spend its
        // appeal has to be able to see what was drafted. The summary's
        // `counts.verdicts` stays whole for both: knowing that two drafts
        // exist is the phase working; knowing what the other one SAYS is not.
        case 'verdicts': {
          const all = verdicts.all();
          const rows = actor === 'seat1' || actor === 'seat2' ? all.filter((v) => v.seat === actor) : all;
          return page(rows.map((v) => ({ seat: v.seat, outcome: v.outcome, reasoning: clip(v.reasoning, 220) })), 2);
        }
        case 'ledger':
          return page(board.ledger.map(line), 15);
        default:
          throw new Refusal(`no such section: ${section}; use summary, facts, exhibits, disputes, objections, assessments, verdicts or ledger`);
      }
    },

    // Spec v3 §5: "Recorded, not adjudicated". Fable F5 — this used to read
    // "no ObjectionStore exists, the ledger itself is the record", and the
    // ledger only ever held the fact that a call happened. So the page could
    // say Advocate A objected and never say what A objected TO, which is the
    // silence this whole project is an answer to. Recorded now means kept,
    // in full, under an id the record can show and `read_board` can hand
    // back — still not adjudicated, because nothing acts on it.
    object: async (args, origin) => {
      const by = requireSide(actorFor(origin));
      const text = String(args?.text ?? '').trim();
      // Recovery-clause round (scope extension): judged already-compliant,
      // left unchanged. "Needs text" already states the fix, not just the
      // state — there is nothing a second clause would add beyond repeating
      // "provide some" — the same shape as `extract_text requires a
      // 1-based page number`, below, judged the same way.
      if (!text) throw new Refusal('an objection needs text');
      const objection = deps.objections.record({ by, text, at: now() });
      return { recorded: true, id: objection.id, text };
    },

    // RULING 2 (controller): refuse a phantom exhibit id BEFORE writing a
    // read receipt. `Receipts.markOpened` performs no existence check of
    // its own — this is the validating caller (see its one-line comment).
    // Without this, a nonexistent id could ride into `Verdict.opened` and
    // then into `computeSplit`'s `differingInput`, printing a fabricated
    // "differing input" exhibit on the split table.
    open_exhibit: async (args, origin) => {
      const actor = actorFor(origin);
      // Trimmed like every sibling body in this file: an id that arrives as
      // " E1 " is the same exhibit, and refusing it would be this tool being
      // pedantic about whitespace rather than about what was filed.
      const exhibitId = nonEmpty(args?.exhibitId);
      const exhibit = exhibits.get(exhibitId);
      // Byte-identical to DisputeStore/AssessmentStore's own "no such
      // exhibit" (model/disputes.ts, model/receipts.ts) — one canonical
      // missing-exhibit message across every store AND this tool body, not
      // a fourth spelling of the same refusal. Reachable by all four
      // actors (open_exhibit is granted to A/B in filing and seat1/seat2
      // in boardRead), so the clause still names no tool.
      if (!exhibit) throw new Refusal(`no such exhibit: ${exhibitId}; use an exhibit id that was actually filed`);
      receipts.markOpened(actor, exhibitId);
      // F14: this used to return the whole Exhibit, text and all. Anything
      // past 1,500 characters — a routine document — came back cut mid-string
      // by `withTruncation`, so the caller got a JSON fragment that would not
      // parse at all. A bounded shape parses every time, and says in the
      // payload itself that the text is a preview.
      //
      // Fix round 1: `name` is clipped too. It is free text nobody caps —
      // this comment used to claim the shape "parses every time" while a
      // 2,000-character exhibit name could still push the JSON past the
      // budget and get it cut mid-string. Every field in this object is now
      // bounded, so the claim is true rather than nearly true.
      const preview = exhibit.text ?? exhibit.pages?.join('\n') ?? '';
      return {
        id: exhibit.id, name: clip(exhibit.name, 40), kind: exhibit.kind, side: exhibit.side, sha256: exhibit.sha256,
        pageCount: exhibit.pages?.length,
        textPreview: preview.length > 600 ? `${preview.slice(0, 599)}…` : preview,
        // Only a seat is told about `extract_text` — it is granted to
        // seat1/seat2 in boardRead and to nobody else, and this tool is
        // reachable by all four actors. Pointing a party at a tool it cannot
        // hold would be the success-payload version of the mistake the
        // refusal clauses in this file exist to avoid.
        note: exhibit.kind === 'pdf' && (actor === 'seat1' || actor === 'seat2')
          ? 'use extract_text with a page number for the full text of a page'
          : undefined
      };
    },

    // readOnly: true in the schema (writes nothing) — but per docs/WEBMCP-NOTES.md §2,
    // it MUST refuse on an exhibit this seat has not opened, mirroring the
    // read-receipt chain `record_assessment` already enforces. Text is
    // already extracted at filing time (file_exhibit calls extractPages
    // once) — the page lends the capability, the agent parses no bytes.
    extract_text: async (args, origin) => {
      const seat = requireSeat(actorFor(origin));
      const exhibitId = nonEmpty(args?.exhibitId);
      // EXISTENCE FIRST, RECEIPT SECOND. The two guards used to sit the other
      // way round, so `extract_text({ page: 1 })` with no exhibit id at all
      // came back `seat1 has not opened ; call open_exhibit first` — a
      // confident sentence naming the wrong problem, and one that sends the
      // seat off to call open_exhibit with the same missing id. Same
      // inversion `dispute` already fixed. Same canonical "no such exhibit"
      // string as open_exhibit's own guard and the model-layer stores.
      const exhibit = exhibits.get(exhibitId);
      if (!exhibit) throw new Refusal(`no such exhibit: ${exhibitId || '(none)'}; use an exhibit id that was actually filed`);
      // Byte-identical to AssessmentStore's own "has not opened"
      // (model/receipts.ts) — same guard (seat, boardRead), and open_exhibit
      // is held by ['seat1','seat2'] in boardRead, so it is safe to name.
      if (!receipts.hasOpened(seat, exhibitId)) {
        throw new Refusal(`${seat} has not opened ${exhibitId}; call open_exhibit first`);
      }
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
      // Fix round 1: `query` is `required` in the schema, and the schema is a
      // hint the browser does not enforce. An empty one used to return `[]`,
      // which reads as "searched everything, found nothing" — the most
      // misleading answer this tool can give, because it is indistinguishable
      // from a real miss and would let a seat conclude a document says
      // nothing about a subject it was never asked about.
      const query = nonEmpty(args?.query);
      if (!query) throw new Refusal('search_exhibits needs a query; say what text to look for');
      return searchExhibits(exhibits.all(), query);
    },

    // F8: an assessment is what a citation rests on, and `AssessmentStore`
    // never checks that the fact it names exists — a finding against "F99"
    // used to record cleanly and then show on the verdict panel as a real
    // finding about a fact nobody can read. Refused where the id enters.
    record_assessment: async (args, origin) => {
      const seat = requireSeat(actorFor(origin));
      const factId = nonEmpty(args?.factId);
      if (!facts.get(factId)) throw new Refusal(`no such fact: ${factId || '(none)'}; use a fact id that was actually filed`);
      const finding = nonEmpty(args?.finding);
      if (!FINDINGS.includes(finding)) throw new Refusal(`unknown finding: ${finding || '(none)'}; use supported, contradicted, not-addressed or cannot-tell`);
      // Fix round 1, same defect as `dispute`'s: with no exhibitId the
      // store's read-receipt guard fires first and reports `seat1 has not
      // opened ; call open_exhibit first`, which is a true sentence about a
      // problem the seat does not have. Same template `file_fact` uses.
      const exhibitId = nonEmpty(args?.exhibitId);
      if (!exhibitId) throw new Refusal(`no such exhibit: ${exhibitId || '(none)'}; use an exhibit id that was actually filed`);
      return assessments.record({
        seat,
        factId,
        exhibitId,
        locator: requireLocator(args?.locator),
        finding: finding as Finding,
        // F6, as in `dispute` above: `checkQuote` refuses an empty quote in
        // its own words; `undefined` crashed it before it could.
        quote: String(args?.quote ?? ''),
        because: String(args?.because ?? '')
      });
    },

    cite: async (args, origin) => {
      const seat = requireSeat(actorFor(origin));
      const factId = nonEmpty(args?.factId);
      if (!facts.get(factId)) throw new Refusal(`no such fact: ${factId || '(none)'}; use a fact id that was actually filed`);
      return verdicts.cite(seat, factId);
    },

    draft_verdict: async (args, origin) => {
      const seat = requireSeat(actorFor(origin));
      // Presence, not membership. `VerdictStore.draft` deliberately does not
      // validate WHICH outcome a seat proposes (see its own comment on the
      // asymmetry) — an unrecognised one is recorded and drawn. What it
      // cannot do is record an outcome that is not there at all, or a draft
      // with no reasoning behind it, which is the silence this page answers.
      const outcome = nonEmpty(args?.outcome);
      if (!outcome) throw new Refusal('a verdict needs an outcome; use UPHELD or OVERTURNED');
      const reasoning = nonEmpty(args?.reasoning);
      if (!reasoning) throw new Refusal('a verdict needs reasoning; say in a few sentences why');
      const allExhibitIds = exhibits.all().map((e) => e.id);
      return verdicts.draft(seat, outcome as Outcome, reasoning, allExhibitIds, args?.basisFactId);
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
    // is `appealA`/`appealB`'s own. docs/WEBMCP-NOTES.md §1: Chrome 152 and earlier
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
      // A party holds exactly one appeal and spending it is irreversible, so
      // it may not be spent on nothing: the reason is the only thing the
      // record keeps about why the review was re-opened.
      const reason = nonEmpty(args?.reason);
      if (!reason) throw new Refusal('spending an appeal needs a reason; say in one or two sentences why');
      const phaseMachine = getPhaseMachine();
      const result = { spent: true, side, reason, contests: args?.contests };
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
