import { describe, it, expect, vi, afterEach } from 'vitest';
import { Ledger, Refusal } from './ledger';
import { ORIGIN } from '../config/origins';

describe('Ledger', () => {
  it('counts calls per origin and tool', async () => {
    const ledger = new Ledger(() => 1000);
    const run = ledger.wrap(ORIGIN.seat2, 'open_exhibit', async () => 'ok');
    await run({});
    await run({});
    expect(ledger.countsFor(ORIGIN.seat2)).toEqual({ open_exhibit: 2 });
  });

  it('keeps origins separate, which is what the split beat reads from', async () => {
    const ledger = new Ledger(() => 1000);
    await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
    await ledger.wrap(ORIGIN.seat2, 'extract_text', async () => 'ok')({});
    expect(ledger.countsFor(ORIGIN.seat1)).toEqual({ open_exhibit: 1 });
    expect(ledger.countsFor(ORIGIN.seat2)).toEqual({ extract_text: 1 });
  });

  it('records a refusal too — the refusal is evidence, not an error to swallow', async () => {
    const ledger = new Ledger(() => 1000);
    const run = ledger.wrap(ORIGIN.seat1, 'record_assessment', async () => {
      throw new Refusal('quote not found in E1 at the given locator; check the exact wording and the locator');
    });
    await expect(run({})).rejects.toThrow('quote not found');
    expect(ledger.all()).toEqual([{
      origin: ORIGIN.seat1, tool: 'record_assessment', at: 1000,
      ok: false, detail: 'quote not found in E1 at the given locator; check the exact wording and the locator',
      failure: 'refusal'
    }]);
  });

  // The discriminator this file's `wrap` adds so a reader (AgentCard's
  // `deriveAgentState`, first) can tell a deliberate refusal apart from an
  // ordinary bug — derived from `instanceof Refusal`, never from sniffing
  // `detail` for the marker (the marker never reaches this stored copy at
  // all, by design — see the test above and `wrap`'s own comment).
  describe('the failure discriminator', () => {
    it('marks a thrown Refusal as failure: "refusal"', async () => {
      const ledger = new Ledger(() => 1000);
      const run = ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => {
        throw new Refusal('seat1 has not opened E9; call open_exhibit first');
      });
      await run({}).catch(() => {});
      expect(ledger.all()[0]).toMatchObject({ ok: false, failure: 'refusal' });
    });

    it('marks a plain crash — a TypeError nobody anticipated — as failure: "crash", never "refusal"', async () => {
      const ledger = new Ledger(() => 1000);
      const run = ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => {
        throw new TypeError('cannot read properties of undefined');
      });
      await run({}).catch(() => {});
      expect(ledger.all()[0]).toMatchObject({ ok: false, failure: 'crash' });
    });

    it('leaves a success entry with no failure field at all', async () => {
      const ledger = new Ledger(() => 1000);
      await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
      expect(ledger.all()[0]).toEqual({ origin: ORIGIN.seat1, tool: 'open_exhibit', at: 1000, ok: true });
    });
  });

  // -------------------------------------------------------------------
  // Task 5, fix round 1, C1/C2: `Refusal` is the ONLY signal that survives
  // the trip across the cross-origin boundary to `loop.ts` — everything
  // else about the thrown error (its class, a stack trace, anything
  // attached to it beyond `.message`) does not make it. So the marker has
  // to be baked into the message text itself, here, before that crossing —
  // these tests are what proves it actually is.
  // -------------------------------------------------------------------
  describe('Refusal marking (fix round 1, C1/C2)', () => {
    it('marks a thrown Refusal\'s message before re-throwing it', async () => {
      const ledger = new Ledger(() => 1000);
      const run = ledger.wrap(ORIGIN.seat1, 'dispute', async () => {
        throw new Refusal('cannot dispute your own fact');
      });
      await expect(run({})).rejects.toThrow(`${Refusal.MARKER}cannot dispute your own fact`);
    });

    it('leaves a plain Error UNMARKED — an unrecognised failure defaults to broke, not refused', async () => {
      const ledger = new Ledger(() => 1000);
      const run = ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => {
        throw new TypeError('cannot read properties of undefined');
      });
      let err: Error | undefined;
      try {
        await run({});
      } catch (e) {
        err = e as Error;
      }
      expect(err?.message).not.toContain(Refusal.MARKER);
      expect(err?.message).toBe('cannot read properties of undefined');
    });

    it('does not mark the LEDGER\'s own record of the failure — only what is re-thrown', async () => {
      const ledger = new Ledger(() => 1000);
      const run = ledger.wrap(ORIGIN.A, 'file_fact', async () => {
        throw new Refusal('no such fact: F9');
      });
      await expect(run({})).rejects.toThrow();
      // The docket only ever needed the two-way ok/not-ok split (task 5's
      // own brief). Marking `detail` too would make every refused row in
      // the record's own UI print a literal "[board:refusal]" prefix nobody
      // asked to read.
      expect(ledger.all()[0].detail).toBe('no such fact: F9');
      expect(ledger.all()[0].ok).toBe(false);
    });

    it('a Refusal subclassing Error still notifies subscribers and writes exactly one entry, same as any other failure', async () => {
      const ledger = new Ledger(() => 1000);
      let notified = 0;
      ledger.subscribe(() => { notified += 1; });
      const run = ledger.wrap(ORIGIN.seat2, 'extract_text', async () => {
        throw new Refusal('seat2 has not opened E2');
      });
      await run({}).catch(() => {});
      expect(notified).toBe(1);
      expect(ledger.all()).toHaveLength(1);
    });
  });

  it('returns an empty count for an origin that has done nothing', () => {
    expect(new Ledger(() => 1000).countsFor(ORIGIN.A)).toEqual({});
  });

  // Task 9: `run` now receives the calling origin as its second argument —
  // it's the only forgery-proof channel a tool body has for learning which
  // actor is calling (see the type's own comment in ledger.ts). This is the
  // seam tools/impl.ts's actor lookup depends on; without it, every
  // actor-aware body (open_exhibit, record_assessment, cite, spend_appeal,
  // file_exhibit, file_fact, concede, dispute) would have no sound way to
  // know who called them.
  it('passes the origin through to the wrapped body as a second argument', async () => {
    const ledger = new Ledger(() => 1000);
    let seen: string | undefined;
    const run = ledger.wrap(ORIGIN.seat1, 'open_exhibit', async (_args, origin) => { seen = origin; return 'ok'; });
    await run({});
    expect(seen).toBe(ORIGIN.seat1);
  });

  // Task 8 fix round 1, Critical: a panel's tool call runs through Chrome's
  // own cross-origin machinery, not through any call the record page's React
  // tree makes — so the record page can only ever learn "a receipt landed"
  // by subscribing to the ledger itself. These tests are the covering test
  // for that fix: they prove the seam exists and fires correctly, which is
  // as much of it as a unit test can reach (App.tsx's actual `refresh()`
  // wiring is UI, out of this task's unit-test scope by its own stated
  // limit).
  describe('subscribe', () => {
    it('notifies a listener when a successful call lands — the seam Docket\'s ledger tape and Manifest\'s call counts both need', async () => {
      const ledger = new Ledger(() => 1000);
      let notified = 0;
      ledger.subscribe(() => { notified += 1; });
      await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
      expect(notified).toBe(1);
    });

    it('notifies on a refusal too — a refusal landing is exactly as much "a receipt landing" as a success', async () => {
      const ledger = new Ledger(() => 1000);
      let notified = 0;
      ledger.subscribe(() => { notified += 1; });
      const run = ledger.wrap(ORIGIN.seat2, 'confirm', async () => { throw new Error('not implemented'); });
      await expect(run({})).rejects.toThrow('not implemented');
      expect(notified).toBe(1);
    });

    it('notifies every subscriber, once per entry, in the order entries land', async () => {
      const ledger = new Ledger(() => 1000);
      const seen: number[] = [];
      ledger.subscribe(() => seen.push(1));
      ledger.subscribe(() => seen.push(2));
      await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
      expect(seen).toEqual([1, 2]);
    });

    it('stops notifying once unsubscribed', async () => {
      const ledger = new Ledger(() => 1000);
      let notified = 0;
      const unsubscribe = ledger.subscribe(() => { notified += 1; });
      await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
      unsubscribe();
      await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
      expect(notified).toBe(1);
    });

    // -------------------------------------------------------------------
    // FINAL REVIEW, BLOCKER 3 (second half): the success branch's notify()
    // used to sit INSIDE wrap()'s try. A subscriber that threw was therefore
    // caught by wrap()'s own catch, which wrote a SECOND entry for the same
    // call, marked as a refusal, and rethrew. A successful call rendered as
    // REFUSED with its count at two, and nothing looked broken.
    //
    // It could not fire while React's state setter was the only subscriber.
    // The appeal-refresh fix adds a second one, so it could.
    // -------------------------------------------------------------------
    describe('a subscriber that throws (final review, Blocker 3)', () => {
      afterEach(() => { vi.restoreAllMocks(); });

      it('cannot turn a successful call into a refusal, or write a second row for it', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const ledger = new Ledger(() => 1000);
        ledger.subscribe(() => { throw new Error('a render blew up'); });

        await expect(ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({})).resolves.toBe('ok');

        expect(ledger.all()).toEqual([{ origin: ORIGIN.seat1, tool: 'open_exhibit', at: 1000, ok: true }]);
        expect(ledger.countsFor(ORIGIN.seat1)).toEqual({ open_exhibit: 1 });
      });

      it('cannot replace a genuine refusal with its own error', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const ledger = new Ledger(() => 1000);
        ledger.subscribe(() => { throw new Error('a render blew up'); });

        const run = ledger.wrap(ORIGIN.seat2, 'cite', async () => { throw new Error('seat2 never assessed F9'); });

        // The message the panel renders must be the tool's, not the UI's.
        await expect(run({})).rejects.toThrow('seat2 never assessed F9');
        expect(ledger.all()).toHaveLength(1);
        expect(ledger.all()[0].detail).toBe('seat2 never assessed F9');
      });

      it('still notifies every other subscriber when one of them throws', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const ledger = new Ledger(() => 1000);
        const seen: string[] = [];
        ledger.subscribe(() => { seen.push('first'); });
        ledger.subscribe(() => { throw new Error('a render blew up'); });
        ledger.subscribe(() => { seen.push('third'); });

        await ledger.wrap(ORIGIN.seat1, 'open_exhibit', async () => 'ok')({});
        expect(seen).toEqual(['first', 'third']);
      });
    });
  });
});
