import { CdpClient } from './cdp.mjs';

const ACTORS = new Set(['A', 'B', 'seat1', 'seat2']);

export function parseActor(value) {
  if (!ACTORS.has(value)) {
    throw new Error(`unknown actor "${value}": expected A, B, seat1, or seat2`);
  }
  return value;
}

export function bareToolName(name) {
  const separator = name.indexOf('__');
  return separator === -1 ? name : name.slice(separator + 2);
}

export function actorOrigin(actor, configured = {}) {
  const defaults = {
    A: 'http://localhost:8081',
    B: 'http://localhost:8082',
    seat1: 'http://localhost:8083',
    seat2: 'http://localhost:8084',
  };
  return configured[actor] ?? defaults[actor];
}

export async function listToolsInPage({ recordOrigin }) {
  const context = document.modelContext ?? navigator.modelContext;
  if (!context?.getTools) throw new Error('WebMCP is not available in this panel');
  const tools = await context.getTools({ fromOrigins: [recordOrigin] });
  return tools.map((tool) => {
    // One tool with a malformed schema string must not blind the whole actor:
    // parse per tool, and fall back to an empty schema for that tool only.
    let inputSchema = tool.inputSchema ?? { type: 'object', properties: {} };
    if (typeof inputSchema === 'string') {
      try {
        inputSchema = JSON.parse(inputSchema);
      } catch {
        inputSchema = { type: 'object', properties: {} };
      }
    }
    return {
      registeredName: tool.name,
      name: tool.name.includes('__') ? tool.name.slice(tool.name.indexOf('__') + 2) : tool.name,
      title: tool.title ?? undefined,
      description: tool.description ?? '',
      inputSchema,
      annotations: tool.annotations ?? undefined,
    };
  });
}

export async function callToolInPage({ recordOrigin, requestedName, input }) {
  const context = document.modelContext ?? navigator.modelContext;
  if (!context?.getTools || !context?.executeTool) {
    throw new Error('WebMCP is not available in this panel');
  }
  const tools = await context.getTools({ fromOrigins: [recordOrigin] });
  const bare = (candidate) => {
    const separator = candidate.indexOf('__');
    return separator === -1 ? candidate : candidate.slice(separator + 2);
  };
  const tool = tools.find((candidate) => candidate.name === requestedName)
    ?? tools.find((candidate) => bare(candidate.name) === requestedName);
  if (!tool) {
    throw new Error(`${requestedName} is not granted to this origin in the current phase`);
  }
  // Chrome 149-152 takes a JSON string here. Keep this bridge aligned with
  // the browser surface the shipped application targets.
  return context.executeTool(tool, JSON.stringify(input ?? {}));
}

export function pageEpoch() {
  return performance.timeOrigin;
}

export class BoardBrowser {
  constructor({ cdpUrl, recordOrigin, actor, panelOrigin, client }) {
    this.actor = parseActor(actor);
    this.recordOrigin = new URL(recordOrigin).origin;
    this.panelOrigin = new URL(panelOrigin).origin;
    this.client = client ?? new CdpClient(cdpUrl);
    this.epoch = undefined;
    // Sticky: set when the frame's epoch changes, cleared only by the call
    // that actually reports it to the agent. See `inFrame`.
    this.pendingReset = false;
  }

  // Attach per call and detach after. A tab reload or navigation kills a
  // session; never caching one means there is nothing stale to hold.
  //
  // A reload also resets the whole board to the seeded case (F11), while
  // the MCP client still remembers ids from before. `performance.timeOrigin`
  // is the frame's birth time: when it changes, refuse ONCE with a warning
  // so the agent re-reads before it acts on stale ids.
  //
  // WHY THE FLAG IS STICKY, AND WHY THE POLL DOES NOT CLAIM IT. The CLI runs
  // a background `listTools` every 750 ms through this same path, inside a
  // try/catch that swallows everything. Detecting the reload and throwing in
  // one step meant the poll usually got there first, ate the one warning,
  // and the agent's next call went through as if nothing had happened —
  // acting on ids the reload had already thrown away. So detection sets a
  // flag that survives, and only a call that will actually SHOW the agent
  // the warning (`claimReset`, the default) clears it. The poll passes
  // `claimReset: false`: it observes the new epoch, leaves the warning
  // standing for whoever the agent is, and keeps its own tool list fresh.
  async inFrame(fn, arg, { claimReset = true } = {}) {
    const sessionId = await this.client.attachToIframe(this.panelOrigin);
    try {
      const epoch = await this.client.evaluate(sessionId, pageEpoch, null);
      if (this.epoch !== undefined && epoch !== this.epoch) this.pendingReset = true;
      this.epoch = epoch;
      if (this.pendingReset && claimReset) {
        this.pendingReset = false;
        throw new Error('the record page reloaded; the board reset to the seeded case; read the board again before acting');
      }
      return await this.client.evaluate(sessionId, fn, arg);
    } finally {
      await this.client.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    }
  }

  listTools(opts) {
    return this.inFrame(listToolsInPage, { recordOrigin: this.recordOrigin }, opts);
  }

  callTool(name, args) {
    return this.inFrame(callToolInPage, { recordOrigin: this.recordOrigin, requestedName: name, input: args ?? {} });
  }
}
