import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth, getAgentInfo } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";
import { RPS_ARENA_ADDRESS } from "@/app/api/_lib/monadClient";
import { keccak256, toBytes } from "viem";

type FinalizeBody = {
  matchId: string;
  transcriptHash?: string; // Optional hex string (0x...)
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

  let agentInfo;
  try {
    agentInfo = await getAgentInfo(agent.moltbookApiKey);
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      {
        success: false,
        error: "MOLTBOOK_ERROR",
        message: "Failed to fetch agent info.",
      },
      { status: 500 },
    );
  }

  const agentAddress = agentInfo.address;

  let body: FinalizeBody;
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

  const { matchId, transcriptHash } = body;

  if (!matchId) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing 'matchId' field.",
      },
      { status: 400 },
    );
  }

  // Fetch match
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, status, stake, best_of, player1_address, player2_address, wins1, wins2, winner_address, transcript_hash"
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

  if (match.status !== "finished") {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_STATE",
        message: `Match is not finished (status: ${match.status}).`,
      },
      { status: 400 },
    );
  }

  if (!match.winner_address) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_STATE",
        message: "Match has no winner. Cannot finalize.",
      },
      { status: 400 },
    );
  }

  // Update transcript hash if provided
  if (transcriptHash) {
    const transcriptBytes = Buffer.from(transcriptHash.slice(2), "hex");
    await supabase
      .from("matches")
      .update({
        transcript_hash: transcriptBytes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchId);
  }

  // Prepare MatchResult for EIP-712 signing
  const matchIdBytes32 = keccak256(toBytes(matchId));
  const stakeWei = BigInt(Math.floor(parseFloat(match.stake) * 1e18));

  const matchResult = {
    matchId: matchIdBytes32,
    player1: match.player1_address,
    player2: match.player2_address,
    winner: match.winner_address,
    stake: stakeWei.toString(),
    bestOf: match.best_of,
    wins1: match.wins1,
    wins2: match.wins2,
    transcriptHash: match.transcript_hash
      ? "0x" + Buffer.from(match.transcript_hash as Uint8Array).toString("hex")
      : keccak256(toBytes(matchId)), // fallback
    nonce: 1, // Can be incremented if needed
  };

  // Log action
  await supabase.from("match_actions").insert({
    match_id: matchId,
    player_address: agentAddress,
    agent_name: agentInfo.name,
    action: "finalize",
    payload: { matchResult },
  });

  return NextResponse.json({
    success: true,
    message: "Match finalized. Both players must sign MatchResult with EIP-712 and call settleMatch on-chain.",
    matchResult,
    onchain: {
      chainId: 10143,
      contractAddress: RPS_ARENA_ADDRESS,
      function: "settleMatch(MatchResult result, bytes sigPlayer1, bytes sigPlayer2)",
      notes: "Use EIP-712 typed data signing for MatchResult struct. Both signatures required.",
    },
  });
}
