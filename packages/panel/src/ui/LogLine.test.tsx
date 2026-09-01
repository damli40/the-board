// The five states are the product (task 5 brief). Each must render its own
// distinct treatment, and ONLY `broke` may offer a retry — a real refusal
// (3) or a not-granted call (4) must never grow a Retry button, because
// retrying either would be a lie about what would happen.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LogLine, type LogLineData } from './LogLine';
import {
  BROKE_CHIP,
  BROKE_NOTE_HAD_PRIOR_SUCCESS,
  BROKE_NOTE_NO_PRIOR_SUCCESS,
  BROKE_RETRY_ANYWAY_LABEL,
  BROKE_RETRY_LABEL,
  NOTGRANTED_CHIP,
  REFUSED_CHIP,
  REFUSED_NOTE,
  STOP_LABEL,
} from './copy';

function renderLine(
  line: LogLineData,
  extra: { onStop?: () => void; onRetry?: () => void; retryDisabled?: boolean } = {}
) {
  return render(<LogLine index={0} line={line} {...extra} />);
}

describe('LogLine', () => {
  it('renders ok as a plain line when there is no tool (the model\'s own closing message)', () => {
    renderLine({ kind: 'ok', text: 'Filed the exhibit and stated the delivery date.' });
    const wrapper = screen.getByTestId('panel-line-0');
    expect(wrapper.querySelector('[data-testid="panel-state-ok"]')).not.toBeNull();
    expect(screen.getByText('Filed the exhibit and stated the delivery date.')).toBeInTheDocument();
    // None of the other four states' markers are present.
    for (const kind of ['run', 'refused', 'notgranted', 'broke']) {
      expect(wrapper.querySelector(`[data-testid="panel-state-${kind}"]`)).toBeNull();
    }
  });

  // Fix round 1, M3: with structured entries, tool and arg are real data —
  // ported as the design's own grid (tool name + argument line left,
  // outcome right), not a single collapsed line.
  it('renders ok as the design\'s grid — tool name, argument line and outcome — once a tool is present', () => {
    renderLine({ kind: 'ok', tool: 'open_exhibit', arg: '{"exhibitId":"E1"}', text: 'text layer present' });
    expect(screen.getByText('open_exhibit')).toBeInTheDocument();
    expect(screen.getByText('{"exhibitId":"E1"}')).toBeInTheDocument();
    expect(screen.getByText('text layer present')).toBeInTheDocument();
  });

  it('renders run with a Stop control and no retry', () => {
    const onStop = vi.fn();
    renderLine({ kind: 'run', text: 'File the signed agreement as an exhibit.' }, { onStop });
    expect(screen.getByTestId('panel-state-run')).toBeInTheDocument();
    const stop = screen.getByText(STOP_LABEL);
    stop.click();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(BROKE_RETRY_LABEL)).toBeNull();
  });

  it('renders refused with the boundary chip, the tool it was about, and the exact reassurance line — no retry', () => {
    renderLine({ kind: 'refused', tool: 'record_assessment', text: 'seat2 has not opened E2' });
    expect(screen.getByTestId('panel-state-refused')).toBeInTheDocument();
    expect(screen.getByText(REFUSED_CHIP)).toBeInTheDocument();
    expect(screen.getByText('record_assessment')).toBeInTheDocument();
    expect(screen.getByText('seat2 has not opened E2')).toBeInTheDocument();
    expect(screen.getByText(REFUSED_NOTE)).toBeInTheDocument();
  });

  it('renders notgranted with the "Not handed over" chip, the bare tool name, and no retry', () => {
    renderLine({ kind: 'notgranted', text: "confirm was never in this agent's list.", tool: 'confirm' });
    expect(screen.getByTestId('panel-state-notgranted')).toBeInTheDocument();
    expect(screen.getByText(NOTGRANTED_CHIP)).toBeInTheDocument();
    expect(screen.getByText('confirm')).toBeInTheDocument();
    expect(screen.getByText("confirm was never in this agent's list.")).toBeInTheDocument();
  });

  // Fix round 1, test hygiene #2: the OLD version of this test rendered
  // refused/notgranted with no `onRetry` at all — a component that renders
  // zero buttons unconditionally and takes no such prop cannot fail this,
  // whatever it does. `RefusedLine`/`NotGrantedLine` genuinely have no
  // `onRetry` PARAMETER (see LogLine.tsx) so `LogLine` itself is what would
  // have to route it — this proves that routing does not exist, by handing
  // it one and confirming no button appears anyway.
  it('refused and notgranted render no button even when handed an onRetry — the routing does not exist, not merely unused', () => {
    const onRetry = vi.fn();
    renderLine({ kind: 'refused', text: 'x' }, { onRetry });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(BROKE_RETRY_LABEL)).toBeNull();

    renderLine({ kind: 'notgranted', tool: 'confirm', text: 'x' }, { onRetry });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders broke with the "Something broke" chip and the NO-PRIOR-SUCCESS variant by default — the only state with a retry', () => {
    const onRetry = vi.fn();
    renderLine({ kind: 'broke', text: 'model proxy responded 500 Internal Server Error' }, { onRetry });
    expect(screen.getByTestId('panel-state-broke')).toBeInTheDocument();
    expect(screen.getByText(BROKE_CHIP)).toBeInTheDocument();
    expect(screen.getByText('model proxy responded 500 Internal Server Error')).toBeInTheDocument();
    expect(screen.getByText(BROKE_NOTE_NO_PRIOR_SUCCESS)).toBeInTheDocument();
    const retry = screen.getByText(BROKE_RETRY_LABEL);
    retry.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // Fix round 1, I1: retrying restarts the WHOLE goal from step 0, so a
  // turn that already wrote something before breaking will repeat that
  // write. The card must say so, and its button must say "anyway".
  it('renders the HAD-PRIOR-SUCCESS variant — different note, different button label — when an earlier step already succeeded', () => {
    renderLine({ kind: 'broke', text: 'model proxy responded 500 Internal Server Error', hadPriorSuccess: true });
    expect(screen.getByText(BROKE_NOTE_HAD_PRIOR_SUCCESS)).toBeInTheDocument();
    expect(screen.getByText(BROKE_RETRY_ANYWAY_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(BROKE_NOTE_NO_PRIOR_SUCCESS)).toBeNull();
    expect(screen.queryByText(BROKE_RETRY_LABEL)).toBeNull();
  });

  // Fix round 1, I9 — asserted, not just fixed in code (the finding's own
  // words: "in code and still unproven in test"). `var(--tb-broke-ink)`
  // flips to `#201e1d` in light mode and would go ~invisible against this
  // panel, which stays dark in every site theme — the left bar must use
  // the same fixed literal every other panel-internal color in this file
  // uses, never that token. Checked on the rendered inline style directly,
  // since that is the one thing a token-vs-literal regression actually
  // changes.
  it('the broke state\'s left bar is the panel\'s fixed ink literal, never the --tb-broke-ink token (I9)', () => {
    renderLine({ kind: 'broke', text: 'x' });
    const card = screen.getByTestId('panel-state-broke').firstElementChild as HTMLElement;
    // jsdom normalises the #f3f2f2 literal to its rgb() form; either way,
    // what matters is that it resolved to a literal color at all, not a
    // custom-property reference the light-mode media query could flip.
    expect(card.style.borderLeft).toContain('rgb(243, 242, 242)');
    expect(card.style.borderLeft).not.toContain('--tb-broke-ink');
    expect(card.style.borderLeft).not.toContain('var(');
  });

  // Fix round 1, I10: a click during a running turn must not start a
  // second one. The retry button itself carries that guard visibly.
  it('disables the retry button when retryDisabled is set, and does not fire onRetry when clicked anyway', () => {
    const onRetry = vi.fn();
    renderLine({ kind: 'broke', text: 'x' }, { onRetry, retryDisabled: true });
    const retry = screen.getByText(BROKE_RETRY_LABEL);
    expect(retry).toBeDisabled();
    retry.click();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('indexes the wrapper testid from the index prop, not a fixed value', () => {
    render(<LogLine index={7} line={{ kind: 'ok', text: 'hi' }} />);
    expect(screen.getByTestId('panel-line-7')).toBeInTheDocument();
  });

  // Fix round 1, test hygiene #1: the OLD version of this test asserted
  // `retryButton.style.outline === ''` as proof the ring "works" — but the
  // actual reset in use is `all: 'unset'`, which jsdom does NOT expand into
  // individual longhand properties like `outline`, so that assertion reads
  // '' whether or not the reset is present and cannot fail either way. It
  // proved nothing about the mechanism. What IS checkable here, honestly:
  // the element opts into the class-based ring (carries the class name) and
  // sets no CONFLICTING inline declaration of its own for the one property
  // that matters. Whether the ring actually PAINTS is a real-browser
  // question, checked separately and reported in task-5-report.md, not
  // something this jsdom test can settle.
  it('the retry button opts into the focus-visible class and sets no inline outline that could fight it', () => {
    renderLine({ kind: 'broke', text: 'x' }, { onRetry: () => {} });
    const retryButton = screen.getByText(BROKE_RETRY_LABEL);
    expect(retryButton.className).toContain('tb-focus-amber');
    expect(retryButton.getAttribute('style') ?? '').not.toContain('outline');
  });
});
