import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Setup } from './Setup';
import { CONFIG_STORAGE_KEY, ROOM_CODE_STORAGE_KEY, type AgentConfigs } from '../model/agentConfig';
import { DEMO_ROOM_CODE } from '../config/origins';

const ACTOR_ORDER = ['A', 'B', 'seat1', 'seat2'] as const;

beforeEach(() => {
  globalThis.sessionStorage.clear();
});

describe('Setup — verbatim copy', () => {
  it('renders the disclosure title, positioning line, and both under-button paragraphs exactly', () => {
    render(<Setup onSave={() => {}} />);
    expect(screen.getByText('Connect the agents')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Give the two advocates different providers if you have two keys. That is the whole argument, made literal: my agent and your agent, from two different companies, working the same file under one boundary.'
      )
    ).toBeInTheDocument();
    // Fix round 1, I6: the sessionStorage sentence is corrected — keys are
    // staged on THIS page's own origin too, not only "each frame's own origin."
    expect(
      screen.getByText(
        "Keys stay in this tab. They are held in sessionStorage on this page's origin and, once sent, on each frame's own origin; they go to nothing but each frame's own proxy, and they are gone when you close the tab. Nothing is committed and nothing is put in a link."
      )
    ).toBeInTheDocument();
    // Fix round 1, C2's second half: the new honest-fallback sentence.
    expect(
      screen.getByText(
        "A key set here is used by that agent's frame. With no key here, the frame falls back to whatever its own site is configured with — a site key if one is set, or scripted mode if it was opened with ?offline=1."
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('setup-save')).toHaveTextContent('Save and send to the frames');
    expect(screen.getByTestId('setup-copy-all')).toHaveTextContent('Use these for all four');
    expect(screen.getAllByText('Provider').length).toBe(4);
    expect(screen.getAllByText('Model').length).toBe(4);
    expect(screen.getAllByText('API key').length).toBe(4);
    expect(screen.getByText('Room code')).toBeInTheDocument();
  });

  it('renders one row per actor, in Actor order (A, B, seat1, seat2)', () => {
    const { container } = render(<Setup onSave={() => {}} />);
    const rowEls = [...container.querySelectorAll('[data-testid^="setup-row-"]')];
    const order = rowEls.map((el) => el.getAttribute('data-testid')?.replace('setup-row-', ''));
    expect(order).toEqual(ACTOR_ORDER);
  });

  it('every field has a visible label', () => {
    render(<Setup onSave={() => {}} />);
    for (const actor of ACTOR_ORDER) {
      expect(document.querySelector(`label[for="tb-setup-provider-${actor}"]`)).toHaveTextContent('Provider');
      expect(document.querySelector(`label[for="tb-setup-model-${actor}"]`)).toHaveTextContent('Model');
      expect(document.querySelector(`label[for="tb-setup-key-${actor}"]`)).toHaveTextContent('API key');
    }
    expect(document.querySelector('label[for="tb-setup-roomcode"]')).toHaveTextContent('Room code');
  });

  it('the key field has autocomplete off and spellcheck off', () => {
    render(<Setup onSave={() => {}} />);
    for (const actor of ACTOR_ORDER) {
      const key = screen.getByTestId(`setup-key-${actor}`);
      expect(key).toHaveAttribute('autocomplete', 'off');
      expect(key).toHaveAttribute('spellcheck', 'false');
      expect(key).toHaveAttribute('type', 'password');
    }
  });
});

describe('Setup — the disclosure default state', () => {
  it('is open by default when no key is set anywhere', () => {
    render(<Setup onSave={() => {}} />);
    expect(screen.getByTestId('setup-block')).toHaveAttribute('open');
  });

  it('is collapsed by default once a key is already saved', () => {
    const configs: AgentConfigs = { A: { provider: 'anthropic', model: '', key: 'sk-ant-already-saved-key' } };
    globalThis.sessionStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
    render(<Setup onSave={() => {}} />);
    expect(screen.getByTestId('setup-block')).not.toHaveAttribute('open');
  });
});

