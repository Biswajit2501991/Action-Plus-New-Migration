import { describe, expect, it, vi } from 'vitest';
import { syncGymRowsByExternalId } from './collectionSync.js';

function mockSb(existingRows = []) {
  const store = [...existingRows];
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                range: async () => ({ data: store.map((r) => ({ external_tx_id: r.external_tx_id })) }),
              };
            },
          };
        },
        delete() {
          return {
            eq() {
              return {
                in: async (_col, ids) => {
                  for (let i = store.length - 1; i >= 0; i -= 1) {
                    if (ids.includes(store[i].external_tx_id)) store.splice(i, 1);
                  }
                  return { error: null };
                },
              };
            },
          };
        },
        upsert: async (rows) => {
          for (const row of rows) {
            const idx = store.findIndex((r) => r.external_tx_id === row.external_tx_id);
            if (idx >= 0) store[idx] = row;
            else store.push(row);
          }
          return { error: null };
        },
        insert: async (row) => {
          store.push(row);
          return { error: null };
        },
      };
    },
    _store: store,
  };
}

describe('syncGymRowsByExternalId', () => {
  it('upserts rows and removes orphans scoped to gym', async () => {
    const sb = mockSb([
      { gym_id: 'g1', external_tx_id: 'old', amount: 1 },
    ]);
    await syncGymRowsByExternalId(sb, 'finance_transactions', {
      gymId: 'g1',
      externalIdColumn: 'external_tx_id',
      rows: [{ gym_id: 'g1', external_tx_id: 'new', amount: 2 }],
      onConflict: 'gym_id,external_tx_id',
    });
    expect(sb._store).toHaveLength(1);
    expect(sb._store[0].external_tx_id).toBe('new');
  });
});
