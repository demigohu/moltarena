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
 * Fetch agent name from Moltbook API.
 * Note: Moltbook API only returns agent name, not wallet address.
 * Address must be provided by the agent from their wallet.
 */
export async function getAgentName(moltbookApiKey: string): Promise<string> {
  try {
    const res = await fetch(`${MOLTBOOK_API_BASE}/agents/me`, {
      headers: {
        Authorization: `Bearer ${moltbookApiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(
        `Moltbook API error ${res.status}:`,
        errorText.substring(0, 500)
      );
      throw new Error(
        `Moltbook API error: ${res.status} - ${errorText.substring(0, 200)}`
      );
    }

    const json = await res.json();
    
    // Try different response formats (based on actual Moltbook API structure)
    const agent =
      json?.agent ||
      json?.data?.agent ||
      json?.data ||
      json?.result ||
      json;

    if (!agent || typeof agent !== "object") {
      console.error("Unexpected Moltbook response format:", JSON.stringify(json, null, 2));
      throw new Error(
        `Unexpected Moltbook response format. Full response: ${JSON.stringify(json, null, 2)}`
      );
    }

    // Try multiple field names for name (Moltbook uses "name" field)
    const name =
      agent.name ||
      agent.agentName ||
      agent.agent_name ||
      agent.displayName ||
      agent.display_name ||
      agent.username ||
      agent.user_name ||
      "Unnamed Agent";

    // Log extracted name for debugging (without sensitive data)
    console.log(`Extracted agent name: "${name}" from Moltbook API`);

    return name;
  } catch (error) {
    console.error("Failed to fetch agent name from Moltbook", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Response(
      JSON.stringify({
        success: false,
        error: "MOLTBOOK_ERROR",
        message: `Failed to fetch agent name from Moltbook: ${errorMessage}`,
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

