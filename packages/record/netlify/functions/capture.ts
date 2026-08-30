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

  try {
    const upstream = await fetch(parsed.toString(), { redirect: 'follow' });
    if (!upstream.ok) return { statusCode: 502, body: `upstream ${upstream.status}` };

    return {
      statusCode: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: await upstream.text(),
    };
  } catch {
    // A network-level failure (DNS, TLS, timeout, refused connection) throws
    // rather than resolving with a bad status. Caught here so it still
    // becomes an ordinary response — never an unhandled rejection that
    // could stop the client's party-supplied fallback from running.
    return { statusCode: 502, body: 'upstream fetch failed' };
  }
};
