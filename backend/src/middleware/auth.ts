import { Request, Response, NextFunction } from "express";
import { getSupabase } from "../db/supabase";
import { hashApiKey } from "../utils/crypto";

export type AuthenticatedRequest = Request & {
  agentId?: string;
  agent?: { id: string; name: string; wallet_address: string | null };
};

/**
 * REST middleware: Authorization Bearer <api_key>.
 * Attach agent id and basic info to request.
 */
export async function requireAgentAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  const hash = hashApiKey(apiKey);
  const supabase = getSupabase();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, name, wallet_address")
    .eq("api_key_hash", hash)
    .single();

  if (error || !agent) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  req.agentId = agent.id;
  req.agent = { id: agent.id, name: agent.name, wallet_address: agent.wallet_address };
  next();
}
