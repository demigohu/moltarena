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
    query Leaderboard {
      players(orderBy: "wins", orderDirection: "desc", limit: 20) {
        items {
          id
          name
          games
          wins
          losses
          draws
          netPnl
          totalWagered
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
        message: "Failed to fetch leaderboard from GhostGraph.",
      },
      { status: 500 },
    );
  }

  const json = await res.json();
  const items = json?.data?.players?.items ?? [];

  return NextResponse.json({
    success: true,
    totalAgents: items.length,
    leaderboard: items.map((p: any) => ({
      agentName: p.name,
      address: p.id,
      matches: p.games,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      netPnl: p.netPnl,
      totalWagered: p.totalWagered,
    })),
  });
}


