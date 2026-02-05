import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";

// Legacy endpoint kept for backwards compatibility.
// Now reads from Supabase instead of the on-chain contract.
export async function GET(req: NextRequest) {
  try {
    requireMoltbookAuth(req);
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");
  const playerAddr = searchParams.get("player") ?? undefined;

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

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, status, stake, best_of, player1_address, player2_address, wins1, wins2, winner_address",
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

  const { data: rounds, error: roundsError } = await supabase
    .from("match_rounds")
    .select(
      "round_number, phase, commit_deadline, reveal_deadline, move1, move2, result",
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

  const now = Date.now();
  let phase:
    | "finished"
    | "waiting_commit"
    | "waiting_reveal"
    | "waiting_next_round" = "waiting_next_round";
  let currentRound = 0;
  let timeRemainingMs: number | null = null;

  if (match.status === "finished") {
    phase = "finished";
  } else {
    const undecided = (rounds ?? []).find((r) => r.phase !== "done");
    if (!undecided) {
      phase = "finished";
    } else {
      currentRound = undecided.round_number;
      const r = undecided;

      const hasMove1 = r.move1 !== null && r.move1 !== undefined;
      const hasMove2 = r.move2 !== null && r.move2 !== undefined;

      if (!hasMove1 || !hasMove2) {
        phase = "waiting_commit";
        if (r.commit_deadline) {
          const deadline = new Date(r.commit_deadline).getTime();
          timeRemainingMs = Math.max(0, deadline - now);
        }
      } else if (r.phase === "reveal") {
        phase = "waiting_reveal";
        if (r.reveal_deadline) {
          const deadline = new Date(r.reveal_deadline).getTime();
          timeRemainingMs = Math.max(0, deadline - now);
        }
      } else if (r.phase === "done") {
        phase = "waiting_next_round";
      }
    }
  }

  let role: "player1" | "player2" | "unknown" = "unknown";
  if (playerAddr) {
    const lower = playerAddr.toLowerCase();
    if (lower === match.player1_address.toLowerCase()) role = "player1";
    else if (lower === match.player2_address?.toLowerCase()) role = "player2";
  }

  const you =
    role === "player1"
      ? { address: match.player1_address, wins: match.wins1 }
      : role === "player2"
        ? { address: match.player2_address, wins: match.wins2 }
        : null;

  const opponent =
    role === "player1"
      ? { address: match.player2_address, wins: match.wins2 }
      : role === "player2"
        ? { address: match.player1_address, wins: match.wins1 }
        : null;

  let should:
    | "commit"
    | "reveal"
    | "wait"
    | "claim_timeout_commit"
    | "claim_timeout_reveal"
    | null = null;

  if (phase === "waiting_commit") {
    should = "commit";
  } else if (phase === "waiting_reveal") {
    should = "reveal";
  } else if (phase === "finished") {
    should = "wait";
  }

  return NextResponse.json({
    success: true,
    matchId,
    phase,
    currentRound,
    timeRemainingMs,
    role,
    you,
    opponent,
    match: {
      player1: match.player1_address,
      player2: match.player2_address,
      wager: match.stake,
      roundsPlayed: rounds?.length ?? 0,
      wins1: match.wins1,
      wins2: match.wins2,
      status: match.status,
      settled: match.status === "finished",
    },
    actionHint: {
      should,
      allowedMoves: ["rock", "paper", "scissors"],
    },
  });
}

