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
 * machinery, so this is upstream of the cross-origin boundary that erases
 * everything except the message string (verified against `loop.ts`'s own
 * comment on what Chrome hands back — only `.message` survives).
 *
 * So the type information has to be flattened into that string before it
 * crosses, which is what `MARKER` is for: prepended here, stripped back off
 * on the panel side (`loop.ts`). A message that does not carry it defaults
 * to "broke" on the far side — deliberately: calling a crash a refusal is
 * the lie this fixes, and calling a refusal a crash merely under-claims
 * what the record intended (per the finding's own ruling).
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
        // sees the actual failure"). The marker is added ONLY to what is
        // re-thrown, because the re-thrown message is the one thing that
        // survives the trip across the cross-origin boundary to loop.ts.
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
          throw new Error(`${Refusal.MARKER}${detail}`);
        }
        throw err;
      }
      this.entries.push({ origin, tool, at: this.clock(), ok: true });
      this.notify();
      return result;
    };
  }

  countsFor(origin: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of this.entries) {
      if (e.origin === origin) counts[e.tool] = (counts[e.tool] ?? 0) + 1;
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
