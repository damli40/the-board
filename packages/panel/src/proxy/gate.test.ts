import { describe, expect, it } from 'vitest';
import {
  checkOrigin,
  checkRate,
  checkRoomCode,
  EMPTY_RATE_STATE,
  ROOM_CODE_HEADER,
} from './gate';

describe('checkRoomCode', () => {
  it('fails CLOSED when the deploy forgot ROOM_CODE', () => {
    // The whole point. Before this file the endpoint was open; a missing
    // variable must not quietly restore that.
    for (const unset of [undefined, '', '   ']) {
      const r = checkRoomCode('anything', unset);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.statusCode).toBe(500);
      expect(r.ok === false && r.body).toContain('ROOM_CODE');
    }
  });

  it('refuses a caller that sent no code', () => {
    const r = checkRoomCode(undefined, 'open-sesame');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.statusCode).toBe(401);
  });

  it('refuses a wrong code, including one that only shares a prefix', () => {
    for (const wrong of ['open-sesam', 'open-sesamex', 'OPEN-SESAME', 'x']) {
      const r = checkRoomCode(wrong, 'open-sesame');
      expect(r.ok, wrong).toBe(false);
      expect(r.ok === false && r.statusCode).toBe(401);
    }
  });

  it('admits the right code', () => {
    expect(checkRoomCode('open-sesame', 'open-sesame').ok).toBe(true);
  });

  it('does not trim or normalise the supplied code', () => {
    // A header with stray whitespace is a different string. Silently
    // trimming would widen the accepted set without saying so.
    expect(checkRoomCode(' open-sesame', 'open-sesame').ok).toBe(false);
  });

  it('names its header once, so client and function cannot drift', () => {
    expect(ROOM_CODE_HEADER).toBe('x-room-code');
  });
});

describe('checkOrigin', () => {
  const allowed = ['https://theboard-a.netlify.app', 'http://localhost:8081'];

  it('allows an allowlisted origin', () => {
    expect(checkOrigin('https://theboard-a.netlify.app', allowed).ok).toBe(true);
  });

  it('rejects an origin that is not on the list', () => {
    const r = checkOrigin('https://evil.example', allowed);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.statusCode).toBe(403);
  });

  it('ALLOWS a missing origin on purpose', () => {
    // Documented, deliberate, and the reason this check is defence in depth
    // rather than security: the caller it cannot stop is the one that sends
    // no Origin at all. Changing this to a rejection would break legitimate
    // non-browser clients and stop no attacker.
    expect(checkOrigin(undefined, allowed).ok).toBe(true);
  });

  it('does not match on a prefix or a subdomain', () => {
    expect(checkOrigin('https://theboard-a.netlify.app.evil.example', allowed).ok).toBe(false);
    expect(checkOrigin('https://evil.theboard-a.netlify.app', allowed).ok).toBe(false);
  });
});

describe('checkRate', () => {
  const LIMIT = 3;
  const WINDOW = 60_000;

  it('admits up to the limit and then refuses', () => {
    let state = EMPTY_RATE_STATE;
    const statuses: (number | true)[] = [];
    for (let i = 0; i < 5; i += 1) {
      const step = checkRate(state, 1_000, LIMIT, WINDOW);
      state = step.state;
      statuses.push(step.result.ok ? true : step.result.statusCode);
    }
    expect(statuses).toEqual([true, true, true, 429, 429]);
  });

  it('reopens once the window has passed', () => {
    let state = EMPTY_RATE_STATE;
    for (let i = 0; i < 4; i += 1) state = checkRate(state, 1_000, LIMIT, WINDOW).state;
    expect(checkRate(state, 1_000, LIMIT, WINDOW).result.ok).toBe(false);

    const after = checkRate(state, 1_000 + WINDOW, LIMIT, WINDOW);
    expect(after.result.ok).toBe(true);
    expect(after.state.count).toBe(1);
  });

  it('a client hammering a closed gate cannot push the window out for others', () => {
    // The count is pinned at limit+1 while refusing, so `windowStart` stays
    // put and the window still expires on schedule.
    let state = EMPTY_RATE_STATE;
    for (let i = 0; i < 50; i += 1) state = checkRate(state, 1_000, LIMIT, WINDOW).state;
    expect(state.count).toBe(LIMIT + 1);
    expect(state.windowStart).toBe(1_000);
    expect(checkRate(state, 1_000 + WINDOW, LIMIT, WINDOW).result.ok).toBe(true);
  });
});
