// Task 2a, Part 2 — the setup form: one place to put a model key per actor,
// per copy-final.md's "The setup block (Task 2)" section (the corrected,
// authoritative copy — read fresh the day this was built, not the older
// draft in task-2-brief.md, which differs by a few words in the positioning
// line).
//
// The headline the copy makes, and the reason this form exists at all:
// Advocate A can run on one company's model and Advocate B on another's.
// "My AI argues against your AI" stops being a metaphor and becomes
// something a viewer can see in the manifest — two different providers,
// side by side, arguing the same file.
//
// Reuses `ui/theme.ts` (ACTORS order, ACTOR_LABEL) and the panel package's
// own provider registry (`packages/panel/src/proxy/providers.ts`) by
// relative cross-package import — the same convention `ui/theme.ts`'s own
// header comment documents (`packages/panel/src/App.tsx` already imports
// that file the same way, and both packages share one tsconfig.json). No
// second provider list is invented here.
//
// Status line. Fix round 1, C2 (Critical, a demo blocker): the original
// status string, `no key — this agent runs scripted`, was wrong in all
// four reachable states, and wrong in the direction that costs money — on
// a deployed site with `MODEL_API_KEY` set, it read "scripted" while the
// agent made live calls on the operator's own funded key. The record
// cannot know how a panel will actually run; it only knows whether THIS
// browser currently holds a key for that agent. Every status string below
// is scoped to that one fact, per copy-final.md's corrected ruling (31
// Aug), and nothing stronger.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Actor } from '../model/types';
import { ACTORS, ACTOR_LABEL } from './theme';
import { DEMO_ROOM_CODE } from '../config/origins';
import { PROVIDERS, providerById } from '../../../panel/src/proxy/providers';
import {
  loadConfigs,
  saveConfigs,
  redactKey,
  buildActorConfig,
  ROOM_CODE_STORAGE_KEY,
  type AgentConfigs,
  type AgentConfigFields,
} from '../model/agentConfig';

const STATUS_NO_KEY = 'no key set here';
const STATUS_SENT = 'sent';
const SENT_DISPLAY_MS = 2000;

function emptyRow(): AgentConfigFields {
  return { provider: PROVIDERS[0].id, model: '', key: '', baseUrl: '' };
}

type FormRow = ReturnType<typeof emptyRow>;

function rowFromConfig(config: AgentConfigs[Actor]): FormRow {
  if (!config) return emptyRow();
  return { provider: config.provider, model: config.model, key: config.key, baseUrl: config.baseUrl ?? '' };
}

function buildInitialRows(loaded: AgentConfigs): Record<Actor, FormRow> {
  return Object.fromEntries(ACTORS.map((actor) => [actor, rowFromConfig(loaded[actor])])) as Record<Actor, FormRow>;
}

/**
 * Fix round 1, I3: this used to read `sessionStorage` then fall back
 * straight to `DEMO_ROOM_CODE`, never looking at the record's own `?code=`
 * query param — which is the ONE thing `App.tsx`'s `roomCodeParam()`
 * actually uses to load the four panel frames. Open `…/record/?code=
 * secret-xyz` and, before this fix, the frames carried `secret-xyz` while
 * this field displayed (and, on Save, transmitted) `board-demo-2026` to
 * every one of them — a wrong number on screen today, and (once a later
 * task writes a received code into a panel's own storage) a `401 room code
 * rejected` on any panel reload. Same precedence `App.tsx`'s own
 * `roomCodeParam()` and `loop.ts`'s `roomCodeHeader()` already use: the
 * URL is the live instruction for THIS load, storage is what survived a
 * previous one, the demo default is the last resort.
 */
function readStoredRoomCode(): string {
  try {
    const fromUrl = new URLSearchParams(globalThis.location?.search ?? '').get('code');
    if (fromUrl) return fromUrl;
    return globalThis.sessionStorage?.getItem(ROOM_CODE_STORAGE_KEY) ?? DEMO_ROOM_CODE;
  } catch {
    return DEMO_ROOM_CODE;
  }
}

/**
 * Fix round 1, C2 + I4: renders the saved model and says nothing when it is
 * blank, rather than inventing a default. The prior version rendered
 * `config.model || providerDef.defaultModel || 'default model'` — for
 * `openai-compatible` (which has NO `defaultModel`, by design: the whole
 * point of that provider entry is that the caller supplies one) a blank
 * model rendered the literal string `default model`, naming a default that
 * does not exist for a call the proxy will refuse outright ("model id
 * required"). And with `MODEL_ID` set in a deployed site's own environment,
 * the row claimed `claude-opus-5` while the proxy actually resolves the env
 * value — a second, unrelated invented number. This function now says only
 * what THIS browser actually has stored.
 */
