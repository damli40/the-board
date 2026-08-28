// Node (22+) ships a built-in `navigator` global as a getter-only accessor
// with no setter. Vitest test files run as strict-mode ESM, where assigning
// to an accessor with no setter throws `TypeError: Cannot set property
// navigator of #<Object> which has only a getter` instead of the silent
// no-op it would be in sloppy mode. Several tests in this project need to
// stub `globalThis.navigator` (see packages/record/src/webmcp/env.test.ts).
// Redefining it as a plain writable data property here, once, before any
// test file runs, makes `globalThis.navigator = ...` behave the way every
// test in this codebase assumes it does.
Object.defineProperty(globalThis, 'navigator', {
  value: globalThis.navigator,
  writable: true,
  configurable: true,
  enumerable: true,
});
