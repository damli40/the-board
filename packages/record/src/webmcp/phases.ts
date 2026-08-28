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

  appealHeld(side: Side): boolean {
    return this.registry.isOpen(APPEAL_LIFETIME[side]);
  }

  private isSpent(lifetime: Lifetime): boolean {
    return (lifetime === 'appealA' && this.spent.has('A'))
        || (lifetime === 'appealB' && this.spent.has('B'));
  }
}
