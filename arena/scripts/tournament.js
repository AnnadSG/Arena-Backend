// Round-robin tournament between the agent levels, for every game.
// Results are saved through the configured store (PostgreSQL if DATABASE_URL is set),
// so the ELO ranking of the agents reflects them.
//
//   npm run tournament                          # 2 games per pairing and colour
//   npm run tournament -- --rounds 10 --game rastos --time-scale 0.25
// --time-scale multiplies every agent's thinking time (0.25 = 4x faster tournament).
import { parseArgs } from 'node:util';
import { LEVELS, search } from '../shared/engine.js';
import { GAMES, getGame } from '../shared/games/index.js';
import { createStore } from '../server/db/index.js';
import { MatchManager } from '../server/matches.js';

const { values } = parseArgs({ options: { rounds: { type: 'string', default: '2' }, game: { type: 'string' }, 'time-scale': { type: 'string', default: '1' } } });
const rounds = Number(values.rounds);
const games = values.game ? [values.game] : Object.keys(GAMES);
const levels = Object.keys(LEVELS).map(Number);
const scale = Number(values['time-scale']);

// Same behaviour as chooseMove, with the thinking time scaled.
async function runAI(gameId, state, level) {
  const cfg = LEVELS[level];
  const game = getGame(gameId);
  const res = search(game, state, { ...cfg, timeMs: Math.max(5, cfg.timeMs * scale) });
  if (cfg.randomness && Math.random() < cfg.randomness) {
    const legal = game.moves(state);
    res.move = legal[Math.floor(Math.random() * legal.length)];
  }
  return res;
}

const store = await createStore();
const manager = new MatchManager({ store, runAI, finishedTtlMs: 0 });

for (const gameId of games) {
  const table = {};
  const key = (l) => LEVELS[l].name;
  levels.forEach((l) => (table[key(l)] = { vitórias: 0, derrotas: 0, 'jogadas (média)': 0 }));
  let totalMoves = 0;
  let played = 0;

  for (const a of levels) {
    for (const b of levels) {
      if (a === b) continue;
      for (let r = 0; r < rounds; r++) {
        const m = await manager.create({ gameId, mode: 'aivai', levels: [a, b] });
        await manager.settled(m.id);
        const winner = m.winner === 0 ? a : b;
        const loser = m.winner === 0 ? b : a;
        table[key(winner)].vitórias++;
        table[key(loser)].derrotas++;
        totalMoves += m.log.length;
        played++;
      }
    }
  }
  console.log(`\n${GAMES[gameId].title} — ${played} partidas, ${(totalMoves / played).toFixed(1)} jogadas em média`);
  console.table(Object.fromEntries(Object.entries(table).map(([k, v]) => [k, { vitórias: v.vitórias, derrotas: v.derrotas }])));
  console.table(await store.leaderboard(gameId, 10));
}

await store.close();
