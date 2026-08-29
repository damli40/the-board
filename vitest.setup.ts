import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// This project's test files import `describe`/`it`/`expect` explicitly from
// 'vitest' rather than relying on `test.globals` (see vitest.config.ts — no
// `globals: true` is set for either project). @testing-library/react's
// auto-cleanup detects a test framework by looking for a GLOBAL `afterEach`,
// so without this it silently never runs: every `render()` in a file stays
// mounted into the same jsdom `document` for the rest of that file, and the
// next test's query matches every previous test's leftover markup too
// (`getByTestId` throws "found multiple elements", `getAllByTestId` returns
// duplicates). Task 8 is the first task to add a `.test.tsx` file, which is
// why this was unnoticed until now — registering cleanup explicitly here
// makes every test file get an isolated DOM per test, present and future,
// without each file having to remember to import it.
afterEach(() => cleanup());
