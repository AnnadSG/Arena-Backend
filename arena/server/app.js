import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { GAMES } from '../shared/games/index.js';
import { LEVELS } from '../shared/engine.js';
import { GameError, MatchManager } from './matches.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAME_RE = /^[\p{L}\p{N} _.-]{2,24}$/u;

/** Builds the HTTP + WebSocket server. Kept separate from index.js so tests can start it on a random port. */
export function createApp({ store, runAI, aiDelayMs = 0, corsOrigin = '*' }) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: corsOrigin } });
  const room = (id) => `match:${id}`;
  const manager = new MatchManager({
    store, runAI, aiDelayMs,
    onUpdate: (m) => io.to(room(m.id)).emit('match:state', manager.view(m)),
  });

  app.use(express.json({ limit: '16kb' }));
  app.use(express.static(path.join(ROOT, 'public')));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));

  // ---- REST API ----
  const wrap = (fn) => (req, res) =>
    Promise.resolve(fn(req, res)).catch((e) => {
      if (!(e instanceof GameError)) console.error(e);
      res.status(e instanceof GameError ? 400 : 500).json({ error: e instanceof GameError ? e.message : 'Erro interno' });
    });
  const gameParam = (req) => {
    const g = String(req.query.game ?? '');
    if (!GAMES[g]) throw new GameError('Parâmetro game inválido');
    return g;
  };

  app.get('/api/health', (req, res) => res.json({ ok: true, store: store.kind }));
  app.get('/api/games', (req, res) =>
    res.json({
      games: Object.values(GAMES).map(({ id, title, players, rules }) => ({ id, title, players, rules })),
      levels: Object.entries(LEVELS).map(([level, c]) => ({ level: Number(level), name: c.name, timeMs: c.timeMs })),
    }),
  );
  app.get('/api/leaderboard', wrap(async (req, res) => res.json(await store.leaderboard(gameParam(req), 20))));
  app.get('/api/matches', wrap(async (req, res) => res.json(await store.recentMatches(gameParam(req), 15))));
  app.get('/api/matches/:id', wrap(async (req, res) => {
    const m = await store.getMatch(req.params.id);
    if (!m) return res.status(404).json({ error: 'Partida não encontrada' });
    res.json(m);
  }));

  // ---- Real time ----
  io.on('connection', (socket) => {
    let player = null;
    const handle = (fn) => async (data, ack = () => {}) => {
      try {
        ack({ ok: true, ...(await fn(data ?? {})) });
      } catch (e) {
        if (!(e instanceof GameError)) console.error(e);
        ack({ ok: false, error: e instanceof GameError ? e.message : 'Erro interno' });
      }
    };
    const needPlayer = () => {
      if (!player) throw new GameError('Escolhe primeiro um nome');
      return player;
    };
    const watch = (m) => {
      for (const r of socket.rooms) if (r.startsWith('match:')) socket.leave(r);
      socket.join(room(m.id));
      return { match: manager.view(m) };
    };

    socket.on('hello', handle(async ({ name }) => {
      const n = String(name ?? '').trim();
      if (!NAME_RE.test(n)) throw new GameError('Nome inválido (2 a 24 letras, números, espaço, _ . -)');
      const p = await store.upsertPlayer(n, false);
      if (p.is_bot) throw new GameError('Esse nome está reservado');
      player = { id: p.id, name: p.name };
      return { player };
    }));

    socket.on('match:create', handle(async ({ gameId, mode, side, level, levels }) => {
      const m = await manager.create({ gameId, mode, side, level, levels, player: mode === 'aivai' ? player : needPlayer() });
      return watch(m);
    }));
    socket.on('match:join', handle(async ({ code }) => watch(manager.join(code, needPlayer()))));
    socket.on('match:move', handle(async ({ id, move }) => {
      await manager.move(id, needPlayer().id, move);
      return {};
    }));
    socket.on('match:resign', handle(async ({ id }) => {
      await manager.resign(id, needPlayer().id);
      return {};
    }));
  });

  return { app, server, io, manager };
}
