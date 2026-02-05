import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth } from "@/app/api/_lib/moltArenaAuth";

const GHOSTGRAPH_URL = process.env.GHOSTGRAPH_URL;
const GHOSTGRAPH_API_KEY = process.env.GHOSTGRAPH_API_KEY;

export async function GET(req: NextRequest) {
  try {
    requireMoltbookAuth(req);
  } catch (err) {
    if (err instanceof Response) throw err;
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED", message: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!GHOSTGRAPH_URL || !GHOSTGRAPH_API_KEY) {
    return NextResponse.json(
      {
        success: false,
        error: "CONFIG_ERROR",
        message: "GhostGraph environment variables are not set.",
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing ?address=0x... query parameter.",
      },
      { status: 400 },
    );
  }

  const query = `
    query PlayerGames($id: ID!) {
      games(
        where: { OR: [{ player1: $id }, { player2: $id }] }
        orderBy: "finishedAt"
        orderDirection: "desc"
        limit: 50
      ) {
        items {
          matchId
          player1
          player2
          winner
          wager
          finishedAt
        }
      }
    }
  `;

  const res = await fetch(GHOSTGRAPH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-GHOST-KEY": GHOSTGRAPH_API_KEY,
    },
    body: JSON.stringify({ query, variables: { id: address } }),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "GHOSTGRAPH_ERROR",
        message: "Failed to fetch match history from GhostGraph.",
      },
      { status: 500 },
    );
  }

  const json = await res.json();
  const items = json?.data?.games?.items ?? [];

  const lowerAddress = address.toLowerCase();

  const history = items.map((g: any) => {
    const youArePlayer1 = g.player1.toLowerCase() === lowerAddress;
    const opponent = youArePlayer1 ? g.player2 : g.player1;

    let result: "win" | "loss" | "draw" = "draw";
    if (g.winner) {
      const winnerLower = String(g.winner).toLowerCase();
      if (winnerLower === lowerAddress) result = "win";
      else result = "loss";
    }

    const wager = Number(g.wager ?? 0);
    let profitLoss = 0;
    if (result === "win") profitLoss = wager;
    else if (result === "loss") profitLoss = -wager;

    const finishedAtMs =
      typeof g.finishedAt === "number"
        ? g.finishedAt
        : g.finishedAt
          ? Date.parse(g.finishedAt)
          : Date.now();

    return {
      matchId: String(g.matchId),
      opponent,
      result,
      wager,
      profitLoss,
      finishedAt: finishedAtMs,
      txHash: g.txHash ?? null,
    };
  });

  return NextResponse.json({
    success: true,
    address,
    count: history.length,
    history,
  });
}

