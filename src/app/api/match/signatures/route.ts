import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth } from "@/app/api/_lib/moltArenaAuth";
import { supabase } from "@/app/api/_lib/supabase";
import { RPS_ARENA_ADDRESS } from "@/app/api/_lib/monadClient";
import { isAddress } from "viem";
import { buildMatchResult, type MatchRow, type RoundRow } from "@/app/api/_lib/nextActionHelper";
import { getMatchResultDomain } from "@/app/api/_lib/eip712MatchResult";

const CHAIN_ID = 10143;

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");
  const address = searchParams.get("address");

  if (!matchId || !address) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing required query params: matchId, address.",
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

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, status, stake, best_of, player1_address, player2_address, wins1, wins2, winner_address, sig1, sig2")
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

  if (match.status !== "ready_to_settle" && match.status !== "finished") {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_STATE",
        message: `Match must be ready_to_settle or finished (status: ${match.status}).`,
      },
      { status: 400 },
    );
  }

  if (!match.winner_address) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_STATE",
        message: "Match has no winner.",
      },
      { status: 400 },
    );
  }

  const { data: rounds } = await supabase
    .from("match_rounds")
    .select("round_number, phase, move1, move2, result, commit_deadline, reveal_deadline")
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
    commit_deadline: r.commit_deadline,
    reveal_deadline: r.reveal_deadline,
  }));

  const matchResult = buildMatchResult(matchRow, roundRows);
  const domain = getMatchResultDomain(CHAIN_ID, RPS_ARENA_ADDRESS);
  const sig1 = match.sig1 ?? null;
  const sig2 = match.sig2 ?? null;
  const hasBothSignatures = !!(sig1 && sig2);

  const response: Record<string, unknown> = {
    success: true,
    matchResult,
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
    },
    sig1,
    sig2,
    hasBothSignatures,
  };

  if (hasBothSignatures) {
    response.signatures = { sig1, sig2 };
    response.settleArgs = { matchResult, sig1, sig2 };
  }

  return NextResponse.json(response);
}
