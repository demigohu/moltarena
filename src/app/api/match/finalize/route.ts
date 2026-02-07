import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth, getAgentName } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";
import { RPS_ARENA_ADDRESS } from "@/app/api/_lib/monadClient";
import { isAddress } from "viem";
import { buildMatchResult, type MatchRow, type RoundRow } from "@/app/api/_lib/nextActionHelper";
import { verifyMatchResultSignature } from "@/app/api/_lib/eip712MatchResult";
import { publishMatchEvent } from "@/app/api/_lib/realtimePublish";

type FinalizeBody = {
  matchId: string;
  transcriptHash?: string; // Optional hex string (0x...)
  address: string; // Agent's Monad wallet address
  signature?: string; // hex (0x...) - store for settleMatch
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

  const { matchId, transcriptHash, address, signature } = body;

  if (!matchId || !address) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing required fields: matchId, address.",
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

  // Fetch match and rounds
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, status, stake, best_of, player1_address, player2_address, wins1, wins2, winner_address, transcript_hash, sig1, sig2"
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

  // Accept ready_to_settle (need sigs) or finished (already settled)
  if (match.status !== "ready_to_settle" && match.status !== "finished") {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_STATE",
        message: `Match must be ready_to_settle (status: ${match.status}).`,
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

  const { data: rounds } = await supabase
    .from("match_rounds")
    .select("round_number, phase, move1, move2, result")
    .eq("match_id", matchId)
    .order("round_number", { ascending: true });

  const matchRow: MatchRow = {
    id: match.id,
    status: match.status as MatchRow["status"],
    stake: match.stake,
    best_of: match.best_of,
    player1_address: match.player1_address,
    player2_address: match.player2_address,
    wins1: match.wins1 ?? 0,
    wins2: match.wins2 ?? 0,
    winner_address: match.winner_address,
    sig1: match.sig1,
    sig2: match.sig2,
  };
  const roundRows: RoundRow[] = (rounds ?? []).map((r) => ({
    round_number: r.round_number,
    phase: r.phase as RoundRow["phase"],
    commit1: null,
    commit2: null,
    move1: r.move1,
    move2: r.move2,
    result: r.result,
    commit_deadline: null,
    reveal_deadline: null,
  }));

  const matchResult = buildMatchResult(matchRow, roundRows);

  // Validate transcriptHash if provided: must be hex 0x + 64 chars
  if (transcriptHash) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(transcriptHash)) {
      return NextResponse.json(
        {
          success: false,
          error: "BAD_REQUEST",
          message: "Invalid transcriptHash. Must be hex string 0x followed by 64 hex chars.",
        },
        { status: 400 },
      );
    }
    const transcriptBytes = Buffer.from(transcriptHash.slice(2), "hex");
    await supabase
      .from("matches")
      .update({
        transcript_hash: transcriptBytes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchId);
  }

  const isPlayer1 = match.player1_address.toLowerCase() === agentAddress;

  // Validate signature format: 0x + 130 hex chars (65 bytes)
  if (signature) {
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      return NextResponse.json(
        {
          success: false,
          error: "BAD_REQUEST",
          message: "Invalid signature. Must be hex string 0x followed by 130 hex chars (65 bytes).",
        },
        { status: 400 },
      );
    }

    // Verify signature with ecrecover: signer must match player address
    const expectedSigner = isPlayer1 ? match.player1_address : match.player2_address;
    const valid = await verifyMatchResultSignature(
      signature as `0x${string}`,
      matchResult,
      expectedSigner
    );
    if (!valid) {
      return NextResponse.json(
        {
          success: false,
          error: "BAD_REQUEST",
          message: "Invalid signature: signer does not match player address.",
        },
        { status: 400 },
      );
    }

    // Store only if valid
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...(isPlayer1 ? { sig1: signature } : { sig2: signature }),
    };
    await supabase.from("matches").update(updatePayload).eq("id", matchId);
  }

  const sig1Now = isPlayer1 && signature ? signature : match.sig1;
  const sig2Now = !isPlayer1 && signature ? signature : match.sig2;
  const hasBothSigs = !!(sig1Now && sig2Now);

  // If both sigs present, ensure status is at least ready_to_settle
  if (hasBothSigs && match.status !== "ready_to_settle" && match.status !== "finished") {
    await supabase
      .from("matches")
      .update({ status: "ready_to_settle", updated_at: new Date().toISOString() })
      .eq("id", matchId);
  }

  // Log action
  await supabase.from("match_actions").insert({
    match_id: matchId,
    player_address: agentAddress,
    agent_name: agentName,
    action: "finalize",
    payload: { matchResult, signature: signature ? "0x..." : undefined },
  });

  const chainId = 10143; // Monad testnet

  // signatures included only when both present (prevent partial sig leak)
  // Unit: return.signatures present iff hasBothSigs
  const signatures = hasBothSigs
    ? { sig1: sig1Now ?? null, sig2: sig2Now ?? null }
    : undefined;

  const response: Record<string, unknown> = {
    success: true,
    message: hasBothSigs
      ? "Both signatures ready. Call settleMatch on-chain."
      : "Signature stored. Both players must sign MatchResult with EIP-712.",
    matchResult,
    domain: {
      name: "RPSArena",
      version: "1",
      chainId,
      verifyingContract: RPS_ARENA_ADDRESS,
    },
    onchain: {
      chainId,
      contractAddress: RPS_ARENA_ADDRESS,
      function: "settleMatch(MatchResult result, bytes sigPlayer1, bytes sigPlayer2)",
      notes: "Use EIP-712 typed data signing for MatchResult struct. Both signatures required.",
      hasBothSignatures: hasBothSigs,
    },
  };
  if (hasBothSigs && signatures) {
    response.signatures = signatures;
    response.settleArgs = {
      matchResult,
      sig1: sig1Now,
      sig2: sig2Now,
    };
    publishMatchEvent(matchId, "signatures_ready", {
      signatures: { sig1: sig1Now as string, sig2: sig2Now as string },
      settleArgs: { matchResult, sig1: sig1Now, sig2: sig2Now },
    }).catch(() => {});
  }

  return NextResponse.json(response);
}
