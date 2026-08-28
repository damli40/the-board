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

  constructor(private clock: () => number = () => Date.now()) {}

  wrap(origin: string, tool: string, run: ToolRun): ToolRun {
    return async (args: any) => {
      try {
        const result = await run(args);
        this.entries.push({ origin, tool, at: this.clock(), ok: true });
        return result;
      } catch (err) {
        this.entries.push({
          origin, tool, at: this.clock(), ok: false,
          detail: err instanceof Error ? err.message : String(err)
        });
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
}
