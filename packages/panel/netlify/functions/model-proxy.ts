import type { Handler } from '@netlify/functions';
import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_MODEL,
  parsePanelRequest,
  schemaIsUnknown,
  toMessagesRequest,
  toProxyPlan,
} from '../../src/proxy/anthropic';

// Holds the provider key server-side so it never ships in client code — the
// repo is public (CLAUDE.md §0 "No secrets in client code"). One deployment
// of this function per panel origin, each with its own MODEL_API_KEY set in
// that Netlify site's environment, never in a file checked into the repo.
// The key is read here and handed to the SDK client constructed here; it is
// never echoed into a response body, and nothing that reaches the browser
// carries it.
//
// This function is defence in depth, not the layer that actually holds. The
// layer that holds is Task 4: `exposedTo` scoping WebMCP tools to an origin,
// enforced by the browser. Keeping the key off the client stops it leaking
// through the bundle; it does not by itself decide what a seat may do.
//
// FINAL REVIEW, BLOCKER 1: this function used to forward `event.body`
// upstream verbatim and return the upstream body verbatim. It translated
// nothing in either direction, and the panel speaks a shape no provider
// accepts or returns, so deployed it would have failed silently: the panel
// showing a goal line and then nothing. Both translations now happen here,
// in `src/proxy/anthropic.ts`, which is where the tests can reach them.
//
// Environment:
//   MODEL_API_KEY   (required) the provider key. Never committed.
//   MODEL_ID        (optional) defaults to claude-opus-5.
//   MODEL_BASE_URL  (optional) overrides the API base URL. Absent means the
//                   first-party Anthropic Messages API, which is the default
//                   provider this adapter targets.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };

  const key = process.env.MODEL_API_KEY; // set per Netlify site, never committed
  if (!key) return { statusCode: 500, body: 'proxy not configured' };

  let request;
  try {
    const panelRequest = parsePanelRequest(event.body);
    for (const tool of panelRequest.tools ?? []) {
      if (schemaIsUnknown(tool.name)) {
        // Not fatal, but never silent: the model is about to be shown a tool
        // whose parameters this adapter could not describe. See
        // UNKNOWN_TOOL_SCHEMA in src/proxy/anthropic.ts for why the call is
        // still forwarded rather than dropped.
        console.warn(`model-proxy: no input schema in the tool catalogue for "${tool.name}"`);
      }
    }
    request = toMessagesRequest(panelRequest, { model: process.env.MODEL_ID ?? DEFAULT_MODEL });
  } catch (err) {
    // A malformed request is the caller's fault and is worth saying so, in a
    // status the panel's own `res.ok` check turns into a visible
    // TRANSPORT ERROR line rather than a hang.
    return { statusCode: 400, body: err instanceof Error ? err.message : 'bad request' };
  }

  const client = new Anthropic({
    apiKey: key,
    ...(process.env.MODEL_BASE_URL ? { baseURL: process.env.MODEL_BASE_URL } : {}),
  });

  try {
    const response = await client.messages.create(request);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toProxyPlan(response)),
    };
  } catch (err) {
    // Most-specific first, so a network failure and a rate limit do not both
    // read as one anonymous 502. Every branch passes a real status through,
    // because the panel renders anything non-2xx as a TRANSPORT ERROR line
    // carrying the status. A proxy that flattened everything to 502 would
    // make "out of credit" and "DNS is down" indistinguishable on the day.
    if (err instanceof Anthropic.APIConnectionError) {
      return { statusCode: 504, body: `model provider unreachable: ${err.message}` };
    }
    if (err instanceof Anthropic.APIError) {
      return { statusCode: err.status ?? 502, body: `model provider error ${err.status ?? ''}: ${err.message}` };
    }
    return { statusCode: 502, body: `model call failed: ${err instanceof Error ? err.message : String(err)}` };
  }
};
