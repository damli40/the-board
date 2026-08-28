import { describe, it, expect, beforeEach } from 'vitest';
import { CaseOutcome } from './outcome';
import { TOOLS } from '../webmcp/tools';

describe('CaseOutcome', () => {
  let outcome: CaseOutcome;
  beforeEach(() => { outcome = new CaseOutcome(); });

  it('starts as a draft with no force', () => {
    expect(outcome.state).toBe('draft');
  });

  it('becomes real only when a named person confirms', () => {
    outcome.confirmByHuman('D. Akins');
    expect(outcome.state).toBe('confirmed');
    expect(outcome.confirmedBy).toBe('D. Akins');
  });

  it('refuses an unnamed confirm — "someone approved it" is the thing we are replacing', () => {
    expect(() => outcome.confirmByHuman('  ')).toThrow('confirm requires a named person');
  });

  it('can be returned with a note instead, which keeps it a draft', () => {
    outcome.returnWithNote('D. Akins', 'Seat 1 never opened E2. Read it and re-draft.');
    expect(outcome.state).toBe('returned');
    expect(outcome.notes).toEqual([{ by: 'D. Akins', note: 'Seat 1 never opened E2. Read it and re-draft.' }]);
  });

  it('cannot be confirmed twice', () => {
    outcome.confirmByHuman('D. Akins');
    expect(() => outcome.confirmByHuman('D. Akins')).toThrow('already confirmed');
  });

  it('cannot be returned with a note after it is confirmed', () => {
    outcome.confirmByHuman('D. Akins');
    expect(() => outcome.returnWithNote('D. Akins', 'too late')).toThrow('already confirmed');
  });

  it('is unreachable by any agent: no tool in the catalogue confirms', () => {
    expect(TOOLS.some((t) => t.name === 'confirm')).toBe(false);
    expect(TOOLS.some((t) => t.name === 'return_with_note')).toBe(false);
  });
});
