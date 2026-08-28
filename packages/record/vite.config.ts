import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { ORIGIN } from './src/config/origins';

// Dev headers mirror packages/record/netlify.toml (see that file's comment:
// the origins here are localhost dev ports, not production). Both this file
// and netlify.toml are covered by
// packages/record/src/config/netlify-headers.test.ts, which fails if either
// one drifts from src/config/origins.ts — the single source of truth for
// every origin string in this repo.
const PANEL_ORIGINS = Object.values(ORIGIN)
  .map((origin) => `"${origin}"`)
  .join(' ');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Origin-Agent-Cluster': '?1',
      'Permissions-Policy': `tools=(self ${PANEL_ORIGINS})`,
    },
  },
});
