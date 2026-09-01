// One redaction routine, used on BOTH sides of the model proxy.
//
// It used to live only in handler.ts, which meant the SERVER scrubbed keys
// out of upstream error text while the BROWSER did not scrub them out of
// its own. Task 2b review, C1: `fetch` itself throws before sending when a
// header value contains a control character, and at least one runtime
// (undici, which is what this repo's tests run on) puts the whole offending
// value into the TypeError's message:
//
//     Headers.append: "sk-ant-REAL-KEY\nx-injected: 1" is an invalid header value.
//
// loop.ts catches that and renders it as a visible log card, so the key
// lands on screen — and, when someone is filming the demo, in the footage.
// Chrome's wording is believed to omit the value, but "believed" is not a
// guarantee, and a browser's error string is not something this project
// controls. Lifted here so the panel can apply the identical scrub before
// any caught message becomes an entry.
//
// Kept free of every server-side import on purpose: handler.ts pulls in
// ProxyEnv, the gate checks and the provider table, none of which belong in
// a browser bundle. This module is two functions and no dependencies, so
// both hosts can import it without dragging the other's world along.

/**
 * Replaces every occurrence of `key` in `text` with `[redacted]`. Applied
 * BEFORE any length cap: capping first could slice through the middle of
 * the key, leaving a fragment that no longer matches and slips past this
 * untouched (handler.ts I2, fix round 1).
 *
 * An empty or non-string `key` is a no-op rather than an error — a caller
 * scrubbing "whatever key might be configured" should not have to check
 * first, and `''.split()` would otherwise shred the text into characters.
 */
export function redactKey(text: string, key: string | undefined): string {
  return key ? text.split(key).join('[redacted]') : text;
}

/**
 * Scrubs a key out of `text` in every form it could plausibly appear in.
 *
 * The stored value and the value actually put on the wire are not always
 * the same string: `modelConfigHeaders()` sends the TRIMMED key, so an
 * error quoting the wire value would survive a redaction that only knew
 * the raw stored one (and vice versa). Both are removed, longest first, so
 * a trimmed key that is a substring of the raw one cannot leave the
 * surrounding whitespace-padded remainder behind.
 */
export function redactKeyVariants(text: string, key: string | undefined): string {
  if (typeof key !== 'string' || !key) return text;
  const variants = [...new Set([key, key.trim()])].filter(Boolean).sort((a, b) => b.length - a.length);
  return variants.reduce((acc, variant) => redactKey(acc, variant), text);
}
