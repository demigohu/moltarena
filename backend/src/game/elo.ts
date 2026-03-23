/**
 * ELO rating update after a 1v1 match (winner gets 1, loser gets 0).
 * Formula: E_a = 1 / (1 + 10^((elo_b - elo_a) / 400)); new_elo = elo + K * (score - E).
 */
const ELO_K = 32;

export function computeNewElo(
  eloWinner: number,
  eloLoser: number,
  k: number = ELO_K
): { newWinnerElo: number; newLoserElo: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (eloLoser - eloWinner) / 400));
  const expectedLoser = 1 - expectedWinner;
  const newWinnerElo = Math.max(0, Math.round(eloWinner + k * (1 - expectedWinner)));
  const newLoserElo = Math.max(0, Math.round(eloLoser + k * (0 - expectedLoser)));
  return { newWinnerElo, newLoserElo };
}
