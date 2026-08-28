import { describe, it, expect } from 'vitest';
import { searchExhibits } from './search';
import type { Exhibit } from '../model/types';

const exhibits: Exhibit[] = [
  { id: 'E1', side: 'A', kind: 'text', name: 'a.txt', sha256: 'x', filedAt: '2026-08-20T09:00:00Z',
    text: 'The first line.\nThe file was byte-identical.\nNothing else.' },
  { id: 'E2', side: 'B', kind: 'pdf', name: 'b.pdf', sha256: 'y', filedAt: '2026-08-20T09:01:00Z',
    text: 'cover sheet\nthe file was byte-identical on arrival',
    pages: ['cover sheet', 'the file was byte-identical on arrival'] },
  { id: 'E3', side: 'A', kind: 'image', name: 's.png', sha256: 'z', filedAt: '2026-08-20T09:02:00Z', text: null }
];

describe('searchExhibits', () => {
  it('finds a phrase across every exhibit that has text', () => {
    const hits = searchExhibits(exhibits, 'byte-identical');
    expect(hits.map((h) => h.exhibitId)).toEqual(['E1', 'E2']);
  });

  it('locates a text hit by line and a pdf hit by page', () => {
    const hits = searchExhibits(exhibits, 'byte-identical');
    expect(hits[0].locator).toEqual({ lines: [2, 2] });
    expect(hits[1].locator).toEqual({ page: 2 });
  });

  it('ignores case, matching the quote check', () => {
    expect(searchExhibits(exhibits, 'BYTE-IDENTICAL')).toHaveLength(2);
  });

  it('skips images silently rather than pretending to have read them', () => {
    expect(searchExhibits(exhibits, 'png').map((h) => h.exhibitId)).not.toContain('E3');
  });

  it('returns nothing for a query that is not there — the devastating record', () => {
    expect(searchExhibits(exhibits, 'never written anywhere')).toEqual([]);
  });

  it('returns a snippet the board can read without opening the exhibit', () => {
    expect(searchExhibits(exhibits, 'byte-identical')[0].snippet).toContain('byte-identical');
  });

  it('returns nothing for an empty or whitespace-only query', () => {
    expect(searchExhibits(exhibits, '')).toEqual([]);
    expect(searchExhibits(exhibits, '   ')).toEqual([]);
  });
});
