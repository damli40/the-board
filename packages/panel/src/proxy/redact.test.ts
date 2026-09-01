// Fix round 1, C1. `redactKey` used to live inside handler.ts with no test
// of its own — its behaviour was only ever observed through the proxy's
// error paths. It is now shared with the browser side, where it is the last
// thing standing between an API key and a rendered log card, so it gets
// asserted directly.
import { describe, it, expect } from 'vitest';
import { redactKey, redactKeyVariants } from './redact';

describe('redactKey', () => {
  it('replaces every occurrence, not just the first', () => {
    expect(redactKey('a KEY b KEY c', 'KEY')).toBe('a [redacted] b [redacted] c');
  });

  it('is a no-op for an empty key rather than shredding the text into characters', () => {
    expect(redactKey('nothing to hide', '')).toBe('nothing to hide');
  });

  it('is a no-op for an undefined key, so a caller scrubbing "whatever might be configured" need not check first', () => {
    expect(redactKey('nothing to hide', undefined)).toBe('nothing to hide');
  });

  it('leaves text that does not contain the key exactly as it was', () => {
    expect(redactKey('model proxy responded 503', 'sk-SECRET')).toBe('model proxy responded 503');
  });
});

describe('redactKeyVariants', () => {
  it('removes the raw stored form', () => {
    expect(redactKeyVariants('saw   sk-SECRET   here', '  sk-SECRET  ')).not.toContain('sk-SECRET');
  });

  it('removes the TRIMMED form too — the form actually sent, which a raw-only scrub would miss', () => {
    // This is the case that matters: storage holds the padded value,
    // modelConfigHeaders() sends the trimmed one, and an error quoting the
    // wire value contains only the trimmed one.
    const out = redactKeyVariants('header value was sk-SECRET here', '  sk-SECRET  ');
    expect(out).not.toContain('sk-SECRET');
    expect(out).toContain('[redacted]');
  });

  it('redacts the longest form first, so the shorter one cannot leave a padded remainder behind', () => {
    const out = redactKeyVariants('exact:   sk-SECRET  |trimmed:sk-SECRET', '  sk-SECRET  ');
    expect(out).not.toContain('sk-SECRET');
  });

  it('leaves the message otherwise intact — this redacts, it does not swallow', () => {
    const out = redactKeyVariants('Headers.append: "sk-SECRET" is an invalid header value.', 'sk-SECRET');
    expect(out).toBe('Headers.append: "[redacted]" is an invalid header value.');
  });

  it('is a no-op for a missing or non-string key', () => {
    expect(redactKeyVariants('text', undefined)).toBe('text');
    expect(redactKeyVariants('text', '')).toBe('text');
    expect(redactKeyVariants('text', 12345 as unknown as string)).toBe('text');
  });
});
