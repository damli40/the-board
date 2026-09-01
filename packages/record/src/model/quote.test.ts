import { describe, it, expect } from 'vitest';
import { checkQuote } from './quote';
import type { Exhibit } from './types';

const textExhibit: Exhibit = {
  id: 'E1', side: 'A', kind: 'text', name: 'notes.txt', sha256: 'x',
  text: 'Delivery was accepted.\nNo objection was raised within the window.\nThe file was byte-identical.',
  filedAt: '2026-08-20T09:00:00Z'
};

const pdfExhibit: Exhibit = {
  id: 'E2', side: 'B', kind: 'pdf', name: 'report.pdf', sha256: 'y',
  text: 'page one body\npage two body mentions the window',
  pages: ['page one body', 'page two body mentions the window'],
  filedAt: '2026-08-20T09:01:00Z'
};

const imageExhibit: Exhibit = {
  id: 'E3', side: 'A', kind: 'image', name: 'screenshot.png', sha256: 'z',
  text: null, filedAt: '2026-08-20T09:02:00Z'
};

// A PDF whose text extraction produced nothing (a scanned page with no OCR layer,
// say). Its `text` is also null, but it is NOT an image — controller ruling: the
// unverifiable branch must key off `kind === 'image'`, not `text === null`, or the
// page tells the reader a confident falsehood about what E4 is.
const extractionFailedPdf: Exhibit = {
  id: 'E4', side: 'B', kind: 'pdf', name: 'scan.pdf', sha256: 'w',
  text: null, filedAt: '2026-08-20T09:03:00Z'
};

describe('checkQuote', () => {
  it('confirms a quote that is really there', () => {
    expect(checkQuote(textExhibit, {}, 'No objection was raised')).toEqual({
      verifiable: true, found: true, verified: 'machine-checked'
    });
  });

  it('refuses a quote the document does not contain', () => {
    const r = checkQuote(textExhibit, {}, 'Delivery was rejected.');
    expect(r).toEqual({
      verifiable: true, found: false,
      reason: 'quote not found in E1 at the given locator; check the exact wording and the locator'
    });
  });

  it('tolerates whitespace and case, because PDF extraction breaks lines mid-sentence', () => {
    const r = checkQuote(textExhibit, {}, 'no    objection\n was RAISED');
    expect(r).toMatchObject({ verifiable: true, found: true });
  });

  it('does not tolerate changed words', () => {
    const r = checkQuote(textExhibit, {}, 'no objection was recorded');
    expect(r).toMatchObject({ verifiable: true, found: false });
  });

  it('scopes the search to the page named in the locator', () => {
    expect(checkQuote(pdfExhibit, { page: 2 }, 'mentions the window')).toMatchObject({ found: true });
    expect(checkQuote(pdfExhibit, { page: 1 }, 'mentions the window')).toMatchObject({ found: false });
  });

  it('scopes the search to the line range named in the locator', () => {
    expect(checkQuote(textExhibit, { lines: [3, 3] }, 'byte-identical')).toMatchObject({ found: true });
    expect(checkQuote(textExhibit, { lines: [1, 1] }, 'byte-identical')).toMatchObject({ found: false });
  });

  it('reports a page that does not exist rather than silently searching everything', () => {
    expect(checkQuote(pdfExhibit, { page: 9 }, 'anything')).toEqual({
      verifiable: true, found: false, reason: 'E2 has no page 9; check the locator against the exhibit'
    });
  });

  it('declares an image unverifiable instead of guessing', () => {
    expect(checkQuote(imageExhibit, {}, 'the timestamp reads 21:00')).toEqual({
      verifiable: false, verified: 'human-check',
      reason: 'E3 is an image. The page cannot verify this quote — check it yourself.'
    });
  });

  it('refuses an empty quote, because nothing is not a proof', () => {
    expect(checkQuote(textExhibit, {}, '   ')).toEqual({
      verifiable: true, found: false, reason: 'an empty quote proves nothing; quote the exact passage relied on' });
  });

  it('declares a failed text extraction unverifiable without calling it an image', () => {
    expect(checkQuote(extractionFailedPdf, {}, 'anything')).toEqual({
      verifiable: false, verified: 'human-check',
      reason: 'E4 has no extracted text. The page cannot verify this quote — check it yourself.'
    });
  });
});
