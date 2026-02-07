/**
 * State machine helper: compute "next action per player" given match + rounds.
 * Requires both stakes locked before commit.
 * Produces result struct + transcript_hash when best_of reached.
 */

import { keccak256, toBytes, toHex } from "viem";

export type MatchStatus =
  | "lobby"
  | "stake_locked"
  | "in_progress"
  | "ready_to_settle"
  | "finished"
  | "cancelled";

export type RoundPhase = "commit" | "reveal" | "done";

export type RoundRow = {
  round_number: number;
  phase: RoundPhase;
  commit1: Uint8Array | null;
  commit2: Uint8Array | null;
  commit1_hex?: string | null;
  commit2_hex?: string | null;
  move1: number | null;
  move2: number | null;
  result: number | null; // 1=p1, 0=draw, -1=p2
  commit_deadline: string | null;
  reveal_deadline: string | null;
};

export type MatchRow = {
  id: string;
  status: MatchStatus;
  stake: number | string;
  best_of: number;
  player1_address: string;
  player2_address: string;
  wins1: number;
  wins2: number;
  winner_address: string | null;
  player1_stake_locked?: boolean;
  player2_stake_locked?: boolean;
  sig1?: string | null;
  sig2?: string | null;
};

export type NextAction =
  | "stake"
  | "wait_stake"
  | "commit"
  | "wait_commit"
  | "reveal"
  | "wait_reveal"
  | "wait_result"
  | "sign_result"
  | "settle"
  | "wait_signatures"
  | "done"
  | "timeout";

export type NextActionResult = {
  action: NextAction;
  message: string;
  roundNumber?: number;
  deadline?: string;
  canCommit?: boolean;
  canReveal?: boolean;
};

/**
 * Check if both stakes are locked (required before any commit).
 */
export function areStakesLocked(match: MatchRow): boolean {
  const p1 = match.player1_stake_locked ?? false;
  const p2 = match.player2_stake_locked ?? false;
  return p1 && p2;
}

/**
 * Compute deterministic transcript hash from rounds + stake + best_of + winner + nonce.
 */
export function computeTranscriptHash(
  matchId: string,
  rounds: RoundRow[],
  stakeWei: bigint,
  bestOf: number,
  winner: string | null,
  nonce: number
): `0x${string}` {
  const payload = [
    matchId,
    rounds
      .filter((r) => r.phase === "done")
      .map((r) => `${r.round_number}:${r.result ?? ""}`)
      .join("|"),
    stakeWei.toString(),
    bestOf.toString(),
    winner ?? "",
    nonce.toString(),
  ].join(":");
  return keccak256(toBytes(payload));
}

export type MatchResultStruct = {
  matchId: `0x${string}`;
  player1: string;
  player2: string;
  winner: string;
  stake: string;
  bestOf: number;
  wins1: number;
  wins2: number;
  transcriptHash: `0x${string}`;
  nonce: number;
};

/**
 * Build MatchResult struct for EIP-712 signing.
 */
export function buildMatchResult(
  match: MatchRow,
  rounds: RoundRow[],
  nonce: number = 1
): MatchResultStruct {
  const matchIdBytes32 = keccak256(toBytes(match.id)) as `0x${string}`;
  const stakeWei = BigInt(Math.floor(parseFloat(String(match.stake)) * 1e18));
  const winner = match.winner_address ?? "0x0000000000000000000000000000000000000000";
  const transcriptHash = computeTranscriptHash(
    match.id,
    rounds,
    stakeWei,
    match.best_of,
    match.winner_address ?? null,
    nonce
  );
  return {
    matchId: matchIdBytes32,
    player1: match.player1_address,
    player2: match.player2_address,
    winner,
    stake: stakeWei.toString(),
    bestOf: match.best_of,
    wins1: match.wins1 ?? 0,
    wins2: match.wins2 ?? 0,
    transcriptHash,
    nonce,
  };
}

const VALID_STAKE_TIERS = [0.1, 0.5, 1, 5] as const;
export function isValidStakeTier(stake: number): boolean {
  return VALID_STAKE_TIERS.includes(stake as (typeof VALID_STAKE_TIERS)[number]);
}

export function isValidBestOf(n: number): boolean {
  return n > 0 && n % 2 === 1;
}

/**
 * Ensure move is in {1,2,3} (rock, paper, scissors).
 */
export function isValidMove(move: number | null): boolean {
  if (move === null || move === undefined) return false;
  return move >= 1 && move <= 3;
}

/**
 * Compute next action for a given player.
 */
