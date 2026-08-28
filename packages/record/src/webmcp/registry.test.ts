import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from './registry';
import { Ledger } from './ledger';
import { FakeModelContext } from './fakeModelContext';
import { NEVER_GRANTED } from './tools';
import { ORIGIN } from '../config/origins';

describe('ToolRegistry', () => {
  let mc: FakeModelContext;
  let ledger: Ledger;
  let registry: ToolRegistry;

  beforeEach(() => {
    mc = new FakeModelContext();
    ledger = new Ledger(() => 1000);
    registry = new ToolRegistry(mc, ledger, new Proxy({}, { get: () => async () => 'ok' }) as any);
  });

  it('scopes a filing tool to one origin, so the other side never sees it', async () => {
    await registry.open('filing');
    expect(mc.visibleTo(ORIGIN.A)).toContain('file_fact');
    expect(mc.visibleTo(ORIGIN.seat1)).not.toContain('file_fact');
  });

  it('withdraws every tool in a lifetime by aborting its signal', async () => {
    await registry.open('filing');
    expect(mc.visibleTo(ORIGIN.A)).toContain('file_exhibit');
    registry.close('filing');
    expect(mc.visibleTo(ORIGIN.A)).not.toContain('file_exhibit');
  });

  it('withdraws from both sides at the same instant — the visible beat', async () => {
    await registry.open('filing');
    registry.close('filing');
    expect(mc.visibleTo(ORIGIN.A)).toEqual([]);
    expect(mc.visibleTo(ORIGIN.B)).toEqual([]);
  });

  it("grants each side its own appeal, so spending one does not spend the other's", async () => {
    await registry.open('appealA');
    await registry.open('appealB');
    registry.close('appealA');
    expect(mc.visibleTo(ORIGIN.A)).not.toContain('spend_appeal');
    expect(mc.visibleTo(ORIGIN.B)).toContain('spend_appeal');
  });

  it('marks every tool untrustedContentHint, per spec layer 2', async () => {
    await registry.open('filing');
    expect(mc.tools.every((t) => t.annotations.untrustedContentHint)).toBe(true);
  });

  it('routes every execution through the ledger', async () => {
    await registry.open('boardRead');
    const tool = mc.tools.find((t) => t.name === 'open_exhibit' && t.exposedTo.includes(ORIGIN.seat2))!;
    await tool.execute({ exhibitId: 'E1' });
    expect(ledger.countsFor(ORIGIN.seat2)).toEqual({ open_exhibit: 1 });
  });

  it('projects a manifest whose granted half comes from the registry itself', async () => {
    await registry.open('boardRead');
    const m = registry.manifest('seat2');
    expect(m.granted.map((g) => g.tool).sort()).toEqual(['extract_text', 'open_exhibit', 'record_assessment', 'search_exhibits']);
    expect(m.granted.find((g) => g.tool === 'extract_text')!.lends).toBe(true);
  });

  it('shows live call counts in the manifest', async () => {
    await registry.open('boardRead');
    const tool = mc.tools.find((t) => t.name === 'record_assessment' && t.exposedTo.includes(ORIGIN.seat1))!;
    await tool.execute({});
    expect(registry.manifest('seat1').granted.find((g) => g.tool === 'record_assessment')!.used).toBe(1);
  });

  it('lists what the board was NOT granted, which is the half doing the work', async () => {
    await registry.open('boardRead');
    const m = registry.manifest('seat2');
    expect(m.notGranted).toContain('file_fact');
    expect(m.notGranted).toContain('confirm');
  });

  it('never grants confirm to anyone, in any lifetime', async () => {
    for (const lifetime of ['filing', 'partyObject', 'boardRead', 'verdictDraft', 'appealA', 'appealB'] as const) {
      await registry.open(lifetime);
    }
    for (const origin of [ORIGIN.A, ORIGIN.B, ORIGIN.seat1, ORIGIN.seat2]) {
      for (const forbidden of NEVER_GRANTED) {
        expect(mc.visibleTo(origin)).not.toContain(forbidden);
      }
    }
  });
});
