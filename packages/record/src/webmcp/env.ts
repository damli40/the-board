export type WebmcpStatus = { available: boolean; reason?: string };

export function webmcpStatus(): WebmcpStatus {
  // Google's own fallback shape. `navigator.modelContext` is deprecated as of
  // Chromium 150 but is still the documented second lookup, and Chrome 149 —
  // the origin-trial floor — predates the deprecation.
  const d = (globalThis as any).document, n = (globalThis as any).navigator;
  const mc = d?.modelContext ?? n?.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') {
    return {
      available: false,
      reason: 'WebMCP not enabled. Chrome 149+ with chrome://flags/#enable-webmcp-testing.'
    };
  }
  return { available: true };
}
