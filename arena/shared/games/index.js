import dominorio from './dominorio.js';
import caesEGatos from './caes-e-gatos.js';
import rastos from './rastos.js';

/**
 * Registry of available games. Every game implements the same interface:
 *   id, title, players[2], rules[]
 *   init()            -> initial state (plain JSON, p = player to move)
 *   moves(state)      -> legal moves for the player to move
 *   apply(state, m)   -> NEW state (states are never mutated)
 *   result(state)     -> winner (0 | 1) or null while the game is running
 *   evaluate(state)   -> heuristic score from the point of view of the player to move
 *   label(m)          -> human readable move
 * Adding a game = adding a module here; the engine, server and UI need no changes.
 */
export const GAMES = Object.fromEntries([dominorio, caesEGatos, rastos].map((g) => [g.id, g]));

export function getGame(id) {
  const g = GAMES[id];
  if (!g) throw new Error(`Jogo desconhecido: ${id}`);
  return g;
}

/** Moves may be numbers or arrays; compare them structurally. */
export const moveKey = (m) => JSON.stringify(m);

export function findLegalMove(game, state, move) {
  const k = moveKey(move);
  return game.moves(state).find((m) => moveKey(m) === k) ?? null;
}
