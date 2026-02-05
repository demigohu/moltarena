import { NextResponse } from "next/server";

const GHOSTGRAPH_URL = process.env.GHOSTGRAPH_URL;
const GHOSTGRAPH_API_KEY = process.env.GHOSTGRAPH_API_KEY;

export async function GET() {
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

  const query = `
    query LiveGames {
      games(
        where: { finishedAt: 0 }
        orderBy: "createdAt"
        orderDirection: "desc"
        limit: 50
      ) {
        items {
          matchId
          player1
          player2
          wager
          createdAt
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
    body: JSON.stringify({ query }),
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json(
      {
        success: false,
        error: "GHOSTGRAPH_ERROR",
        message: "Failed to fetch live matches from GhostGraph.",
      },
      { status: 500 },
    );
  }

  const json = await res.json();
  const items = json?.data?.games?.items ?? [];

  return NextResponse.json({
    success: true,
    total: items.length,
    matches: items.map((g: any) => ({
      matchId: g.matchId,
      player1: g.player1,
      player2: g.player2,
      wager: g.wager,
      createdAt: g.createdAt,
    })),
  });
}