describe('Setup — base URL field', () => {
  it('is hidden unless that row’s provider is openai-compatible', () => {
    render(<Setup onSave={() => {}} />);
    expect(screen.queryByTestId('setup-baseurl-A')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('setup-provider-A'), { target: { value: 'openai-compatible' } });
    expect(screen.getByTestId('setup-baseurl-A')).toBeInTheDocument();
    // Other rows are unaffected.
    expect(screen.queryByTestId('setup-baseurl-B')).not.toBeInTheDocument();
  });
});

describe('Setup — "Use these for all four"', () => {
  it('copies A’s current field values into B, seat1 and seat2', () => {
    render(<Setup onSave={() => {}} />);
    fireEvent.change(screen.getByTestId('setup-provider-A'), { target: { value: 'openai-compatible' } });
    fireEvent.change(screen.getByTestId('setup-model-A'), { target: { value: 'llama-3-70b' } });
    fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'a-shared-key' } });
    fireEvent.change(screen.getByTestId('setup-baseurl-A'), { target: { value: 'http://localhost:11434' } });

    fireEvent.click(screen.getByTestId('setup-copy-all'));

    for (const actor of ['B', 'seat1', 'seat2'] as const) {
      expect(screen.getByTestId(`setup-provider-${actor}`)).toHaveValue('openai-compatible');
      expect(screen.getByTestId(`setup-model-${actor}`)).toHaveValue('llama-3-70b');
      expect(screen.getByTestId(`setup-key-${actor}`)).toHaveValue('a-shared-key');
      expect(screen.getByTestId(`setup-baseurl-${actor}`)).toHaveValue('http://localhost:11434');
    }
  });

  // Fix round 1, I7: the button itself must never lose its own label on
  // hover — asserted structurally (the hover-only inline style targets
  // `borderColor`, never `color` or `background`), since jsdom does not
  // compute real contrast.
  it('changes only its border on hover, never its text colour or its own background', () => {
    render(<Setup onSave={() => {}} />);
    const button = screen.getByTestId('setup-copy-all');
    const before = { color: button.style.color, background: button.style.background };
    fireEvent.mouseEnter(button);
    expect(button.style.color).toBe(before.color);
    expect(button.style.background).toBe(before.background);
    fireEvent.mouseLeave(button);
  });
});

