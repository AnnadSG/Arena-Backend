import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expected, updateElo } from '../server/elo.js';

test('equal ratings expect 0.5 and move 16 points with K=32', () => {
  assert.equal(expected(1200, 1200), 0.5);
  assert.deepEqual(updateElo(1200, 1200, 1), { a: 1216, b: 1184, delta: 16 });
});

test('rating changes are zero-sum and favour upsets', () => {
  const upset = updateElo(1000, 1400, 1);
  const expectedWin = updateElo(1400, 1000, 1);
  assert.equal(upset.a + upset.b, 2400);
  assert.ok(upset.delta > expectedWin.delta);
});
