import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { PARENT_ORIGIN } from '../record/src/config/origins';

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
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Origin-Agent-Cluster': '?1',
      'Permissions-Policy': `tools=(self "${PARENT_ORIGIN}")`,
    },
  },
});
