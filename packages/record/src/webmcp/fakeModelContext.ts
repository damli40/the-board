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

  /** What an agent at this origin would see if it called getTools() right now. */
  visibleTo(origin: string): string[] {
    return this.tools
      .filter((t) => t.live && t.exposedTo.includes(origin))
      .map((t) => t.name)
      .sort();
  }
}
