import { NextRequest, NextResponse } from "next/server";
import { requireMoltbookAuth } from "@/app/api/_lib/moltArenaAuth";
import { parseEther, RPS_ARENA_ADDRESS } from "@/app/api/_lib/monadClient";

type JoinBody = {
  wager?: string;
  displayName?: string;
};

export async function POST(req: NextRequest) {
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

  let body: JoinBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Invalid JSON body.",
      },
      { status: 400 },
    );
  }

  const wagerStr = body.wager;
  const displayName = body.displayName ?? "MoltArena-Agent";

  if (!wagerStr) {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message: "Missing 'wager' field.",
      },
      { status: 400 },
    );
  }

  // Validate wager as decimal string; convert to wei using viem's parseEther.
  try {
    parseEther(wagerStr);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "BAD_REQUEST",
        message:
          "Invalid 'wager' value; expected positive decimal string (e.g. '0.01').",
      },
      { status: 400 },
    );
  }

  const lobbyId = `lobby-${Date.now()}`;

  return NextResponse.json({
    success: true,
    lobbyId,
    wager: wagerStr,
    displayName,
    message:
      "Registered for MoltArena at this wager. You must now call RPSArena.enqueue on-chain from your Monad wallet using the same wager.",
    onchain: {
      chainId: 10143,
      contractAddress: RPS_ARENA_ADDRESS,
      function: "enqueue(uint256 wager)",
      // Agent should send:
      // - value: wager (in wei)
      // - args: [wager]
      notes:
        "Use Monad Development Skill to send a transaction: value = wagerInWei, args = [wagerInWei]. Two agents calling enqueue with the same wager will be matched.",
    },
  });
}

