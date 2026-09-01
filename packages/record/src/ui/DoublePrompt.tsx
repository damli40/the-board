// The double-prompt bar: one instruction, sent to both advocates at once.
//
// Ported from the design (docs/design/claude-design/the-board.dc.html, lines
// 153-164), copy verbatim per copy-final.md. This already existed as a plain
// input+button pair inline in App.tsx; the wiring is unchanged — only the
// markup, styling and copy move here, and the input's own text state moves
// with it (App.tsx no longer holds a `prompt` string).
//
// `onSend` is called with the trimmed goal text and does exactly what the
// pre-restyle `broadcastPrompt` did: posts `{ type: 'board:prompt', goal,
// sentAt, demo }` into Advocate A's and Advocate B's frames only, each with
// its OWN real `targetOrigin` — never `'*'`, never staggered. That message
// shape is not renamed to `board:goal` here despite the task brief's loose
// prose calling it "posting board:goal": `packages/panel/src/App.tsx`'s
// listener checks for the literal string `'board:prompt'`, that file is
// outside this task's file list, and renaming the wire format on one side
// only would silently break the panels rather than restyle the record page.
//
// Fix round 1, C1: the input used to carry an inline `outline: 'none'`,
// which — being an inline "normal" declaration — outranked the
// `.tb-focus-amber:focus-visible` class entirely, regardless of that class's
// selector specificity. It existed only to suppress the default ring so the
// class could draw its own; the design's actual intent was to REPLACE the
// default ring, not delete it and replace it with nothing. Removed — the
// class (now `!important`, see theme.css) supplies the ring on its own.
import { useState } from 'react';

interface DoublePromptProps {
  onSend: (goal: string) => void;
}

export function DoublePrompt({ onSend }: DoublePromptProps) {
  const [value, setValue] = useState('');

  function send() {
    const goal = value.trim();
    if (!goal) return;
    onSend(goal);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px 24px',
        alignItems: 'center',
        padding: '16px clamp(16px,2.6vw,40px)',
        borderBottom: '2px solid var(--tb-rule)',
        background: 'var(--tb-ground-2)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 260px' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>One instruction, both advocates</span>
        <span style={{ fontSize: 13, color: 'var(--tb-ink-2)', lineHeight: 1.4 }}>
          The same words reach Advocate A and Advocate B in the same moment.
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: '3 1 420px' }}>
        <label
          htmlFor="tb-double"
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
        >
          Instruction for both advocates
        </label>
        <input
          id="tb-double"
          type="text"
          data-testid="double-prompt-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Ask both advocates the same question, in the same words"
          className="tb-focus-amber"
          style={{
            flex: 1,
            minWidth: 0,
            boxSizing: 'border-box',
            border: '2px solid var(--tb-rule)',
            background: 'var(--tb-field)',
            padding: '11px 13px',
            fontFamily: 'var(--font-body, Archivo), sans-serif',
            fontSize: 14,
            color: 'var(--tb-ink)',
            borderRadius: 0,
          }}
        />
        <button
          type="button"
          data-testid="double-prompt-send"
          onClick={send}
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
          Send to both
        </button>
      </div>
    </div>
  );
}
