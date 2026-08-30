import type { Actor, Phase } from '../model/types';

/**
 * A lifetime is a span of phases over which a set of tools exists.
 * Three overlap deliberately: the board keeps reading while it drafts, and an
 * appeal outlives nothing but its own spending.
 */
export type Lifetime = 'filing' | 'partyObject' | 'boardRead' | 'verdictDraft' | 'appealA' | 'appealB';

export const PHASE_ORDER: Phase[] = ['FILING', 'REVIEW', 'VERDICT', 'CONFIRMED'];

export const LIFETIME_WINDOW: Record<Lifetime, { startsAt: Phase; endsAfter: Phase }> = {
  filing:       { startsAt: 'FILING',  endsAfter: 'FILING'  },
  partyObject:  { startsAt: 'REVIEW',  endsAfter: 'REVIEW'  },
  boardRead:    { startsAt: 'REVIEW',  endsAfter: 'VERDICT' },
  verdictDraft: { startsAt: 'VERDICT', endsAfter: 'VERDICT' },
  appealA:      { startsAt: 'VERDICT', endsAfter: 'VERDICT' },
  appealB:      { startsAt: 'VERDICT', endsAfter: 'VERDICT' }
};

export function lifetimeIsActiveIn(lifetime: Lifetime, phase: Phase): boolean {
  const w = LIFETIME_WINDOW[lifetime];
  const at = PHASE_ORDER.indexOf(phase);
  return at >= PHASE_ORDER.indexOf(w.startsAt) && at <= PHASE_ORDER.indexOf(w.endsAfter);
}

export interface ToolSpec {
  name: string;
  lifetime: Lifetime;
  actors: Actor[];
  readOnly: boolean;
  /** The page carries machinery the agent does not have. Rendered as "(page lends)". */
  lends?: boolean;
  title: string;
  /** NEVER contains counterparty text. Tool-poisoning defence, spec §10 layer 2. */
  description: string;
  inputSchema: object;
}

const obj = (props: Record<string, unknown>, required: string[]) => ({
  type: 'object', properties: props, required
});

// Every property below carries a `description` under 150 chars — ruling 4.
// `locator` is the one that matters most: an agent has to map "page 4, lines
// 10-12" onto { page?, lines? } without guessing, so both fields spell out
// the 1-based, inclusive convention explicitly.
const nameProp = { type: 'string', description: 'A short label for the exhibit, shown in the record (e.g. "Policy PDF", "Screenshot of the thread").' };
const kindProp = { type: 'string', description: 'The exhibit format: text, pdf, image, capture, or rule (a published rule or policy).' };
const contentProp = { type: 'string', description: 'The exhibit content itself — raw text, or a data URL for pdf/image/capture kinds.' };
const sourceUrlProp = { type: 'string', description: 'Where this exhibit was captured from, if it came from a URL. Optional.' };
const exhibitIdProp = { type: 'string', description: 'The exhibit id this points into, e.g. "E1". Returned by file_exhibit or search_exhibits.' };
const factTextProp = { type: 'string', description: 'The claim being stated, in one sentence.' };
const factIdProp = { type: 'string', description: 'The fact id this refers to, e.g. "F1". Returned by file_fact.' };
const countersProp = { type: 'string', description: 'The id of the fact this one answers, if it is a rebuttal. Optional.' };
const locatorSchema = {
  type: 'object',
  description: 'Where inside the exhibit this points. Omit both fields to mean the whole document.',
  properties: {
    page: { type: 'number', description: '1-based page number, for pdf exhibits only (page 1 is the first page).' },
    lines: {
      type: 'array', items: { type: 'number' },
      description: '1-based inclusive line range as [from, to] (e.g. [10, 12] means lines 10 through 12), for text/capture exhibits only.'
    }
  }
};
const quoteProp = { type: 'string', description: 'The exact text at that locator you are relying on. Checked verbatim against the exhibit.' };
const becauseProp = { type: 'string', description: 'One sentence of reasoning connecting the quote to your claim.' };
const objectTextProp = { type: 'string', description: 'The text of the objection, in one or two sentences.' };
const pageProp = { type: 'number', description: '1-based page number to extract text from (page 1 is the first page).' };
const queryProp = { type: 'string', description: 'The search text to look for across every filed exhibit.' };
const findingProp = { type: 'string', description: 'Your conclusion: supported, contradicted, not-addressed, or cannot-tell.' };
const outcomeProp = { type: 'string', description: 'Your proposed outcome: UPHELD or OVERTURNED.' };
const reasoningProp = { type: 'string', description: 'Your reasoning for this outcome, in a few sentences.' };
const basisFactIdProp = { type: 'string', description: 'The id of the rule fact this outcome rests on, if any. Optional.' };
const reasonProp = { type: 'string', description: 'Why you are spending your appeal, in one or two sentences.' };
const contestsProp = { type: 'string', description: 'The id of the fact or citation you are contesting. Optional.' };

