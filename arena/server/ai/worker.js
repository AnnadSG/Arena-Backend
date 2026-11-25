// Runs one search in a separate thread so the server's event loop never blocks.
import { parentPort, workerData } from 'node:worker_threads';
import { chooseMove } from '../../shared/engine.js';
import { getGame } from '../../shared/games/index.js';

const { gameId, state, level } = workerData;
parentPort.postMessage(chooseMove(getGame(gameId), state, level));
