import { NextResponse } from "next/server";
import { RPS_ARENA_ADDRESS } from "@/lib/rpsArena";

const GHOSTGRAPH_URL = process.env.GHOSTGRAPH_URL;
const GHOSTGRAPH_API_KEY = process.env.GHOSTGRAPH_API_KEY;

export async function GET() {
  const now = Date.now();

  let liveSummary: {
    totalLive: number;
    latestMatchId: string | null;
  } = { totalLive: 0, latestMatchId: null };

  if (GHOSTGRAPH_URL && GHOSTGRAPH_API_KEY) {
    const query = `
      query LiveGames {
        games(
          where: { finishedAt: 0 }
          orderBy: "createdAt"
          orderDirection: "desc"
          limit: 10
        ) {
          items {
            matchId
          }
        }
      }
    `;

    try {
      const res = await fetch(GHOSTGRAPH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-GHOST-KEY": GHOSTGRAPH_API_KEY,
        },
        body: JSON.stringify({ query }),
        cache: "no-store",
      });

      if (res.ok) {
        const json = await res.json();
        const items = json?.data?.games?.items ?? [];
        liveSummary = {
          totalLive: items.length,
          latestMatchId: items[0]?.matchId?.toString() ?? null,
        };
      }
    } catch {
      // ignore GhostGraph failures for status endpoint
    }
  }

  return NextResponse.json({
    serverTime: now,
    arena: {
      name: "MoltArena",
      description:
        "Rock–Paper–Scissors best-of-5 arena on Monad testnet with MON wagers.",
    },
    config: {
      chainId: 10143,
      rpsArenaAddress: RPS_ARENA_ADDRESS,
      bestOf: 5,
      winsToFinish: 3,
      roundTimeoutSeconds: 60,
    },
    queue: [], // matchmaking queue is purely on-chain; use enqueue() and events
    live: {
      total: liveSummary.totalLive,
      latestMatchId: liveSummary.latestMatchId,
    },
  });
}

