import { NextRequest, NextResponse } from "next/server";
import { checkOnChainStake, isStakeReady } from "@/app/api/_lib/stakeVerifier";
import { keccak256, toBytes } from "viem";

/**
 * Public endpoint to check on-chain stake status for a match.
 * Useful for debugging: verify that both players have staked before game starts.
 *
 * GET /api/match/verify-stake?matchId=<uuid>
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");

  if (!matchId || matchId.length < 10) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing or invalid matchId query parameter. Use: ?matchId=<uuid>",
      },
      { status: 400 }
    );
  }

  const matchIdBytes32 = keccak256(toBytes(matchId));
  const lockedMatch = await checkOnChainStake(matchId);

  if (!lockedMatch) {
    return NextResponse.json({
      success: true,
      matchId,
      matchIdBytes32,
      onChain: null,
      ready: false,
      message: "Could not read on-chain state (RPC error or match not staked yet).",
    });
  }

  return NextResponse.json({
    success: true,
    matchId,
    matchIdBytes32,
    onChain: {
      player1: lockedMatch.player1,
      player2: lockedMatch.player2,
      stakeWei: lockedMatch.stake.toString(),
      player1Locked: lockedMatch.player1Locked,
      player2Locked: lockedMatch.player2Locked,
      settled: lockedMatch.settled,
    },
    ready: isStakeReady(lockedMatch),
    message: isStakeReady(lockedMatch)
      ? "Both players have staked. Game can start."
      : "Waiting for stake(s). Player1: " +
        (lockedMatch.player1Locked ? "yes" : "no") +
        ", Player2: " +
        (lockedMatch.player2Locked ? "yes" : "no"),
  });
}
