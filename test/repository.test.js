import test from 'node:test';
import assert from 'node:assert/strict';
import { Repository, canonicalNpcPair } from '../src/repository.js';

test('canonicalNpcPair always orders NPC ids so relationship key is stable', () => {
  assert.deepEqual(canonicalNpcPair(20, 10), { a: 10, b: 20, swapped: true });
  assert.deepEqual(canonicalNpcPair(10, 20), { a: 10, b: 20, swapped: false });
  assert.throws(() => canonicalNpcPair(10, 10), /distinct/i);
});

test('insertNpcProfile uses a parameterized conflict-safe insert then rereads authoritative row', async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      if (calls.length === 1) return { rows: [] };
      return {
        rows: [{
          npc_user_id: 123,
          username: 'A',
          display_name: 'A',
          profile: { archetype: 'x' },
        }],
      };
    },
  };

  const repo = new Repository(pool);
  const row = await repo.insertNpcProfile({
    userId: 123,
    username: 'A',
    displayName: 'A',
    profile: { archetype: 'x' },
  });

  assert.equal(row.npc_user_id, 123);
  assert.match(calls[0].text, /ON CONFLICT \(npc_user_id\) DO NOTHING/i);
  assert.deepEqual(calls[0].values.slice(0, 3), [123, 'A', 'A']);
  assert.match(calls[1].text, /WHERE npc_user_id = \$1/i);
});

test('applyPlayerOpinionDelta clamps in SQL and updates username/summary atomically', async () => {
  const calls = [];
  const pool = {
    async query(text, values) {
      calls.push({ text, values });
      return { rows: [{ opinion: 100, relationship_summary: 'updated' }] };
    },
  };

  const repo = new Repository(pool);
  const result = await repo.applyPlayerOpinionDelta({
    npcUserId: 1,
    playerUserId: 2,
    playerUsername: 'PlayerTwo',
    delta: 8,
    relationshipSummary: 'updated',
  });

  assert.equal(result.opinion, 100);
  assert.match(calls[0].text, /GREATEST\(1, LEAST\(100/i);
  assert.deepEqual(calls[0].values, [1, 2, 'PlayerTwo', 8, 'updated']);
});
