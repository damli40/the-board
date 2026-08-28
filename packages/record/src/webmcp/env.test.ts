import { describe, it, expect, afterEach } from 'vitest';
import { webmcpStatus } from './env';

describe('webmcpStatus', () => {
  afterEach(() => { delete (globalThis as any).document; });

  it('reports unavailable when modelContext is missing', () => {
    (globalThis as any).document = {};
    (globalThis as any).navigator = {};
    expect(webmcpStatus()).toEqual({
      available: false,
      reason: 'WebMCP not enabled. Chrome 149+ with chrome://flags/#enable-webmcp-testing.'
    });
  });

  it('reports available when modelContext exists', () => {
    (globalThis as any).document = { modelContext: { registerTool: () => {} } };
    expect(webmcpStatus()).toEqual({ available: true });
  });
});
