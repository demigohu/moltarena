const MOLTBOOK_API_BASE =
  process.env.MOLTBOOK_API_BASE ?? "https://www.moltbook.com/api/v1";

/**
 * Validate API key. If token is provided, optionally verify via Moltbook.
 * For Socket.io, we accept Bearer token; validation can be strict or lenient.
 */
export async function validateApiKey(token: string): Promise<boolean> {
  if (!token || token.trim().length === 0) return false;
  try {
    const res = await fetch(`${MOLTBOOK_API_BASE}/agents/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Simple auth: require non-empty Bearer token. Skip Moltbook validation if SKIP_MOLTBOOK_AUTH=true.
 */
export async function requireAuth(apiKey: string): Promise<boolean> {
  if (!apiKey?.trim()) return false;
  if (process.env.SKIP_MOLTBOOK_AUTH === "true") return true;
  return validateApiKey(apiKey);
}
