import type { Exhibit, ExhibitKind, Side } from './types';

export interface ExhibitInput {
  side: Side;
  kind: ExhibitKind;
  name: string;
  bytes: ArrayBuffer;
  filedAt: string;
  sourceUrl?: string;
  captured?: 'proxy-fetch' | 'party-supplied';
  /** Supplied by Task 5 for PDFs. Text exhibits decode their own. */
  pages?: string[];
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const DB_NAME = 'the-board-exhibits';
const STORE_NAME = 'blobs';

/**
 * jsdom has never implemented IndexedDB (a documented, long-standing gap —
 * `'indexedDB' in window` is false under jsdom 29, and Node has no global
 * `indexedDB` either), so BOTH vitest projects this repo runs under (node
 * and jsdom) lack it entirely. `typeof indexedDB` never throws even when the
 * identifier doesn't exist, which is what makes this feature-detection safe
 * to call from every environment.
 */
function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class ExhibitStore {
  private items: Exhibit[] = [];
  /**
   * Task 8, ruling 4: the byte map was meant to move to IndexedDB outright.
   * It moves for real wherever IndexedDB exists (every actual browser this
   * project targets — WebMCP itself requires Chrome). Where it does not
   * exist — both vitest projects, per the note on `hasIndexedDB` above —
   * this in-memory Map is the ONLY storage, so the full suite stays green
   * without either environment needing a fake or a polyfill. It is ALSO the
   * fallback for a real browser whose IndexedDB open attempt fails (fix
   * round 1, Important 3) — see `db()` below.
   */
  private memory = new Map<string, ArrayBuffer>();
  private dbPromise: Promise<IDBDatabase> | undefined;
  /**
   * Fix round 1, Important 3: set once an `openDb()` attempt actually
   * fails, so this store falls back to `memory` for the rest of the
   * session. The previous version cached the REJECTED promise in
   * `dbPromise` forever — every later `add`/`bytesOf` call re-awaited that
   * same rejection and threw, bricking storage for a browser that has
   * IndexedDB but hit one transient failure (a quota error, private mode),
   * with no fallback at all. `db()` now catches the rejection once, flips
   * this flag, and every call after that goes straight to `memory` instead
   * of re-attempting (and re-failing) the open.
   */
  private dbFailed = false;
  /**
   * Final review, Blocker 2: the id used to be derived as
   * `E${this.items.length + 1}`, read at the top of `add()`, and `add()`
   * then awaits hashing and byte storage before it pushes anything into
   * `items`. Two concurrent calls therefore read the SAME length and mint
   * the SAME id.
   *
   * That is not a theoretical race in this project, it is the documented
   * demo: `docs/evidence/hand-run.md` Step 1B fires one instruction at
   * advocates A and B simultaneously through the double prompt, and the
   * double prompt broadcasts to both panels at once. Both filings would come
   * back as the same id, `get()` would resolve it to whichever document
   * landed first, permanently, and from then on one side's fact would
   * point at the other side's document, the quote check would run against
   * text that is not theirs, and the split's differing-input list would
   * silently merge two exhibits into one. Nothing would throw.
   *
   * A monotonic counter incremented at CLAIM time closes it: the id is taken
   * before the first `await`, so no two calls can hold the same one. If a
   * filing later fails (a quota error on the byte write), its id is burned
   * and the sequence skips a number. A gap is visible and harmless; a
   * collision is invisible and corrupting.
   */
  private nextId = 1;

  /** Resolves to the database, or `undefined` when IndexedDB is absent or has failed — never rejects. */
  private async db(): Promise<IDBDatabase | undefined> {
    if (this.dbFailed || !hasIndexedDB()) return undefined;
    if (!this.dbPromise) this.dbPromise = openDb();
    try {
      return await this.dbPromise;
    } catch {
      this.dbFailed = true;
      this.dbPromise = undefined;
      return undefined;
    }
  }

  /** Writes to IndexedDB if it's available and healthy, else to the in-memory fallback. Throws on a genuine write failure (e.g. quota exceeded) — the DB was open, the write itself failed. */
  private async storeBytes(id: string, bytes: ArrayBuffer): Promise<void> {
    const db = await this.db();
    if (!db) { this.memory.set(id, bytes); return; }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(bytes, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async add(input: ExhibitInput): Promise<Exhibit> {
    // Claimed synchronously, before any await. See `nextId` above.
    const id = `E${this.nextId++}`;
    const sha256 = await sha256Hex(input.bytes);

    let text: string | null = null;
    // 'rule' MUST be in this branch. checkQuote keys off `text === null`, so a rule
    // filed without extracted text would silently fall through to 'human-check' and
    // the whole "an outcome must name a filed rule" guard would pass while proving
    // nothing. The failure would be invisible: no error, just a weaker record.
    if (input.kind === 'text' || input.kind === 'capture' || input.kind === 'rule') {
      text = new TextDecoder().decode(input.bytes);
    } else if (input.kind === 'pdf') {
      text = input.pages ? input.pages.join('\n') : null;
    }

    const exhibit: Exhibit = {
      id,
      side: input.side,
      kind: input.kind,
      name: input.name,
      sha256,
      text,
      pages: input.pages,
      sourceUrl: input.sourceUrl,
      captured: input.captured,
      filedAt: input.filedAt
    };

    // Fix round 1, Important 3: store the bytes BEFORE publishing the
    // exhibit into `items`. The previous order pushed first, so a quota or
    // private-mode failure on the `put` rejected `add()` while the exhibit
    // was already visible in `all()` with its bytes nowhere — `ExhibitImage`
    // would then show "loading image…" forever for an exhibit the record
    // claims exists. Now, if `storeBytes` throws, this function rejects and
    // `items` was never touched: the exhibit either exists with its bytes
    // reachable, or it does not exist at all.
    await this.storeBytes(id, input.bytes);
    this.items.push(exhibit);
    return exhibit;
  }

  get(id: string): Exhibit | undefined {
    return this.items.find((e) => e.id === id);
  }

  /**
   * Async because IndexedDB is inherently async (ruling 4's "bytesOf becomes
   * async"). Callers that pre-date this swap should route through
   * `Promise.resolve(store.bytesOf(id))` if they ever need to tolerate a
   * hypothetical sync implementation again — none in this codebase do; every
   * caller (ExhibitList) already awaits this.
   */
  async bytesOf(id: string): Promise<ArrayBuffer | undefined> {
    const db = await this.db();
    if (!db) return this.memory.get(id);
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  all(): Exhibit[] {
    return [...this.items];
  }
}
