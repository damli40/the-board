import { describe, it, expect } from 'vitest';
import { PARENT_ORIGIN, ORIGIN, DEMO_ROOM_CODE } from './origins';

describe('origins', () => {
  it('defines the five concrete dev origins', () => {
    expect(PARENT_ORIGIN).toBe('http://localhost:8080');
    expect(ORIGIN.A).toBe('http://localhost:8081');
    expect(ORIGIN.B).toBe('http://localhost:8082');
    expect(ORIGIN.seat1).toBe('http://localhost:8083');
    expect(ORIGIN.seat2).toBe('http://localhost:8084');
  });

  it('gives every actor a distinct origin', () => {
    const values = Object.values(ORIGIN);
    expect(new Set(values).size).toBe(values.length);
  });

  it('defines the demo room code (task 1, ruling 1)', () => {
    expect(DEMO_ROOM_CODE).toBe('board-demo-2026');
  });
});