export const TOOLS: ToolSpec[] = [
  { name: 'file_exhibit', lifetime: 'filing', actors: ['A', 'B'], readOnly: false,
    title: 'File an exhibit',
    description: 'Attach a document to the record. Returns the exhibit id and its SHA-256.',
    inputSchema: obj({ name: nameProp, kind: kindProp, content: contentProp, sourceUrl: sourceUrlProp }, ['name', 'kind', 'content']) },

  { name: 'file_fact', lifetime: 'filing', actors: ['A', 'B'], readOnly: false,
    title: 'File a fact',
    description: 'State a claim that points into a specific exhibit at a specific page or line range.',
    inputSchema: obj({ text: factTextProp, exhibitId: exhibitIdProp, locator: locatorSchema, counters: countersProp }, ['text', 'exhibitId']) },

  { name: 'concede', lifetime: 'filing', actors: ['A', 'B'], readOnly: false,
    title: 'Concede a fact',
    description: "Accept the other side's fact as true. This narrows the dispute.",
    inputSchema: obj({ factId: factIdProp }, ['factId']) },

  // dispute is not free. You cannot mark a fact contested without opening the
  // exhibit and quoting the part you say is wrong. Same guard record_assessment
  // carries, pointed at the other party instead of a seat. This is the change
  // that makes the party-to-party layer real: evidence cannot be waved away by
  // someone who never demonstrably read it.
  { name: 'dispute', lifetime: 'filing', actors: ['A', 'B'], readOnly: false,
    title: 'Dispute a fact',
    description: 'Contest a fact by pointing at the passage you say is wrong, and saying why.',
    inputSchema: obj({ factId: factIdProp, exhibitId: exhibitIdProp, locator: locatorSchema, quote: quoteProp, because: becauseProp },
                     ['factId', 'exhibitId', 'quote', 'because']) },

  { name: 'object', lifetime: 'partyObject', actors: ['A', 'B'], readOnly: false,
    title: 'Object',
    description: 'Raise an objection while the board is reading. Recorded, not adjudicated.',
    inputSchema: obj({ text: objectTextProp }, ['text']) },

  // readOnly: FALSE — deliberately. This tool writes a read receipt, so it mutates
  // the record. Chrome's guidance says an agent uses `readOnlyHint` to decide when it
  // may skip asking the user. Annotating a state-mutating tool as read-only would be a
  // quiet lie told by a project whose entire subject is provenance. It is also the most
  // interesting line in the catalogue: here, reading is not free.
  { name: 'open_exhibit', lifetime: 'boardRead', actors: ['seat1', 'seat2'], readOnly: false,
    title: 'Open an exhibit',
    description: 'Read an exhibit. Every open lands on the record with a timestamp.',
    inputSchema: obj({ exhibitId: exhibitIdProp }, ['exhibitId']) },

  // readOnly: true is honest here — it writes nothing. But it must REFUSE on an exhibit
  // this seat has not opened, so the chain is three links, not two:
  // open_exhibit -> extract_text -> record_assessment -> cite. Costs one `hasOpened` call.
  // Parties can read during filing too, because dispute now requires it. Same tool,
  // different lifetime, different actors. Every open is receipted for parties too.
  { name: 'open_exhibit', lifetime: 'filing', actors: ['A', 'B'], readOnly: false,
    title: 'Open an exhibit',
    description: 'Read a document the other side filed. Every open lands on the record with a timestamp.',
    inputSchema: obj({ exhibitId: exhibitIdProp }, ['exhibitId']) },

  { name: 'extract_text', lifetime: 'boardRead', actors: ['seat1', 'seat2'], readOnly: true, lends: true,
    title: 'Extract text from a page',
    description: 'The page extracts text from a PDF page and returns it. The agent parses no bytes.',
    inputSchema: obj({ exhibitId: exhibitIdProp, page: pageProp }, ['exhibitId']) },

  { name: 'search_exhibits', lifetime: 'boardRead', actors: ['seat1', 'seat2'], readOnly: true, lends: true,
    title: 'Search every exhibit',
    description: 'Full-text search across everything filed. Returns hits with exhibit ids and locators.',
    inputSchema: obj({ query: queryProp }, ['query']) },

  // RENAMED from 'assess' per Chrome's naming rule: a tool name must distinguish
  // execution from initiation. Also gives the manifest's sorted output a name that
  // reads clearly next to record's other verbs.
  { name: 'record_assessment', lifetime: 'boardRead', actors: ['seat1', 'seat2'], readOnly: false,
    title: 'Record an assessment',
    description: 'Record a finding, the exact quote relied on, and one line of reasoning.',
    inputSchema: obj({ factId: factIdProp, exhibitId: exhibitIdProp, locator: locatorSchema, finding: findingProp, quote: quoteProp, because: becauseProp },
                     ['factId', 'exhibitId', 'finding', 'quote', 'because']) },

  // Positive language only — ruling 5. What it does, not what it refuses. The
  // refusal itself still throws (Task 6); the description just stops naming it.
  { name: 'cite', lifetime: 'verdictDraft', actors: ['seat1', 'seat2'], readOnly: false,
    title: 'Cite a fact in the verdict',
    description: 'Add a fact this seat has assessed to its citation list for the verdict.',
    inputSchema: obj({ factId: factIdProp }, ['factId']) },

  { name: 'draft_verdict', lifetime: 'verdictDraft', actors: ['seat1', 'seat2'], readOnly: false,
    title: 'Draft a verdict',
    description: 'Submit this seat’s draft outcome, the rule it rests on, and reasoning. A draft has no force until a human confirms it.',
    inputSchema: obj({ outcome: outcomeProp, reasoning: reasoningProp, basisFactId: basisFactIdProp }, ['outcome', 'reasoning']) },

  // RENAMED from 'appeal' per Chrome's naming rule.
  { name: 'spend_appeal', lifetime: 'appealA', actors: ['A'], readOnly: false,
    title: 'Spend your appeal',
    description: 'Re-open the review. You hold exactly one. Spending it removes it permanently.',
    inputSchema: obj({ reason: reasonProp, contests: contestsProp }, ['reason']) },

  { name: 'spend_appeal', lifetime: 'appealB', actors: ['B'], readOnly: false,
    title: 'Spend your appeal',
    description: 'Re-open the review. You hold exactly one. Spending it removes it permanently.',
    inputSchema: obj({ reason: reasonProp, contests: contestsProp }, ['reason']) }
];

