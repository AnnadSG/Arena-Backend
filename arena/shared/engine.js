// Generic adversarial search: negamax + alpha-beta pruning + iterative deepening,
// with a time budget and best-move-first ordering at the root. Works for any game
// that implements the interface described in games/index.js.

export const WIN = 10000;

export const LEVELS = {
  0: { name: 'Agente Fácil', timeMs: 40, maxDepth: 1, randomness: 0.35 },
  1: { name: 'Agente Médio', timeMs: 300, maxDepth: 40, randomness: 0 },
  2: { name: 'Agente Difícil', timeMs: 1200, maxDepth: 40, randomness: 0 },
};

class Timeout extends Error {}

const now = () => (globalThis.performance ? performance.now() : Date.now());

/**
 * @param {object} game     game module
 * @param {object} state    current state
 * @param {object} options  { timeMs, maxDepth, random = Math.random }
 * @returns {{ move, depth, nodes, timeMs, score }}
 */
export function search(game, state, { timeMs = 300, maxDepth = 40, random = Math.random } = {}) {
  const t0 = now();
  let nodes = 0;
  const outOfTime = () => now() - t0 > timeMs;

  function negamax(s, depth, alpha, beta, ply) {
    nodes++;
    const r = game.result(s);
    if (r !== null) return r === s.p ? WIN - ply : -(WIN - ply);
    if (depth === 0) return game.evaluate(s);
    if ((nodes & 511) === 0 && outOfTime()) throw new Timeout();
    let best = -Infinity;
    for (const m of game.moves(s)) {
      const v = -negamax(game.apply(s, m), depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Shuffle so equal moves are not always played in the same order.
  let order = game.moves(state).map((m) => [random(), m]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  if (!order.length) throw new Error('Sem jogadas legais');

  let best = order[0];
  let score = 0;
  let completedDepth = 0;

  for (let d = 1; d <= maxDepth; d++) {
    let alpha = -Infinity;
    let bestHere = null;
    try {
      for (const m of order) {
        const v = -negamax(game.apply(state, m), d - 1, -Infinity, -alpha, 1);
        if (v > alpha) {
          alpha = v;
          bestHere = m;
        }
      }
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    best = bestHere;
    score = alpha;
    completedDepth = d;
    order = [bestHere, ...order.filter((m) => m !== bestHere)];
    if (Math.abs(alpha) > WIN - 1000 || outOfTime()) break;
  }

  return { move: best, depth: completedDepth, nodes, timeMs: Math.round(now() - t0), score };
}

/** Chooses a move for a given difficulty level (0, 1, 2). */
export function chooseMove(game, state, level, random = Math.random) {
  const cfg = LEVELS[level] ?? LEVELS[1];
  const res = search(game, state, { ...cfg, random });
  if (cfg.randomness && random() < cfg.randomness) {
    const legal = game.moves(state);
    res.move = legal[Math.floor(random() * legal.length)];
    res.random = true;
  }
  return res;
}
