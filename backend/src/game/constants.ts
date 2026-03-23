/**
 * Sesuai PRD: wager tier, best-of-5, timeout 30 detik per round, deposit timeout 5 menit.
 */
export const WAGER_TIERS = {
  1: 0.1,
  2: 0.5,
  3: 1,
  4: 5,
} as const;

export type WagerTier = keyof typeof WAGER_TIERS;

export const BEST_OF = 5;
export const WINS_TO_WIN_MATCH = 3;

/** Detik per round (harus submit throw sebelum endsAt). */
export const ROUND_TIMEOUT_SECONDS = 30;

/** Detik minimum setelah round_start sebelum throw diterima (agar live match enak ditonton). */
export const ROUND_MIN_DELAY_SECONDS = 3;

/** Jeda ms setelah round_result sebelum kirim round_start (pause antar ronde). */
export const ROUND_RESULT_PAUSE_MS = 5000;

/** Menit untuk deposit setelah game_matched. */
export const DEPOSIT_TIMEOUT_MINUTES = 5;

/** Detik grace period setelah disconnect sebelum forfeit match. */
export const DISCONNECT_GRACE_SECONDS = 30;

/** Max karakter body pesan in-match chat (PRD §9.1). */
export const CHAT_BODY_MAX_LENGTH = 150;

export type RpsChoice = "rock" | "paper" | "scissors";

export function getWagerAmount(tier: WagerTier): number {
  return WAGER_TIERS[tier];
}