/**
 * Page-owned controls. These appear in every manifest's NOT GRANTED column and
 * are never registered as tools, for any actor, in any phase. The NOT GRANTED
 * half is what turns the security claim into something you can see.
 */
export const NEVER_GRANTED = ['confirm', 'return_with_note'];

/** The universe the manifest subtracts from. */
export const ALL_TOOL_NAMES = [...new Set(TOOLS.map((t) => t.name)), ...NEVER_GRANTED];

/**
 * WebMCP tool names are unique per DOCUMENT, not per origin. The spec is
 * explicit: "If tool map[tool name] exists, then return a promise rejected
 * with an InvalidStateError DOMException."
 *
 * This design hands both advocates the same five capabilities and both seats
 * the same six. Registering each under one shared name meant Chrome accepted
 * the FIRST actor's copy and refused the second's, so Advocate B and Seat 2
 * ended up holding nothing at all. Observed in Chrome 152 on 30 Aug 2026, on
 * the first run in a real browser. No unit test caught it, because the test
 * double did not enforce uniqueness — it was more permissive than Chrome.
 *
 * It was visible at all only because `ToolRegistry` records what the browser
 * REFUSED rather than assuming every registration succeeded. Without that,
 * B's manifest would have drawn an empty GRANTED column, which looks exactly
 * like a boundary working correctly.
 *
 * So each actor's copy registers under its own name. This is not a workaround
 * for the collision; it is the honest shape of the design. The actor is closed
 * over at registration, which is what makes `actorFor(origin)` safe: there is
 * no argument B's agent can pass to reach A's tool, because B was never handed
 * a reference to it. One shared registration exposed to both origins would
 * register fine and then be UNABLE to tell the two apart — `execute` receives
 * `(inputObject, options)` and options carries only an AbortSignal, so a shared
 * tool cannot learn its caller. That is the spoofing hole this design exists
 * to close.
 *
 * The manifest is unaffected: `granted` is recorded from `spec.name`, never
 * from the registered name, so a viewer still reads "file_exhibit" in both
 * columns exactly as before.
 */
