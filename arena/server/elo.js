export const DEFAULT_RATING = 1200;
export const K = 32;

/** Expected score of A against B. */
export const expected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));

/**
 * New ratings after a game. scoreA is 1 (A won), 0 (A lost) or 0.5 (draw).
 * Returns integers; the two changes always sum to zero.
 */
export function updateElo(ra, rb, scoreA, k = K) {
  const delta = Math.round(k * (scoreA - expected(ra, rb)));
  return { a: ra + delta, b: rb - delta, delta };
}
