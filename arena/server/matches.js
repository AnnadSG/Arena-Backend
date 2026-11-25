import crypto from 'node:crypto';
import { LEVELS } from '../shared/engine.js';
import { findLegalMove, getGame } from '../shared/games/index.js';
import { updateElo } from './elo.js';

export class GameError extends Error {}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(5), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

/**
 * Keeps the live matches and is the single authority on their state:
 * every move is validated here, AI moves are computed here, results are persisted here.
 */
export class MatchManager {
  constructor({ store, runAI, aiDelayMs = 0, onUpdate = () => {}, finishedTtlMs = 30 * 60_000 }) {
    this.store = store;
    this.runAI = runAI;
    this.aiDelayMs = aiDelayMs;
    this.onUpdate = onUpdate;
    this.finishedTtlMs = finishedTtlMs;
    this.matches = new Map(); // id -> match
    this.byCode = new Map(); // code -> id
  }

  async botPlayer(level) {
    const cfg = LEVELS[level];
    if (!cfg) throw new GameError('Nível de agente inválido');
    const p = await this.store.upsertPlayer(cfg.name, true);
    return { type: 'ai', level: Number(level), id: p.id, name: p.name };
  }

  /**
   * mode 'ai'   : creator plays seat `side` against the agent at `level`
   * mode 'pvp'  : creator takes seat 0, a second person joins with the code
   * mode 'aivai': two agents (`levels` = [l0, l1]); the creator watches
   */
  async create({ gameId, mode, player, side = 0, level = 1, levels = [1, 2] }) {
    const game = getGame(gameId);
    const human = player && { type: 'human', id: player.id, name: player.name };
    let seats;
    if (mode === 'ai') {
      if (!human) throw new GameError('É preciso um jogador');
      const bot = await this.botPlayer(level);
      seats = Number(side) === 0 ? [human, bot] : [bot, human];
    } else if (mode === 'pvp') {
      if (!human) throw new GameError('É preciso um jogador');
      seats = [human, null];
    } else if (mode === 'aivai') {
      seats = [await this.botPlayer(levels[0]), await this.botPlayer(levels[1])];
    } else {
      throw new GameError('Modo inválido');
    }

    const match = {
      id: crypto.randomUUID(),
      code: newCode(),
      gameId,
      mode,
      seats,
      state: game.init(),
      log: [],
      status: seats.includes(null) ? 'waiting' : 'playing',
      winner: null,
      reason: null,
      lastSearch: null,
      elo: null,
      startedAt: new Date().toISOString(),
      version: 0,
      pending: Promise.resolve(),
    };
    this.matches.set(match.id, match);
    this.byCode.set(match.code, match.id);
    this.changed(match);
    return match;
  }

  get(idOrCode) {
    const id = this.matches.has(idOrCode) ? idOrCode : this.byCode.get(String(idOrCode).toUpperCase());
    const m = id && this.matches.get(id);
    if (!m) throw new GameError('Partida não encontrada');
    return m;
  }

  /** A second person joins a waiting PvP match; anyone else becomes a spectator. */
  join(code, player) {
    const m = this.get(code);
    if (m.status === 'waiting' && m.seats[0].id !== player.id) {
      m.seats[1] = { type: 'human', id: player.id, name: player.name };
      m.status = 'playing';
      this.changed(m);
    }
    return m;
  }

  seatOf(m, playerId) {
    return m.seats.findIndex((s) => s && s.type === 'human' && s.id === playerId);
  }

  async move(id, playerId, rawMove) {
    const m = this.get(id);
    if (m.status !== 'playing') throw new GameError('A partida não está a decorrer');
    const seat = this.seatOf(m, playerId);
    if (seat < 0) throw new GameError('Não estás sentado nesta partida');
    if (m.state.p !== seat) throw new GameError('Não é a tua vez');
    const game = getGame(m.gameId);
    const move = findLegalMove(game, m.state, rawMove);
    if (move === null) throw new GameError('Jogada ilegal');
    await this.applyMove(m, move);
    return m;
  }

  async resign(id, playerId) {
    const m = this.get(id);
    const seat = this.seatOf(m, playerId);
    if (seat < 0 || m.status !== 'playing') throw new GameError('Não podes desistir desta partida');
    await this.finish(m, 1 - seat, 'desistência');
    return m;
  }

  async applyMove(m, move) {
    const game = getGame(m.gameId);
    m.log.push({ seat: m.state.p, move, label: game.label(move) });
    m.state = game.apply(m.state, move);
    m.version++;
    const winner = game.result(m.state);
    if (winner !== null) await this.finish(m, winner, 'sem jogadas ou objetivo atingido');
    else this.changed(m);
  }

  async finish(m, winner, reason) {
    m.status = 'finished';
    m.winner = winner;
    m.reason = reason;
    m.version++;
    const [p0, p1] = m.seats;
    if (p0 && p1) {
      const [r0, r1] = await Promise.all([this.store.getRating(p0.id, m.gameId), this.store.getRating(p1.id, m.gameId)]);
      const { a, b, delta } = updateElo(r0, r1, winner === 0 ? 1 : 0);
      await this.store.saveResult({
        game: m.gameId, player0Id: p0.id, player1Id: p1.id, winner,
        moves: m.log.map((x) => x.move), startedAt: m.startedAt,
        newRatings: [a, b], eloDelta: delta, source: m.mode,
      });
      m.elo = { before: [r0, r1], after: [a, b] };
    }
    this.changed(m);
    setTimeout(() => this.remove(m.id), this.finishedTtlMs).unref?.();
  }

  remove(id) {
    const m = this.matches.get(id);
    if (!m) return;
    this.matches.delete(id);
    this.byCode.delete(m.code);
  }

  /** Broadcasts and, if an agent is to move, schedules its move. */
  changed(m) {
    this.onUpdate(m);
    if (m.status !== 'playing') return;
    const seat = m.seats[m.state.p];
    if (seat?.type !== 'ai') return;
    const version = m.version;
    m.pending = m.pending.then(async () => {
      if (this.aiDelayMs) await new Promise((r) => setTimeout(r, this.aiDelayMs));
      if (m.version !== version || m.status !== 'playing') return;
      try {
        const res = await this.runAI(m.gameId, m.state, seat.level);
        if (m.version !== version) return;
        m.lastSearch = { seat: m.state.p, depth: res.depth, nodes: res.nodes, timeMs: res.timeMs, score: res.score };
        await this.applyMove(m, res.move);
      } catch (e) {
        console.error('Erro do agente:', e);
      }
    });
  }

  /** Resolves when every scheduled agent move of this match has been played (tests, tournament). */
  async settled(id) {
    const m = this.get(id);
    let p;
    do {
      p = m.pending;
      await p;
    } while (p !== m.pending);
    return m;
  }

  /** What clients are allowed to see. */
  view(m) {
    return {
      id: m.id, code: m.code, gameId: m.gameId, mode: m.mode, status: m.status,
      seats: m.seats.map((s) => s && { type: s.type, name: s.name, level: s.level, id: s.type === 'human' ? s.id : undefined }),
      state: m.state, log: m.log, winner: m.winner, reason: m.reason,
      lastSearch: m.lastSearch, elo: m.elo,
    };
  }
}
