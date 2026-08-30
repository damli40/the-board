import { ORIGIN, type Actor } from '../model/types';
import { ALL_TOOL_NAMES, TOOLS, type Lifetime } from './tools';
import type { Ledger, ToolRun } from './ledger';

export interface ModelContextLike {
  registerTool(def: any, opts: { signal: AbortSignal; exposedTo: string[] }): Promise<void>;
}

export interface Grant { origin: string; tool: string; lends: boolean }

/**
 * A registration the browser refused. Final review, Should-fix 6: a
 * `registerTool` rejection (`NotAllowedError` from a Permissions-Policy that
 * does not name this origin is the realistic one) used to throw out of
 * `open()` mid-loop with no caller catching it, while `registered()` went on
 * rebuilding the grant list from the catalogue and the set of open lifetimes.
 * The record page therefore drew a full GRANTED column for tools that had
 * never been registered, while the panels correctly reported them as not
 * granted. That failure looks exactly like the boundary working, which is the
 * most dangerous shape a bug can take in a project whose whole claim is that
 * the manifest is what the browser actually did.
 */
export interface RegistrationFailure { origin: string; tool: string; lifetime: Lifetime; reason: string }

export interface Manifest {
  actor: Actor;
  origin: string;
  granted: { tool: string; used: number; lends: boolean }[];
  notGranted: string[];
}

export class ToolRegistry {
  private controllers = new Map<Lifetime, AbortController>();
  /**
   * What actually registered, recorded per lifetime as each `registerTool`
   * RESOLVES. This replaces re-deriving the grant list from the catalogue:
   * the catalogue says what was asked for, this says what was given.
   */
  private grants = new Map<Lifetime, Grant[]>();
  private failures = new Map<Lifetime, RegistrationFailure[]>();

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
    const granted: Grant[] = [];
    const failed: RegistrationFailure[] = [];

    for (const spec of TOOLS.filter((t) => t.lifetime === lifetime)) {
      for (const actor of spec.actors) {
        const origin = ORIGIN[actor];
        const body = this.impl[spec.name] ?? (async () => { throw new Error(`${spec.name} not implemented`); });
        try {
          await this.mc.registerTool({
            name: spec.name,
            title: spec.title,
            description: spec.description,
            inputSchema: spec.inputSchema,
            annotations: { readOnlyHint: spec.readOnly, untrustedContentHint: true },
            execute: this.ledger.wrap(origin, spec.name, body)
          }, { signal: ac.signal, exposedTo: [origin] });
          granted.push({ origin, tool: spec.name, lends: spec.lends ?? false });
        } catch (err) {
          // Caught, not swallowed. The loop continues so one refused
          // registration does not silently strip every tool declared after
          // it, and the failure is kept for the page to render.
          failed.push({
            origin, tool: spec.name, lifetime,
            reason: err instanceof Error ? err.message : String(err)
          });
        }
      }
    }

    this.grants.set(lifetime, granted);
    if (failed.length > 0) this.failures.set(lifetime, failed);
  }

  /** The spec has no unregisterTool. A tool is withdrawn by aborting its signal. */
  close(lifetime: Lifetime): void {
    this.controllers.get(lifetime)?.abort();
    this.controllers.delete(lifetime);
    this.grants.delete(lifetime);
    this.failures.delete(lifetime);
  }

  /**
   * Whether this lifetime's window is open. This is about PHASE state: it is
   * what `PhaseMachine.enter` uses to decide what to open and close, and it
   * deliberately says nothing about whether the browser accepted the
   * registrations. Use `hasLiveGrant` for that.
   */
  isOpen(lifetime: Lifetime): boolean {
    return this.controllers.has(lifetime);
  }

  /**
   * Whether this lifetime actually put a tool in somebody's hand. Distinct
   * from `isOpen`: a lifetime whose every `registerTool` was refused is open
   * and grants nothing. Anything that DRAWS a capability must read this, or
   * it draws the intention rather than the browser's answer, the same
   * failure Should-fix 6 corrected in the manifest.
   */
  hasLiveGrant(lifetime: Lifetime): boolean {
    return (this.grants.get(lifetime)?.length ?? 0) > 0;
  }

  /** Every grant currently live. The manifest is a projection of exactly this. */
  registered(): Grant[] {
    return [...this.grants.values()].flat();
  }

  /**
   * Every registration the browser refused, across every open lifetime. The
   * record page renders this; an empty array is the normal case.
   */
  registrationFailures(): RegistrationFailure[] {
    return [...this.failures.values()].flat();
  }

  /**
   * The object that displays the grant is the object that performs the grant:
   * the manifest is projected from the same registry that calls
   * `registerTool`, and `granted` holds only registrations that actually
   * resolved, so a refused one is reported by `registrationFailures()`
   * instead of appearing here.
   *
   * That is a claim about this code, not about the browser. Chrome's own view
   * is the independent check, and it is verified by hand: the DevTools step
   * in `docs/evidence/hand-run.md` compares this manifest against
   * DevTools → Application → WebMCP, origin by origin. (A previous version of
   * this comment said "there is no version of this that drifts out of true",
   * which overstated what the code can guarantee, and the README's weaker
   * phrasing was the accurate one.)
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
