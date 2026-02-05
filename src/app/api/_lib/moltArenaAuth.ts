import { NextRequest } from "next/server";

const AUTH_HEADER = "authorization";

export type AuthedAgent = {
  moltbookApiKey: string;
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

