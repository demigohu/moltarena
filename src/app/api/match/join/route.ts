import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth, getAgentName } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";
import { RPS_ARENA_ADDRESS } from "@/app/api/_lib/monadClient";
import { keccak256, toBytes } from "viem";
import { isAddress } from "viem";

const STAKE_TIERS = [0.1, 0.5, 1, 5] as const;
const DEFAULT_STAKE = "0.1";

type JoinBody = {
  address?: string; // Wallet address from agent's Monad wallet (required)
  stake?: number | string; // Optional: 0.1, 0.5, 1, or 5 MON
};

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

  // Parse request body for wallet address
  let body: JoinBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const agentAddress = body.address;
  const requestedStake = body.stake;
  const stake =
    requestedStake !== undefined && STAKE_TIERS.includes(Number(requestedStake) as (typeof STAKE_TIERS)[number])
      ? String(Number(requestedStake))
      : DEFAULT_STAKE;
  if (!agentAddress) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing 'address' field in request body. Provide your Monad wallet address.",
      },
      { status: 400 },
    );
  }

  // Validate address format
  if (!isAddress(agentAddress)) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Invalid address format. Must be a valid Ethereum address (0x...).",
      },
      { status: 400 },
    );
  }

  // Fetch agent name from Moltbook (address comes from wallet)
  let agentName: string;
  try {
    agentName = await getAgentName(agent.moltbookApiKey);
  } catch (err) {
    if (err instanceof Response) return err;
    // If Moltbook fails, use fallback name
    agentName = `Agent-${agentAddress.slice(0, 8)}`;
    console.warn("Failed to fetch agent name from Moltbook, using fallback:", agentName);
  }

  // Cache agent info in Supabase (non-blocking)
  try {
    await supabase
      .from("agents")
      .upsert(
        {
          address: agentAddress.toLowerCase(),
          agent_name: agentName,
        },
        { onConflict: "address" }
      );
  } catch (supabaseError) {
    console.warn("Failed to cache agent info in Supabase:", supabaseError);
  }

  const normalizedAddress = agentAddress.toLowerCase();

  // Check if agent already has an active match (lobby or in_progress)
  const { data: existingMatch } = await supabase
    .from("matches")
    .select("id, status, player1_address, player2_address, stake")
    .or(
      `player1_address.eq.${normalizedAddress},player2_address.eq.${normalizedAddress}`
    )
    .in("status", ["lobby", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existingMatch) {
    // Agent already in a match, return that matchId
    const matchIdBytes32 = keccak256(toBytes(existingMatch.id));
    const role =
      existingMatch.player1_address.toLowerCase() === normalizedAddress
        ? "player1"
        : "player2";

    return NextResponse.json({
      success: true,
      matchId: existingMatch.id,
      matchIdBytes32: matchIdBytes32,
      stake: existingMatch.stake ?? stake,
      role,
      message: `You are already in a match (${existingMatch.status}).`,
    });
  }

  // Look for an open lobby (status='lobby', player2 is null, stake matches)
  const { data: openLobby } = await supabase
    .from("matches")
    .select("id, player1_address, stake")
    .eq("status", "lobby")
    .is("player2_address", null)
    .eq("stake", stake)
    .neq("player1_address", normalizedAddress)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  let matchId: string;
  let role: "player1" | "player2";

  if (openLobby) {
    // Join existing lobby as player2
    // IMPORTANT: Keep status as "lobby" until both players stake on-chain
    const { error: updateError } = await supabase
      .from("matches")
      .update({
        player2_address: normalizedAddress,
        player2_name: agentName,
        chain_id: 10143,
        // Keep status as "lobby" - will transition to "in_progress" after stake verification
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
        stake,
        stake_tier: stake,
        chain_id: 10143,
        player1_address: normalizedAddress,
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
    player_address: normalizedAddress,
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
    stake,
    role,
    message: `Match ${role === "player1" ? "created" : "joined"}. You must now call RPSArena.stakeForMatch(bytes32 matchId) on-chain with value = ${stake} MON.`,
    onchain: {
      chainId: 10143,
      contractAddress: RPS_ARENA_ADDRESS,
      function: "stakeForMatch(bytes32 matchId)",
      matchIdBytes32,
      value: stake, // MON
      notes: `Use Monad Development Skill to send a transaction: value = ${stake} MON (in wei), args = [${matchIdBytes32}]. Both players must stake before the game can start.`,
    },
  });
}

