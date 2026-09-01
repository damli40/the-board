// Raw Chrome DevTools Protocol client. No Playwright: on Chrome 152, Playwright's
// connectOverCDP reports cross-origin iframes with empty URLs, so the actor frame
// can never be found through it. Cross-origin iframes are separate debug TARGETS
// (type 'iframe') in Chrome; we attach to the one whose origin is the actor's.
// Node 22+ ships fetch and WebSocket globally.

export function pickIframeTarget(targetInfos, origin) {
  return targetInfos.find((target) => {
    if (target.type !== 'iframe') return false;
    try { return new URL(target.url).origin === origin; } catch { return false; }
  });
}

/**
 * Chrome hands back a thrown error as "Error: <message>\n    at <frame>…". The bridge's
 * refusals are meant for a person reading a terminal, so keep the message and drop the
 * stack lines and the "Error: " prefix the caller's own Error will add back.
 * Returns undefined when there is no description, so the caller can fall back to `text`.
 */
export function errorMessageFromDescription(description) {
  if (description === undefined || description === null) return undefined;
  return String(description).split('\n')[0].replace(/^Error: /, '');
}

export class CdpClient {
  constructor(cdpUrl, { timeoutMs = 20000 } = {}) {
    this.cdpUrl = cdpUrl;
    this.timeoutMs = timeoutMs;
    this.ws = undefined;
    this.nextId = 0;
    this.pending = new Map();
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    let version;
    try {
      version = await (await fetch(new URL('/json/version', this.cdpUrl))).json();
    } catch (error) {
      // Node's own message for a refused connection is just "fetch failed",
      // which says the fetch did not work and nothing about why. The reason
      // is on `error.cause` (ECONNREFUSED, ENOTFOUND, ETIMEDOUT), and that
      // is the word that tells a reader whether Chrome is not running or the
      // URL is wrong. Fall back to the message when there is no cause code.
      throw new Error(`cannot reach Chrome's debugging port at ${this.cdpUrl} (${error.cause?.code ?? error.message}); launch it with scripts/agents/chrome.sh`);
    }
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error(`websocket to ${version.webSocketDebuggerUrl} failed`));
    });
    ws.onmessage = (event) => this.receive(JSON.parse(event.data));
    ws.onclose = () => {
      // A stale socket's delayed close (after a reconnect already happened)
      // must not wipe out the new socket's in-flight requests.
      if (ws !== this.ws) return;
      this.ws = undefined;
      for (const entry of this.pending.values()) entry.reject(new Error('Chrome closed the debugging connection'));
      this.pending.clear();
    };
    this.ws = ws;
  }

  receive(message) {
    if (message.id === undefined) {
      // Target.detachedFromTarget is an event, not a response to a request.
      // A navigating or closing frame kills its session mid-call; without this,
      // whatever was pending on that session would hang until the send timeout
      // instead of failing immediately with a clear reason.
      if (message.method === 'Target.detachedFromTarget') {
        const sessionId = message.params?.sessionId;
        for (const [id, entry] of this.pending) {
          if (entry.sessionId === sessionId) {
            this.pending.delete(id);
            entry.reject(new Error('the panel frame detached mid-call (navigation or reload); read the board again before acting'));
          }
        }
      }
      return;
    }
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  }

  async send(method, params = {}, sessionId) {
    // Skip the connect() await when the socket is already open: awaiting
    // anything — even an already-resolved promise — yields a microtask tick,
    // and a caller that fires receive() right after send() (a detach arriving
    // in the same turn) would find the pending entry not registered yet.
    if (!(this.ws && this.ws.readyState === WebSocket.OPEN)) await this.connect();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome did not answer ${method} within ${this.timeoutMs} ms; is the record page still open?`));
      }, this.timeoutMs);
      const settle = (fn) => (value) => { clearTimeout(timer); fn(value); };
      this.pending.set(id, { resolve: settle(resolve), reject: settle(reject), sessionId });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  async attachToIframe(origin) {
    const { targetInfos } = await this.send('Target.getTargets');
    const target = pickIframeTarget(targetInfos, origin);
    if (!target) {
      throw new Error(`no iframe for ${origin} in the Chrome at ${this.cdpUrl}; open the record page there, and check --panel-url matches the panel's origin exactly`);
    }
    const { sessionId } = await this.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    return sessionId;
  }

  /** Runs a self-contained function inside the frame. `arg` crosses as JSON. */
  async evaluate(sessionId, fn, arg) {
    const expression = `(${fn.toString()})(${JSON.stringify(arg)})`;
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) {
      throw new Error(errorMessageFromDescription(result.exceptionDetails.exception?.description) ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }
}
