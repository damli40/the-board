#!/usr/bin/env node
// Starts five Vite dev servers, one per origin, in a single Node process, so
// the app can be exercised locally the way it actually runs: five distinct
// browser origins in one tab, not five routes on one server.
//
//   record (parent) -> http://localhost:8080
//   panel   (A)      -> http://localhost:8081
//   panel   (B)      -> http://localhost:8082
//   panel   (seat1)  -> http://localhost:8083
//   panel   (seat2)  -> http://localhost:8084
//
// Each server loads its package's own vite.config.ts, which already sets the
// Origin-Agent-Cluster and Permissions-Policy headers WebMCP requires (see
// packages/record/vite.config.ts and packages/panel/vite.config.ts, which
// mirror the two netlify.toml files). This script only assigns roots and
// ports.
//
// Chrome treats http://localhost as a secure context, so plain HTTP is fine
// for local dev — no cert setup needed. This script is dev-only; production
// is five separate Netlify sites (see Step 7 of the Task 1 brief).

import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = (pkg) => path.join(__dirname, '..', 'packages', pkg);

const targets = [
  { label: 'record (parent)', pkg: 'record', port: 8080 },
  { label: 'panel (A)', pkg: 'panel', port: 8081 },
  { label: 'panel (B)', pkg: 'panel', port: 8082 },
  { label: 'panel (seat1)', pkg: 'panel', port: 8083 },
  { label: 'panel (seat2)', pkg: 'panel', port: 8084 },
];

const servers = [];

for (const target of targets) {
  const server = await createServer({
    root: packageRoot(target.pkg),
    server: {
      port: target.port,
      strictPort: true,
    },
  });
  await server.listen();
  servers.push(server);
  console.log(
    `[dev-origins] ${target.label.padEnd(16)} http://localhost:${target.port}  (packages/${target.pkg})`
  );
}

console.log('\n[dev-origins] all five origins are up. Ctrl+C to stop.\n');

const shutdown = async () => {
  console.log('\n[dev-origins] shutting down...');
  await Promise.all(servers.map((s) => s.close()));
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
