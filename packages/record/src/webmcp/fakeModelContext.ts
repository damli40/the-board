import { bareToolName } from './tools';

export interface RegisteredTool {
  name: string;
  description: string;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  exposedTo: string[];
  execute: (args: any) => Promise<unknown>;
  live: boolean;
}

/**
 * Stands in for document.modelContext in unit tests. Honours the one behaviour
 * that matters: a tool registered with a signal disappears when that signal aborts.
 */
export class FakeModelContext {
  tools: RegisteredTool[] = [];

  async registerTool(def: any, opts: { signal: AbortSignal; exposedTo: string[] }): Promise<void> {
    // Chrome rejects a name already held by a LIVE registration:
    //   "If tool map[tool name] exists, then return a promise rejected with an
    //    InvalidStateError DOMException."
    // Aborting a signal frees the name again (verified in Chrome 152, 30 Aug
    // 2026), so the check is against live tools only. Without this the double
    // was MORE PERMISSIVE than the browser, and 253 tests passed over a design
    // that left Advocate B and Seat 2 holding no tools at all.
    // Chrome rejects registration against an already-aborted signal
    // (CLAUDE.md sec. 1). The double used to RESOLVE, and because
    // addEventListener('abort') never fires on an already-aborted signal the
    // tool then stayed live forever — visible to its origin, impossible to
    // withdraw, and holding its name against every later registration. Same
    // "double is more permissive than the browser" class as the duplicate-name
    // gap; this closes the other half.
    if (opts.signal.aborted) {
      throw new DOMException('signal aborted', 'InvalidStateError');
    }
    if (this.tools.some((t) => t.live && t.name === def.name)) {
      throw new DOMException('Duplicate tool name', 'InvalidStateError');
    }
    const tool: RegisteredTool = {
      name: def.name,
      description: def.description,
      annotations: def.annotations,
      exposedTo: opts.exposedTo,
      execute: def.execute,
      live: true
    };
    opts.signal.addEventListener('abort', () => { tool.live = false; });
    this.tools.push(tool);
  }

  /**
   * What an agent at this origin would see if it called getTools() right now:
   * the REGISTERED names, which are scoped per actor (`a__file_exhibit`).
   */
  visibleTo(origin: string): string[] {
    return this.tools
      .filter((t) => t.live && t.exposedTo.includes(origin))
      .map((t) => t.name)
      .sort();
  }

  /**
   * The same set as CAPABILITIES, with the per-actor registration prefix
   * removed. This is what most tests mean when they ask whether one side can
   * reach a tool: `file_exhibit`, not the key it happens to be filed under.
   */
  capabilitiesVisibleTo(origin: string): string[] {
    return this.visibleTo(origin).map(bareToolName).sort();
  }
}