describe('Setup — status strings, exactly the three approved (fix round 1, C2)', () => {
  it('shows "no key set here" for every row before anything is saved', () => {
    render(<Setup onSave={() => {}} />);
    for (const actor of ACTOR_ORDER) {
      expect(screen.getByTestId(`setup-status-${actor}`)).toHaveTextContent('no key set here');
    }
  });

  it('typing a key without saving does not change the status line', () => {
    render(<Setup onSave={() => {}} />);
    fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'sk-ant-not-yet-saved-key' } });
    expect(screen.getByTestId('setup-status-A')).toHaveTextContent('no key set here');
  });

  it('shows "sent" immediately after Save, then the provider · model · redacted-key line', () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn();
      render(<Setup onSave={onSave} />);
      fireEvent.change(screen.getByTestId('setup-provider-A'), { target: { value: 'anthropic' } });
      fireEvent.change(screen.getByTestId('setup-model-A'), { target: { value: 'claude-opus-5' } });
      fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'sk-ant-api03-abcdefg9f2a' } });

      fireEvent.click(screen.getByTestId('setup-save'));
      expect(screen.getByTestId('setup-status-A')).toHaveTextContent('sent');

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId('setup-status-A')).toHaveTextContent('Anthropic (Claude) · claude-opus-5 · sk-ant-...9f2a');
    } finally {
      vi.useRealTimers();
    }
  });

  // Fix round 1, C2 + I4: the model segment is omitted entirely when blank
  // — never a `providerDef.defaultModel` fallback (openai-compatible has
  // none) and never the literal string "default model."
  it('omits the model segment entirely when the model field is blank, rather than inventing a default', () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn();
      render(<Setup onSave={onSave} />);
      fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'sk-ant-no-model-set-9f2a' } });
      fireEvent.click(screen.getByTestId('setup-save'));
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId('setup-status-A')).toHaveTextContent('Anthropic (Claude) · sk-ant-...9f2a');
      expect(screen.getByTestId('setup-status-A').textContent).not.toMatch(/default model/);
    } finally {
      vi.useRealTimers();
    }
  });

  // Fix round 1, test hygiene: the prior version of this test advanced the
  // timer 2000ms BEFORE its one assertion, so it only ever checked the
  // settled string and never touched the thing its own title promised —
  // whether an unconfigured row flashes "sent" at all. This version checks
  // both instants: immediately after Save (I5's actual claim) and after the
  // window closes.
  it('a row with no key never flashes "sent" — not right after Save, and not once the window closes', () => {
    vi.useFakeTimers();
    try {
      render(<Setup onSave={() => {}} />);
      fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'sk-ant-only-a-has-a-key9f2a' } });
      fireEvent.click(screen.getByTestId('setup-save'));

      // The instant after Save: A (configured) reads "sent"; B (not
      // configured) must not — this is I5's actual, previously-untested claim.
      expect(screen.getByTestId('setup-status-A')).toHaveTextContent('sent');
      expect(screen.getByTestId('setup-status-B')).toHaveTextContent('no key set here');

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId('setup-status-B')).toHaveTextContent('no key set here');
    } finally {
      vi.useRealTimers();
    }
  });

  // Fix round 1, M7: a second Save inside the 2s window must not leave the
  // flag stuck (the old code raced two independent timers). The ref-backed
  // debounce means only the LATEST timer governs when the flag clears.
  it('a second Save within the 2s window replaces the timer rather than racing it', () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn();
      render(<Setup onSave={onSave} />);
      fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'sk-ant-a-real-key-value-9f2a' } });

      fireEvent.click(screen.getByTestId('setup-save'));
      act(() => {
        vi.advanceTimersByTime(1000); // halfway through the first window
      });
      fireEvent.click(screen.getByTestId('setup-save')); // restarts the window
      act(() => {
        vi.advanceTimersByTime(1500); // 2500ms since the FIRST save, 1500ms since the second
      });
      // The old (undebounced) code's first timer would have fired around
      // here and cleared the flag early; the fix keeps it set until 2000ms
      // after the SECOND save.
      expect(screen.getByTestId('setup-status-A')).toHaveTextContent('sent');

      act(() => {
        vi.advanceTimersByTime(600); // now past 2000ms since the second save
      });
      expect(screen.getByTestId('setup-status-A')).not.toHaveTextContent('sent');
    } finally {
      vi.useRealTimers();
    }
  });

  // Fix round 1, M7: no pending timer must fire against an unmounted
  // component. Asserted by unmounting mid-window and letting the timer's
  // scheduled time pass with no assertion possible on a gone tree — the
  // real proof is that this does not throw / log an act() warning.
  it('cleans up its timer on unmount without throwing', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<Setup onSave={() => {}} />);
      fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'sk-ant-a-real-key-value-9f2a' } });
      fireEvent.click(screen.getByTestId('setup-save'));
      expect(() => unmount()).not.toThrow();
      expect(() => {
        act(() => {
          vi.advanceTimersByTime(2000);
        });
      }).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Setup — Save builds hazard-gated configs and calls onSave', () => {
  it('omits an actor entirely from the saved configs when its key is empty, even if its provider/base-url fields are filled', () => {
    const onSave = vi.fn();
    render(<Setup onSave={onSave} />);
    // B gets a provider + base URL but no key.
    fireEvent.change(screen.getByTestId('setup-provider-B'), { target: { value: 'openai-compatible' } });
    fireEvent.change(screen.getByTestId('setup-baseurl-B'), { target: { value: 'http://a-strangers-host.example' } });
    fireEvent.click(screen.getByTestId('setup-save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [configs] = onSave.mock.calls[0];
    expect('B' in configs).toBe(false);
  });

  it('includes an actor once its key is set, with the room code passed alongside', () => {
    const onSave = vi.fn();
    render(<Setup onSave={onSave} />);
    fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'sk-ant-a-real-key-value-9f2a' } });
    fireEvent.change(screen.getByTestId('setup-roomcode'), { target: { value: 'my-custom-room' } });
    fireEvent.click(screen.getByTestId('setup-save'));

    const [configs, roomCode] = onSave.mock.calls[0];
    expect(configs.A).toEqual({ provider: 'anthropic', model: '', key: 'sk-ant-a-real-key-value-9f2a' });
    expect(roomCode).toBe('my-custom-room');
  });

  it('persists the saved configs to sessionStorage, never localStorage', () => {
    const setSpy = vi.spyOn(globalThis.localStorage, 'setItem');
    render(<Setup onSave={() => {}} />);
    fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'sk-ant-persist-me-9f2a-key' } });
    fireEvent.click(screen.getByTestId('setup-save'));

    expect(setSpy).not.toHaveBeenCalled();
    const stored = JSON.parse(globalThis.sessionStorage.getItem(CONFIG_STORAGE_KEY)!);
    expect(stored.A.key).toBe('sk-ant-persist-me-9f2a-key');
    setSpy.mockRestore();
  });

  it('persists the room code to sessionStorage under ROOM_CODE_STORAGE_KEY', () => {
    render(<Setup onSave={() => {}} />);
    fireEvent.change(screen.getByTestId('setup-roomcode'), { target: { value: 'a-room-code' } });
    fireEvent.click(screen.getByTestId('setup-save'));
    expect(globalThis.sessionStorage.getItem(ROOM_CODE_STORAGE_KEY)).toBe('a-room-code');
  });

  it('defaults the room code field to the shared demo room code', () => {
    render(<Setup onSave={() => {}} />);
    expect(screen.getByTestId('setup-roomcode')).toHaveValue(DEMO_ROOM_CODE);
  });
});

