import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";
import { isAddress } from "viem";
import { checkOnChainStake, isStakeReady } from "@/app/api/_lib/stakeVerifier";
import { checkAndResolveTimeouts, createRound1 } from "@/app/api/_lib/matchResolver";

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

  // Fetch match
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, status, stake, best_of, player1_address, player2_address, player1_name, player2_name, wins1, wins2, winner_address, created_at"
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

  // STAKE VERIFICATION: Check on-chain stake and auto-transition lobby → in_progress
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
      
      // Both players staked on-chain → transition to in_progress and create round 1
      const { data: existingRound1 } = await supabase
        .from("match_rounds")
        .select("id")
        .eq("match_id", matchId)
        .eq("round_number", 1)
        .single();

      if (!existingRound1) {
        // Create round 1 with commit deadline starting now
        console.log(`[${matchId}] Creating round 1...`);
        await createRound1(matchId);
      }

      // Update match status to in_progress
      const { error: updateError } = await supabase
        .from("matches")
        .update({
          status: "in_progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchId);

      if (updateError) {
        console.error(`[${matchId}] Failed to update status to in_progress:`, updateError);
      } else {
        console.log(`[${matchId}] Status updated to in_progress`);
        // Re-fetch match to get updated status
        const { data: updatedMatch } = await supabase
          .from("matches")
          .select("status")
          .eq("id", matchId)
          .single();
        if (updatedMatch) {
          match.status = updatedMatch.status as typeof match.status;
        }
      }
    } else {
      console.log(`[${matchId}] Stake not ready yet. Player1: ${lockedMatch?.player1Locked}, Player2: ${lockedMatch?.player2Locked}`);
    }
  }

  // Fetch all rounds (after potential round 1 creation)
  const { data: rounds, error: roundsError } = await supabase
    .from("match_rounds")
    .select(
      "round_number, phase, commit1, commit2, move1, move2, result, commit_deadline, reveal_deadline"
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

  // Build round states
  const roundStates = rounds?.map((r) => {
    const myCommit = isPlayer1 ? r.commit1 : r.commit2;
    const opponentCommit = isPlayer1 ? r.commit2 : r.commit1;
    const myMove = isPlayer1 ? r.move1 : r.move2;
    const opponentMove = isPlayer1 ? r.move2 : r.move1;

    return {
      roundNumber: r.round_number,
      phase: r.phase,
      myCommit: myCommit ? "0x" + Buffer.from(myCommit as Uint8Array).toString("hex") : null,
      opponentCommit: opponentCommit
        ? "0x" + Buffer.from(opponentCommit as Uint8Array).toString("hex")
        : null,
      myMove: myMove ?? null,
      opponentMove: opponentMove ?? null,
      result: r.result ?? null, // 1 = p1 win, 0 = draw, -1 = p2 win
      commitDeadline: r.commit_deadline,
      revealDeadline: r.reveal_deadline,
    };
  });

  // Determine action needed (after potential status update)
  let actionNeeded: string | null = null;
  
  // Re-check status in case it was updated above
  if (match.status === "lobby") {
    // Double-check stake status
    const lockedMatch = await checkOnChainStake(matchId);
    if (isStakeReady(lockedMatch)) {
      // Both staked but status still lobby - might be transitioning
      // Check if round 1 exists
      const { data: round1 } = await supabase
        .from("match_rounds")
        .select("id, phase")
        .eq("match_id", matchId)
        .eq("round_number", 1)
        .single();
      
      if (round1) {
        // Round 1 exists, should be in_progress
        actionNeeded = round1.phase === "commit" ? "commit" : "wait_reveal";
      } else {
        actionNeeded = "stake"; // Still waiting for transition
      }
    } else {
      actionNeeded = "stake"; // Need to stake on-chain
    }
  } else if (match.status === "in_progress") {
    if (!currentRound) {
      // All rounds done, match should be finished
      actionNeeded = "finalize";
    } else if (currentRound.phase === "commit") {
      const myCommit = isPlayer1
        ? currentRound.commit1
        : currentRound.commit2;
      if (!myCommit) {
        actionNeeded = "commit";
      } else if (
        currentRound.commit_deadline &&
        new Date(currentRound.commit_deadline).getTime() < Date.now()
      ) {
        actionNeeded = "timeout"; // Opponent timeout
      } else {
        actionNeeded = "wait_reveal"; // Wait for opponent commit
      }
    } else if (currentRound.phase === "reveal") {
      const myMove = isPlayer1 ? currentRound.move1 : currentRound.move2;
      if (!myMove) {
        actionNeeded = "reveal";
      } else if (
        currentRound.reveal_deadline &&
        new Date(currentRound.reveal_deadline).getTime() < Date.now()
      ) {
        actionNeeded = "timeout"; // Opponent timeout
      } else {
        actionNeeded = "wait_result"; // Wait for opponent reveal
      }
    } else if (currentRound.phase === "done") {
      // Round done, check if match finished
      actionNeeded = "wait_result"; // Wait for next round or match finish
    }
  } else if (match.status === "finished") {
    if (!match.winner_address) {
      actionNeeded = "finalize";
    } else {
      actionNeeded = null; // Match fully finished
    }
  }

  return NextResponse.json({
    success: true,
    match: {
      id: match.id,
      status: match.status,
      stake: match.stake,
      bestOf: match.best_of,
      role,
      opponent: {
        address: opponentAddress,
        name: opponentName,
      },
      wins1: match.wins1,
      wins2: match.wins2,
      winner: match.winner_address,
      createdAt: match.created_at,
    },
    currentRoundNumber,
    rounds: roundStates,
    actionNeeded,
  });
}
