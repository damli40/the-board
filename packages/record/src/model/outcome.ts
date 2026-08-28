/**
 * Page-owned. Deliberately not importable from any tool body — the only
 * callers are the two buttons in ConfirmBar.tsx (Task 8). No tool reaches
 * this control, in any phase, for any agent: a draft has no force, only a
 * named human does.
 */
export class CaseOutcome {
  state: 'draft' | 'returned' | 'confirmed' = 'draft';
  confirmedBy: string | null = null;
  notes: { by: string; note: string }[] = [];

  confirmByHuman(name: string): void {
    if (this.state === 'confirmed') throw new Error('already confirmed');
    if (name.trim() === '') throw new Error('confirm requires a named person');
    this.state = 'confirmed';
    this.confirmedBy = name;
  }

  returnWithNote(by: string, note: string): void {
    if (this.state === 'confirmed') throw new Error('already confirmed');
    if (by.trim() === '') throw new Error('a note requires a named person');
    this.state = 'returned';
    this.notes.push({ by, note });
  }
}
