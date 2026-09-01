import test from 'node:test';
import assert from 'node:assert/strict';
import { CdpClient, errorMessageFromDescription, pickIframeTarget } from './cdp.mjs';

test('pickIframeTarget selects the iframe target whose origin matches, ignoring pages and srcdoc frames', () => {
  const targets = [
    { type: 'page', targetId: 'p1', url: 'https://theboard-record.netlify.app/?code=x' },
    { type: 'iframe', targetId: 'i0', url: 'about:srcdoc' },
    { type: 'iframe', targetId: 'i1', url: 'https://theboard-a.netlify.app/?actor=A&code=x' },
    { type: 'iframe', targetId: 'i2', url: 'https://theboard-b.netlify.app/?actor=B&code=x' },
  ];
  assert.equal(pickIframeTarget(targets, 'https://theboard-a.netlify.app')?.targetId, 'i1');
  assert.equal(pickIframeTarget(targets, 'https://theboard-record.netlify.app'), undefined);
  assert.equal(pickIframeTarget(targets, 'https://theboard-seat1.netlify.app'), undefined);
});

test('send rejects if Chrome does not answer within the timeout', async () => {
  const client = new CdpClient('http://127.0.0.1:9222', { timeoutMs: 20 });
  client.connect = async () => {};
  client.ws = { readyState: WebSocket.OPEN, send() {} };
  await assert.rejects(client.send('Runtime.evaluate'), /did not answer/);
});

test('a detached session rejects its pending call instead of hanging until the timeout', async () => {
  const client = new CdpClient('http://127.0.0.1:9222', { timeoutMs: 20000 });
  client.connect = async () => {};
  client.ws = { readyState: WebSocket.OPEN, send() {} };
  const pending = client.send('Runtime.evaluate', {}, 'S1');
  client.receive({ method: 'Target.detachedFromTarget', params: { sessionId: 'S1' } });
  await assert.rejects(pending, /the panel frame detached mid-call/);
});

test('an unreachable debugging port names the cause, not just "fetch failed"', async () => {
  const client = new CdpClient('http://127.0.0.1:9222');
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    const error = new TypeError('fetch failed');
    error.cause = { code: 'ECONNREFUSED' };
    throw error;
  };
  try {
    await assert.rejects(
      client.connect(),
      (error) => error.message === "cannot reach Chrome's debugging port at http://127.0.0.1:9222 (ECONNREFUSED); launch it with scripts/agents/chrome.sh",
    );
    // No cause code: fall back to the message rather than printing undefined.
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(client.connect(), /\(fetch failed\)/);
  } finally {
    globalThis.fetch = original;
  }
});

test('errorMessageFromDescription keeps only the message line, without the Error: prefix', () => {
  const description = 'Error: object is not granted to this origin in the current phase\n    at callToolInPage (<anonymous>:14:11)';
  assert.equal(errorMessageFromDescription(description), 'object is not granted to this origin in the current phase');
  assert.equal(errorMessageFromDescription('boom'), 'boom');
  assert.equal(errorMessageFromDescription(undefined), undefined);
});

test('evaluate throws the refusal alone: no stack line, and it falls back to text when there is no description', async () => {
  const client = new CdpClient('http://127.0.0.1:9222');
  const evaluateWith = async (exceptionDetails) => {
    client.send = async () => ({ exceptionDetails });
    return client.evaluate('S1', () => {}, undefined);
  };
  await assert.rejects(
    evaluateWith({ exception: { description: 'Error: object is not granted to this origin in the current phase\n    at callToolInPage (<anonymous>:14:11)' }, text: 'Uncaught' }),
    (error) => error.message === 'object is not granted to this origin in the current phase',
  );
  await assert.rejects(
    evaluateWith({ exception: { description: 'boom' }, text: 'Uncaught' }),
    (error) => error.message === 'boom',
  );
  await assert.rejects(
    evaluateWith({ exception: { description: undefined }, text: 'Uncaught' }),
    (error) => error.message === 'Uncaught',
  );
});
