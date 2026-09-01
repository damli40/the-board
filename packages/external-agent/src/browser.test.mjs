import test from 'node:test';
import assert from 'node:assert/strict';
import { actorOrigin, bareToolName, callToolInPage, listToolsInPage, parseActor } from './browser.mjs';

test('parseActor accepts only the four browser identities', () => {
  for (const actor of ['A', 'B', 'seat1', 'seat2']) assert.equal(parseActor(actor), actor);
  assert.throws(() => parseActor('controller'), /unknown actor/);
});

test('bareToolName removes only the registration prefix', () => {
  assert.equal(bareToolName('a__file_exhibit'), 'file_exhibit');
  assert.equal(bareToolName('read_board'), 'read_board');
});

test('actorOrigin maps the local five-origin setup', () => {
  assert.equal(actorOrigin('A'), 'http://localhost:8081');
  assert.equal(actorOrigin('seat2'), 'http://localhost:8084');
  assert.equal(actorOrigin('A', { A: 'https://a.example' }), 'https://a.example');
});

test('page discovery exposes bare names and preserves schemas', async () => {
  const tool = {
    name: 'a__file_exhibit',
    title: 'File an exhibit',
    description: 'File evidence.',
    inputSchema: { type: 'object', properties: { content: { type: 'string' } } },
  };
  globalThis.document = {
    modelContext: { getTools: async (options) => {
      assert.deepEqual(options, { fromOrigins: ['https://record.example'] });
      return [tool];
    } },
  };
  const listed = await listToolsInPage({ recordOrigin: 'https://record.example' });
  assert.equal(listed[0].name, 'file_exhibit');
  assert.deepEqual(listed[0].inputSchema, tool.inputSchema);
  delete globalThis.document;
});

test('page execution resolves a bare name and uses Chrome 152 JSON-string input', async () => {
  const tool = { name: 'a__file_fact' };
  let received;
  globalThis.document = {
    modelContext: {
      getTools: async () => [tool],
      executeTool: async (...args) => { received = args; return { ok: true }; },
    },
  };
  const result = await callToolInPage({
    recordOrigin: 'https://record.example',
    requestedName: 'file_fact',
    input: { text: 'supported' },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(received[0], tool);
  assert.equal(received[1], '{"text":"supported"}');
  delete globalThis.document;
});

test('every call rechecks the live list and refuses a withdrawn tool', async () => {
  let tools = [{ name: 'a__file_exhibit' }];
  globalThis.document = {
    modelContext: {
      getTools: async () => tools,
      executeTool: async () => ({ ok: true }),
    },
  };
  await callToolInPage({ recordOrigin: 'https://record.example', requestedName: 'file_exhibit', input: {} });
  tools = [];
  await assert.rejects(
    callToolInPage({ recordOrigin: 'https://record.example', requestedName: 'file_exhibit', input: {} }),
    /not granted to this origin in the current phase/
  );
  delete globalThis.document;
});

import { BoardBrowser } from './browser.mjs';

test('page discovery parses an inputSchema that Chrome hands over as a JSON string', async () => {
  const tool = { name: 'a__file_fact', description: 'x', inputSchema: '{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}' };
  globalThis.document = { modelContext: { getTools: async () => [tool] } };
  const [listed] = await listToolsInPage({ recordOrigin: 'https://record.example' });
  assert.deepEqual(listed.inputSchema, { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] });
  delete globalThis.document;
});

test('BoardBrowser attaches to the actor frame for every call, evaluates the page function there, and detaches after', async () => {
  const calls = [];
  const client = {
    attachToIframe: async (origin) => { calls.push(['attach', origin]); return 'S1'; },
    evaluate: async (sessionId, fn, arg) => {
      if (fn.name === 'pageEpoch') return 1000;
      calls.push(['evaluate', sessionId, fn.name, arg]); return 'RESULT';
    },
    send: async (method, params) => { calls.push([method, params]); return {}; },
  };
  const board = new BoardBrowser({ actor: 'A', recordOrigin: 'https://record.example/', panelOrigin: 'https://a.example/x', client });
  assert.equal(await board.callTool('file_fact', { text: 't' }), 'RESULT');
  assert.deepEqual(calls, [
    ['attach', 'https://a.example'],
    ['evaluate', 'S1', 'callToolInPage', { recordOrigin: 'https://record.example', requestedName: 'file_fact', input: { text: 't' } }],
    ['Target.detachFromTarget', { sessionId: 'S1' }],
  ]);
});

test('the first call after the page reloads is refused with a reset warning; the next call proceeds', async () => {
  let epoch = 1000;
  const client = {
    attachToIframe: async () => 'S1',
    evaluate: async (sessionId, fn) => (fn.name === 'pageEpoch' ? epoch : 'RESULT'),
    send: async () => ({}),
  };
  const board = new BoardBrowser({ actor: 'A', recordOrigin: 'https://record.example', panelOrigin: 'https://a.example', client });
  assert.equal(await board.callTool('file_fact', {}), 'RESULT');
  epoch = 2000;
  await assert.rejects(board.callTool('file_fact', {}), /the record page reloaded; the board reset to the seeded case/);
  assert.equal(await board.callTool('file_fact', {}), 'RESULT');
});

test('the background poll observes a reload without eating the warning the agent is owed', async () => {
  let epoch = 1000;
  const client = {
    attachToIframe: async () => 'S1',
    evaluate: async (sessionId, fn) => (fn.name === 'pageEpoch' ? epoch : 'RESULT'),
    send: async () => ({}),
  };
  const board = new BoardBrowser({ actor: 'A', recordOrigin: 'https://record.example', panelOrigin: 'https://a.example', client });
  assert.equal(await board.callTool('file_fact', {}), 'RESULT');
  epoch = 2000;
  // The poll (claimReset: false) sees the new epoch and still returns a list.
  assert.equal(await board.listTools({ claimReset: false }), 'RESULT');
  // The agent's next call is still the one that gets told.
  await assert.rejects(board.callTool('file_fact', {}), /the record page reloaded; the board reset to the seeded case/);
  // And only once: the call after that proceeds.
  assert.equal(await board.callTool('file_fact', {}), 'RESULT');
});

test('listToolsInPage tolerates one malformed inputSchema string; the other tool keeps its schema', async () => {
  const good = { name: 'a__file_fact', inputSchema: '{"type":"object","properties":{"text":{"type":"string"}}}' };
  const bad = { name: 'a__concede', inputSchema: '{not json' };
  globalThis.document = { modelContext: { getTools: async () => [good, bad] } };
  const [listedGood, listedBad] = await listToolsInPage({ recordOrigin: 'https://record.example' });
  assert.deepEqual(listedGood.inputSchema, { type: 'object', properties: { text: { type: 'string' } } });
  assert.deepEqual(listedBad.inputSchema, { type: 'object', properties: {} });
  delete globalThis.document;
});
