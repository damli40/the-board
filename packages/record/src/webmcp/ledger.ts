export interface LedgerEntry {
  origin: string;
  tool: string;
  at: number;
  ok: boolean;
  detail?: string;
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
        this.entries.push({
          origin, tool, at: this.clock(), ok: false,
          detail: err instanceof Error ? err.message : String(err)
        });
        this.notify();
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
