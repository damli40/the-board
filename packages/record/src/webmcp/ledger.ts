export interface LedgerEntry {
  origin: string;
  tool: string;
  at: number;
  ok: boolean;
  detail?: string;
}

export type ToolRun = (args: any) => Promise<unknown>;

/**
 * One recorder wrapped around execute. Nobody has to remember to log,
 * because there is no path to executing a tool that does not go through here.
 */
export class Ledger {
  private entries: LedgerEntry[] = [];
  private listeners = new Set<() => void>();

  constructor(private clock: () => number = () => Date.now()) {}

  wrap(origin: string, tool: string, run: ToolRun): ToolRun {
    return async (args: any) => {
      try {
        const result = await run(args);
        this.entries.push({ origin, tool, at: this.clock(), ok: true });
        this.notify();
        return result;
      } catch (err) {
        this.entries.push({
          origin, tool, at: this.clock(), ok: false,
          detail: err instanceof Error ? err.message : String(err)
        });
        this.notify();
        throw err;
      }
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

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
