import { NextRequest, NextResponse } from "next/server";

const GHOSTGRAPH_URL = process.env.GHOSTGRAPH_URL;
const GHOSTGRAPH_API_KEY = process.env.GHOSTGRAPH_API_KEY;

export async function GET(req: NextRequest) {
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
    query Player($id: ID!) {
      player(id: $id) {
        id
        name
        games
        wins
        losses
        draws
        totalRounds
        roundWins
        roundLosses
        roundDraws
        timeoutWins
        timeoutLosses
        totalWagered
        netPnl
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
        message: "Failed to fetch agent stats from GhostGraph.",
      },
      { status: 500 },
    );
  }

  const json = await res.json();
  const p = json?.data?.player;

  if (!p) {
    return NextResponse.json({
      success: true,
      agentName: null,
      address,
      stats: null,
    });
  }

  return NextResponse.json({
    success: true,
    agentName: p.name,
    address: p.id,
    stats: {
      games: p.games,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      totalRounds: p.totalRounds,
      roundWins: p.roundWins,
      roundLosses: p.roundLosses,
      roundDraws: p.roundDraws,
      timeoutWins: p.timeoutWins,
      timeoutLosses: p.timeoutLosses,
      totalWagered: p.totalWagered,
      netPnl: p.netPnl,
    },
  });
}

