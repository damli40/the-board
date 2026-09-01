#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { actorOrigin, BoardBrowser, parseActor } from './browser.mjs';
import { toMcpResult } from './envelope.mjs';

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    values[key] = value;
    index += 1;
  }
  const actor = parseActor(values.actor ?? process.env.BOARD_ACTOR ?? 'A');
  const recordUrl = values['record-url'] ?? process.env.BOARD_RECORD_URL ?? 'http://localhost:8080';
  const panelUrl = values['panel-url'] ?? process.env.BOARD_PANEL_URL ?? actorOrigin(actor);
  return {
    actor,
    recordUrl,
    panelUrl,
    cdpUrl: values.cdp ?? process.env.BOARD_CDP_URL ?? 'http://127.0.0.1:9222',
  };
}

const options = parseArgs(process.argv.slice(2));
const board = new BoardBrowser({
  actor: options.actor,
  cdpUrl: options.cdpUrl,
  recordOrigin: options.recordUrl,
  panelOrigin: options.panelUrl,
});

const server = new Server(
  { name: `the-board-${options.actor}`, version: '0.1.0' },
  { capabilities: { tools: { listChanged: true } } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = await board.listTools();
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return toMcpResult(await board.callTool(request.params.name, request.params.arguments ?? {}));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // Chrome replaces a thrown message with a generic DOMException (F3), so a
    // crash arrives here as "Tool was executed but the invocation failed…".
    // Say plainly that this is machinery, not a refusal, and where the cause is.
    const text = /invocation failed/i.test(detail)
      ? `the record's machinery failed (this is not a refusal): ${detail}. The cause is on the record page's ledger row for this call.`
      : detail;
    return { isError: true, content: [{ type: 'text', text }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

// A phase transition aborts one set of registrations and creates another.
// Tell MCP clients to refresh their native tool list when the browser surface
// changes, instead of exposing a permanent generic "call anything" escape hatch.
//
// The page itself fires a `toolchange` event on document.modelContext (verified
// on Chrome 152), but catching it from here would need a persistent CDP session
// and Runtime.addBinding just to relay one event — not worth it tonight. So the
// bridge polls the browser's tool list instead and diffs the fingerprint below.
let lastFingerprint = '';
setInterval(async () => {
  try {
    // `claimReset: false` — the poll must not consume the one page-reload
    // warning the agent is owed. See `inFrame` in browser.mjs.
    const tools = await board.listTools({ claimReset: false });
    const fingerprint = tools.map((tool) => tool.registeredName).sort().join('\n');
    if (lastFingerprint && fingerprint !== lastFingerprint) {
      await server.sendToolListChanged();
    }
    lastFingerprint = fingerprint;
  } catch {
    // The tab may be navigating or not open yet. A direct list/call request
    // still returns the actionable connection error; background polling stays quiet.
  }
}, 750).unref();
