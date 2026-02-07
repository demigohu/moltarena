import type { Server, Socket } from "socket.io";
import { isAddress } from "viem";
import { keccak256, toBytes } from "viem";
import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";
import { joinQueue } from "../lib/matchmaking.js";
import { reconcileRounds } from "../lib/reconcileRounds.js";
import { createRound1 } from "../lib/matchResolver.js";
import { buildMatchResult, getNextActionForPlayer, isValidMove } from "../lib/nextActionHelper.js";
import { verifyMatchResultSignature } from "../lib/eip712.js";
import { byteaToHex, byteaToBuffer } from "../lib/bytea.js";
import { RPS_ARENA_ADDRESS } from "../lib/constants.js";
function resolveCommitHex(
  hexVal: unknown,
  byteaVal: unknown
): string | null {
  if (hexVal && typeof hexVal === "string" && /^0x[0-9a-fA-F]{64}$/.test(hexVal))
    return hexVal;
  const decoded = byteaToHex(byteaVal);
  return decoded && decoded.length === 66 ? decoded : null;
}

type AuthPayload = { apiKey?: string; address?: string };

function getAuth(socket: Socket): AuthPayload {
  const auth = socket.handshake.auth as AuthPayload;
  return auth ?? {};
}

function emitError(socket: Socket, code: string, message: string) {
  socket.emit("error", { code, message });
}

function getRoom(matchId: string) {
  return `match:${matchId}`;
}

function getRoundResult(move1: number, move2: number): number {
  if (move1 === move2) return 0;
  if (
    (move1 === 1 && move2 === 3) ||
    (move1 === 2 && move2 === 1) ||
    (move1 === 3 && move2 === 2)
  )
    return 1;
  return -1;
}

