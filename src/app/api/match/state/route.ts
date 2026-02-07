import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";
import { isAddress } from "viem";
import { keccak256, toBytes } from "viem";
import { checkOnChainStake, isStakeReady } from "@/app/api/_lib/stakeVerifier";
import { checkAndResolveTimeouts, createRound1 } from "@/app/api/_lib/matchResolver";
import { byteaToHex } from "@/app/api/_lib/bytea";
import { getNextActionForPlayer, buildMatchResult, type MatchRow, type RoundRow } from "@/app/api/_lib/nextActionHelper";

export async function GET(req: NextRequest) {
  let agent;
  try {
    agent = requireMoltbookAuth(req);
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing 'address' query parameter. Provide your Monad wallet address.",
      },
      { status: 400 },
    );
  }

  if (!isAddress(address)) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Invalid address format.",
      },
      { status: 400 },
    );
  }

  const agentAddress = address.toLowerCase();

  if (!matchId) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing 'matchId' query parameter.",
      },
      { status: 400 },
    );
  }

  // Fetch match (include stake lock status and sigs for ready_to_settle)
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, status, stake, stake_tier, best_of, player1_address, player2_address, player1_name, player2_name, wins1, wins2, winner_address, player1_stake_locked, player2_stake_locked, sig1, sig2, onchain_match_id, chain_id, created_at"
    )
    .eq("id", matchId)
    .single();

  if (matchError || !match) {
    return NextResponse.json(
      {
        success: false,
        error: "NOT_FOUND",
        message: "Match not found.",
      },
      { status: 404 },
    );
  }

  if (
    match.player1_address.toLowerCase() !== agentAddress &&
    match.player2_address.toLowerCase() !== agentAddress
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "FORBIDDEN",
        message: "You are not a player in this match.",
      },
      { status: 403 },
    );
  }

  const isPlayer1 = match.player1_address.toLowerCase() === agentAddress;
  const role = isPlayer1 ? "player1" : "player2";
  const opponentAddress = isPlayer1
    ? match.player2_address
    : match.player1_address;
  const opponentName = isPlayer1 ? match.player2_name : match.player1_name;

  // HEARTBEAT-DRIVEN RESOLUTION: Auto-resolve timeouts every time agent polls
  if (match.status === "in_progress") {
    await checkAndResolveTimeouts(matchId);
    // Re-fetch match after resolution (wins might have changed)
    const { data: updatedMatch } = await supabase
      .from("matches")
      .select("wins1, wins2, status, winner_address")
      .eq("id", matchId)
      .single();
    if (updatedMatch) {
      match.wins1 = updatedMatch.wins1;
      match.wins2 = updatedMatch.wins2;
      match.status = updatedMatch.status as typeof match.status;
      match.winner_address = updatedMatch.winner_address;
    }
  }

  // STAKE VERIFICATION: Check on-chain stake and auto-transition lobby → stake_locked → in_progress
  if (match.status === "lobby") {
    const lockedMatch = await checkOnChainStake(matchId);
    console.log(`[${matchId}] Stake check:`, {
      lockedMatch: lockedMatch ? {
        player1: lockedMatch.player1,
        player2: lockedMatch.player2,
        player1Locked: lockedMatch.player1Locked,
        player2Locked: lockedMatch.player2Locked,
      } : null,
      isStakeReady: isStakeReady(lockedMatch),
    });

    if (isStakeReady(lockedMatch)) {
      console.log(`[${matchId}] Both players staked! Transitioning to in_progress...`);
      const matchIdBytes32 = keccak256(toBytes(matchId));
      const chainId = 10143; // Monad testnet

      // Both players staked on-chain → update lock fields, transition to in_progress, create round 1
      const { data: existingRound1 } = await supabase
        .from("match_rounds")
        .select("id")
        .eq("match_id", matchId)
        .eq("round_number", 1)
        .single();

      if (!existingRound1) {
        console.log(`[${matchId}] Creating round 1...`);
        await createRound1(matchId);
      }

      const { error: updateError } = await supabase
        .from("matches")
        .update({
          status: "in_progress",
          player1_stake_locked: true,
          player2_stake_locked: true,
          onchain_match_id: matchIdBytes32,
          chain_id: chainId,
          stake_tier: String(match.stake),
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchId);

      if (updateError) {
        console.error(`[${matchId}] Failed to update status:`, updateError);
      } else {
        match.status = "in_progress";
        match.player1_stake_locked = true;
        match.player2_stake_locked = true;
        match.onchain_match_id = matchIdBytes32;
        match.chain_id = chainId;
      }
    }
  }

  // Fetch all rounds (after potential round 1 creation)
  const { data: rounds, error: roundsError } = await supabase
    .from("match_rounds")
    .select(
      "round_number, phase, commit1, commit2, commit1_hex, commit2_hex, move1, move2, result, commit_deadline, reveal_deadline"
    )
    .eq("match_id", matchId)
    .order("round_number", { ascending: true });

  if (roundsError) {
    return NextResponse.json(
      {
        success: false,
        error: "DATABASE_ERROR",
        message: "Failed to fetch rounds.",
      },
      { status: 500 },
    );
  }

  // Find current round (first round that's not done)
  const currentRound = rounds?.find((r) => r.phase !== "done");
  const currentRoundNumber = currentRound?.round_number ?? null;

  // Merge on-chain stake lock status for lobby (DB may not have it yet)
  if (match.status === "lobby") {
    const lockedMatch = await checkOnChainStake(matchId);
    if (lockedMatch) {
      match.player1_stake_locked = lockedMatch.player1Locked;
      match.player2_stake_locked = lockedMatch.player2Locked;
    }
  }

  // Build round states: prefer commit*_hex; fallback to decoded bytea if 32 bytes
  const roundStates = rounds?.map((r) => {
    const myHex = isPlayer1 ? r.commit1_hex : r.commit2_hex;
    const oppHex = isPlayer1 ? r.commit2_hex : r.commit1_hex;
    const myBytea = isPlayer1 ? r.commit1 : r.commit2;
    const oppBytea = isPlayer1 ? r.commit2 : r.commit1;
    const myMove = isPlayer1 ? r.move1 : r.move2;
    const opponentMove = isPlayer1 ? r.move2 : r.move1;

    const resolveCommit = (hexVal: unknown, byteaVal: unknown) => {
      if (hexVal && typeof hexVal === "string" && /^0x[0-9a-fA-F]{64}$/.test(hexVal)) return hexVal;
      const decoded = byteaToHex(byteaVal);
      if (decoded && decoded.length === 66) return decoded;
      return null;
    };

    return {
      roundNumber: r.round_number,
      phase: r.phase,
      myCommit: resolveCommit(myHex, myBytea),
      opponentCommit: resolveCommit(oppHex, oppBytea),
      myMove: myMove ?? null,
      opponentMove: opponentMove ?? null,
      result: r.result ?? null, // 1 = p1 win, 0 = draw, -1 = p2 win
      commitDeadline: r.commit_deadline,
      revealDeadline: r.reveal_deadline,
    };
  });

  // Use next-action helper for consistent action logic
  const matchRow: MatchRow = {
    id: match.id,
    status: match.status as MatchRow["status"],
    stake: match.stake,
    best_of: match.best_of,
    player1_address: match.player1_address,
    player2_address: match.player2_address,
    wins1: match.wins1 ?? 0,
    wins2: match.wins2 ?? 0,
    winner_address: match.winner_address,
    player1_stake_locked: match.player1_stake_locked,
    player2_stake_locked: match.player2_stake_locked,
    sig1: match.sig1,
    sig2: match.sig2,
  };
  const roundRows: RoundRow[] = (rounds ?? []).map((r) => ({
    round_number: r.round_number,
    phase: r.phase as RoundRow["phase"],
    commit1: r.commit1 as Uint8Array | null,
    commit2: r.commit2 as Uint8Array | null,
    commit1_hex: r.commit1_hex,
    commit2_hex: r.commit2_hex,
    move1: r.move1,
    move2: r.move2,
    result: r.result,
    commit_deadline: r.commit_deadline,
    reveal_deadline: r.reveal_deadline,
  }));
  const nextAction = getNextActionForPlayer(matchRow, roundRows, agentAddress);

  // Build matchResult for ready_to_settle (for signing)
  let matchResult = null;
  if (match.status === "ready_to_settle" && match.winner_address) {
    matchResult = buildMatchResult(matchRow, roundRows);
  }

  return NextResponse.json({
    success: true,
    match: {
      id: match.id,
      status: match.status,
      stake: match.stake,
      stakeTier: match.stake_tier ?? String(match.stake),
      bestOf: match.best_of,
      role,
      opponent: {
        address: opponentAddress,
        name: opponentName,
      },
      wins1: match.wins1,
      wins2: match.wins2,
      winner: match.winner_address,
      player1StakeLocked: match.player1_stake_locked,
      player2StakeLocked: match.player2_stake_locked,
      onchainMatchId: match.onchain_match_id,
      chainId: match.chain_id,
      createdAt: match.created_at,
    },
    currentRoundNumber,
    rounds: roundStates,
    actionNeeded: nextAction.action === "done" ? null : nextAction.action,
    nextAction: {
      action: nextAction.action,
      message: nextAction.message,
      roundNumber: nextAction.roundNumber,
      deadline: nextAction.deadline,
      canCommit: nextAction.canCommit,
      canReveal: nextAction.canReveal,
    },
    ...(matchResult && { matchResult }),
  });
}
