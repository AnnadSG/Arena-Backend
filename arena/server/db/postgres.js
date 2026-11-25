import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DEFAULT_RATING } from '../elo.js';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function createPostgresStore({ connectionString, ssl }) {
  const pool = new pg.Pool({ connectionString, ssl: ssl ? { rejectUnauthorized: false } : false });

  return {
    kind: 'postgres',

    /** Runs every .sql file in migrations/ in order. They are idempotent (IF NOT EXISTS). */
    async init() {
      const files = (await fs.readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) await pool.query(await fs.readFile(path.join(MIGRATIONS, f), 'utf8'));
    },

    async close() {
      await pool.end();
    },

    async upsertPlayer(name, isBot = false) {
      const { rows } = await pool.query(
        `INSERT INTO players (name, is_bot) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name, is_bot`,
        [name, isBot],
      );
      return rows[0];
    },

    async getRating(playerId, game) {
      const { rows } = await pool.query('SELECT elo FROM ratings WHERE player_id = $1 AND game = $2', [playerId, game]);
      return rows[0]?.elo ?? DEFAULT_RATING;
    },

    async saveResult({ game, player0Id, player1Id, winner, moves, startedAt, newRatings, eloDelta, source }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO matches (game, player0_id, player1_id, winner, moves, elo_delta, source, started_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [game, player0Id, player1Id, winner, JSON.stringify(moves), eloDelta, source, startedAt],
        );
        for (const [seat, id] of [player0Id, player1Id].entries()) {
          await client.query(
            `INSERT INTO ratings (player_id, game, elo, games, wins) VALUES ($1, $2, $3, 1, $4)
             ON CONFLICT (player_id, game) DO UPDATE
             SET elo = EXCLUDED.elo, games = ratings.games + 1, wins = ratings.wins + EXCLUDED.wins`,
            [id, game, newRatings[seat], winner === seat ? 1 : 0],
          );
        }
        await client.query('COMMIT');
        return rows[0].id;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },

    async leaderboard(game, limit = 20) {
      const { rows } = await pool.query(
        `SELECT p.name, p.is_bot, r.elo, r.games, r.wins
         FROM ratings r JOIN players p ON p.id = r.player_id
         WHERE r.game = $1 ORDER BY r.elo DESC LIMIT $2`,
        [game, limit],
      );
      return rows;
    },

    async recentMatches(game, limit = 20) {
      const { rows } = await pool.query(
        `SELECT m.id, p0.name AS player0, p1.name AS player1, m.winner,
                jsonb_array_length(m.moves) AS n_moves, m.elo_delta, m.ended_at
         FROM matches m
         JOIN players p0 ON p0.id = m.player0_id
         JOIN players p1 ON p1.id = m.player1_id
         WHERE m.game = $1 ORDER BY m.ended_at DESC LIMIT $2`,
        [game, limit],
      );
      return rows;
    },

    async getMatch(id) {
      const { rows } = await pool.query('SELECT * FROM matches WHERE id = $1', [id]);
      return rows[0] ?? null;
    },
  };
}
