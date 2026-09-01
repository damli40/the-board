export interface LedgerEntry {
  origin: string;
  tool: string;
  at: number;
  ok: boolean;
  detail?: string;
  /**
   * Present only when `ok` is false. The discriminator this file's own
   * `wrap` derives from `err instanceof Refusal` at the moment it catches —
   * never by sniffing `detail` for `Refusal.MARKER`, because `detail` is
   * deliberately the UNMARKED message (see this file's own comment on
   * `wrap`, below) and the marker is never meant to reach a reader of the
   * ledger at all, only the cross-origin re-throw.
   *
   * Added so a reader (`ui/AgentCard.tsx`'s `deriveAgentState`, first) can
   * tell a deliberate refusal apart from an ordinary bug without collapsing
   * both into the same word — the exact "a bug during a filmed run puts the
   * word refused on an agent's card" defect this field exists to close.
   * `ok` itself is left exactly as it was (true/false) for every existing
   * reader that only ever needed the two-way split.
   */
  failure?: 'refusal' | 'crash';
}

/**
 * Task 5, fix round 1, C1/C2: a plain `throw new Error(...)` cannot tell a
 * deliberate business-rule refusal (dispute's self-dealing check,
 * extract_text's read-receipt gate, ...) apart from a genuine crash (a bug,
 * a malformed input nothing anticipated, the cross-origin bridge itself
 * failing). Both used to arrive at the panel identically, and the panel
 * rendered every one of them as "Refused at the boundary" — a crash got the
 * amber rules and the reassurance line, and the one state with a retry
 * (broke) became the one failure that could never reach it.
 *
 * A tool body throws `Refusal` instead of `Error` for exactly the guards it
 * means as guards. `Ledger.wrap`'s catch below is the only place that reads
 * this class, and it is the one place that CAN: everything a tool body
 * throws passes through here on its way to the browser's real WebMCP
 * machinery.
 *
 * FINISH TASK, verified live tonight against the deployed site in real
 * Chrome (WebMCP flag on): a tool body that throws reaches the caller as a
 * generic `DOMException: "Tool was executed but the invocation failed..."`
 * — Chrome replaces the real message ENTIRELY, so `MARKER` prepended to a
 * re-thrown message (the original design here) never survives the crossing
 * at all. `.message` does not merely lose extra detail beyond the string;
 * for a thrown value specifically, Chrome discards the string itself. The
 * only channel that reliably crosses is the RESOLVED VALUE, so `wrap`
 * (below) no longer re-throws a marked `Refusal` — it RETURNS a JSON
 * envelope instead: `{refused:true,reason}`. `MARKER` and the
 * `startsWith(Refusal.MARKER)` check on the panel side (`loop.ts`'s
 * `classifyCallFailure`) are kept anyway, deliberately never deleted or
 * loosened — a harmless fallback for a non-Chrome or test double that still
 * rejects with a marked message, which is the one shape this file's own
 * `wrap` no longer produces but cannot rule out every caller ever
 * producing.
 *
 * A genuine crash is unaffected by any of this: it still throws, unmarked,
 * and still crosses as Chrome's own generic DOMException — the honest wire
 * shape for machinery failure, which Chrome gives us nothing better to say
 * about either way.
 */
export class Refusal extends Error {
  static readonly MARKER = '[board:refusal] ';

  constructor(message: string) {
    super(message);
    this.name = 'Refusal';
  }
}

