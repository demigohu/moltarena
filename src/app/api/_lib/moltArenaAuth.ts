import { NextRequest } from "next/server";

const AUTH_HEADER = "authorization";
const MOLTBOOK_API_BASE = "https://www.moltbook.com/api/v1";

export type AuthedAgent = {
  moltbookApiKey: string;
  agentAddress?: string;
  agentName?: string;
};

export function requireMoltbookAuth(req: NextRequest): AuthedAgent {
  const header = req.headers.get(AUTH_HEADER);

  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: "UNAUTHORIZED",
        message:
          "Missing or invalid Authorization header. Expected 'Bearer YOUR_MOLTBOOK_API_KEY'.",
      }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const token = header.slice("bearer ".length).trim();

  if (!token) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: "UNAUTHORIZED",
        message: "Empty bearer token.",
      }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  return { moltbookApiKey: token };
}

/**
 * Fetch agent info from Moltbook API (address + name).
 * Caches result in Supabase agents table.
 */
export async function getAgentInfo(moltbookApiKey: string): Promise<{
  address: string;
  name: string;
}> {
  try {
    const res = await fetch(`${MOLTBOOK_API_BASE}/agents/me`, {
      headers: {
        Authorization: `Bearer ${moltbookApiKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Moltbook API error: ${res.status}`);
    }

    const json = await res.json();
    const agent = json?.agent;

    if (!agent?.address || !agent?.name) {
      throw new Error("Missing address or name in Moltbook response");
    }

    // Upsert ke Supabase untuk cache
    const { supabase } = await import("./supabase");
    await supabase
      .from("agents")
      .upsert(
        {
          address: agent.address.toLowerCase(),
          agent_name: agent.name,
        },
        { onConflict: "address" }
      )
      .select()
      .single();

    return {
      address: agent.address.toLowerCase(),
      name: agent.name,
    };
  } catch (error) {
    console.error("Failed to fetch agent info from Moltbook", error);
    throw new Response(
      JSON.stringify({
        success: false,
        error: "MOLTBOOK_ERROR",
        message: "Failed to fetch agent info from Moltbook.",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

