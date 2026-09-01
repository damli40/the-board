// The record answers every call with a one-layer envelope (ledger.ts):
//   {"ok":true,"result":R}  or  {"refused":true,"reason":M}
// because Chrome replaces a thrown message with a generic DOMException. Only
// the OUTER envelope decides success or refusal; whatever R contains is data.
export function toMcpResult(raw) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  let envelope;
  try { envelope = JSON.parse(text); } catch { return { content: [{ type: 'text', text }] }; }
  if (envelope && typeof envelope === 'object' && envelope.refused === true) {
    return { isError: true, content: [{ type: 'text', text: `refused: ${String(envelope.reason)}` }] };
  }
  if (envelope && typeof envelope === 'object' && envelope.ok === true) {
    let inner = envelope.result;
    if (typeof inner === 'string') {
      try { inner = JSON.parse(inner); } catch { /* a plain text result */ }
    }
    return { content: [{ type: 'text', text: typeof inner === 'string' ? inner : JSON.stringify(inner, null, 2) }] };
  }
  return { content: [{ type: 'text', text }] };
}
