import { describe, it, expect } from 'vitest';
import { ObjectionStore } from './objections';

describe('ObjectionStore', () => {
  it('numbers objections O1, O2… and returns copies', () => {
    const store = new ObjectionStore();
    const o = store.record({ by: 'A', text: 'the seat has not opened E3', at: 't1' });
    expect(o).toEqual({ id: 'O1', by: 'A', text: 'the seat has not opened E3', at: 't1' });
    store.record({ by: 'B', text: 'second', at: 't2' });
    expect(store.all().map((x) => x.id)).toEqual(['O1', 'O2']);
    store.all().pop();
    expect(store.all()).toHaveLength(2);
  });
});
