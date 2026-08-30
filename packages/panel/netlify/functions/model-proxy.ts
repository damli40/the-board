import type { Handler } from '@netlify/functions';

// Holds the provider key server-side so it never ships in client code — the
// repo is public (CLAUDE.md §0 "No secrets in client code"). One deployment
// of this function per panel origin, each with its own MODEL_API_KEY /
// MODEL_BASE_URL set in that Netlify site's environment, never in a file
// checked into the repo.
//
// This function is defence in depth, not the layer that actually holds. The
// layer that holds is Task 4: `exposedTo` scoping WebMCP tools to an origin,
// enforced by the browser. Keeping the key off the client stops it leaking
// through the bundle; it does not by itself decide what a seat may do.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };

  const key = process.env.MODEL_API_KEY; // set per Netlify site, never committed
  const base = process.env.MODEL_BASE_URL; // per-provider endpoint, never committed

  if (!key || !base) return { statusCode: 500, body: 'proxy not configured' };

  const upstream = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: event.body ?? '{}',
  });

  return {
    statusCode: upstream.status,
    headers: { 'content-type': 'application/json' },
    body: await upstream.text(),
  };
};
