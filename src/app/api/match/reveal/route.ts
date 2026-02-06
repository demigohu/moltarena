import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth, getAgentName } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";
import { byteaToBuffer } from "@/app/api/_lib/bytea";
import { keccak256, toBytes } from "viem";
import { isAddress } from "viem";

type RevealBody = {
  matchId: string;
  roundNumber: number;
  move: number; // 1 = Rock, 2 = Paper, 3 = Scissors
  salt: string; // hex string (0x...)
  address: string; // Agent's Monad wallet address
};

// RPS logic: 1=Rock, 2=Paper, 3=Scissors
function getRoundResult(move1: number, move2: number): number {
  if (move1 === move2) return 0; // draw
  if (
    (move1 === 1 && move2 === 3) || // Rock beats Scissors
    (move1 === 2 && move2 === 1) || // Paper beats Rock
    (move1 === 3 && move2 === 2) // Scissors beats Paper
  ) {
    return 1; // player1 wins
  }
  return -1; // player2 wins
}

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

  let body: RevealBody;
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

  const { matchId, roundNumber, move, salt, address } = body;

  if (!matchId || !roundNumber || move === undefined || !salt || !address) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing required fields: matchId, roundNumber, move, salt, address.",
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

  // Fetch agent name from Moltbook (optional, for logging)
  let agentName: string;
  try {
    agentName = await getAgentName(agent.moltbookApiKey);
  } catch {
    agentName = `Agent-${agentAddress.slice(0, 8)}`;
  }

  if (move < 1 || move > 3) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Invalid move. Must be 1 (Rock), 2 (Paper), or 3 (Scissors).",
      },
      { status: 400 },
    );
  }

  // Validate salt format (must be hex string)
  if (!salt.startsWith("0x") || salt.length < 10) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Invalid salt format. Must be hex string (0x...) with at least 4 bytes. Salt should be random 32 bytes generated at commit time.",
      },
      { status: 400 },
    );
  }

  // Fetch match and round
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, status, player1_address, player2_address, best_of, wins1, wins2")
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

  if (match.status !== "in_progress") {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_STATE",
        message: `Match must be in_progress (status: ${match.status}).`,
      },
      { status: 400 },
    );
  }

  const { data: round, error: roundError } = await supabase
    .from("match_rounds")
    .select("id, phase, commit1, commit2, move1, move2, reveal_deadline")
    .eq("match_id", matchId)
    .eq("round_number", roundNumber)
    .single();

  if (roundError || !round) {
    return NextResponse.json(
      {
        success: false,
        error: "NOT_FOUND",
        message: "Round not found. You must commit first.",
      },
      { status: 404 },
    );
  }

  if (round.phase !== "commit" && round.phase !== "reveal") {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_PHASE",
        message: `Round must be in commit or reveal phase (current: ${round.phase}).`,
      },
      { status: 400 },
    );
  }

  const isPlayer1 = match.player1_address.toLowerCase() === agentAddress;
  const commitField = isPlayer1 ? "commit1" : "commit2";
  const moveField = isPlayer1 ? "move1" : "move2";

  // Verify commit exists
  if (!round[commitField]) {
    return NextResponse.json(
      {
        success: false,
        error: "NOT_COMMITTED",
        message: "You must commit before revealing.",
      },
      { status: 400 },
    );
  }

  // Verify not already revealed
  if (round[moveField]) {
    return NextResponse.json(
      {
        success: false,
        error: "ALREADY_REVEALED",
        message: "You have already revealed for this round.",
      },
      { status: 400 },
    );
  }

  // Verify commit hash matches (decode Postgres bytea)
  const storedCommitBuf = byteaToBuffer(round[commitField]);
  if (!storedCommitBuf) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_COMMIT",
        message: "Stored commit could not be decoded.",
      },
      { status: 500 },
    );
  }
  const storedCommitHex = "0x" + storedCommitBuf.toString("hex");

  const saltClean = salt.startsWith("0x") ? salt.slice(2) : salt;
  if (saltClean.length !== 64) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_SALT_LENGTH",
        message: "Salt must be 32 bytes (64 hex chars, with 0x prefix).",
      },
      { status: 400 },
    );
  }

  // Strategy A: move byte + salt bytes
  const saltBytes = toBytes(`0x${saltClean}`);
  const moveBytes = new Uint8Array([move]);
  const combined = new Uint8Array(moveBytes.length + saltBytes.length);
  combined.set(moveBytes);
  combined.set(saltBytes, moveBytes.length);
  const computedA = keccak256(combined).toLowerCase();

  // Strategy B: hex concat 0x + moveHex + salt
  const moveHex = move.toString(16).padStart(2, "0");
  const combinedHex = `0x${moveHex}${saltClean}` as `0x${string}`;
  const computedB = keccak256(combinedHex).toLowerCase();

  const stored = storedCommitHex.toLowerCase();
  if (computedA !== stored && computedB !== stored) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_REVEAL",
        message: "Reveal does not match commit hash.",
      },
      { status: 400 },
    );
  }

  // Check deadline (30s from commit deadline)
  if (round.reveal_deadline) {
    const deadline = new Date(round.reveal_deadline);
    if (Date.now() > deadline.getTime()) {
      return NextResponse.json(
        {
          success: false,
          error: "DEADLINE_PASSED",
          message: "Reveal deadline has passed.",
        },
        { status: 400 },
      );
    }
  }

  // Update round with reveal
  const revealDeadline = new Date(Date.now() + 30 * 1000); // 30s from now
  const updateData: any = {
    [moveField]: move,
    phase: "reveal",
    updated_at: new Date().toISOString(),
  };

  // Set reveal deadline if not set
  if (!round.reveal_deadline) {
    updateData.reveal_deadline = revealDeadline.toISOString();
  }

  const { error: updateError } = await supabase
    .from("match_rounds")
    .update(updateData)
    .eq("id", round.id);

  if (updateError) {
    return NextResponse.json(
      {
        success: false,
        error: "DATABASE_ERROR",
        message: "Failed to update round reveal.",
      },
      { status: 500 },
    );
  }

  // Check if both players revealed
  const { data: updatedRound } = await supabase
    .from("match_rounds")
    .select("move1, move2")
    .eq("id", round.id)
    .single();

  if (updatedRound?.move1 && updatedRound?.move2) {
    // Both revealed: resolve round
    const result = getRoundResult(updatedRound.move1, updatedRound.move2);
    const newWins1 = match.wins1 + (result === 1 ? 1 : 0);
    const newWins2 = match.wins2 + (result === -1 ? 1 : 0);

    // Update round result
    await supabase
      .from("match_rounds")
      .update({
        result,
        phase: "done",
        updated_at: new Date().toISOString(),
      })
      .eq("id", round.id);

    // Update match wins
    await supabase
      .from("matches")
      .update({
        wins1: newWins1,
        wins2: newWins2,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchId);

    // Check if match is finished (best-of: first to neededWins)
    const neededWins = Math.ceil(match.best_of / 2);
    if (newWins1 >= neededWins || newWins2 >= neededWins) {
      const winnerAddress =
        newWins1 >= neededWins ? match.player1_address : match.player2_address;
      // Transition to ready_to_settle (need sig1+sig2 before settleMatch → finished)
      await supabase
        .from("matches")
        .update({
          status: "ready_to_settle",
          winner_address: winnerAddress,
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchId);
    }
  }

  // Log action
  await supabase.from("match_actions").insert({
    match_id: matchId,
    player_address: agentAddress,
    agent_name: agentName,
    action: "reveal",
    payload: { roundNumber, move },
  });

  return NextResponse.json({
    success: true,
    message: "Reveal recorded.",
    revealDeadline: revealDeadline.toISOString(),
  });
}
