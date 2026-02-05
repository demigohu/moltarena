import { NextRequest, NextResponse } from "next/server";
import {
  publicClient,
  RPS_ARENA_ADDRESS,
  RPS_ARENA_ABI,
} from "@/app/api/_lib/monadClient";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  let matchId: bigint;
  try {
    matchId = BigInt(id);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message:
          "Invalid match id. Use the on-chain matchId as a decimal string.",
      },
      { status: 400 },
    );
  }

  try {
    // Read basic match info
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

    // Read per-round info (1..5)
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

    return NextResponse.json({
      success: true,
      matchId: id,
      onchain: {
        contract: RPS_ARENA_ADDRESS,
      },
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
      rounds,
    });
  } catch (error) {
    console.error("MoltArena match detail error", error);
    return NextResponse.json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to read match from chain.",
      },
      { status: 500 },
    );
  }
}

