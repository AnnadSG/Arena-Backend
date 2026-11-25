import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../server/db/memory.js';
import { runInline } from '../server/ai/runner.js';
import { GameError, MatchManager } from '../server/matches.js';

async function setup() {
  const store = createMemoryStore();
  const updates = [];
  const manager = new MatchManager({ store, runAI: runInline, onUpdate: (m) => updates.push(m.version), finishedTtlMs: 0 });
  const ana = await store.upsertPlayer('Ana');
  const rui = await store.upsertPlayer('Rui');
  return { store, manager, ana, rui, updates };
}

test('PvP: join, turn order and illegal moves are enforced', async () => {
  const { manager, ana, rui } = await setup();
  const m = await manager.create({ gameId: 'caes-e-gatos', mode: 'pvp', player: ana });
  assert.equal(m.status, 'waiting');
  manager.join(m.code.toLowerCase(), rui);
  assert.equal(m.status, 'playing');

  await assert.rejects(manager.move(m.id, rui.id, 0), GameError, 'not your turn');
  await manager.move(m.id, ana.id, 27);
  await assert.rejects(manager.move(m.id, rui.id, 28), /ilegal/);
  await assert.rejects(manager.move(m.id, 999, 0), /sentado/);
  await manager.move(m.id, rui.id, 0);
  assert.equal(m.log.length, 2);
});

test('resigning finishes the game and updates both ratings', async () => {
  const { manager, store, ana, rui } = await setup();
  const m = await manager.create({ gameId: 'rastos', mode: 'pvp', player: ana });
  manager.join(m.code, rui);
  await manager.resign(m.id, ana.id);
  assert.equal(m.status, 'finished');
  assert.equal(m.winner, 1);
  assert.equal(await store.getRating(rui.id, 'rastos'), 1216);
  assert.equal(await store.getRating(ana.id, 'rastos'), 1184);
  const [row] = await store.recentMatches('rastos');
  assert.equal(row.player1, 'Rui');
});

test('vs agent: the server answers every human move', async () => {
  const { manager, ana } = await setup();
  const m = await manager.create({ gameId: 'dominorio', mode: 'ai', player: ana, side: 0, level: 0 });
  await manager.move(m.id, ana.id, [0, 8]);
  await manager.settled(m.id);
  assert.equal(m.log.length, 2);
  assert.equal(m.state.p, 0, 'back to the human');
  assert.ok(m.lastSearch.nodes > 0);
});

test('agent vs agent plays to the end and is saved', async () => {
  const { manager, store } = await setup();
  const m = await manager.create({ gameId: 'rastos', mode: 'aivai', levels: [0, 0] });
  await manager.settled(m.id);
  assert.equal(m.status, 'finished');
  const board = await store.leaderboard('rastos');
  assert.equal(board.length, 1, 'same bot on both seats shares one rating row');
});
