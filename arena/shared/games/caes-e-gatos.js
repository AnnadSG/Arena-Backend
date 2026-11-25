import { SIZE, cellName, neighbours4 } from '../board.js';

/**
 * Cães e Gatos (Snort). Player 0 places cats (1), player 1 places dogs (2).
 * An animal cannot be placed orthogonally next to an opposing animal.
 * A move is a cell index. The player who cannot move loses.
 */
export default {
  id: 'caes-e-gatos',
  title: 'Cães e Gatos',
  players: ['Gatos', 'Cães'],
  rules: [
    'Tabuleiro 8×8. Um jogador coloca gatos, o outro cães, um animal por jogada numa casa vazia.',
    'Não se pode colocar um animal numa casa ortogonalmente vizinha de um animal adversário.',
    'Quem não conseguir jogar perde.',
  ],

  init() {
    return { b: Array(SIZE * SIZE).fill(0), p: 0, last: null };
  },

  isLegal(s, p, i) {
    if (s.b[i]) return false;
    const opponent = p === 0 ? 2 : 1;
    return !neighbours4(i).some((j) => s.b[j] === opponent);
  },

  moves(s, p = s.p) {
    const r = [];
    for (let i = 0; i < SIZE * SIZE; i++) if (this.isLegal(s, p, i)) r.push(i);
    return r;
  },

  apply(s, m) {
    const b = s.b.slice();
    b[m] = s.p + 1;
    return { b, p: 1 - s.p, last: m };
  },

  result(s) {
    return this.moves(s).length ? null : 1 - s.p;
  },

  evaluate(s) {
    return this.moves(s, s.p).length - this.moves(s, 1 - s.p).length;
  },

  label: (m) => cellName(m),
};
