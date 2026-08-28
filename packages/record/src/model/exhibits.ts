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

export class ExhibitStore {
  private items: Exhibit[] = [];
  private blobs = new Map<string, ArrayBuffer>();

  async add(input: ExhibitInput): Promise<Exhibit> {
    const id = `E${this.items.length + 1}`;
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

    this.items.push(exhibit);
    this.blobs.set(id, input.bytes);
    return exhibit;
  }

  get(id: string): Exhibit | undefined {
    return this.items.find((e) => e.id === id);
  }

  bytesOf(id: string): ArrayBuffer | undefined {
    return this.blobs.get(id);
  }

  all(): Exhibit[] {
    return [...this.items];
  }
}
