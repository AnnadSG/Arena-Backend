// Helpers for 8x8 boards. Cell index i = row * 8 + col, row 0 is the top (rank 8).
export const SIZE = 8;
export const COLS = 'abcdefgh';

/** Algebraic name of a cell, e.g. 0 -> "a8", 63 -> "h1". */
export const cellName = (i) => COLS[i % SIZE] + (SIZE - Math.floor(i / SIZE));

/** Orthogonal neighbours. */
export function neighbours4(i) {
  const r = [];
  if (i >= SIZE) r.push(i - SIZE);
  if (i < SIZE * (SIZE - 1)) r.push(i + SIZE);
  if (i % SIZE) r.push(i - 1);
  if (i % SIZE < SIZE - 1) r.push(i + 1);
  return r;
}

/** Orthogonal and diagonal neighbours. */
export function neighbours8(i) {
  const r = [];
  const y = Math.floor(i / SIZE);
  const x = i % SIZE;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const yy = y + dy;
      const xx = x + dx;
      if (yy >= 0 && yy < SIZE && xx >= 0 && xx < SIZE) r.push(yy * SIZE + xx);
    }
  }
  return r;
}
