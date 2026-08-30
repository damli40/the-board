import type { Handler } from '@netlify/functions';

/**
 * Fetches a public URL server-side and returns its bytes. Stores nothing.
 * This is what makes an exhibit `proxy-fetch` — an independent capture —
 * rather than `party-supplied`. A seat weighing two conflicting exhibits
 * should know which: `proxy-fetch` means this ~20-line function fetched the
 * URL itself; `party-supplied` means a party handed over what they say the
 * link showed.
 *
 * Every failure path here returns an ordinary HTTP response — a rejected
 * input, a failed upstream fetch, and a thrown network error all resolve to
 * a status code, never an uncaught exception. That matters beyond tidiness:
 * on the client, a failed capture is not an error. It falls back to
 * `captured: 'party-supplied'` and says so on the exhibit — the auth wall
 * winning is information, not a bug — and that fallback only works if this
 * function hands back a response for the client to read instead of leaving
 * the request hanging or the call rejecting somewhere the client didn't
 * expect.
 *
 * This is defence-in-depth plumbing, not the layer that actually holds. The
 * layer that holds is Task 4: `exposedTo` scoping WebMCP tools to an
 * origin, enforced by the browser.
 */
const MAX_BYTES = 2_000_000; // an exhibit is a document, not a disk image
const TIMEOUT_MS = 10_000;   // a slow upstream must not hold billed time open

/**
 * Refuses loopback, link-local and RFC1918 literals. `https`-only already
 * blocks the classic cloud-metadata read (that endpoint is plain http), and
 * this closes the rest of the obvious internal surface. It matches on
 * literals only: a hostname that RESOLVES to a private address still gets
 * through, which is why `redirect: 'manual'` above matters more than this
 * does. Both together are proportionate for a function whose only job is
 * fetching public evidence urls.
 */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0.0.0.0') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(fc|fd|fe80)/i.test(h)) return true; // unique-local and link-local IPv6
  return false;
}

export const handler: Handler = async (event) => {
  const target = event.queryStringParameters?.url;
  if (!target) return { statusCode: 400, body: 'url required' };

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return { statusCode: 400, body: 'not a url' };
  }
  if (parsed.protocol !== 'https:') return { statusCode: 400, body: 'https only' };
  if (isPrivateHost(parsed.hostname)) return { statusCode: 400, body: 'target not allowed' };

  try {
    // `redirect: 'manual'` on purpose. This used to follow redirects, which
    // meant the https-only and private-host checks above only ever applied to
    // the FIRST url: a public https link that 302s to somewhere internal
    // walked straight past both of them. Refusing to follow is the cheap
    // correct answer here — an exhibit url that redirects is one the client
    // can fall back to `party-supplied` for, which is a documented, visible
    // outcome rather than a silent one.
    const upstream = await fetch(parsed.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return { statusCode: 502, body: 'upstream redirected; not followed' };
    }
    if (!upstream.ok) return { statusCode: 502, body: `upstream ${upstream.status}` };

    // Cap the body. `await upstream.text()` on an unbounded response is a way
    // to have someone else decide this function's memory and bill.
    const declared = Number(upstream.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      return { statusCode: 502, body: 'upstream too large' };
    }
    const text = await upstream.text();
    if (text.length > MAX_BYTES) return { statusCode: 502, body: 'upstream too large' };

    return {
      statusCode: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: text,
    };
  } catch {
    // A network-level failure (DNS, TLS, timeout, refused connection) throws
    // rather than resolving with a bad status. Caught here so it still
    // becomes an ordinary response — never an unhandled rejection that
    // could stop the client's party-supplied fallback from running.
    return { statusCode: 502, body: 'upstream fetch failed' };
  }
};
