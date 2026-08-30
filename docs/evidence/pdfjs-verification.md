# pdf.js verification: real package, real bytes

**What this proves.** The exact PDF bytes `packages/record/src/scenario.ts` embeds as exhibit `E1`
("Delivery log") are a genuine, syntactically valid PDF, and the real `pdfjs-dist` package this repo
depends on (not the fake loader `pdf/extract.test.ts` stubs out for the unit suite) extracts the
exact text this project's tool bodies and quote checks expect, page by page.

**What this does not prove.** It does not prove this project's own browser-side pdf.js wiring works:
the Vite-bundled worker path, loaded inside an actual Chrome tab, is a different code path than
`pdfjs-dist`'s legacy Node build used here. That check is prescribed step by step in
[`docs/evidence/hand-run.md`](hand-run.md) ("Verifying pdf.js against a real PDF") and has not yet
been run. Until it is, treat this file as proof that the bytes and the package are sound, not as
proof of the browser path.

Run on 2026-08-30, Node v25.8.1, `pdfjs-dist@6.2.108` (the exact version pinned in
`packages/record/package.json`), from a plain script outside this repo's test suite, against the
identical `pdfjs-dist/legacy/build/pdf.mjs` entry point a Node environment resolves to.

## The script

The base64 string below is copied verbatim from `packages/record/src/scenario.ts`'s
`DELIVERY_LOG_PDF_BASE64` constant (that constant is private to the module, not exported, so this
script inlines the identical string rather than importing it) — the same bytes exhibit `E1` is filed
with in the seeded demo scenario, not a different or freshly generated PDF.

```js
// verify-pdfjs.mjs — standalone, not part of the test suite or the app's module graph.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const DELIVERY_LOG_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUiA1IDAgUiA3IDAgUiA5IDAgUl0gL0NvdW50IDQgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSAxMSAwIFIgPj4gPj4gL01lZGlhQm94IFswIDAgNjEyIDc5Ml0gL0NvbnRlbnRzIDQgMCBSID4+CmVuZG9iago0IDAgb2JqCjw8IC9MZW5ndGggMTI3ID4+CnN0cmVhbQpCVCAvRjEgMTIgVGYgNzIgNzIwIFRkIChQYWdlIDEgb2YgdGhlIGRlbGl2ZXJ5IGxvZy4gVGhpcyByZWNvcmQgZG9jdW1lbnRzIGVhY2ggc3RhZ2Ugb2YgcGVyZm9ybWFuY2UgdW5kZXIgdGhlIGFncmVlbWVudC4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9SZXNvdXJjZXMgPDwgL0ZvbnQgPDwgL0YxIDExIDAgUiA+PiA+PiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNiAwIFIgPj4KZW5kb2JqCjYgMCBvYmoKPDwgL0xlbmd0aCAxMzAgPj4Kc3RyZWFtCkJUIC9GMSAxMiBUZiA3MiA3MjAgVGQgKFBhZ2UgMiBvZiB0aGUgZGVsaXZlcnkgbG9nLiBJbnRlcm1lZGlhdGUgbWlsZXN0b25lcyB3ZXJlIHRyYWNrZWQgaGVyZSwgd2l0aCBkYXRlcyBhbmQgc3RhdHVzIG5vdGVzLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago3IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgMTEgMCBSID4+ID4+IC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdIC9Db250ZW50cyA4IDAgUiA+PgplbmRvYmoKOCAwIG9iago8PCAvTGVuZ3RoIDExOSA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDcyIDcyMCBUZCAoUGFnZSAzIG9mIHRoZSBkZWxpdmVyeSBsb2cuIE5vIGV4Y2VwdGlvbnMgd2VyZSByYWlzZWQgYnkgZWl0aGVyIHBhcnR5IGR1cmluZyB0aGlzIHN0YWdlLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago5IDAgb2JqCjw8IC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgMTEgMCBSID4+ID4+IC9NZWRpYUJveCBbMCAwIDYxMiA3OTJdIC9Db250ZW50cyAxMCAwIFIgPj4KZW5kb2JqCjEwIDAgb2JqCjw8IC9MZW5ndGggMTM0ID4+CnN0cmVhbQpCVCAvRjEgMTIgVGYgNzIgNzIwIFRkIChQYWdlIDQgb2YgdGhlIGRlbGl2ZXJ5IGxvZy4gRGVsaXZlcnkgd2FzIGNvbXBsZXRlZCBvbiBkYXkgZm91ciBvZiB0aGUgdGVybSwgd2l0aGluIHRoZSBhZ3JlZWQgZGVhZGxpbmUuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjExIDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDEyCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMzMgMDAwMDAgbiAKMDAwMDAwMDI2MCAwMDAwMCBuIAowMDAwMDAwNDM4IDAwMDAwIG4gCjAwMDAwMDA1NjUgMDAwMDAgbiAKMDAwMDAwMDc0NiAwMDAwMCBuIAowMDAwMDAwODczIDAwMDAwIG4gCjAwMDAwMDEwNDMgMDAwMDAgbiAKMDAwMDAwMTE3MSAwMDAwMCBuIAowMDAwMDAxMzU3IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgMTIgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE0MjgKJSVFT0Y=';

function base64ToBytes(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

const PAGE_4_PHRASE = 'Delivery was completed on day four of the term';

async function main() {
  const data = base64ToBytes(DELIVERY_LOG_PDF_BASE64);
  const doc = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
  console.log('numPages', doc.numPages);

  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str).join('');
    pages.push(text);
    console.log(`--- page ${i} ---`);
    console.log(text);
  }

  const page4 = pages[3];
  const found = page4.includes(PAGE_4_PHRASE);
  console.log('');
  console.log('PAGE_4_PHRASE present on page 4:', found);
  if (!found) {
    console.error('VERIFICATION FAILED: quote not found');
    process.exit(1);
  }
  console.log('VERIFICATION PASSED');
}

main().catch((err) => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});
```

## The output

Captured verbatim, unedited, from the run described above:

```
numPages 4
Warning: UnknownErrorException: Ensure that the `standardFontDataUrl` API parameter is provided.
--- page 1 ---
Page 1 of the delivery log. This record documents each stage of performance under the agreement.
--- page 2 ---
Page 2 of the delivery log. Intermediate milestones were tracked here, with dates and status notes.
--- page 3 ---
Page 3 of the delivery log. No exceptions were raised by either party during this stage.
--- page 4 ---
Page 4 of the delivery log. Delivery was completed on day four of the term, within the agreed deadline.

PAGE_4_PHRASE present on page 4: true
VERIFICATION PASSED
```

**Reading the warning.** `UnknownErrorException: Ensure that the standardFontDataUrl API parameter is
provided` is cosmetic: it is pdf.js complaining about missing glyph-metrics data used for *rendering*
a page to a canvas. This script never renders anything; text extraction reads content-stream
operators (`Tj`/`TJ` show-text instructions), not glyph outlines, so the warning does not affect the
result. The four page strings above match `packages/record/src/scenario.ts`'s
`DELIVERY_LOG_PAGES` array exactly, and page 4 contains the exact phrase
(`PAGE_4_PHRASE`, exported from `scenario.ts`) that fact `F1` points at and that
`checkQuote` verifies against when a seat assesses it.

## Why this matters to the submission

`packages/record/src/pdf/extract.test.ts` stubs the pdf.js loader entirely, on purpose, so the unit
suite stays fast and deterministic. That means the 210/210 test count does not, by itself, prove the
real `pdfjs-dist` package can parse a real PDF at all. This file is that missing proof, run against
the exact bytes this project ships as its own demo exhibit, not a synthetic example built only to
pass this check.
