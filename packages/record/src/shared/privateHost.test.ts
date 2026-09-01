import { describe, it, expect } from 'vitest';
import { isPrivateHost } from './privateHost';

// First tests this predicate has ever had — it lived inside
// netlify/functions/capture.ts, which vitest.config.ts's include pattern
// (packages/*/src/**/*.test.ts) never collects. See privateHost.ts's own
// comment (ruling 2, task 1) for why it moved.

describe('isPrivateHost', () => {
  it('refuses localhost and its subdomains', () => {
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('LOCALHOST')).toBe(true);
    expect(isPrivateHost('foo.localhost')).toBe(true);
  });

  it('refuses loopback and unspecified literals', () => {
    expect(isPrivateHost('127.0.0.1')).toBe(true);
    expect(isPrivateHost('127.255.255.255')).toBe(true);
    expect(isPrivateHost('0.0.0.0')).toBe(true);
    expect(isPrivateHost('::1')).toBe(true);
    // A URL's .hostname for an IPv6 literal keeps its brackets
    // (`new URL('http://[::1]:8080/').hostname === '[::1]'`) — the predicate
    // must strip them, not just match the bracket-free form.
    expect(isPrivateHost('[::1]')).toBe(true);
  });

  it('refuses RFC1918 private ranges', () => {
    expect(isPrivateHost('10.0.0.1')).toBe(true);
    expect(isPrivateHost('10.255.255.255')).toBe(true);
    expect(isPrivateHost('192.168.0.1')).toBe(true);
    expect(isPrivateHost('192.168.255.255')).toBe(true);
  });

  it('refuses the 172.16.0.0/12 range with correct boundaries', () => {
    for (const h of ['172.16.0.1', '172.20.0.1', '172.31.255.255']) {
      expect(isPrivateHost(h), h).toBe(true);
    }
    // Just outside the /12: 172.16-172.31 is private, 172.15 and 172.32 are
    // ordinary public-looking addresses and must not be swept in.
    expect(isPrivateHost('172.15.255.255')).toBe(false);
    expect(isPrivateHost('172.32.0.1')).toBe(false);
  });

  it('refuses link-local IPv4', () => {
    expect(isPrivateHost('169.254.1.1')).toBe(true);
  });

  it('refuses unique-local and link-local IPv6 prefixes', () => {
    expect(isPrivateHost('fc00::1')).toBe(true);
    expect(isPrivateHost('fd12:3456::1')).toBe(true);
    expect(isPrivateHost('fe80::1')).toBe(true);
    // Case-insensitive: the hex prefix can arrive either way.
    expect(isPrivateHost('FE80::1')).toBe(true);
  });

  it('admits an ordinary public hostname or IP', () => {
    expect(isPrivateHost('example.com')).toBe(false);
    expect(isPrivateHost('api.anthropic.com')).toBe(false);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
    expect(isPrivateHost('generativelanguage.googleapis.com')).toBe(false);
  });

  it('anchors each RFC1918 regex to the START of the string only, not the whole literal', () => {
    // Documented as found, not fixed: the regexes are `^10\.` etc., anchored
    // at the start but not pinned to the end, so a PUBLIC hostname that
    // happens to start with a private-looking numeric prefix — an unlikely
    // but real DNS label — still matches. This is the predicate's existing,
    // pre-this-file behaviour (capture.ts shipped it this way); lifting it
    // into its own module is not licence to silently change what it does.
    expect(isPrivateHost('10.example.com')).toBe(true);
  });

  it('does not match a hostname that only ends with a private-looking string', () => {
    // `.localhost` is matched by suffix (`endsWith`). `not-localhost.example.com`
    // does not even END with "localhost" (it ends with ".example.com"), so it
    // proved nothing about the suffix check (test hygiene, fix round 1).
    // `xlocalhost` DOES end with the literal substring "localhost" but has no
    // dot before it, which is the actual boundary `.endsWith('.localhost')`
    // is meant to enforce.
    expect(isPrivateHost('xlocalhost')).toBe(false);
  });

  it('strips a trailing dot (FQDN form) before comparing (I3, fix round 1)', () => {
    expect(isPrivateHost('localhost.')).toBe(true);
    expect(isPrivateHost('127.0.0.1.')).toBe(true);
    expect(isPrivateHost('example.com.')).toBe(false);
  });

  it('unwraps an IPv4-mapped IPv6 loopback/private address, dotted or hex form (I3, fix round 1)', () => {
    expect(isPrivateHost('::ffff:127.0.0.1')).toBe(true);
    // `new URL('https://[::ffff:127.0.0.1]/').hostname` normalises to this
    // hex-group form — reproduced end-to-end through handleProxy by the
    // reviewer, matching no regex before this fix.
    expect(isPrivateHost('::ffff:7f00:1')).toBe(true);
    expect(isPrivateHost('::ffff:169.254.169.254')).toBe(true);
    expect(isPrivateHost('::ffff:a9fe:a9fe')).toBe(true);
    // An IPv4-mapped PUBLIC address must still pass.
    expect(isPrivateHost('::ffff:8.8.8.8')).toBe(false);
  });

  it('unwraps the NAT64 well-known prefix (64:ff9b::/96) the same way (I3, fix round 1)', () => {
    expect(isPrivateHost('64:ff9b::7f00:1')).toBe(true); // NAT64-mapped 127.0.0.1
    expect(isPrivateHost('64:ff9b::808:808')).toBe(false); // NAT64-mapped 8.8.8.8
  });
});
