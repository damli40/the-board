import { ORIGIN, type Actor } from '../model/types';
import {
  ALL_TOOL_NAMES,
  OBSERVER_LABEL,
  OBSERVER_ORIGIN,
  OBSERVER_TOOLS,
  TOOLS,
  registeredToolName,
  type Lifetime,
} from './tools';
import type { Ledger, ToolRun } from './ledger';

export interface ModelContextLike {
  // `exposedTo` is OPTIONAL, and its absence is meaningful rather than a
  // default: it is the one registration a visiting agent can reach. See
  // OBSERVER_TOOLS in ./tools.
  registerTool(def: any, opts: { signal: AbortSignal; exposedTo?: string[] }): Promise<void>;
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

  /** The visiting agent's grant. Opened once, never closed — see openObserver. */
  private observerOpen = false;
  private observerController = new AbortController();
  private observerGrants: Grant[] = [];
  private observerFailures: RegistrationFailure[] = [];

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
        // `close()` can land inside this loop's await window: `registerTool`
        // is real browser IPC, not a microtask. Registering against a signal
        // that is already aborted is a rejection in Chrome, so stop.
        if (ac.signal.aborted) break;
        const origin = ORIGIN[actor];
        const body = this.impl[spec.name] ?? (async () => { throw new Error(`${spec.name} not implemented`); });
        try {
          await this.mc.registerTool({
            // Per-actor name: WebMCP tool names are unique per DOCUMENT, so
            // A's and B's copies of the same capability cannot share one.
            // `granted` below still records the BARE name, so the manifest is
            // unchanged. See registeredToolName in ./tools.
            name: registeredToolName(actor, spec.name),
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
      if (ac.signal.aborted) break;
    }

    // If this lifetime was closed — or closed and re-opened — while we were
    // awaiting, `granted` describes a registry that no longer exists. Writing
    // it would leave GRANTED rows standing for tools the browser does not
    // hold, and nothing would ever clear them, because `close()` only runs
    // when `isOpen` is true. That is the manifest drifting from the browser:
    // the exact failure this class exists to prevent, and the one the header
    // above calls the most dangerous shape a bug can take here.
    if (this.controllers.get(lifetime) !== ac) return;

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
  /**
   * Registers the read-only observer set WITHOUT `exposedTo`, which is what
   * makes it reachable by a visiting agent rather than by one of the four
   * panel origins.
   *
   * Deliberately not a phase lifetime. It opens once at boot and is never
   * closed, because what a visiting agent may read does not change with the
   * phase — it may always read, and it may never write.
   *
   * `read` is passed in rather than built here so the registry stays ignorant
   * of the case model. It is called at CALL time, never captured, so the
   * agent always reads current state and never a snapshot taken at boot.
   */
  async openObserver(read: () => unknown): Promise<void> {
    if (this.observerOpen) return;
    this.observerOpen = true;

    for (const spec of OBSERVER_TOOLS) {
      try {
        await this.mc.registerTool({
          name: spec.name,
          title: spec.title,
          description: spec.description,
          inputSchema: spec.inputSchema,
          // readOnlyHint is not decoration here. A missing `exposedTo` is the
          // widest registration this codebase makes, and read-only is the
          // property that makes it safe. registry.test.ts enforces it.
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          // Ledgered like every other call: a visiting agent reading the board
          // is part of the record, not invisible to it.
          execute: this.ledger.wrap(OBSERVER_ORIGIN, spec.name, async () => read())
        }, { signal: this.observerController.signal });
        this.observerGrants.push({ origin: OBSERVER_ORIGIN, tool: spec.name, lends: false });
      } catch (err) {
        this.observerFailures.push({
          origin: OBSERVER_ORIGIN, tool: spec.name, lifetime: 'observer' as Lifetime,
          reason: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  /**
   * The visiting agent's manifest, built the same way every other actor's is:
   * what actually registered, and everything in the catalogue that did not.
   */
  observerManifest(): { label: string; origin: string; granted: { tool: string; used: number; lends: boolean }[]; notGranted: string[] } {
    const counts = this.ledger.countsFor(OBSERVER_ORIGIN);
    const granted = this.observerGrants.map((g) => ({ tool: g.tool, used: counts[g.tool] ?? 0, lends: g.lends }));
    const names = new Set(granted.map((g) => g.tool));
    return {
      // Fix round 2, Minor: was the literal string 'visiting agent'
      // alongside an OBSERVER_ORIGIN import that WAS the constant — nothing
      // asserted the two agreed, so a rename of OBSERVER_LABEL would have
      // gone stale here silently. registry.test.ts now asserts they match.
      label: OBSERVER_LABEL,
      origin: OBSERVER_ORIGIN,
      granted,
      // Every tool the four panels can hold, none of which this one can.
      notGranted: ALL_TOOL_NAMES.filter((n) => !names.has(n))
    };
  }

  /**
   * Fix round 2, C1: `observerFailures` was written at `openObserver`'s catch
   * branch and read nowhere — so if Chrome refused the no-`exposedTo`
   * registration, nothing on the page could tell the difference between
   * "the browser said no" and "there was simply nothing to hand over yet".
   * The observer card (`ui/Manifest.tsx`) reads this directly to draw that
   * third state; `RefusalBanner` does NOT read it — that component belongs
   * to a different task, and this failure is not a per-lifetime one, so it
   * does not belong in `registrationFailures()`'s per-lifetime map either.
   */
  observerRegistrationFailures(): RegistrationFailure[] {
    return [...this.observerFailures];
  }

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
