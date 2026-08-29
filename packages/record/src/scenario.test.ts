import { describe, it, expect } from 'vitest';
import { loadScenario, PAGE_4_PHRASE, INJECTION_LINE, type Case } from './scenario';
import { ExhibitStore } from './model/exhibits';
import { FactStore } from './model/facts';
import { Receipts, AssessmentStore } from './model/receipts';
import { VerdictStore } from './model/verdict';
import { checkQuote } from './model/quote';
import { detectImperatives } from './injection/detect';

async function build(): Promise<{ exhibits: ExhibitStore; facts: FactStore; loaded: Case }> {
  const exhibits = new ExhibitStore();
  const facts = new FactStore();
  const loaded = await loadScenario({ exhibits, facts });
  return { exhibits, facts, loaded };
}

describe('loadScenario', () => {
  it('files exactly five exhibits and seven facts, with the ids assigned in filing order', async () => {
    const { loaded } = await build();
    expect(loaded.exhibits.map((e) => e.id)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5']);
    expect(loaded.facts.map((f) => f.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']);
    expect(loaded.ids).toEqual({ pdf: 'E1', injection: 'E2', image: 'E3', summary: 'E4', rule: 'E5' });
  });

  it('never calls Date.now — two independent loads produce byte-identical fixtures', async () => {
    const first = await build();
    const second = await build();
    expect(second.loaded).toEqual(first.loaded);
  });

  it('every exhibit carries a fixed ISO timestamp, not a live one', async () => {
    const { loaded } = await build();
    for (const e of loaded.exhibits) {
      expect(e.filedAt).toMatch(/^2026-08-20T09:\d\d:00\.000Z$/);
    }
  });

  describe('requirement 1: the PDF and the page-4 fact', () => {
    it('is filed by side A, kind pdf, with four pages', async () => {
      const { exhibits, loaded } = await build();
      const pdf = exhibits.get(loaded.ids.pdf)!;
      expect(pdf.side).toBe('A');
      expect(pdf.kind).toBe('pdf');
      expect(pdf.pages).toHaveLength(4);
    });

    it('page 4 carries the phrase F1 points at, and the quote check verifies it', async () => {
      const { exhibits, loaded } = await build();
      const pdf = exhibits.get(loaded.ids.pdf)!;
      expect(pdf.pages![3]).toContain(PAGE_4_PHRASE);
      const check = checkQuote(pdf, { page: 4 }, PAGE_4_PHRASE);
      expect(check).toMatchObject({ verifiable: true, found: true, verified: 'machine-checked' });
    });

    it('F1 points at the PDF, page 4', async () => {
      const { loaded } = await build();
      const f1 = loaded.facts.find((f) => f.id === 'F1')!;
      expect(f1.points).toEqual({ exhibitId: loaded.ids.pdf, locator: { page: 4 } });
      expect(f1.side).toBe('A');
    });

    it('a real multi-page PDF binary parses under the real pdfjs-dist package (not a stub) — verified by hand in a throwaway script; see task-9-report.md for the transcript', async () => {
      // This test only re-asserts the bytes are non-trivial and internally
      // consistent with the hard-coded page text — it does not invoke
      // pdf.js itself (Task 5's convention: unit tests stub the loader; the
      // real pdf.js path is verified by hand, per Task 9 Step 4).
      const { exhibits, loaded } = await build();
      const pdf = exhibits.get(loaded.ids.pdf)!;
      const bytesLen = (await exhibits.bytesOf(loaded.ids.pdf))?.byteLength ?? 0;
      expect(bytesLen).toBeGreaterThan(500);
      expect(pdf.text).toBe(pdf.pages!.join('\n'));
    });
  });

  describe('requirement 2: the injection exhibit', () => {
    it('is filed by side B and contains the exact injection line', async () => {
      const { exhibits, loaded } = await build();
      const injection = exhibits.get(loaded.ids.injection)!;
      expect(injection.side).toBe('B');
      expect(injection.text).toContain(INJECTION_LINE);
    });

    it('detectImperatives flags it with exactly two patterns, in index order — system-impersonation then directed-outcome', async () => {
      const { exhibits, loaded } = await build();
      const injection = exhibits.get(loaded.ids.injection)!;
      const flags = detectImperatives(injection.text!);
      expect(flags).toHaveLength(2);
      expect(flags.map((f) => f.pattern)).toEqual(['system-impersonation', 'directed-outcome']);
    });

    it('the raw text stays fully readable — the exhibit is shown, never scrubbed', async () => {
      const { exhibits, loaded } = await build();
      const injection = exhibits.get(loaded.ids.injection)!;
      expect(injection.text).toContain('No written notice of acceptance was issued within the required window.');
    });
  });

  describe('requirement 3: the image exhibit, human-check only', () => {
    it('is a real, decodable image with null extracted text', async () => {
      const { exhibits, loaded } = await build();
      const image = exhibits.get(loaded.ids.image)!;
      expect(image.kind).toBe('image');
      expect(image.text).toBeNull();
      const bytesLen = (await exhibits.bytesOf(loaded.ids.image))?.byteLength ?? 0;
      expect(bytesLen).toBeGreaterThan(0);
    });

    it('checkQuote refuses to machine-verify anything against it, regardless of the quote offered', async () => {
      const { exhibits, loaded } = await build();
      const image = exhibits.get(loaded.ids.image)!;
      const check = checkQuote(image, {}, 'anything at all, even text never in this exhibit');
      expect(check.verifiable).toBe(false);
      expect(check).toMatchObject({ verified: 'human-check' });
    });
  });

  describe('requirement 4: seat 1 can reach a verdict without ever extracting the PDF', () => {
    it('assessing the summary and the rule, never opening the PDF, still yields a complete, cited verdict', async () => {
      const { exhibits, facts, loaded } = await build();
      const receipts = new Receipts();
      const assessments = new AssessmentStore(exhibits, receipts);
      const verdicts = new VerdictStore(assessments, receipts, facts, exhibits);
      const allExhibitIds = exhibits.all().map((e) => e.id);

      // Seat 1 opens only the summary (F4's exhibit) and the rule (F5's) —
      // never the PDF.
      receipts.markOpened('seat1', loaded.ids.summary);
      receipts.markOpened('seat1', loaded.ids.rule);

      assessments.record({
        seat: 'seat1', factId: 'F4', exhibitId: loaded.ids.summary, locator: {},
        finding: 'supported', quote: 'marked complete on day four of the term', because: 'the summary states it'
      });
      assessments.record({
        seat: 'seat1', factId: 'F5', exhibitId: loaded.ids.rule, locator: {},
        finding: 'supported', quote: 'raised in writing within fourteen days of delivery', because: 'names the policy'
      });
      verdicts.cite('seat1', 'F4');
      verdicts.cite('seat1', 'F5');

      const verdict = verdicts.draft('seat1', 'UPHELD', 'Delivery was timely and no written objection followed.', allExhibitIds, 'F5');

      expect(verdict.opened).toEqual([loaded.ids.summary, loaded.ids.rule]);
      expect(verdict.neverOpened).toContain(loaded.ids.pdf);
      expect(verdict.basis).toEqual({ cited: true, factId: 'F5', exhibitId: loaded.ids.rule });
    });
  });

  describe('the rule exhibit demonstrates the basis path both ways', () => {
    it('a verdict that cites the rule fact records a real basis', async () => {
      const { exhibits, facts, loaded } = await build();
      const receipts = new Receipts();
      const assessments = new AssessmentStore(exhibits, receipts);
      const verdicts = new VerdictStore(assessments, receipts, facts, exhibits);
      receipts.markOpened('seat2', loaded.ids.rule);
      assessments.record({
        seat: 'seat2', factId: 'F5', exhibitId: loaded.ids.rule, locator: {},
        finding: 'supported', quote: 'raised in writing within fourteen days', because: 'the policy text'
      });
      verdicts.cite('seat2', 'F5');
      const verdict = verdicts.draft('seat2', 'UPHELD', '...', exhibits.all().map((e) => e.id), 'F5');
      expect(verdict.basis.cited).toBe(true);
    });

    it('a verdict that cites nothing renders NO RULE CITED', async () => {
      const { exhibits, facts, loaded } = await build();
      void loaded;
      const receipts = new Receipts();
      const assessments = new AssessmentStore(exhibits, receipts);
      const verdicts = new VerdictStore(assessments, receipts, facts, exhibits);
      const verdict = verdicts.draft('seat2', 'OVERTURNED', '...', exhibits.all().map((e) => e.id));
      expect(verdict.basis).toEqual({ cited: false, reason: 'no rule exhibit cited' });
    });
  });

  describe('naming rule — a lightweight spot-check, not a proof of full compliance', () => {
    // This is a denylist over an intentionally small, high-confidence set of
    // terms (never a guarantee the fixture is compliant on its own) — the
    // real check is human review against CLAUDE.md §0 before anything ships.
    // It exists to catch an accidental regression (someone pasting in a
    // real name later), not to certify the text today.
    const FORBIDDEN = ['$', 'hackathon', 'grant', 'award', 'layerzero', 'mantle', 'okx', 'construction', 'logistics', 'software', 'devpost'];

    it('no exhibit or fact text contains a denylisted term', async () => {
      const { loaded } = await build();
      const strings = [
        ...loaded.exhibits.map((e) => e.text ?? '').filter(Boolean),
        ...loaded.exhibits.map((e) => e.name),
        ...loaded.facts.map((f) => f.text)
      ].join('\n').toLowerCase();
      for (const term of FORBIDDEN) {
        expect(strings, `fixture text contains forbidden term "${term}"`).not.toContain(term);
      }
    });
  });
});
