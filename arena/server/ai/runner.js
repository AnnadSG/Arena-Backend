import { Worker } from 'node:worker_threads';
import { chooseMove } from '../../shared/engine.js';
import { getGame } from '../../shared/games/index.js';

const WORKER = new URL('./worker.js', import.meta.url);

/** Computes the AI move in a worker thread. Resolves to { move, depth, nodes, timeMs, score }. */
export function runInWorker(gameId, state, level) {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER, { workerData: { gameId, state, level } });
    const timer = setTimeout(() => {
      w.terminate();
      reject(new Error('A pesquisa do agente excedeu o tempo limite'));
    }, 10_000);
    w.once('message', (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    w.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** Same contract, same thread. Used by tests and the tournament script. */
export const runInline = async (gameId, state, level) => chooseMove(getGame(gameId), state, level);