export function getNextActionForPlayer(
  match: MatchRow,
  rounds: RoundRow[],
  playerAddress: string
): NextActionResult {
  const now = Date.now();
  const addr = playerAddress.toLowerCase();
  const isPlayer1 = match.player1_address?.toLowerCase() === addr;
  const role = isPlayer1 ? "player1" : "player2";

  // Lobby: need to stake (both must stake before commit)
  if (match.status === "lobby") {
    const myLocked = isPlayer1 ? match.player1_stake_locked : match.player2_stake_locked;
    if (!myLocked) {
      return { action: "stake", message: "Stake on-chain to proceed" };
    }
    return {
      action: "wait_stake",
      message: "Waiting for opponent to stake",
    };
  }

  // stake_locked: both staked, should transition to in_progress + create round 1
  if (match.status === "stake_locked") {
    return {
      action: "wait_commit",
      message: "Round 1 will start shortly",
      roundNumber: 1,
    };
  }

  // In progress
  if (match.status === "in_progress") {
    const currentRound = rounds.find((r) => r.phase !== "done");
    if (!currentRound) {
      // All rounds done, should be ready_to_settle
      return {
        action: "sign_result",
        message: "Match complete. Sign result to settle.",
      };
    }

    if (currentRound.phase === "commit") {
      const myHex = isPlayer1 ? currentRound.commit1_hex : currentRound.commit2_hex;
      const myBytea = isPlayer1 ? currentRound.commit1 : currentRound.commit2;
      const myCommit = (myHex && /^0x[0-9a-fA-F]{64}$/.test(myHex)) || myBytea;
      const deadline = currentRound.commit_deadline
        ? new Date(currentRound.commit_deadline).getTime()
        : null;

      if (!myCommit) {
        if (deadline && now > deadline) {
          return {
            action: "timeout",
            message: "Commit deadline passed",
            roundNumber: currentRound.round_number,
            deadline: currentRound.commit_deadline ?? undefined,
          };
        }
        return {
          action: "commit",
          message: "Submit commit hash",
          roundNumber: currentRound.round_number,
          deadline: currentRound.commit_deadline ?? undefined,
          canCommit: true,
        };
      }
      const oppHex = isPlayer1 ? currentRound.commit2_hex : currentRound.commit1_hex;
      const oppBytea = isPlayer1 ? currentRound.commit2 : currentRound.commit1;
      const oppCommit = (oppHex && /^0x[0-9a-fA-F]{64}$/.test(oppHex)) || oppBytea;
      if (oppCommit) {
        return {
          action: "wait_reveal",
          message: "Reveal phase starting soon (5s buffer after commit window)",
          roundNumber: currentRound.round_number,
          deadline: currentRound.reveal_deadline ?? undefined,
        };
      }
      return {
        action: "wait_commit",
        message: "Waiting for opponent commit",
        roundNumber: currentRound.round_number,
        deadline: currentRound.commit_deadline ?? undefined,
      };
    }

    if (currentRound.phase === "reveal") {
      const myMove = isPlayer1 ? currentRound.move1 : currentRound.move2;
      const deadline = currentRound.reveal_deadline
        ? new Date(currentRound.reveal_deadline).getTime()
        : null;

      if (!myMove && myMove !== 0) {
        if (deadline && now > deadline) {
          return {
            action: "timeout",
            message: "Reveal deadline passed",
            roundNumber: currentRound.round_number,
            deadline: currentRound.reveal_deadline ?? undefined,
          };
        }
        return {
          action: "reveal",
          message: "Reveal your move",
          roundNumber: currentRound.round_number,
          deadline: currentRound.reveal_deadline ?? undefined,
          canReveal: true,
        };
      }
      return {
        action: "wait_reveal",
        message: "Waiting for opponent reveal",
        roundNumber: currentRound.round_number,
        deadline: currentRound.reveal_deadline ?? undefined,
      };
    }
  }

  // ready_to_settle: need sig1 + sig2 before settleMatch
  if (match.status === "ready_to_settle") {
    const mySig = isPlayer1 ? match.sig1 : match.sig2;
    const hasBoth = !!(match.sig1 && match.sig2);

    if (!mySig) {
      return {
        action: "sign_result",
        message: "Sign the result struct to enable settlement",
      };
    }
    if (!hasBoth) {
      return {
        action: "wait_signatures",
        message: "Waiting for opponent signature",
      };
    }
    return {
      action: "settle",
      message: "Both signatures ready. Call settleMatch on-chain.",
    };
  }

  if (match.status === "finished") {
    return { action: "done", message: "Match settled" };
  }

  if (match.status === "cancelled") {
    return { action: "done", message: "Match cancelled" };
  }

  return { action: "wait_result", message: "Waiting..." };
}
