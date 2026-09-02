// The page a visitor without the flag actually reads. Before this component
// the same branch rendered one status string, which reads as a broken deploy,
// so what is pinned here is the copy that stops it reading that way: the
// product's name, the flag to turn on, and a link back to the code.
//
// The last test is the guard the fix plan asked for by name: `VIDEO_URL` ships
// empty, and an empty value must hide the whole video row rather than render a
// dead link or a placeholder.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Unsupported, VIDEO_URL, REPO_URL } from './Unsupported';

describe('Unsupported', () => {
  it('names the product, so the page is not just an error string', () => {
    render(<Unsupported />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Board');
  });

  it('names the exact flag a reader has to turn on', () => {
    render(<Unsupported />);
    expect(screen.getByText('chrome://flags/#enable-webmcp-testing')).toBeInTheDocument();
  });

  it('links the repository, so a reader with no flag still has somewhere to go', () => {
    render(<Unsupported />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain(REPO_URL);
    expect(REPO_URL).toBe('https://github.com/damli40/the-board');
  });

  it('renders the reason string from webmcpStatus when one is passed', () => {
    render(<Unsupported reason="WebMCP not enabled. Chrome 149+ with chrome://flags/#enable-webmcp-testing." />);
    expect(screen.getByText(/WebMCP not enabled/)).toBeInTheDocument();
  });

  // Holds whether or not a video link exists yet: empty means no row at all, so a
  // placeholder can never ship; a real URL means a real link. Setting VIDEO_URL must
  // not turn this suite red.
  it('shows a video link when VIDEO_URL is set, and no video row at all when it is empty', () => {
    render(<Unsupported />);
    if (VIDEO_URL === '') {
      expect(screen.queryByText(/video/i)).toBeNull();
      return;
    }
    expect(screen.getByRole('link', { name: /video/i })).toHaveAttribute('href', VIDEO_URL);
  });
});
