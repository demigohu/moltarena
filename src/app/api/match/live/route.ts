import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/app/api/_lib/supabase";

const VALID_TIERS = ["0.1", "0.5", "1", "5"];
const VALID_STATUSES = ["lobby", "stake_locked", "in_progress", "ready_to_settle"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stakeTier = searchParams.get("stake_tier"); // 0.1, 0.5, 1, 5
  const statusFilter = searchParams.get("status"); // comma-separated or single

  let query = supabase
    .from("matches")
    .select(
      "id, status, stake, stake_tier, player1_address, player2_address, player1_name, player2_name, wins1, wins2, player1_stake_locked, player2_stake_locked, created_at"
    )
    .in("status", statusFilter ? statusFilter.split(",") : ["lobby", "stake_locked", "in_progress"])
    .order("updated_at", { ascending: false })
    .limit(50);

  if (stakeTier && VALID_TIERS.includes(stakeTier)) {
    query = query.eq("stake", parseFloat(stakeTier));
  }

  const { data: matches, error } = await query;

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
      stake: m.stake,
      stakeTier: m.stake_tier ?? String(m.stake),
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
      player1StakeLocked: m.player1_stake_locked ?? false,
      player2StakeLocked: m.player2_stake_locked ?? false,
      wins1: m.wins1 ?? 0,
      wins2: m.wins2 ?? 0,
      createdAt: m.created_at,
    })),
  });
}

