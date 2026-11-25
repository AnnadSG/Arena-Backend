import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIN, chooseMove, search } from '../shared/engine.js';
import { getGame } from '../shared/games/index.js';

test('Rastos: agent takes an immediate win', () => {
  const g = getGame('rastos');
  const s = { ...g.init(), k: 48, p: 0 }; // a2, next to a1 (player 0's goal)
  const r = search(g, s, { timeMs: 200 });
  assert.equal(r.move, 56);
  assert.ok(r.score > WIN - 1000);
});

test('Rastos: agent does not hand the opponent their goal', () => {
  const g = getGame('rastos');
  const s = { ...g.init(), k: 15, p: 0 }; // h7, next to h8 (player 1's goal)
  const r = search(g, s, { timeMs: 200 });
  assert.notEqual(r.move, 7);
});

test('search always returns a legal move and reports its effort', () => {
  for (const id of ['dominorio', 'caes-e-gatos', 'rastos']) {
    const g = getGame(id);
    const s = g.init();
    const r = search(g, s, { timeMs: 50 });
    assert.ok(g.moves(s).some((m) => JSON.stringify(m) === JSON.stringify(r.move)), id);
    assert.ok(r.depth >= 1 && r.nodes > 0, id);
  }
});

test('stronger agent beats the easy one in most Rastos games', () => {
  const g = getGame('rastos');
  let wins = 0;
  for (let i = 0; i < 6; i++) {
    let s = g.init();
    const strong = i % 2; // alternate colours
    while (g.result(s) === null) {
      const lvl = s.p === strong ? 1 : 0;
      s = g.apply(s, chooseMove(g, s, lvl).move);
    }
    if (g.result(s) === strong) wins++;
  }
  assert.ok(wins >= 4, `ganhou ${wins}/6`);
});
