// An agent cannot read a PDF — it has no parser. The page can. This wrapper is
// what lets `extract_text` (Task 9) hand an agent a capability it does not
// otherwise have, on the page's terms, with every use landing on the record.
//
// The loader is injected (`load: PdfLoader = realLoader`) so this module's own
// contract — one string per page, fragments joined, empty doc -> [] — is
// testable without a binary PDF fixture. pdf.js itself is verified by hand in
// Task 9 Step 4, not here. That is a real gap in this test suite and it is
// named on purpose rather than papered over.

export type PdfLoader = (bytes: ArrayBuffer) => Promise<{
  numPages: number;
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str: string }[] }> }>;
}>;

const realLoader: PdfLoader = async (bytes) => {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  return pdfjs.getDocument({ data: bytes }).promise as any;
};

export async function extractPages(bytes: ArrayBuffer, load: PdfLoader = realLoader): Promise<string[]> {
  const doc = await load(bytes);
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    // pdf.js emits text as fragmented runs (kerning, positioning), not whole
    // lines — join with a single space so `checkQuote`'s whitespace collapse
    // (../model/quote.ts) has one canonical separator to normalise, not pdf.js's
    // internal fragmentation leaking into the record.
    pages.push(content.items.map((i) => i.str).join(' '));
  }
  return pages;
}

// The 1.5K WebMCP tool-output budget applies to what `extract_text` (Task 9)
// returns, not to this function — see ../shared/truncate.ts for why a silent
// truncation there would be load-bearing, not cosmetic. Re-exported here so a
// caller that already imports from this module doesn't need a second import
// path to reach it.
export { truncateForTool, TOOL_OUTPUT_BUDGET } from '../shared/truncate';
