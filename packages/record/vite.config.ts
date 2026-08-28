import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev headers mirror packages/record/netlify.toml (see that file's comment:
// the origins here are localhost dev ports, not production). This lets
// `npm run dev` inside this package alone serve correct WebMCP headers, and
// scripts/dev-origins.mjs (which starts all five origins at once) inherits
// them by loading this config for its `record` server too.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    headers: {
      'Origin-Agent-Cluster': '?1',
      'Permissions-Policy':
        'tools=(self "http://localhost:8081" "http://localhost:8082" "http://localhost:8083" "http://localhost:8084")',
    },
  },
});
