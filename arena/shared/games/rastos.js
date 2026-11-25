import { SIZE, cellName, neighbours8 } from '../board.js';

export const START = 28; // e5
export const GOALS = [56, 7]; // player 0 -> a1, player 1 -> h8

/**
 * Rastos (Rastros). A single stone moves to a free neighbouring cell (8 directions);
 * the cell it leaves becomes blocked. If the stone enters a1 player 0 wins, h8 player 1
 * wins, whoever moved it there. A player with no legal move loses.
 */
export default {
  id: 'rastos',
  title: 'Rastos',
  players: ['Jogador 1', 'Jogador 2'],
  rules: [
    'A peça branca começa em e5. Na sua vez, cada jogador move-a para uma casa vizinha livre (incluindo diagonais); a casa de onde saiu fica bloqueada.',
    'Se a peça entrar na casa 1 (a1) ganha o jogador 1; se entrar na casa 2 (h8) ganha o jogador 2 — seja quem for que a lá coloque.',
    'Quem ficar sem jogadas perde.',
  ],

  init() {
    return { b: Array(SIZE * SIZE).fill(0), k: START, p: 0, last: null };
  },

  moves(s) {
    return neighbours8(s.k).filter((j) => !s.b[j]);
  },

  apply(s, m) {
    const b = s.b.slice();
    b[s.k] = 1;
    return { b, k: m, p: 1 - s.p, last: m };
  },

  result(s) {
    if (s.k === GOALS[0]) return 0;
    if (s.k === GOALS[1]) return 1;
    return this.moves(s).length ? null : 1 - s.p;
  },

  /** Shortest path (BFS) from the stone to a target through free cells; 50 if unreachable. */
  distance(s, target) {
    const d = Array(SIZE * SIZE).fill(-1);
    const queue = [s.k];
    d[s.k] = 0;
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h];
      if (i === target) return d[i];
      for (const j of neighbours8(i)) {
        if (d[j] < 0 && !s.b[j]) {
          d[j] = d[i] + 1;
          queue.push(j);
        }
      }
    }
    return 50;
  },

  evaluate(s) {
    const d0 = this.distance(s, GOALS[0]);
    const d1 = this.distance(s, GOALS[1]);
    const sign = s.p === 0 ? 1 : -1;
    return sign * (d1 - d0) * 4 + this.moves(s).length;
  },

  label: (m) => cellName(m),
};