function statusText(config: AgentConfigs[Actor]): string {
  if (!config) return STATUS_NO_KEY;
  const providerLabel = providerById(config.provider)?.label ?? config.provider;
  const redacted = redactKey(config.key);
  const model = config.model.trim();
  return model ? `${providerLabel} · ${model} · ${redacted}` : `${providerLabel} · ${redacted}`;
}

export interface SetupProps {
  /** Called once per Save click, with the built configs (hazard-gated —
   *  never an actor entry with an empty key) and the shared room code. The
   *  caller (App.tsx) is what actually posts `board:model-config` to each
   *  frame; this component only ever decides WHAT to send, never how. */
  onSave: (configs: AgentConfigs, roomCode: string) => void;
}

export function Setup({ onSave }: SetupProps) {
  const [initialLoaded] = useState<AgentConfigs>(() => loadConfigs());
  const [rows, setRows] = useState<Record<Actor, FormRow>>(() => buildInitialRows(initialLoaded));
  const [roomCode, setRoomCode] = useState<string>(() => readStoredRoomCode());
  const [savedConfigs, setSavedConfigs] = useState<AgentConfigs>(initialLoaded);
  // Open by default when no key is set anywhere yet; collapsed once one is,
  // and collapsed when the URL itself arrived configured: `?code=` means the
  // deployed panels hold their own key and the room code is in the link,
  // `?offline=1` means scripted mode and no key is needed. Same parse as
  // App.tsx's roomCodeParam, down to reading `code` for a truthy value rather
  // than mere presence, so a bare `?code=` is treated as unconfigured there
  // and here alike. Computed ONCE, from what was on disk at mount.
  // Deliberately not re-derived on every render: forcing the <details> open
  // state to track live edits would fight a viewer's own manual toggle the
  // next time this component re-renders for an unrelated reason.
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const q = new URLSearchParams(globalThis.location?.search ?? '');
      if (q.get('code') || q.get('offline') === '1') return false;
    } catch {
      // No location (tests): fall through to the storage rule.
    }
    return Object.keys(initialLoaded).length === 0;
  });
  // Fix round 1, I5: this used to be one shared `justSaved` boolean, so
  // typing a key into Advocate A alone and pressing Save made all FOUR
  // rows flash `sent` — for the other three, the only thing actually sent
  // was `config: undefined`. A `Set` of the actors that were genuinely in
  // THIS save's `configs` gates the flash per row, matching copy-final.md's
  // corrected ruling: "only on rows that were actually configured."
  const [justSavedActors, setJustSavedActors] = useState<Set<Actor>>(() => new Set());
  // Fix round 1, M7: the prior timer had no cleanup (a Setup unmounted
  // inside the 2s window left a `setState` scheduled against a gone
  // component) and no debounce (two Saves inside 2s raced two timers, and
  // whichever fired last decided the outcome for both). The ref holds the
  // one live timer; a new Save clears any timer already in flight before
  // starting its own, and the unmount effect below clears whatever is still
  // pending.
  const sentTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (sentTimerRef.current !== undefined) globalThis.clearTimeout(sentTimerRef.current);
    };
  }, []);

  function updateRow(actor: Actor, patch: Partial<FormRow>) {
    setRows((prev) => ({ ...prev, [actor]: { ...prev[actor], ...patch } }));
  }

  function copyAllFromA() {
    setRows((prev) => ({ ...prev, B: { ...prev.A }, seat1: { ...prev.A }, seat2: { ...prev.A } }));
  }

  function handleSave() {
    const configs: AgentConfigs = {};
    for (const actor of ACTORS) {
      const config = buildActorConfig(rows[actor]);
      if (config) configs[actor] = config;
    }
    saveConfigs(configs);
    try {
      globalThis.sessionStorage?.setItem(ROOM_CODE_STORAGE_KEY, roomCode);
    } catch {
      // Best-effort, same as saveConfigs — a blocked store loses persistence
      // across a reload, never the ability to send this once.
    }
    setSavedConfigs(configs);
    onSave(configs, roomCode);

    if (sentTimerRef.current !== undefined) globalThis.clearTimeout(sentTimerRef.current);
    const configuredActors = new Set(Object.keys(configs) as Actor[]);
    setJustSavedActors(configuredActors);
    sentTimerRef.current = globalThis.setTimeout(() => {
      setJustSavedActors(new Set());
      sentTimerRef.current = undefined;
    }, SENT_DISPLAY_MS);
  }

  return (
    <details
      data-testid="setup-block"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      style={{ borderBottom: '2px solid var(--tb-rule)', background: 'var(--tb-ground-2)' }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '14px clamp(16px,2.6vw,40px)',
          fontFamily: 'var(--font-heading, Archivo), sans-serif',
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        Connect the agents
      </summary>

      <div style={{ padding: '0 clamp(16px,2.6vw,40px) 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--tb-ink-2)', maxWidth: '90ch' }}>
          Give the two advocates different providers if you have two keys. That is the whole argument, made literal:
          my agent and your agent, from two different companies, working the same file under one boundary.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ACTORS.map((actor) => {
            const row = rows[actor];
            const providerDef = providerById(row.provider);
            const showBaseUrl = row.provider === 'openai-compatible';
            return (
              <div
                key={actor}
                data-testid={`setup-row-${actor}`}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px 16px',
                  alignItems: 'flex-end',
                  padding: '12px 14px',
                  border: '1px solid var(--tb-rule-2)',
                }}
              >
                <div style={{ flex: '0 0 auto', minWidth: 90, alignSelf: 'center', fontSize: 12.5, fontWeight: 700 }}>
                  {ACTOR_LABEL[actor]}
                </div>

                <Field label="Provider" htmlFor={`tb-setup-provider-${actor}`}>
                  <select
                    id={`tb-setup-provider-${actor}`}
                    data-testid={`setup-provider-${actor}`}
                    value={row.provider}
                    onChange={(e) => updateRow(actor, { provider: e.target.value })}
                    className="tb-focus-amber"
                    style={fieldStyle}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Model" htmlFor={`tb-setup-model-${actor}`}>
                  <input
                    id={`tb-setup-model-${actor}`}
                    data-testid={`setup-model-${actor}`}
                    type="text"
                    value={row.model}
                    onChange={(e) => updateRow(actor, { model: e.target.value })}
                    placeholder={providerDef?.defaultModel ?? 'model id'}
                    className="tb-focus-amber"
                    style={fieldStyle}
                  />
                </Field>

                <Field label="API key" htmlFor={`tb-setup-key-${actor}`}>
                  <input
                    id={`tb-setup-key-${actor}`}
                    data-testid={`setup-key-${actor}`}
                    type="password"
                    value={row.key}
                    onChange={(e) => updateRow(actor, { key: e.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                    className="tb-focus-amber"
                    style={fieldStyle}
                  />
                  {providerDef?.hint && (
                    <span style={{ fontSize: 11, color: 'var(--tb-ink-3)', lineHeight: 1.3, maxWidth: '38ch' }}>
                      {providerDef.hint}
                    </span>
                  )}
                </Field>

                {showBaseUrl && (
                  <Field label="Base URL" htmlFor={`tb-setup-baseurl-${actor}`}>
                    <input
                      id={`tb-setup-baseurl-${actor}`}
                      data-testid={`setup-baseurl-${actor}`}
                      type="text"
                      value={row.baseUrl}
                      onChange={(e) => updateRow(actor, { baseUrl: e.target.value })}
                      className="tb-focus-amber"
                      style={fieldStyle}
                    />
                  </Field>
                )}

                {actor === 'A' && <CopyAllButton onClick={copyAllFromA} />}

                <span
                  data-testid={`setup-status-${actor}`}
                  style={{
                    flex: '1 1 100%',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11.5,
                    color: 'var(--tb-ink-3)',
                  }}
                >
                  {justSavedActors.has(actor) ? STATUS_SENT : statusText(savedConfigs[actor])}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'flex-end' }}>
          <Field label="Room code" htmlFor="tb-setup-roomcode">
            <input
              id="tb-setup-roomcode"
              data-testid="setup-roomcode"
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="tb-focus-amber"
              style={fieldStyle}
            />
          </Field>

          <button
            type="button"
            data-testid="setup-save"
            onClick={handleSave}
            className="tb-hover-amber-dark tb-focus-amber"
            style={{
              all: 'unset',
              cursor: 'pointer',
              boxSizing: 'border-box',
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              background: 'var(--tb-amber)',
              color: 'var(--tb-amber-ink)',
              padding: '11px 20px',
              fontSize: 14,
              fontWeight: 700,
              border: '2px solid var(--tb-rule)',
              whiteSpace: 'nowrap',
            }}
          >
            Save and send to the frames
          </button>
        </div>

        {/*
          Fix round 1, I6: the old sentence said keys live "on each frame's
          own origin." `saveConfigs()` (called a few lines above, in
          `handleSave`) writes all four, in plaintext, to the RECORD's OWN
          origin — under `board:agentConfig` — and, before the task that
          reads `board:model-config` on the panel side existed, to no
          frame's origin at all. `Setup.test.tsx`'s own "persists the saved
          configs to sessionStorage" test reads the full plaintext key back
          out of that store, which is what surfaced the sentence was false:
          this is the one line on the page a security-minded reader checks
          twice. Corrected text below is copy-final.md's, verbatim.
        */}
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--tb-ink-3)', maxWidth: '90ch' }}>
          Keys stay in this tab. They are held in sessionStorage on this page&apos;s origin and, once sent, on each
          frame&apos;s own origin; they go to nothing but each frame&apos;s own proxy, and they are gone when you
          close the tab. Nothing is committed and nothing is put in a link.
        </p>

        {/*
          Fix round 1, C2's second half: the honest version of what the old
          (now-removed) fourth status string was trying to say. Also
          verbatim from copy-final.md — added here because a key set in
          this browser does nothing on its own until it reaches a frame;
          this line says what actually decides how that frame runs.
        */}
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--tb-ink-3)', maxWidth: '90ch' }}>
          A key set here is used by that agent&apos;s frame. With no key here, the frame falls back to whatever its
          own site is configured with — a site key if one is set, or scripted mode if it was opened with
          ?offline=1.
        </p>
      </div>
    </details>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 11, color: 'var(--tb-ink-3)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Fix round 1, I7: this button used to carry `.tb-hover-ink2` (theme.css),
 * a class built for an INVERTED, filled button (PhaseRail's advance
 * button: dark fill, light label — lightening the fill on hover is safe
 * there) fills the background with `--tb-ink-2` on hover while the label
 * keeps `--tb-ink`. On this OUTLINE button those two colours are close
 * enough to erase the label: 1.96:1 dark, 2.56:1 light, against a 4.5:1
 * floor — hover deleted the button's own text.
 *
 * Fixed by not touching the fill or the label colour on hover at all: only
 * the border brightens, to `--tb-amber` (the same colour every focus ring
 * on this page already uses), via local component state rather than a
 * shared global class — `--tb-ink`-on-`--tb-ground-2` (the label's actual
 * resting contrast) is untouched in every state, so there is no fill/label
 * pair that can ever collide again on this control.
 */
function CopyAllButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      data-testid="setup-copy-all"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="tb-focus-amber"
      style={{
        all: 'unset',
        cursor: 'pointer',
        boxSizing: 'border-box',
        // Fix round 1, M8: was 36px; the page's own convention (Save,
        // Send-to-both, the phase-advance button) is 44px.
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        border: `1px solid ${hover ? 'var(--tb-amber)' : 'var(--tb-rule-2)'}`,
        color: 'var(--tb-ink)',
        padding: '7px 12px',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      Use these for all four
    </button>
  );
}

/**
 * Fix round 1, I8: was `1px solid var(--tb-rule-2)` on `--tb-ground-2` —
 * 1.97:1 dark, 1.60:1 light, against WCAG 1.4.11's 3:1 floor for a
 * control's own boundary (the fill offered no help either: 1.19:1 /
 * 1.10:1). Replaced with the exact pattern this record's own
 * `DoublePrompt.tsx` input already uses (`2px solid var(--tb-rule)`,
 * computed there at roughly 11.8:1) rather than a new value — reusing a
 * boundary this page has already gotten right once, not inventing a second
 * one that has to be gotten right again. `minHeight: 44` is fix round 1,
 * M8: these were about 33px tall against the page's own 44px convention.
 */
const fieldStyle: CSSProperties = {
  boxSizing: 'border-box',
  border: '2px solid var(--tb-rule)',
  background: 'var(--tb-field)',
  padding: '7px 9px',
  fontFamily: 'var(--font-body, Archivo), sans-serif',
  fontSize: 13,
  color: 'var(--tb-ink)',
  borderRadius: 0,
  minWidth: 140,
  minHeight: 44,
};
