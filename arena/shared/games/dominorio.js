import { SIZE, cellName } from '../board.js';

/**
 * Dominório (Domineering). Player 0 places vertical dominoes, player 1 horizontal ones.
 * A move is [a, b] with a < b. The player who cannot move loses.
 */
export default {
  id: 'dominorio',
  title: 'Dominório',
  players: ['Vertical', 'Horizontal'],
  rules: [
    'Tabuleiro 8×8. Um jogador coloca dominós na vertical, o outro na horizontal; cada dominó ocupa duas casas livres adjacentes.',
    'Quem não conseguir jogar perde — o último a jogar ganha.',
  ],

  init() {
    return { b: Array(SIZE * SIZE).fill(0), id: Array(SIZE * SIZE).fill(0), p: 0, n: 0, last: null };
  },

  moves(s, p = s.p) {
    const r = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (s.b[i]) continue;
      if (p === 0) {
        if (i < SIZE * (SIZE - 1) && !s.b[i + SIZE]) r.push([i, i + SIZE]);
      } else if (i % SIZE < SIZE - 1 && !s.b[i + 1]) {
        r.push([i, i + 1]);
      }
    }
    return r;
  },

  apply(s, m) {
    const b = s.b.slice();
    const id = s.id.slice();
    b[m[0]] = b[m[1]] = s.p + 1;
    id[m[0]] = id[m[1]] = s.n + 1;
    return { b, id, p: 1 - s.p, n: s.n + 1, last: m };
  },

  result(s) {
    return this.moves(s).length ? null : 1 - s.p;
  },

  /** Mobility difference from the point of view of the player to move. */
  evaluate(s) {
    return this.moves(s, s.p).length - this.moves(s, 1 - s.p).length;
  },

  label: (m) => `${cellName(m[0])}–${cellName(m[1])}`,
};
