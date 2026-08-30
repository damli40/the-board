import type { Phase, Side } from '../model/types';
import { LIFETIME_WINDOW, lifetimeIsActiveIn, type Lifetime } from './tools';
import type { ToolRegistry } from './registry';

const APPEAL_LIFETIME: Record<Side, Lifetime> = { A: 'appealA', B: 'appealB' };

export class PhaseMachine {
  phase: Phase = 'FILING';
  private spent = new Set<Side>();

  constructor(private registry: ToolRegistry) {}

  async enter(next: Phase): Promise<void> {
    this.phase = next;

    for (const lifetime of Object.keys(LIFETIME_WINDOW) as Lifetime[]) {
      const shouldBeOpen = lifetimeIsActiveIn(lifetime, next) && !this.isSpent(lifetime);
      if (shouldBeOpen && !this.registry.isOpen(lifetime)) {
        await this.registry.open(lifetime);
      } else if (!shouldBeOpen && this.registry.isOpen(lifetime)) {
        this.registry.close(lifetime);
      }
    }
  }

  /** Spending aborts the controller: the card leaves the hand, visibly and permanently. */
  spendAppeal(side: Side): void {
    this.spent.add(side);
    this.registry.close(APPEAL_LIFETIME[side]);
  }

  /**
   * Drives the appeal card in the hand, so it reads `hasLiveGrant`, not
   * `isOpen`. Final review, Should-fix 6: a lifetime whose `registerTool` the
   * browser refused is still "open", because the abort controller went in
   * before any registration resolved, and drawing the card off that would put a
   * face-up `spend_appeal ×1` in A's hand for a tool A does not hold, which is
   * exactly the manifest bug one surface over.
   */
  appealHeld(side: Side): boolean {
    return this.registry.hasLiveGrant(APPEAL_LIFETIME[side]);
  }

  /**
   * Task 8: the phase ribbon draws a permanently empty socket once an appeal
   * is spent, distinct from "not open yet because we're not at VERDICT". A
   * public reader over the existing private `spent` set — no change to how
   * spending works, no new state.
   */
  appealSpent(side: Side): boolean {
    return this.spent.has(side);
  }

  private isSpent(lifetime: Lifetime): boolean {
    return (lifetime === 'appealA' && this.spent.has('A'))
        || (lifetime === 'appealB' && this.spent.has('B'));
  }
}
