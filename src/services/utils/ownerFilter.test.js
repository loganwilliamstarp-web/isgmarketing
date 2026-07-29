// Tests for the multi-tenant owner scoping helper.

import { describe, expect, it } from 'vitest';
import { applyOwnerFilter, getFirstOwnerId, normalizeOwnerIds } from './ownerFilter';

function fakeQuery() {
  const calls = [];
  const q = {
    calls,
    eq: (col, val) => { calls.push(['eq', col, val]); return q; },
    in: (col, vals) => { calls.push(['in', col, vals]); return q; },
  };
  return q;
}

describe('applyOwnerFilter', () => {
  it('passes the query through when no owner is given', () => {
    const q = fakeQuery();
    expect(applyOwnerFilter(q, null)).toBe(q);
    expect(applyOwnerFilter(q, [])).toBe(q);
    expect(q.calls).toEqual([]);
  });

  it('uses eq for a single owner (string or 1-element array)', () => {
    const q1 = fakeQuery();
    applyOwnerFilter(q1, 'U1');
    expect(q1.calls).toEqual([['eq', 'owner_id', 'U1']]);

    const q2 = fakeQuery();
    applyOwnerFilter(q2, ['U1']);
    expect(q2.calls).toEqual([['eq', 'owner_id', 'U1']]);
  });

  it('uses in for multiple owners and honors a custom column', () => {
    const q = fakeQuery();
    applyOwnerFilter(q, ['U1', 'U2'], 'user_id');
    expect(q.calls).toEqual([['in', 'user_id', ['U1', 'U2']]]);
  });
});

describe('getFirstOwnerId / normalizeOwnerIds', () => {
  it('returns the first owner or null', () => {
    expect(getFirstOwnerId('U1')).toBe('U1');
    expect(getFirstOwnerId(['U1', 'U2'])).toBe('U1');
    expect(getFirstOwnerId([])).toBeNull();
    expect(getFirstOwnerId(null)).toBeNull();
  });

  it('normalizes to an array', () => {
    expect(normalizeOwnerIds('U1')).toEqual(['U1']);
    expect(normalizeOwnerIds(['U1'])).toEqual(['U1']);
    expect(normalizeOwnerIds(null)).toEqual([]);
  });
});