/**
 * Task 9: a raw tool body receives the calling ORIGIN as its second
 * parameter, not just `args`. This is deliberate, and it is the only place
 * in the whole pipeline where actor identity can be attached safely.
 *
 * `registry.ts`'s `open()` registers the exact same shared function
 * (`this.impl[spec.name]`) once per actor in a spec — it never wraps a
 * fresh closure per actor — so a body cannot otherwise learn who is
 * calling. It must not learn it from `args` either: nothing stops an
 * adversarial model from putting `{ seat: 'seat2' }` in its own call
 * arguments, and trusting that would let any actor impersonate any other
 * one, which is exactly the boundary this whole project exists to make the
 * browser (not the app) enforce. Origin is the one thing that cannot be
 * forged this way: `exposedTo` scopes a registration to one origin, so
 * whichever code path actually invokes `execute` is running as that
 * origin, structurally.
 *
 * Chrome's own `execute(args, { signal })` callback carries no such field,
 * so this can't be threaded through Chrome's call — it has to be threaded
 * through OUR wrapping instead. `Ledger.wrap` is that wrapping: it already
 * receives `origin` as a constructor-time argument (for logging), and the
 * function it RETURNS still matches Chrome's exact one-argument contract
 * (`(args) => Promise<unknown>`) — only the inner `run` this class calls on
 * the way there gets the extra parameter. `packages/record/src/tools/impl.ts`
 * is the one place that reads it, mapping origin back to actor via
 * `config/origins.ts`'s ORIGIN table.
 */
export type ToolRun = (args: any, origin: string) => Promise<unknown>;

/**
 * One recorder wrapped around execute. Nobody has to remember to log,
 * because there is no path to executing a tool that does not go through here.
 */
export class Ledger {
  private entries: LedgerEntry[] = [];
  private listeners = new Set<() => void>();

  constructor(private clock: () => number = () => Date.now()) {}

  /**
   * Final review, Blocker 3 (second half): the success branch used to sit
   * INSIDE the `try`: push the entry, notify, return. A subscriber that
   * threw would therefore be caught by this function's own `catch`, which
   * would then write a SECOND row for the same call marked as a refusal, and
   * rethrow. A call that genuinely succeeded would render as REFUSED, with
   * the tool's call count at two. Nothing would look broken; the record would
   * just be wrong about what happened, which is the only kind of wrong this
   * project cannot tolerate.
   *
   * It could not fire while React's state setter was the only subscriber.
   * The appeal-refresh fix in `App.tsx` adds a second one, so it could.
   *
   * Two changes close it: the success path's `notify()` now runs after the
   * `try` has already completed, and `notify()` itself isolates each
   * subscriber (below) so one throwing listener can neither corrupt this
   * record nor stop the other listeners from running.
   *
   * FINISH TASK: every RESOLVED outcome — success or a deliberate refusal —
   * now returns a one-layer JSON envelope, `{ok:true,result}` or
   * `{refused:true,reason}`, instead of the bare result or a re-thrown
   * marked message (see `Refusal`'s own comment, above, for why: verified
   * live, Chrome erases a thrown message entirely, so the RETURN VALUE is
   * the only channel that reliably crosses). The envelope wraps SUCCESSES
   * too, not just refusals — if it only wrapped refusals, a successful call
   * whose own result happened to BE the text
   * `{"refused":true,"reason":"..."}` (an exhibit's counterparty-authored
   * content, surfaced verbatim by `extract_text` or `search_exhibits`) would
   * parse as a refusal on the panel side — a forgeable refusal, the exact
   * C2 class this repo already closed once for the OLD thrown-string
   * design. Enveloping every result means attacker text can only ever sit
   * INSIDE `result` as a JSON string value; it can never BE the envelope.
   * `loop.test.ts` and this file's own tests both pin that property.
   *
   * The result going into the envelope is whatever `run` resolved with —
   * already a truncated STRING for every real panel-facing tool
   * (`tools/impl.ts`'s `withTruncation` runs upstream of this, inside
   * `run`), so truncation always bounds the INNER result before this
   * function stringifies the envelope AROUND it. `JSON.stringify` escapes
   * that inner string properly either way, so the envelope's own JSON
   * structure can never break mid-string, no matter what the inner text
   * contains or how it was cut.
   */
  wrap(origin: string, tool: string, run: ToolRun): (args: any) => Promise<unknown> {
    return async (args: any) => {
      let result: unknown;
      try {
        result = await run(args, origin);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        // The ledger's own record of what happened is UNMARKED either way —
        // `ok: false` already says it was a refusal from this page's point
        // of view, and the docket only ever needed that two-way split (see
        // task 5's own brief: "the record's LedgerEntry carries only
        // ok:boolean... the panel can [distinguish further] because loop.ts
        // sees the actual failure"). Unchanged by the finish task: this is
        // still the record's own account of what happened, independent of
        // whatever shape crosses the wire.
        //
        // `failure` is decided the same way, right here, at the only point
        // that ever sees the real exception object: `instanceof Refusal` is
        // the class check, not a string check — it cannot be spoofed by
        // whatever text a tool body (or something it threw from) happens to
        // contain, and it works whether or not this entry's own `detail`
        // ever gets rendered anywhere.
        const failure: LedgerEntry['failure'] = err instanceof Refusal ? 'refusal' : 'crash';
        this.entries.push({ origin, tool, at: this.clock(), ok: false, detail, failure });
        this.notify();
        if (err instanceof Refusal) {
          // FINISH TASK: no longer a re-thrown, marked message (see this
          // class's own comment on why that channel is dead in real
          // Chrome) — the envelope crosses as a RESOLVED value instead, so
          // the promise this function returns resolves here, it does not
          // reject.
          return JSON.stringify({ refused: true, reason: detail });
        }
        // A genuine crash is unaffected: still re-thrown, unmarked, and
        // still the honest wire shape for machinery failure — Chrome's own
        // generic DOMException is what a real caller actually sees, and
        // this project would rather that than invent a friendlier lie.
        throw err;
      }
      this.entries.push({ origin, tool, at: this.clock(), ok: true });
      this.notify();
      return JSON.stringify({ ok: true, result });
    };
  }

