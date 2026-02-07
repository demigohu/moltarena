import type { Request, Response } from "express";
import { isAddress } from "viem";
import { supabase } from "../lib/supabase.js";
import { reconcileRounds } from "../lib/reconcileRounds.js";
import { byteaToHex } from "../lib/bytea.js";
import {
  buildMatchResult,
  getNextActionForPlayer,
  type MatchRow,
  type RoundRow,
} from "../lib/nextActionHelper.js";
import { RPS_ARENA_ADDRESS } from "../lib/constants.js";

export async function getMatchState(req: Request, res: Response) {
  const matchId = req.query.matchId as string;
  const address = req.query.address as string;

  if (!matchId || !address) {
    return res.status(400).json({
      success: false,
      error: "BAD_REQUEST",
      message: "Missing matchId or address query param",
    });
  }

  if (!isAddress(address)) {
    return res.status(400).json({
      success: false,
      error: "BAD_REQUEST",
      message: "Invalid address format",
    });
  }

  const agentAddress = address.toLowerCase();

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, status, stake, best_of, player1_address, player2_address, wins1, wins2, winner_address, sig1, sig2"
    )
    .eq("id", matchId)
    .single();

  if (matchError || !match) {
    return res.status(404).json({
      success: false,
      error: "NOT_FOUND",
      message: "Match not found",
    });
  }

  if (
    match.player1_address?.toLowerCase() !== agentAddress &&
    match.player2_address?.toLowerCase() !== agentAddress
  ) {
    return res.status(403).json({
      success: false,
      error: "FORBIDDEN",
      message: "Not a player in this match",
    });
  }

  if (match.status === "in_progress") {
    await reconcileRounds(matchId);
    const { data: updated } = await supabase
      .from("matches")
      .select("wins1, wins2, status, winner_address")
      .eq("id", matchId)
      .single();
    if (updated) {
      match.wins1 = updated.wins1;
      match.wins2 = updated.wins2;
      match.status = updated.status;
      match.winner_address = updated.winner_address;
    }
  }

  const { data: rounds } = await supabase
    .from("match_rounds")
    .select(
      "round_number, phase, commit1, commit2, commit1_hex, commit2_hex, move1, move2, result, commit_deadline, reveal_deadline"
    )
    .eq("match_id", matchId)
    .order("round_number", { ascending: true });

  const isPlayer1 = match.player1_address?.toLowerCase() === agentAddress;
  const resolveCommit = (hexVal: unknown, byteaVal: unknown) => {
    if (hexVal && typeof hexVal === "string" && /^0x[0-9a-fA-F]{64}$/.test(hexVal))
      return hexVal;
    const decoded = byteaToHex(byteaVal);
    return decoded && decoded.length === 66 ? decoded : null;
  };

  const roundStates = (rounds ?? []).map((r) => ({
    roundNumber: r.round_number,
    phase: r.phase,
    myCommit: resolveCommit(
      isPlayer1 ? r.commit1_hex : r.commit2_hex,
      isPlayer1 ? r.commit1 : r.commit2
    ),
    opponentCommit: resolveCommit(
      isPlayer1 ? r.commit2_hex : r.commit1_hex,
      isPlayer1 ? r.commit2 : r.commit1
    ),
    myMove: isPlayer1 ? r.move1 : r.move2,
    opponentMove: isPlayer1 ? r.move2 : r.move1,
    result: r.result ?? null,
    commitDeadline: r.commit_deadline,
    revealDeadline: r.reveal_deadline,
  }));

  const matchRow: MatchRow = {
    id: match.id,
    status: match.status as MatchRow["status"],
    stake: match.stake,
    best_of: match.best_of ?? 5,
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
    commit1_hex: r.commit1_hex,
    commit2_hex: r.commit2_hex,
    move1: r.move1,
    move2: r.move2,
    result: r.result,
    commit_deadline: r.commit_deadline,
    reveal_deadline: r.reveal_deadline,
  }));

  const nextAction = getNextActionForPlayer(matchRow, roundRows, agentAddress);

  let matchResult = null;
  if (
    (match.status === "ready_to_settle" || match.status === "finished") &&
    match.winner_address
  ) {
    matchResult = buildMatchResult(matchRow, roundRows);
  }

  const hasBothSignatures = !!(match.sig1 && match.sig2);

  const response: Record<string, unknown> = {
    success: true,
    match: {
      id: match.id,
      status: match.status,
      stake: match.stake,
      bestOf: match.best_of,
      wins1: match.wins1,
      wins2: match.wins2,
      winner: match.winner_address,
    },
    actionNeeded: nextAction.action === "done" ? null : nextAction.action,
    nextAction: {
      action: nextAction.action,
      message: nextAction.message,
    },
    rounds: roundStates,
    matchResult: matchResult ?? undefined,
    domain: {
      name: "RPSArena",
      version: "1",
      chainId: 10143,
      verifyingContract: RPS_ARENA_ADDRESS,
    },
  };

  if (hasBothSignatures && match.sig1 && match.sig2 && matchResult) {
    response.signatures = { sig1: match.sig1, sig2: match.sig2 };
    response.settleArgs = {
      matchResult,
      sig1: match.sig1,
      sig2: match.sig2,
    };
  }

  res.json(response);
}