export const ACTOR_PREFIX: Record<Actor, string> = { A: 'a', B: 'b', seat1: 'seat1', seat2: 'seat2' };

/** The name a tool is registered under for one actor. Unique per document. */
export function registeredToolName(actor: Actor, tool: string): string {
  return `${ACTOR_PREFIX[actor]}__${tool}`;
}

/**
 * The inverse, for display and for schema lookup. Strips only a KNOWN actor
 * prefix, so a tool name that happens to contain `__` is returned untouched
 * rather than silently truncated at the wrong place.
 */
export function bareToolName(registered: string): string {
  for (const prefix of Object.values(ACTOR_PREFIX)) {
    if (registered.startsWith(`${prefix}__`)) return registered.slice(prefix.length + 2);
  }
  return registered;
}

// ---------------------------------------------------------------------------
// The visiting agent.
//
// Everything above is registered WITH `exposedTo`, which scopes it to one
// panel origin and is what the browser enforces. A visiting agent — Chrome's
// built-in one, or an agent driving this page from outside — is not an origin
// in that list and therefore holds nothing at all. Today it cannot read the
// phase, the manifest or the ledger without scraping pixels.
//
// CLAUDE.md sec. 4 records the seam: "a top-level document with a *missing*
// `exposedTo` exposes tools to the built-in agent". So the way to hand a
// visiting agent a capability is to register WITHOUT `exposedTo`, and that is
// exactly what `ToolRegistry.openObserver` does.
//
// TWO RULES, both load-bearing:
//
// 1. READ-ONLY, ALWAYS. A missing `exposedTo` is the widest registration this
//    codebase can make. Anything that mutates the record must never be
//    registered this way, and `registry.test.ts` fails if one ever is.
//
// 2. IT APPEARS IN THE MANIFEST. An unmanifested capability is precisely the
//    lie this project exists to prevent. The visiting agent gets its own
//    manifest row like every other actor: what it holds, and the fourteen
//    things it does not.
//
// What this is NOT: a claim that the origin partition covers the built-in
// agent. CLAUDE.md sec. 4 is explicit that it does not, and adding this must
// not be read as extending it. `confirm` is safe under either reading for the
// same reason it always was — it is never registered anywhere, to anyone.
export const OBSERVER_LABEL = 'visiting agent';

/** Not a real origin. A missing `exposedTo` is the absence of an origin scope. */
export const OBSERVER_ORIGIN = 'no origin (registered without exposedTo)';

export const OBSERVER_TOOLS: {
  name: string;
  title: string;
  description: string;
  inputSchema: unknown;
}[] = [
  {
    name: 'read_board',
    title: 'Read the whole board',
    description:
      'Returns the entire state of this page as structured data: the phase, every agent with its ' +
      'origin and what it was and was not handed, every registration the browser refused, the ' +
      'ledger of calls made so far, the case material, and any draft verdict. Read-only. Calling ' +
      'this changes nothing and is itself recorded in the ledger.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
];
