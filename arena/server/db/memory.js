import { DEFAULT_RATING } from '../elo.js';

/** In-memory store with the same interface as the Postgres store. Used for local dev and tests. */
export function createMemoryStore() {
  const players = [];
  const ratings = new Map(); // `${playerId}:${game}` -> { elo, games, wins }
  const matches = [];
  const key = (id, game) => `${id}:${game}`;
  const rating = (id, game) => ratings.get(key(id, game)) ?? { elo: DEFAULT_RATING, games: 0, wins: 0 };

  return {
    kind: 'memory',
    async init() {},
    async close() {},

    async upsertPlayer(name, isBot = false) {
      let p = players.find((x) => x.name === name);
      if (!p) {
        p = { id: players.length + 1, name, is_bot: isBot };
        players.push(p);
      }
      return { ...p };
    },

    async getRating(playerId, game) {
      return rating(playerId, game).elo;
    },

    /** Saves a finished match and both new ratings atomically (trivially, in memory). */
    async saveResult({ game, player0Id, player1Id, winner, moves, startedAt, newRatings, eloDelta, source }) {
      [player0Id, player1Id].forEach((id, seat) => {
        const r = rating(id, game);
        ratings.set(key(id, game), { elo: newRatings[seat], games: r.games + 1, wins: r.wins + (winner === seat ? 1 : 0) });
      });
      const m = {
        id: matches.length + 1, game, player0_id: player0Id, player1_id: player1Id, winner, moves,
        elo_delta: eloDelta, source, started_at: startedAt, ended_at: new Date().toISOString(),
      };
      matches.push(m);
      return m.id;
    },

    async leaderboard(game, limit = 20) {
      return [...ratings.entries()]
        .filter(([k]) => k.endsWith(`:${game}`))
        .map(([k, r]) => {
          const p = players.find((x) => x.id === Number(k.split(':')[0]));
          return { name: p.name, is_bot: p.is_bot, ...r };
        })
        .sort((a, b) => b.elo - a.elo)
        .slice(0, limit);
    },

    async recentMatches(game, limit = 20) {
      const name = (id) => players.find((p) => p.id === id)?.name;
      return matches
        .filter((m) => m.game === game)
        .slice(-limit)
        .reverse()
        .map((m) => ({ id: m.id, player0: name(m.player0_id), player1: name(m.player1_id), winner: m.winner, n_moves: m.moves.length, elo_delta: m.elo_delta, ended_at: m.ended_at }));
    },

    async getMatch(id) {
      return matches.find((m) => m.id === Number(id)) ?? null;
    },
  };
}
