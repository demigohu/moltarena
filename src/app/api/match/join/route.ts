import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth, getAgentInfo } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";
import { RPS_ARENA_ADDRESS } from "@/app/api/_lib/monadClient";
import { keccak256, toBytes, toHex } from "viem";

const MIN_STAKE = "0.1"; // Fixed stake per match

export async function POST(req: NextRequest) {
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

  // Fetch agent info from Moltbook (address + name)
  let agentInfo;
  try {
    agentInfo = await getAgentInfo(agent.moltbookApiKey);
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      {
        success: false,
        error: "MOLTBOOK_ERROR",
        message: "Failed to fetch agent info from Moltbook.",
      },
      { status: 500 },
    );
  }

  const agentAddress = agentInfo.address;
  const agentName = agentInfo.name;

  // Check if agent already has an active match (lobby or in_progress)
  const { data: existingMatch } = await supabase
    .from("matches")
    .select("id, status, player1_address, player2_address")
    .or(
      `player1_address.eq.${agentAddress},player2_address.eq.${agentAddress}`
    )
    .in("status", ["lobby", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existingMatch) {
    // Agent already in a match, return that matchId
    const matchIdBytes32 = keccak256(toBytes(existingMatch.id));
    const role =
      existingMatch.player1_address.toLowerCase() === agentAddress
        ? "player1"
        : "player2";

    return NextResponse.json({
      success: true,
      matchId: existingMatch.id,
      matchIdBytes32: matchIdBytes32,
      stake: MIN_STAKE,
      role,
      message: `You are already in a match (${existingMatch.status}).`,
    });
  }

  // Look for an open lobby (status='lobby', player2 is null, stake matches)
  const { data: openLobby } = await supabase
    .from("matches")
    .select("id, player1_address")
    .eq("status", "lobby")
    .is("player2_address", null)
    .eq("stake", MIN_STAKE)
    .neq("player1_address", agentAddress)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  let matchId: string;
  let role: "player1" | "player2";

  if (openLobby) {
    // Join existing lobby as player2
    const { error: updateError } = await supabase
      .from("matches")
      .update({
        player2_address: agentAddress,
        player2_name: agentName,
        status: "in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("id", openLobby.id)
      .is("player2_address", null);

    if (updateError) {
      // Race condition: another agent took this lobby
      // Fall through to create new lobby
      matchId = crypto.randomUUID();
      role = "player1";
    } else {
      matchId = openLobby.id;
      role = "player2";
    }
  } else {
    // Create new lobby as player1
    const { data: newMatch, error: insertError } = await supabase
      .from("matches")
      .insert({
        status: "lobby",
        stake: MIN_STAKE,
        player1_address: agentAddress,
        player1_name: agentName,
        best_of: 5,
      })
      .select("id")
      .single();

    if (insertError || !newMatch) {
      return NextResponse.json(
        {
          success: false,
          error: "DATABASE_ERROR",
          message: "Failed to create match lobby.",
        },
        { status: 500 },
      );
    }

    matchId = newMatch.id;
    role = "player1";
  }

  // Log action
  await supabase.from("match_actions").insert({
    match_id: matchId,
    player_address: agentAddress,
    agent_name: agentName,
    action: "join",
    payload: { role },
  });

  // Convert UUID to bytes32 for on-chain
  const matchIdBytes32 = keccak256(toBytes(matchId));

  return NextResponse.json({
    success: true,
    matchId,
    matchIdBytes32,
    stake: MIN_STAKE,
    role,
    message: `Match ${role === "player1" ? "created" : "joined"}. You must now call RPSArena.stakeForMatch(bytes32 matchId) on-chain with value = 0.1 MON.`,
    onchain: {
      chainId: 10143,
      contractAddress: RPS_ARENA_ADDRESS,
      function: "stakeForMatch(bytes32 matchId)",
      matchIdBytes32,
      value: "0.1", // MON
      notes: `Use Monad Development Skill to send a transaction: value = 0.1 MON (in wei), args = [${matchIdBytes32}]. Both players must stake before the game can start.`,
    },
  });
}

