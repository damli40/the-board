import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two projects, split by file extension, so Tasks 2-8 (which add React
// component tests) don't need to touch this file:
//   *.test.tsx -> jsdom  (renders components, needs a DOM)
//   *.test.ts  -> node   (pure logic: tool handlers, ledger, quote checks)
// This is the `test.projects` replacement for the older `environmentMatchGlobs`
// option, which Vitest 4 no longer ships.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'jsdom',
          include: ['packages/*/src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['./vitest.setup.node.ts'],
        },
      },
    ],
  },
});