  /**
   * Scope extension, live hand-run finding: this used to count every entry
   * for an origin regardless of `e.ok`, so a REFUSED attempt bumped the
   * manifest's `used` number the same as a real success. Driving the full
   * hand-run on the deployed site caught it directly: seat1's only
   * `extract_text` call was deliberately refused
   * (`seat1 has not opened E1`), and the capability table still showed
   * `extract_text used=1` for a seat that never actually extracted
   * anything — while this project's whole demo turns on that exact number
   * ("these two seats disagree because one never read the PDF"). A live
   * model that tries and gets refused mid-take flips the number and puts
   * the spoken claim at war with the table on camera.
   *
   * The attempt is not erased by counting only successes — it is already
   * fully visible as its own REFUSED row on the ledger tape
   * (`ui/Docket.tsx`). `used` on a capability card means "what actually
   * informed this agent," and a refused call informed nothing.
   */
  countsFor(origin: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of this.entries) {
      if (e.origin === origin && e.ok) counts[e.tool] = (counts[e.tool] ?? 0) + 1;
    }
    return counts;
  }

  all(): LedgerEntry[] {
    return [...this.entries];
  }

  /**
   * Task 8 fix round 1, Critical: a tool a PANEL executes runs inside
   * Chrome's own cross-origin WebMCP machinery, not through any call the
   * record page's React tree makes itself — so nothing in App.tsx was ever
   * called after that mutation, and the ledger tape, the manifest call
   * counts and the hand chips all went stale until a human clicked
   * something. Subscribing beats polling here: the event that matters
   * (an entry landing) is exactly the event this method already knows
   * about, so a callback fires with zero lag and no interval to tune,
   * where a poll would have to either lag behind the real event or spend
   * cycles checking a state that usually hasn't changed.
   *
   * Returns an unsubscribe function. Fires after BOTH branches of `wrap`
   * above — a refusal is exactly as much "a receipt landing" as a success.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * A throwing subscriber must not be able to change what the ledger says
   * happened, and must not stop the other subscribers from hearing about it.
   * Each listener is therefore isolated. Swallowing is deliberate but not
   * silent: the failure goes to the console, because a refresh callback that
   * throws is a bug in the UI, not evidence about the case.
   */
  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('ledger subscriber threw; the record is unaffected', err);
      }
    }
  }
}
