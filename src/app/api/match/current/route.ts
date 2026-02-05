import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth } from "@/app/api/_lib/moltArenaAuth";
import {
  publicClient,
  RPS_ARENA_ADDRESS,
  RPS_ARENA_ABI,
} from "@/app/api/_lib/monadClient";

export async function GET(req: NextRequest) {
  // Auth is mainly for rate limiting and per-agent stats later.
  try {
    requireMoltbookAuth(req);
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const matchIdStr = searchParams.get("matchId");
  const playerAddr = searchParams.get("player") ?? undefined;

  if (!matchIdStr) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing 'matchId' query parameter.",
      },
      { status: 400 },
    );
  }

  let matchId: bigint;
  try {
    matchId = BigInt(matchIdStr);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message:
          "Invalid 'matchId'. Use the on-chain matchId as a decimal string.",
      },
      { status: 400 },
    );
  }

  try {
    const match = await publicClient.readContract({
      address: RPS_ARENA_ADDRESS,
      abi: RPS_ARENA_ABI,
      functionName: "getMatch",
      args: [matchId],
    });

    const [
      player1,
      player2,
      wager,
      roundsPlayed,
      wins1,
      wins2,
      status,
      settled,
    ] = match as readonly [
      string,
      string,
      bigint,
      number,
      number,
      number,
      number,
      boolean,
    ];

    if (player1 === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json(
        {
          success: false,
          error: "NOT_FOUND",
          message: "Match not found on-chain.",
        },
        { status: 404 },
      );
    }

    // Read rounds to determine current phase and next action.
    const rounds = [];
    for (let r = 1; r <= 5; r++) {
      // eslint-disable-next-line no-await-in-loop
      const round = await publicClient.readContract({
        address: RPS_ARENA_ADDRESS,
        abi: RPS_ARENA_ABI,
        functionName: "rounds",
        args: [matchId, r],
      });

      const [
        commit1,
        commit2,
        move1,
        move2,
        commitDeadline,
        revealDeadline,
        revealed1,
        revealed2,
        decided,
      ] = round as readonly [
        `0x${string}`,
        `0x${string}`,
        number,
        number,
        bigint,
        bigint,
        boolean,
        boolean,
        boolean,
      ];

      rounds.push({
        round: r,
        commit1,
        commit2,
        move1,
        move2,
        commitDeadline: Number(commitDeadline),
        revealDeadline: Number(revealDeadline),
        revealed1,
        revealed2,
        decided,
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);

    let phase:
      | "finished"
      | "waiting_commit"
      | "waiting_reveal"
      | "waiting_next_round" = "waiting_next_round";
    let currentRound = 0;
    let timeRemainingMs: number | null = null;

    if (settled || status === 2 /* MatchStatus.Finished */) {
      phase = "finished";
    } else {
      // Find first undecided round
      const undecided = rounds.find((r) => !r.decided);
      if (!undecided) {
        phase = "finished";
      } else {
        currentRound = undecided.round;
        const r = undecided;

        const hasCommit1 = r.commit1 !== "0x0000000000000000000000000000000000000000000000000000000000000000";
        const hasCommit2 = r.commit2 !== "0x0000000000000000000000000000000000000000000000000000000000000000";

        if (!hasCommit1 || !hasCommit2) {
          phase = "waiting_commit";
          if (r.commitDeadline > 0) {
            timeRemainingMs = Math.max(0, (r.commitDeadline - nowSec) * 1000);
          }
        } else if (!r.revealed1 || !r.revealed2) {
          phase = "waiting_reveal";
          if (r.revealDeadline > 0) {
            timeRemainingMs = Math.max(0, (r.revealDeadline - nowSec) * 1000);
          }
        } else {
          phase = "waiting_next_round";
        }
      }
    }

    let role: "player1" | "player2" | "unknown" = "unknown";
    if (playerAddr) {
      const lower = playerAddr.toLowerCase();
      if (lower === player1.toLowerCase()) role = "player1";
      else if (lower === player2.toLowerCase()) role = "player2";
    }

    const you =
      role === "player1"
        ? { address: player1, wins: wins1 }
        : role === "player2"
          ? { address: player2, wins: wins2 }
          : null;

    const opponent =
      role === "player1"
        ? { address: player2, wins: wins2 }
        : role === "player2"
          ? { address: player1, wins: wins1 }
          : null;

    let should:
      | "commit"
      | "reveal"
      | "wait"
      | "claim_timeout_commit"
      | "claim_timeout_reveal"
      | null = null;

    if (phase === "waiting_commit") {
      should = "commit";
    } else if (phase === "waiting_reveal") {
      should = "reveal";
    } else if (phase === "finished") {
      should = "wait";
    }

    return NextResponse.json({
      success: true,
      matchId: matchIdStr,
      phase,
      currentRound,
      timeRemainingMs,
      role,
      you,
      opponent,
      match: {
        player1,
        player2,
        wager: wager.toString(),
        roundsPlayed,
        wins1,
        wins2,
        status,
        settled,
      },
      actionHint: {
        should,
        allowedMoves: ["rock", "paper", "scissors"],
      },
    });
  } catch (error) {
    console.error("MoltArena match/current error", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to read match state from chain.",
      },
      { status: 500 },
    );
  }
}

