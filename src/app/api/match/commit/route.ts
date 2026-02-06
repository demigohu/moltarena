import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth, getAgentName } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";
import { keccak256, toBytes } from "viem";
import { isAddress } from "viem";
import { checkOnChainStake, isStakeReady } from "@/app/api/_lib/stakeVerifier";

type CommitBody = {
  matchId: string;
  roundNumber: number;
  commitHash: string; // hex string (0x...)
  address: string; // Agent's Monad wallet address
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

  let body: CommitBody;
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

  const { matchId, roundNumber, commitHash, address } = body;

  if (!matchId || !roundNumber || !commitHash || !address) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing required fields: matchId, roundNumber, commitHash, address.",
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

  // Validate match exists and agent is a player
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, status, player1_address, player2_address, best_of")
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

  // Verify stake on-chain before allowing commit
  const lockedMatch = await checkOnChainStake(matchId);
  if (!isStakeReady(lockedMatch)) {
    return NextResponse.json(
      {
        success: false,
        error: "STAKE_NOT_READY",
        message: "Both players must stake on-chain before starting the game.",
      },
      { status: 400 },
    );
  }

  if (match.status !== "in_progress") {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_STATE",
        message: `Match is not in progress (status: ${match.status}).`,
      },
      { status: 400 },
    );
  }

  if (roundNumber < 1 || roundNumber > match.best_of) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: `Invalid roundNumber. Must be between 1 and ${match.best_of}.`,
      },
      { status: 400 },
    );
  }

  // ROUND PROGRESSION VALIDATION: Previous rounds must be completed
  if (roundNumber > 1) {
    const { data: previousRounds } = await supabase
      .from("match_rounds")
      .select("round_number, phase")
      .eq("match_id", matchId)
      .lt("round_number", roundNumber)
      .order("round_number", { ascending: false });

    const incompleteRounds = previousRounds?.filter((r) => r.phase !== "done");
    if (incompleteRounds && incompleteRounds.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "ROUND_PROGRESSION_ERROR",
          message: `Previous rounds must be completed first. Round ${incompleteRounds[0].round_number} is still ${incompleteRounds[0].phase}.`,
        },
        { status: 400 },
      );
    }
  }

  // Check if round exists, create if not
  const { data: round, error: roundFetchError } = await supabase
    .from("match_rounds")
    .select("id, phase, commit1, commit2, commit_deadline")
    .eq("match_id", matchId)
    .eq("round_number", roundNumber)
    .single();

  if (roundFetchError && roundFetchError.code !== "PGRST116") {
    // PGRST116 = not found, which is OK
    return NextResponse.json(
      {
        success: false,
        error: "DATABASE_ERROR",
        message: "Failed to fetch round.",
      },
      { status: 500 },
    );
  }

  // Guard: round must be in commit phase
  if (round && round.phase !== "commit") {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_PHASE",
        message: `Round is in '${round.phase}' phase. Commit only allowed in 'commit' phase.`,
      },
      { status: 400 },
    );
  }

  const isPlayer1 = match.player1_address.toLowerCase() === agentAddress;
  const commitField = isPlayer1 ? "commit1" : "commit2";

  // Check if already committed
  if (round && round[commitField]) {
    return NextResponse.json(
      {
        success: false,
        error: "ALREADY_COMMITTED",
        message: "You have already committed for this round.",
      },
      { status: 400 },
    );
  }

  // Check deadline (30s from round creation)
  if (round && round.commit_deadline) {
    const deadline = new Date(round.commit_deadline);
    if (Date.now() > deadline.getTime()) {
      return NextResponse.json(
        {
          success: false,
          error: "DEADLINE_PASSED",
          message: "Commit deadline has passed.",
        },
        { status: 400 },
      );
    }
  }

  // Validate commit hash format (must be hex string starting with 0x)
  if (!commitHash.startsWith("0x") || commitHash.length !== 66) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Invalid commitHash format. Must be hex string (0x...) with 32 bytes (66 chars total).",
      },
      { status: 400 },
    );
  }

  // Reject placeholder patterns (all zeros, repeated patterns, etc.)
  const hashWithoutPrefix = commitHash.slice(2).toLowerCase();
  const isAllZeros = /^0+$/.test(hashWithoutPrefix);
  const isRepeatedPattern = /^([0-9a-f]{2})\1{15}$/.test(hashWithoutPrefix); // e.g., 0x01010101...
  const isSequential = /^(01234567|abcdef|fedcba|0123|abcd)/i.test(hashWithoutPrefix);

  if (isAllZeros || isRepeatedPattern || isSequential) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_COMMIT_HASH",
        message: "Commit hash appears to be a placeholder. You must generate a real hash from keccak256(move || salt) where move is 1-3 and salt is random 32 bytes. Example: move=1, salt=randomBytes(32), hash=keccak256([move, ...salt]).",
      },
      { status: 400 },
    );
  }

  // Convert hex string to bytea
  const commitHashBytes = Buffer.from(commitHash.slice(2), "hex");

  // Set deadline: 30s from now
  const commitDeadline = new Date(Date.now() + 30 * 1000);

  if (round) {
    // Update existing round
    const { error: updateError } = await supabase
      .from("match_rounds")
      .update({
        [commitField]: commitHashBytes,
        commit_deadline: commitDeadline.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", round.id);

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: "DATABASE_ERROR",
          message: "Failed to update round commit.",
        },
        { status: 500 },
      );
    }
  } else {
    // Create new round
    const { error: insertError } = await supabase.from("match_rounds").insert({
      match_id: matchId,
      round_number: roundNumber,
      [commitField]: commitHashBytes,
      phase: "commit",
      commit_deadline: commitDeadline.toISOString(),
    });

    if (insertError) {
      return NextResponse.json(
        {
          success: false,
          error: "DATABASE_ERROR",
          message: "Failed to create round.",
        },
        { status: 500 },
      );
    }
  }

  // Log action
  await supabase.from("match_actions").insert({
    match_id: matchId,
    player_address: agentAddress,
    agent_name: agentName,
    action: "commit",
    payload: { roundNumber, commitHash },
  });

  return NextResponse.json({
    success: true,
    message: "Commit recorded. You have 30 seconds to commit.",
    commitDeadline: commitDeadline.toISOString(),
  });
}
