import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev headers mirror packages/panel/netlify.toml (see that file's comment:
// the origin here is the parent's localhost dev port, not production). The
// same built package is deployed to all four panel origins, so this one
// config is correct for A, B, seat1 and seat2 alike.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Origin-Agent-Cluster': '?1',
      'Permissions-Policy': 'tools=(self "http://localhost:8080")',
    },
  },
});