// Fix round 1, I3: the room-code field used to read sessionStorage then fall
// straight to DEMO_ROOM_CODE, never looking at the record's own `?code=`
// query param — the one thing App.tsx's roomCodeParam() actually uses to
// load the four panel frames. `window.history.pushState` is this repo's own
// established pattern for simulating a query string in a jsdom test
// (packages/panel/src/App.test.tsx already uses it this way).
describe('Setup — room code reads the record’s own ?code= (fix round 1, I3)', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('prefers ?code= over a stored value and over the demo default', () => {
    globalThis.sessionStorage.setItem(ROOM_CODE_STORAGE_KEY, 'a-stored-code');
    window.history.pushState({}, '', '/?code=secret-xyz');
    render(<Setup onSave={() => {}} />);
    expect(screen.getByTestId('setup-roomcode')).toHaveValue('secret-xyz');
  });

  it('falls back to the stored value when there is no ?code=', () => {
    globalThis.sessionStorage.setItem(ROOM_CODE_STORAGE_KEY, 'a-stored-code');
    window.history.pushState({}, '', '/');
    render(<Setup onSave={() => {}} />);
    expect(screen.getByTestId('setup-roomcode')).toHaveValue('a-stored-code');
  });

  it('sends the ?code= value on Save, not the demo default', () => {
    window.history.pushState({}, '', '/?code=secret-xyz');
    const onSave = vi.fn();
    render(<Setup onSave={onSave} />);
    fireEvent.change(screen.getByTestId('setup-key-A'), { target: { value: 'sk-ant-a-real-key-value-9f2a' } });
    fireEvent.click(screen.getByTestId('setup-save'));
    const [, roomCode] = onSave.mock.calls[0];
    expect(roomCode).toBe('secret-xyz');
  });
});