async function buildStatePayload(
  matchId: string,
  address: string
): Promise<Record<string, unknown> | null> {
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select(
      "id, status, stake, best_of, player1_address, player2_address, wins1, wins2, winner_address, sig1, sig2"
    )
    .eq("id", matchId)
    .single();

  if (matchErr || !match) return null;
  const addr = address.toLowerCase();
  if (
    match.player1_address?.toLowerCase() !== addr &&
    match.player2_address?.toLowerCase() !== addr
  )
    return null;

  const { data: rounds } = await supabase
    .from("match_rounds")
    .select(
      "round_number, phase, commit1, commit2, commit1_hex, commit2_hex, move1, move2, result, commit_deadline, reveal_deadline"
    )
    .eq("match_id", matchId)
    .order("round_number", { ascending: true });

  const matchRow = {
    id: match.id,
    status: match.status,
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
  const roundRows = (rounds ?? []).map((r) => ({
    round_number: r.round_number,
    phase: r.phase,
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
  const nextAction = getNextActionForPlayer(matchRow, roundRows, addr);

  const isPlayer1 = match.player1_address?.toLowerCase() === addr;
  const roundStates = (rounds ?? []).map((r) => ({
    roundNumber: r.round_number,
    phase: r.phase,
    myCommit: resolveCommitHex(
      isPlayer1 ? r.commit1_hex : r.commit2_hex,
      isPlayer1 ? r.commit1 : r.commit2
    ),
    opponentCommit: resolveCommitHex(
      isPlayer1 ? r.commit2_hex : r.commit1_hex,
      isPlayer1 ? r.commit2 : r.commit1
    ),
    myMove: isPlayer1 ? r.move1 : r.move2,
    opponentMove: isPlayer1 ? r.move2 : r.move1,
    result: r.result ?? null,
    commitDeadline: r.commit_deadline,
    revealDeadline: r.reveal_deadline,
  }));

  let matchResult = null;
  if (
    (match.status === "ready_to_settle" || match.status === "finished") &&
    match.winner_address
  ) {
    matchResult = buildMatchResult(matchRow, roundRows);
  }

  const hasBothSigs = !!(match.sig1 && match.sig2);
  const payload: Record<string, unknown> = {
    status: match.status,
    wins1: match.wins1 ?? 0,
    wins2: match.wins2 ?? 0,
    actionNeeded: nextAction.action === "done" ? undefined : nextAction.action,
    roundStates,
    deadlines: {},
    matchResult: matchResult ?? undefined,
  };
  if (hasBothSigs && match.sig1 && match.sig2) {
    payload.signatures = { sig1: match.sig1, sig2: match.sig2 };
    payload.settleArgs =
      matchResult && { matchResult, sig1: match.sig1, sig2: match.sig2 };
  }
  return payload;
}

async function buildReadyToSettlePayload(matchId: string): Promise<Record<string, unknown> | null> {
  const { data: match, error: matchErr } = await supabase
    .from("matches")
    .select("id, status, stake, best_of, player1_address, player2_address, wins1, wins2, winner_address")
    .eq("id", matchId)
    .single();
  if (matchErr || !match || match.status !== "ready_to_settle" || !match.winner_address)
    return null;

  const { data: rounds } = await supabase
    .from("match_rounds")
    .select("round_number, phase, move1, move2, result")
    .eq("match_id", matchId)
    .order("round_number", { ascending: true });

  const matchRow = {
    ...match,
    stake: match.stake ?? "0.1",
    best_of: match.best_of ?? 5,
    wins1: match.wins1 ?? 0,
    wins2: match.wins2 ?? 0,
  };
  const roundRows = (rounds ?? []).map((r) => ({
    round_number: r.round_number,
    phase: r.phase as "commit" | "reveal" | "done",
    commit1: null,
    commit2: null,
    move1: r.move1,
    move2: r.move2,
    result: r.result,
    commit_deadline: null,
    reveal_deadline: null,
  }));
  const matchResult = buildMatchResult(matchRow, roundRows);
  return { matchResult };
}

/** Emit settled event. Call when on-chain settle is detected. */
export function emitSettled(io: Server, matchId: string, txHash?: string): void {
  io.to(getRoom(matchId)).emit("settled", {
    status: "finished",
    ...(txHash && { txHash }),
  });
}

export function setupSocketHandlers(io: Server) {
  io.use(async (socket, next) => {
    const auth = getAuth(socket);
    if (!auth.apiKey?.trim()) {
      return next(new Error("Missing apiKey in handshake auth"));
    }
    const valid = await requireAuth(auth.apiKey);
    if (!valid) {
      return next(new Error("Invalid API key"));
    }
    next();
  });

  io.on("connection", (socket) => {
    const auth = getAuth(socket);
    const address = auth.address?.trim();

    socket.on("join_queue", async (data: { tier?: number; address?: string }) => {
      const addr = (data?.address ?? address)?.toLowerCase();
      if (!addr || !isAddress(addr)) {
        emitError(socket, "BAD_REQUEST", "Invalid or missing address");
        return;
      }
      const tier = data?.tier ?? 0.1;
      const result = await joinQueue(tier, addr);
      if (!result) {
        emitError(socket, "MATCHMAKING_ERROR", "Failed to join queue");
        return;
      }
      socket.emit("match_found", {
        matchId: result.matchId,
        role: result.role,
        stake: result.stake,
        matchIdBytes32: result.matchIdBytes32,
      });
      socket.join(getRoom(result.matchId));
    });

    socket.on(
      "commit",
      async (data: { matchId: string; round: number; commitHash: string; address?: string }) => {
        const addr = (data?.address ?? address)?.toLowerCase();
        if (!addr || !isAddress(addr)) {
          emitError(socket, "BAD_REQUEST", "Invalid or missing address");
          return;
        }
        const { matchId, round: roundNumber, commitHash } = data;
        if (!matchId || !roundNumber || !commitHash) {
          emitError(socket, "BAD_REQUEST", "Missing matchId, round, or commitHash");
          return;
        }
        if (!/^0x[0-9a-fA-F]{64}$/.test(commitHash)) {
          emitError(socket, "BAD_REQUEST", "Invalid commitHash (0x + 64 hex)");
          return;
        }

        const { data: match, error: matchErr } = await supabase
          .from("matches")
          .select("id, status, player1_address, player2_address, best_of")
          .eq("id", matchId)
          .single();

        if (matchErr || !match) {
          emitError(socket, "NOT_FOUND", "Match not found");
          return;
        }
        if (
          match.player1_address?.toLowerCase() !== addr &&
          match.player2_address?.toLowerCase() !== addr
        ) {
          emitError(socket, "FORBIDDEN", "Not a player");
          return;
        }
        if (match.status !== "in_progress") {
          emitError(socket, "INVALID_STATE", "Match not in progress");
          return;
        }

        const isPlayer1 = match.player1_address?.toLowerCase() === addr;
        const commitField = isPlayer1 ? "commit1" : "commit2";
        const commitHexField = isPlayer1 ? "commit1_hex" : "commit2_hex";

        const { data: round } = await supabase
          .from("match_rounds")
          .select("id, phase, commit1, commit2, commit1_hex, commit2_hex, commit_deadline")
          .eq("match_id", matchId)
          .eq("round_number", roundNumber)
          .single();

        if (round) {
          if (round.phase !== "commit") {
            emitError(socket, "INVALID_PHASE", "Round not in commit phase; only commit when phase=commit");
            return;
          }
          const alreadyCommitted =
            (round[commitHexField] && /^0x[0-9a-fA-F]{64}$/.test(round[commitHexField] as string)) ||
            round[commitField];
          if (alreadyCommitted) {
            emitError(socket, "ALREADY_COMMITTED", "You have already committed for this round");
            return;
          }
        }

        const byteaHex = "\\x" + commitHash.slice(2);
        const useDeadline = round?.commit_deadline
          ? round.commit_deadline
          : new Date(Date.now() + 30_000).toISOString();

        if (round) {
          await supabase
            .from("match_rounds")
            .update({
              [commitHexField]: commitHash,
              [commitField]: byteaHex,
              updated_at: new Date().toISOString(),
            })
            .eq("id", round.id);
        } else {
          await supabase.from("match_rounds").insert({
            match_id: matchId,
            round_number: roundNumber,
            [commitHexField]: commitHash,
            [commitField]: byteaHex,
            phase: "commit",
            commit_deadline: useDeadline,
          });
        }

        await supabase.from("match_actions").insert({
          match_id: matchId,
          player_address: addr,
          agent_name: `Agent-${addr.slice(0, 8)}`,
          action: "commit",
          payload: { roundNumber, commitHash: "0x..." },
        });

        const { becameReadyToSettle } = await reconcileRounds(matchId);
        if (becameReadyToSettle) {
          const rts = await buildReadyToSettlePayload(matchId);
          if (rts?.matchResult)
            io.to(getRoom(matchId)).emit("ready_to_settle", { matchResult: rts.matchResult });
        }
        const payload = await buildStatePayload(matchId, addr);
        if (payload) {
          io.to(getRoom(matchId)).emit("state", payload);
        }
      }
    );

    socket.on(
      "reveal",
      async (data: { matchId: string; round: number; move: number; salt: string; address?: string }) => {
        const addr = (data?.address ?? address)?.toLowerCase();
        if (!addr || !isAddress(addr)) {
          emitError(socket, "BAD_REQUEST", "Invalid or missing address");
          return;
        }
        const { matchId, round: roundNumber, move, salt } = data;
        if (!matchId || !roundNumber || move == null || !salt) {
          emitError(socket, "BAD_REQUEST", "Missing matchId, round, move, or salt");
          return;
        }
        if (!isValidMove(move)) {
          emitError(socket, "BAD_REQUEST", "Move must be 1, 2, or 3");
          return;
        }

        const { data: match, error: matchErr } = await supabase
          .from("matches")
          .select("id, status, stake, best_of, player1_address, player2_address, wins1, wins2")
          .eq("id", matchId)
          .single();

        if (matchErr || !match) {
          emitError(socket, "NOT_FOUND", "Match not found");
          return;
        }
        if (
          match.player1_address?.toLowerCase() !== addr &&
          match.player2_address?.toLowerCase() !== addr
        ) {
          emitError(socket, "FORBIDDEN", "Not a player");
          return;
        }

        const { data: round, error: roundErr } = await supabase
          .from("match_rounds")
          .select("id, phase, commit1, commit2, commit1_hex, commit2_hex, move1, move2")
          .eq("match_id", matchId)
          .eq("round_number", roundNumber)
          .single();

        if (roundErr || !round) {
          emitError(socket, "NOT_FOUND", "Round not found");
          return;
        }
        if (round.phase !== "commit" && round.phase !== "reveal") {
          emitError(socket, "INVALID_PHASE", "Round not in commit/reveal");
          return;
        }

        const isPlayer1 = match.player1_address?.toLowerCase() === addr;
        const moveField = isPlayer1 ? "move1" : "move2";
        const commitHexField = isPlayer1 ? "commit1_hex" : "commit2_hex";

        let storedHex =
          round[commitHexField] && /^0x[0-9a-fA-F]{64}$/.test(round[commitHexField])
            ? round[commitHexField]
            : byteaToHex(isPlayer1 ? round.commit1 : round.commit2);
        if (!storedHex || storedHex.length !== 66) {
          emitError(socket, "INVALID_COMMIT", "Stored commit invalid");
          return;
        }

        if (round[moveField] != null) {
          emitError(socket, "ALREADY_REVEALED", "Already revealed");
          return;
        }

        const saltClean = salt.startsWith("0x") ? salt.slice(2) : salt;
        if (saltClean.length !== 64) {
          emitError(socket, "BAD_REQUEST", "Salt must be 32 bytes (64 hex)");
          return;
        }

        const moveBytes = new Uint8Array([move]);
        const saltBytes = Buffer.from(saltClean, "hex");
        const combined = new Uint8Array(moveBytes.length + saltBytes.length);
        combined.set(moveBytes);
        combined.set(saltBytes, moveBytes.length);
        const computed = keccak256(combined).toLowerCase();
        const stored = storedHex.toLowerCase();
        if (computed !== stored) {
          emitError(socket, "INVALID_REVEAL", "Reveal does not match commit");
          return;
        }

        await supabase
          .from("match_rounds")
          .update({
            [moveField]: move,
            updated_at: new Date().toISOString(),
          })
          .eq("id", round.id);

        const { data: updated } = await supabase
          .from("match_rounds")
          .select("move1, move2")
          .eq("id", round.id)
          .single();

        if (updated?.move1 != null && updated?.move2 != null) {
          const result = getRoundResult(updated.move1, updated.move2);
          const newWins1 = (match.wins1 ?? 0) + (result === 1 ? 1 : 0);
          const newWins2 = (match.wins2 ?? 0) + (result === -1 ? 1 : 0);

          await supabase
            .from("match_rounds")
            .update({ result, phase: "done", updated_at: new Date().toISOString() })
            .eq("id", round.id);

          await supabase
            .from("matches")
            .update({
              wins1: newWins1,
              wins2: newWins2,
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchId);

          const neededWins = Math.ceil(match.best_of / 2);
          if (newWins1 >= neededWins || newWins2 >= neededWins) {
            const winner =
              newWins1 >= neededWins ? match.player1_address : match.player2_address;
            await supabase
              .from("matches")
              .update({
                status: "ready_to_settle",
                winner_address: winner,
                updated_at: new Date().toISOString(),
              })
              .eq("id", matchId);

            const { data: m2 } = await supabase
              .from("matches")
              .select("winner_address")
              .eq("id", matchId)
              .single();
            const { data: rds } = await supabase
              .from("match_rounds")
              .select("round_number, phase, move1, move2, result")
              .eq("match_id", matchId)
              .order("round_number", { ascending: true });
            const matchRow = {
              ...match,
              stake: match.stake ?? "0.1",
              status: "ready_to_settle" as const,
              wins1: newWins1,
              wins2: newWins2,
              winner_address: m2?.winner_address ?? winner,
            };
            const roundRows = (rds ?? []).map((r) => ({
              round_number: r.round_number,
              phase: r.phase as "commit" | "reveal" | "done",
              commit1: null,
              commit2: null,
              move1: r.move1,
              move2: r.move2,
              result: r.result,
              commit_deadline: null,
              reveal_deadline: null,
            }));
            const matchResult = buildMatchResult(matchRow, roundRows);
            io.to(getRoom(matchId)).emit("ready_to_settle", { matchResult });
          }
        }

        const { becameReadyToSettle } = await reconcileRounds(matchId);
        if (becameReadyToSettle) {
          const rts = await buildReadyToSettlePayload(matchId);
          if (rts?.matchResult)
            io.to(getRoom(matchId)).emit("ready_to_settle", { matchResult: rts.matchResult });
        }
        const payload = await buildStatePayload(matchId, addr);
        if (payload) io.to(getRoom(matchId)).emit("state", payload);
      }
    );

    socket.on(
      "finalize",
      async (data: { matchId: string; signature: string; address?: string }) => {
        const addr = (data?.address ?? address)?.toLowerCase();
        if (!addr || !isAddress(addr)) {
          emitError(socket, "BAD_REQUEST", "Invalid or missing address");
          return;
        }
        const { matchId, signature } = data;
        if (!matchId || !signature) {
          emitError(socket, "BAD_REQUEST", "Missing matchId or signature");
          return;
        }
        if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
          emitError(socket, "BAD_REQUEST", "Invalid signature (0x + 130 hex)");
          return;
        }

        const { data: match, error: matchErr } = await supabase
          .from("matches")
          .select(
            "id, status, stake, best_of, player1_address, player2_address, wins1, wins2, winner_address, sig1, sig2"
          )
          .eq("id", matchId)
          .single();

        if (matchErr || !match) {
          emitError(socket, "NOT_FOUND", "Match not found");
          return;
        }
        if (
          match.player1_address?.toLowerCase() !== addr &&
          match.player2_address?.toLowerCase() !== addr
        ) {
          emitError(socket, "FORBIDDEN", "Not a player");
          return;
        }
        if (match.status !== "ready_to_settle" && match.status !== "finished") {
          emitError(socket, "INVALID_STATE", "Match not ready to settle");
          return;
        }

        const { data: rounds } = await supabase
          .from("match_rounds")
          .select("round_number, phase, move1, move2, result")
          .eq("match_id", matchId)
          .order("round_number", { ascending: true });

        const matchRow = {
          id: match.id,
          status: match.status,
          stake: match.stake ?? "0.1",
          best_of: match.best_of ?? 5,
          player1_address: match.player1_address,
          player2_address: match.player2_address,
          wins1: match.wins1 ?? 0,
          wins2: match.wins2 ?? 0,
          winner_address: match.winner_address,
          sig1: match.sig1,
          sig2: match.sig2,
        };
        const roundRows = (rounds ?? []).map((r) => ({
          round_number: r.round_number,
          phase: r.phase as "commit" | "reveal" | "done",
          commit1: null,
          commit2: null,
          move1: r.move1,
          move2: r.move2,
          result: r.result,
          commit_deadline: null,
          reveal_deadline: null,
        }));
        const matchResult = buildMatchResult(matchRow, roundRows);

        const isPlayer1 = match.player1_address?.toLowerCase() === addr;
        const expectedSigner = isPlayer1 ? match.player1_address : match.player2_address;
        const valid = await verifyMatchResultSignature(
          signature as `0x${string}`,
          matchResult,
          expectedSigner
        );
        if (!valid) {
          emitError(socket, "INVALID_SIGNATURE", "Signer does not match player");
          return;
        }

        const sigField = isPlayer1 ? "sig1" : "sig2";
        await supabase
          .from("matches")
          .update({
            [sigField]: signature,
            updated_at: new Date().toISOString(),
          })
          .eq("id", matchId);

        const { data: updated } = await supabase
          .from("matches")
          .select("sig1, sig2")
          .eq("id", matchId)
          .single();

        const hasBoth = !!(updated?.sig1 && updated?.sig2);
        if (hasBoth) {
          io.to(getRoom(matchId)).emit("signatures_ready", {
            signatures: { sig1: updated!.sig1, sig2: updated!.sig2 },
            settleArgs: {
              matchResult,
              sig1: updated!.sig1,
              sig2: updated!.sig2,
            },
          });
        }

        const payload = await buildStatePayload(matchId, addr);
        if (payload) io.to(getRoom(matchId)).emit("state", payload);
      }
    );

    socket.on("resume", async (data: { matchId: string; address?: string }) => {
      const addr = (data?.address ?? address)?.toLowerCase();
      if (!addr || !isAddress(addr)) {
        emitError(socket, "BAD_REQUEST", "Invalid or missing address");
        return;
      }
      const matchId = data?.matchId;
      if (!matchId) {
        emitError(socket, "BAD_REQUEST", "Missing matchId");
        return;
      }
      socket.join(getRoom(matchId));
      const { becameReadyToSettle } = await reconcileRounds(matchId);
      if (becameReadyToSettle) {
        const rts = await buildReadyToSettlePayload(matchId);
        if (rts?.matchResult)
          io.to(getRoom(matchId)).emit("ready_to_settle", { matchResult: rts.matchResult });
      }
      const payload = await buildStatePayload(matchId, addr);
      if (payload) socket.emit("state", payload);
    });

    socket.on("stake_tx", async (data: { matchId: string; txHash: string; address?: string }) => {
      const addr = (data?.address ?? address)?.toLowerCase();
      if (!addr || !isAddress(addr)) return;
      const { matchId, txHash } = data ?? {};
      if (!matchId || !txHash) return;

      await supabase.from("match_actions").insert({
        match_id: matchId,
        player_address: addr,
        agent_name: `Agent-${addr.slice(0, 8)}`,
        action: "stake_tx",
        payload: { txHash },
      });
    });
  });
}
