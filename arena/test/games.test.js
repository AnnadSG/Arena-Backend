import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, findLegalMove, getGame } from '../shared/games/index.js';
import { cellName } from '../shared/board.js';

test('cell names follow algebraic notation', () => {
  assert.equal(cellName(0), 'a8');
  assert.equal(cellName(63), 'h1');
  assert.equal(cellName(28), 'e5');
});

test('Dominório: opening move counts and orientation', () => {
  const g = getGame('dominorio');
  const s = g.init();
  assert.equal(g.moves(s).length, 56); // 8 columns x 7 vertical pairs
  assert.equal(g.moves(s, 1).length, 56);
  assert.ok(g.moves(s).every(([a, b]) => b - a === 8));
  assert.ok(g.moves(s, 1).every(([a, b]) => b - a === 1 && a % 8 < 7));
});

test('Dominório: apply does not mutate and blocks overlapping moves', () => {
  const g = getGame('dominorio');
  const s0 = g.init();
  const s1 = g.apply(s0, [0, 8]);
  assert.equal(s0.b[0], 0, 'original state untouched');
  assert.equal(s1.p, 1);
  assert.equal(findLegalMove(g, s1, [0, 1]), null, 'horizontal over a placed domino is illegal');
  assert.deepEqual(findLegalMove(g, s1, [1, 2]), [1, 2]);
});

test('Dominório: player without moves loses', () => {
  const g = getGame('dominorio');
  const s = g.init();
  s.b = s.b.map((_, i) => (i % 2 ? 1 : 0)); // every other column filled: no horizontal moves
  s.p = 1;
  assert.equal(g.result(s), 0);
});

test('Cães e Gatos: cannot place next to an opposing animal', () => {
  const g = getGame('caes-e-gatos');
  const s1 = g.apply(g.init(), 27); // cat on d5
  assert.equal(g.moves(g.init()).length, 64);
  for (const j of [19, 35, 26, 28]) assert.equal(g.isLegal(s1, 1, j), false);
  assert.equal(g.isLegal(s1, 1, 18), true, 'diagonal is allowed');
  assert.equal(g.isLegal(s1, 0, 28), true, 'own species can be adjacent');
});

test('Rastos: stone moves, leaves a trail, goals decide the winner', () => {
  const g = getGame('rastos');
  const s0 = g.init();
  assert.equal(s0.k, 28);
  assert.equal(g.moves(s0).length, 8);
  const s1 = g.apply(s0, 29);
  assert.equal(s1.b[28], 1);
  assert.ok(!g.moves(s1).includes(28));
  assert.equal(g.result({ ...s1, k: 56 }), 0);
  assert.equal(g.result({ ...s1, k: 7 }), 1);
});

test('every registered game implements the interface', () => {
  for (const g of Object.values(GAMES)) {
    for (const fn of ['init', 'moves', 'apply', 'result', 'evaluate', 'label']) assert.equal(typeof g[fn], 'function', `${g.id}.${fn}`);
    assert.equal(g.players.length, 2);
    const s = g.init();
    assert.equal(g.result(s), null);
    assert.doesNotThrow(() => JSON.stringify(s));
  }
});
