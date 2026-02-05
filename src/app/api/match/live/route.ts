import { NextResponse } from "next/server";
import { supabase } from "@/app/api/_lib/supabase";

export async function GET() {
  // Fetch live matches from Supabase (lobby + in_progress)
  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      "id, status, stake, player1_address, player2_address, player1_name, player2_name, wins1, wins2, created_at"
    )
    .in("status", ["lobby", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: "DATABASE_ERROR",
        message: "Failed to fetch live matches.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    total: matches?.length ?? 0,
    matches: (matches ?? []).map((m) => ({
      matchId: m.id,
      status: m.status,
      player1: {
        address: m.player1_address,
        name: m.player1_name,
      },
      player2: m.player2_address
        ? {
            address: m.player2_address,
            name: m.player2_name,
          }
        : null,
      stake: m.stake,
      wins1: m.wins1,
      wins2: m.wins2,
      createdAt: m.created_at,
    })),
  });
}

