// End-to-end: real HTTP + Socket.IO server on a random port, memory store, agents in worker threads.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createMemoryStore } from '../server/db/memory.js';
import { runInWorker } from '../server/ai/runner.js';
import { createApp } from '../server/app.js';

let server;
let url;
const sockets = [];

before(async () => {
  ({ server } = createApp({ store: createMemoryStore(), runAI: runInWorker }));
  await new Promise((r) => server.listen(0, r));
  url = `http://localhost:${server.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.close());
  await new Promise((r) => server.close(r));
});

function client() {
  const s = connect(url, { transports: ['websocket'] });
  sockets.push(s);
  const emit = (ev, data) => new Promise((r) => s.emit(ev, data, r));
  const next = (pred) => new Promise((r) => {
    const h = (m) => { if (pred(m)) { s.off('match:state', h); r(m); } };
    s.on('match:state', h);
  });
  return { s, emit, next };
}

test('REST: health, games and validation', async () => {
  assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { ok: true, store: 'memory' });
  const info = await (await fetch(`${url}/api/games`)).json();
  assert.equal(info.games.length, 3);
  assert.equal((await fetch(`${url}/api/leaderboard?game=xadrez`)).status, 400);
  assert.equal((await fetch(`${url}/shared/engine.js`)).status, 200, 'shared code is served to the browser');
});

test('socket: names are validated and bot names reserved', async () => {
  const c = client();
  assert.equal((await c.emit('hello', { name: '<script>' })).ok, false);
  assert.equal((await c.emit('match:create', { gameId: 'rastos', mode: 'ai' })).ok, false, 'needs a name first');
  const r = await c.emit('hello', { name: 'Ana' });
  assert.equal(r.ok, true);
  const bot = await c.emit('match:create', { gameId: 'rastos', mode: 'ai', level: 0 });
  assert.equal(bot.ok, true);
  const c2 = client();
  assert.equal((await c2.emit('hello', { name: 'Agente Fácil' })).ok, false);
});

test('socket: online game between two people, broadcast to both', async () => {
  const a = client();
  const b = client();
  await a.emit('hello', { name: 'Beatriz' });
  await b.emit('hello', { name: 'Carlos' });
  const { match } = await a.emit('match:create', { gameId: 'caes-e-gatos', mode: 'pvp' });
  const started = a.next((m) => m.status === 'playing');
  const joined = await b.emit('match:join', { code: match.code });
  assert.equal(joined.match.seats[1].name, 'Carlos');
  await started;

  const seen = b.next((m) => m.log.length === 1);
  assert.equal((await a.emit('match:move', { id: match.id, move: 27 })).ok, true);
  assert.equal((await seen).log[0].label, 'd5');
  assert.equal((await a.emit('match:move', { id: match.id, move: 0 })).error, 'Não é a tua vez');

  const done = a.next((m) => m.status === 'finished');
  await b.emit('match:resign', { id: match.id });
  const final = await done;
  assert.equal(final.winner, 0);
  assert.deepEqual(final.elo.after, [1216, 1184]);

  const board = await (await fetch(`${url}/api/leaderboard?game=caes-e-gatos`)).json();
  assert.equal(board[0].name, 'Beatriz');
});

test('socket: the agent replies from a worker thread', async () => {
  const c = client();
  await c.emit('hello', { name: 'Daniel' });
  const { match } = await c.emit('match:create', { gameId: 'dominorio', mode: 'ai', side: 0, level: 1 });
  const reply = c.next((m) => m.log.length === 2);
  await c.emit('match:move', { id: match.id, move: [0, 8] });
  const m = await reply;
  assert.equal(m.log[1].seat, 1);
  assert.ok(m.lastSearch.depth >= 1);
});
