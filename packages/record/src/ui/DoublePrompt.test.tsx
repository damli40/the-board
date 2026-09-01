import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DoublePrompt } from './DoublePrompt';

describe('DoublePrompt', () => {
  it('renders the verbatim heading, sub-line, placeholder and button copy', () => {
    render(<DoublePrompt onSend={() => {}} />);
    expect(screen.getByText('One instruction, both advocates')).toBeInTheDocument();
    expect(screen.getByText('The same words reach Advocate A and Advocate B in the same moment.')).toBeInTheDocument();
    expect(screen.getByTestId('double-prompt-input')).toHaveAttribute(
      'placeholder',
      'Ask both advocates the same question, in the same words'
    );
    expect(screen.getByTestId('double-prompt-send')).toHaveTextContent('Send to both');
  });

  it('sends the trimmed goal when the button is clicked', () => {
    const onSend = vi.fn();
    render(<DoublePrompt onSend={onSend} />);
    fireEvent.change(screen.getByTestId('double-prompt-input'), { target: { value: '  what happened on day four?  ' } });
    fireEvent.click(screen.getByTestId('double-prompt-send'));
    expect(onSend).toHaveBeenCalledWith('what happened on day four?');
  });

  it('sends on Enter, same as clicking the button', () => {
    const onSend = vi.fn();
    render(<DoublePrompt onSend={onSend} />);
    fireEvent.change(screen.getByTestId('double-prompt-input'), { target: { value: 'read the delivery log' } });
    fireEvent.keyDown(screen.getByTestId('double-prompt-input'), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('read the delivery log');
  });

  it('never sends an empty or whitespace-only goal', () => {
    const onSend = vi.fn();
    render(<DoublePrompt onSend={onSend} />);
    fireEvent.click(screen.getByTestId('double-prompt-send'));
    fireEvent.change(screen.getByTestId('double-prompt-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('double-prompt-send'));
    expect(onSend).not.toHaveBeenCalled();
  });
});
