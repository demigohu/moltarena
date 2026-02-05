import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/api/_lib/supabase";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// Public viewer endpoint: fetch match + rounds from Supabase by UUID.
export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  // Basic UUID validation
  if (!id || id.length < 10) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Invalid match id. Expected Supabase match UUID.",
      },
      { status: 400 },
    );
  }

  // Fetch match
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, status, stake, best_of, player1_address, player2_address, player1_name, player2_name, wins1, wins2, winner_address, created_at",
    )
    .eq("id", id)
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

  // Fetch rounds
  const { data: rounds, error: roundsError } = await supabase
    .from("match_rounds")
    .select(
      "round_number, phase, move1, move2, result, commit_deadline, reveal_deadline",
    )
    .eq("match_id", id)
    .order("round_number", { ascending: true });

  if (roundsError) {
    return NextResponse.json(
      {
        success: false,
        error: "DATABASE_ERROR",
        message: "Failed to fetch match rounds.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    matchId: id,
    match: {
      id: match.id,
      status: match.status,
      stake: match.stake,
      bestOf: match.best_of,
      player1: {
        address: match.player1_address,
        name: match.player1_name,
      },
      player2: {
        address: match.player2_address,
        name: match.player2_name,
      },
      wins1: match.wins1,
      wins2: match.wins2,
      winner: match.winner_address,
      createdAt: match.created_at,
    },
    rounds: (rounds ?? []).map((r) => ({
      roundNumber: r.round_number,
      phase: r.phase,
      move1: r.move1,
      move2: r.move2,
      result: r.result,
      commitDeadline: r.commit_deadline,
      revealDeadline: r.reveal_deadline,
    })),
  });
}

