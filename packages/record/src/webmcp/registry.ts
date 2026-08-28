import { ORIGIN, type Actor } from '../model/types';
import { ALL_TOOL_NAMES, TOOLS, type Lifetime } from './tools';
import type { Ledger, ToolRun } from './ledger';

export interface ModelContextLike {
  registerTool(def: any, opts: { signal: AbortSignal; exposedTo: string[] }): Promise<void>;
}

export interface Grant { origin: string; tool: string; lends: boolean }

export interface Manifest {
  actor: Actor;
  origin: string;
  granted: { tool: string; used: number; lends: boolean }[];
  notGranted: string[];
}

export class ToolRegistry {
  private controllers = new Map<Lifetime, AbortController>();

  constructor(
    private mc: ModelContextLike,
    private ledger: Ledger,
    /** name -> body. Task 5 and Task 6 add entries; Task 9 wires the real ones. */
    private impl: Record<string, ToolRun>
  ) {}

  async open(lifetime: Lifetime): Promise<void> {
    if (this.controllers.has(lifetime)) return;
    const ac = new AbortController();
    this.controllers.set(lifetime, ac);

    for (const spec of TOOLS.filter((t) => t.lifetime === lifetime)) {
      for (const actor of spec.actors) {
        const origin = ORIGIN[actor];
        const body = this.impl[spec.name] ?? (async () => { throw new Error(`${spec.name} not implemented`); });
        await this.mc.registerTool({
          name: spec.name,
          title: spec.title,
          description: spec.description,
          inputSchema: spec.inputSchema,
          annotations: { readOnlyHint: spec.readOnly, untrustedContentHint: true },
          execute: this.ledger.wrap(origin, spec.name, body)
        }, { signal: ac.signal, exposedTo: [origin] });
      }
    }
  }

  /** The spec has no unregisterTool. A tool is withdrawn by aborting its signal. */
  close(lifetime: Lifetime): void {
    this.controllers.get(lifetime)?.abort();
    this.controllers.delete(lifetime);
  }

  isOpen(lifetime: Lifetime): boolean {
    return this.controllers.has(lifetime);
  }

  /** Every grant currently live. The manifest is a projection of exactly this. */
  registered(): Grant[] {
    const grants: Grant[] = [];
    for (const lifetime of this.controllers.keys()) {
      for (const spec of TOOLS.filter((t) => t.lifetime === lifetime)) {
        for (const actor of spec.actors) {
          grants.push({ origin: ORIGIN[actor], tool: spec.name, lends: spec.lends ?? false });
        }
      }
    }
    return grants;
  }

  /**
   * The object that displays the grant is the object that performs the grant.
   * There is no version of this that drifts out of true.
   */
  manifest(actor: Actor): Manifest {
    const origin = ORIGIN[actor];
    const counts = this.ledger.countsFor(origin);
    const granted = this.registered()
      .filter((g) => g.origin === origin)
      .map((g) => ({ tool: g.tool, used: counts[g.tool] ?? 0, lends: g.lends }));

    const grantedNames = new Set(granted.map((g) => g.tool));
    return {
      actor,
      origin,
      granted,
      notGranted: ALL_TOOL_NAMES.filter((n) => !grantedNames.has(n))
    };
  }
}
