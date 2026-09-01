import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { PARENT_ORIGIN, DEMO_ROOM_CODE } from '../record/src/config/origins';
import { handleProxy, type ProxyEnv } from './src/proxy/handler';

const MODEL_PROXY_PATH = '/.netlify/functions/model-proxy';

/**
 * Mounts the model proxy on Vite's own dev server, calling the exact same
 * `handleProxy` the deployed Netlify function calls
 * (packages/panel/netlify/functions/model-proxy.ts). Without this,
 * `npm run dev:origins` serves a 404 for every model call and `?offline=1`
 * is the only mode that works — this is what makes a plain `npm run dev`
 * runnable at all (task 1 brief, §1e).
 *
 * Two dev-only defaults, neither reachable from the deployed function (that
 * one hardcodes `allowPrivateHosts: false` and reads ROOM_CODE with no
 * fallback — see model-proxy.ts):
 *   - ROOM_CODE defaults to the demo room code when unset. Safe ONLY here:
 *     localhost is not a public endpoint, so a reader who never set the
 *     variable still gets a working local demo instead of a 500, and no
 *     deployed site's funded key is ever reachable through this default.
 *   - allowPrivateHosts is always true, so a local Ollama or LM Studio
 *     server (an http://localhost base url) works without relaxing
 *     anything in production.
 */
function modelProxyDevMiddleware(): Plugin {
  return {
    name: 'the-board-model-proxy-dev-middleware',
    configureServer(server) {
      server.middlewares.use(MODEL_PROXY_PATH, async (req, res) => {
        // Fix round 1, C2: this used to have no try/catch at all. handleProxy
        // can throw — a wire adapter's toRequest calls toApiMessages, which
        // throws on an empty/unusable message list — and an unhandled
        // rejection here means `res.end()` is never reached: the browser
        // request just hangs forever with no response, ever. Deployed to
        // Netlify the same throw becomes an opaque 500, which is bad enough;
        // in dev it is a hang, which is the exact failure this whole
        // middleware exists to prevent (§1e). Every path below now ends the
        // response one way or another.
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : null;

          const headers: Record<string, string | undefined> = {};
          for (const [key, value] of Object.entries(req.headers)) {
            headers[key] = Array.isArray(value) ? value.join(', ') : value;
          }

          const env: ProxyEnv = {
            ROOM_CODE: process.env.ROOM_CODE ?? DEMO_ROOM_CODE,
            MODEL_API_KEY: process.env.MODEL_API_KEY,
            MODEL_ID: process.env.MODEL_ID,
            MODEL_PROVIDER: process.env.MODEL_PROVIDER,
            MODEL_BASE_URL: process.env.MODEL_BASE_URL,
            RATE_LIMIT: process.env.RATE_LIMIT,
            allowPrivateHosts: true,
          };

          const result = await handleProxy({ method: req.method ?? 'GET', headers, body }, env);

          res.statusCode = result.statusCode;
          for (const [key, value] of Object.entries(result.headers ?? {})) {
            res.setHeader(key, value);
          }
          res.end(result.body);
        } catch (err) {
          // handleProxy itself is written not to throw (every one of its own
          // gates returns a status instead), so reaching this is a genuine
          // bug in this middleware's own plumbing (reading the request body,
          // say) rather than an ordinary rejected call. Still answered with
          // a real response, never a hang — and never the raw error object,
          // which could carry anything.
          res.statusCode = 500;
          res.setHeader('content-type', 'text/plain');
          res.end(`model proxy dev middleware failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
  };
}

// Dev headers mirror packages/panel/netlify.toml (see that file's comment:
// the origin here is the parent's localhost dev port, not production). The
// same built package is deployed to all four panel origins, so this one
// config is correct for A, B, seat1 and seat2 alike. This file and
// netlify.toml are both covered by
// packages/record/src/config/netlify-headers.test.ts, which fails if either
// one drifts from packages/record/src/config/origins.ts — the single source
// of truth for every origin string in this repo, imported here via a
// relative path across the package boundary rather than re-declared.
export default defineConfig({
  plugins: [react(), tailwindcss(), modelProxyDevMiddleware()],
  server: {
    headers: {
      'Origin-Agent-Cluster': '?1',
      'Permissions-Policy': `tools=(self "${PARENT_ORIGIN}")`,
    },
  },
});
