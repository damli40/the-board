// Refuses loopback, link-local and RFC1918 literals in a hostname. Shared by
// `packages/record/netlify/functions/capture.ts` (fetching an exhibit URL a
// party supplied) and `packages/panel/src/proxy/handler.ts` (fetching a
// model provider's base URL, which can itself be caller-supplied — see task
// 1's BYOK headers) — both are server-side code taking a URL from outside
// this origin and fetching it, so both need the same private-network guard.
//
// Lifted out of capture.ts (ruling 2, task 1,
// docs/superpowers/plans/2026-08-31-the-board-finish.md). It used to live
// inside netlify/functions/, which vitest never collects — vitest.config.ts
// only includes `packages/*/src/**/*.test.ts` — so this predicate had never
// been under test until this file existed.
//
// `https`-only (enforced by each caller, not here) already blocks the
// classic cloud-metadata read, since that endpoint is plain http. This
// closes the rest of the obvious internal surface.
//
// Matches on literals only: a hostname that RESOLVES to a private address
// still gets through — DNS rebinding is a different, harder problem than
// this predicate is trying to solve. That is why BOTH callers also refuse to
// follow a redirect (`redirect: 'manual'`, treating any 3xx as a failure):
// a check on the literal the caller supplied is worthless if the fetch is
// then allowed to hop somewhere else entirely. A timeout is not a substitute
// for that guard — it bounds how long a bad request can run, not where it
// can go (fix round 1, I1: an earlier version of this comment claimed
// handler.ts's 25-second timeout was doing that job; it never was).
export function isPrivateHost(hostname: string): boolean {
  let h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // A trailing dot makes a hostname an explicit FQDN — `localhost.` and
  // `localhost` name the same thing to a resolver (`dns.lookup('localhost.')`
  // still resolves to ::1) — so strip it before comparing, or this predicate
  // waves through a request `dns.lookup` would still send loopback (fix
  // round 1, I3).
  h = h.replace(/\.$/, '');

  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0.0.0.0') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^(fc|fd|fe80)/i.test(h)) return true; // unique-local and link-local IPv6

  // IPv4-mapped IPv6 (`::ffff:a.b.c.d`, or normalised by the URL parser to
  // hex groups like `::ffff:7f00:1`) and the NAT64 well-known prefix
  // (`64:ff9b::/96`) both encode a plain IPv4 address in their last 32 bits
  // — including a loopback or RFC1918 one, which is exactly how
  // `https://[::ffff:127.0.0.1]` and `https://[::ffff:169.254.169.254]`
  // passed every regex above (fix round 1, I3, reproduced end-to-end through
  // handleProxy). Rather than a parallel hex ladder for every rule already
  // written in dotted-quad form, unwrap the embedded IPv4 and recurse.
  const mappedDotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) return isPrivateHost(mappedDotted[1]);
  const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) return isPrivateHost(hexPairToIPv4(mappedHex[1], mappedHex[2]));
  const nat64 = h.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (nat64) return isPrivateHost(hexPairToIPv4(nat64[1], nat64[2]));

  return false;
}

/** The last 32 bits of an IPv4-mapped or NAT64 IPv6 address, as two 16-bit
 *  hex groups, decoded back into a dotted-quad IPv4 string. */
function hexPairToIPv4(hi: string, lo: string): string {
  const h = parseInt(hi, 16);
  const l = parseInt(lo, 16);
  return [(h >> 8) & 0xff, h & 0xff, (l >> 8) & 0xff, l & 0xff].join('.');
}
