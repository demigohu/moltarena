import { supabase } from "./supabase.js";
import { keccak256, toBytes } from "viem";
const STAKE_TIERS = [0.1, 0.5, 1, 5] as const;
const DEFAULT_STAKE = "0.1";

export async function joinQueue(
  tier: number,
  address: string,
  agentName?: string
): Promise<{
  matchId: string;
  role: "player1" | "player2";
  stake: string;
  matchIdBytes32: string;
} | null> {
  const stake =
    STAKE_TIERS.includes(tier as (typeof STAKE_TIERS)[number])
      ? String(tier)
      : DEFAULT_STAKE;
  const normalizedAddress = address.toLowerCase();
  const name = agentName ?? `Agent-${normalizedAddress.slice(0, 8)}`;

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
    const role =
      existingMatch.player1_address?.toLowerCase() === normalizedAddress
        ? "player1"
        : "player2";
    return {
      matchId: existingMatch.id,
      role,
      stake: String(existingMatch.stake ?? stake),
      matchIdBytes32: keccak256(toBytes(existingMatch.id)),
    };
  }

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
    const { error } = await supabase
      .from("matches")
      .update({
        player2_address: normalizedAddress,
        player2_name: name,
        chain_id: 10143,
        updated_at: new Date().toISOString(),
      })
      .eq("id", openLobby.id)
      .is("player2_address", null);

    if (error) {
      return null;
    }
    matchId = openLobby.id;
    role = "player2";
  } else {
    const { data: newMatch, error } = await supabase
      .from("matches")
      .insert({
        status: "lobby",
        stake,
        stake_tier: stake,
        chain_id: 10143,
        player1_address: normalizedAddress,
        player1_name: name,
        best_of: 5,
      })
      .select("id")
      .single();

    if (error || !newMatch) return null;
    matchId = newMatch.id;
    role = "player1";
  }

  await supabase.from("match_actions").insert({
    match_id: matchId,
    player_address: normalizedAddress,
    agent_name: name,
    action: "join",
    payload: { role },
  });

  return {
    matchId,
    role,
    stake,
    matchIdBytes32: keccak256(toBytes(matchId)),
  };
}
