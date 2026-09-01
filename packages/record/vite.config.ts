import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { ORIGIN, PROD_PARENT_ORIGIN } from './src/config/origins';

// Dev headers mirror packages/record/netlify.toml (see that file's comment:
// the origins here are localhost dev ports, not production). Both this file
// and netlify.toml are covered by
// packages/record/src/config/netlify-headers.test.ts, which fails if either
// one drifts from src/config/origins.ts — the single source of truth for
// every origin string in this repo.
const PANEL_ORIGINS = Object.values(ORIGIN)
  .map((origin) => `"${origin}"`)
  .join(' ');

/**
 * Task 9: the canonical <link> and the absolute og:image URL both need the
 * real production origin baked into the served/built HTML. Task 9's own
 * brief: "Never hardcode an origin string into the HTML." Injected here,
 * from origins.ts's own PROD_PARENT_ORIGIN, instead — this is the one file
 * that is allowed to know what that origin is; index.html itself never does
 * (see the comment left in its place there). Covered by
 * build-output.test.ts, which builds this package (and the panel's) for
 * real and reads the resulting dist/, rather than trusting this docblock.
 *
 * Uses PROD_PARENT_ORIGIN specifically, not the dev/prod-resolved
 * PARENT_ORIGIN that `import.meta.env.PROD` switches on: a canonical URL and
 * a social-preview image always describe the one real published site, even
 * on the rare occasion this HTML is being reviewed from a local `vite`
 * dev server.
 */
function canonicalAndOgImagePlugin(): Plugin {
  return {
    name: 'the-board-canonical-and-og-image',
    transformIndexHtml() {
      return [
        {
          tag: 'link',
          attrs: { rel: 'canonical', href: `${PROD_PARENT_ORIGIN}/` },
          injectTo: 'head',
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: `${PROD_PARENT_ORIGIN}/the-board-lockup.jpg` },
          injectTo: 'head',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), canonicalAndOgImagePlugin()],
  server: {
    headers: {
      'Origin-Agent-Cluster': '?1',
      'Permissions-Policy': `tools=(self ${PANEL_ORIGINS})`,
    },
  },
});
