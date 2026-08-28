import { describe, it, expect } from 'vitest';
import { extractPages } from './extract';

// Fake loader stands in for pdf.js so this suite tests the wrapper's contract
// (order, joining, empty-doc handling), not pdf.js's own PDF parsing. See the
// comment at the top of extract.ts: pdf.js itself is verified by hand in
// Task 9 Step 4, not here.
const fakeLoader = (pages: string[][]) => async () => ({
  numPages: pages.length,
  getPage: async (n: number) => ({
    getTextContent: async () => ({ items: pages[n - 1].map((str) => ({ str })) })
  })
});

describe('extractPages', () => {
  it('returns one string per page, in order', async () => {
    const out = await extractPages(new ArrayBuffer(0), fakeLoader([['page', 'one'], ['page', 'two']]));
    expect(out).toEqual(['page one', 'page two']);
  });

  it('joins text runs with a space, because pdf.js emits them fragmented', async () => {
    const out = await extractPages(new ArrayBuffer(0), fakeLoader([['byte-', 'identical']]));
    expect(out).toEqual(['byte- identical']);
  });

  it('returns an empty array for a document with no pages', async () => {
    expect(await extractPages(new ArrayBuffer(0), fakeLoader([]))).toEqual([]);
  });
});
