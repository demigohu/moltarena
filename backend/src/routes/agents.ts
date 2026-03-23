import { Router, Response } from "express";
import { getSupabase } from "../db/supabase";
import { generateApiKey, hashApiKey } from "../utils/crypto";
import { requireAgentAuth, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

/**
 * POST /agents/register
 * Body: { name, ai_model?, wallet_address?, webhook_url? }
 * Returns: { agent_id, api_key } — simpan api_key, tidak bisa diambil lagi.
 */
router.post("/register", async (req, res: Response) => {
  const { name, ai_model, wallet_address, webhook_url } = req.body as {
    name?: string;
    ai_model?: string;
    wallet_address?: string;
    webhook_url?: string;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("agents")
    .insert({
      name: name.trim(),
      api_key_hash: apiKeyHash,
      ai_model: ai_model?.trim() ?? null,
      wallet_address: wallet_address?.trim() ?? null,
      webhook_url: webhook_url?.trim() ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "Agent name already exists" });
      return;
    }
    res.status(500).json({ error: "Failed to register agent" });
    return;
  }

  res.status(201).json({
    agent_id: data.id,
    api_key: apiKey,
  });
});

/**
 * GET /agents/me
 * Header: Authorization: Bearer <api_key>
 * Returns: profile + wins, losses, win_rate, elo, total_wagered, total_won
 */
router.get("/me", requireAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.agentId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const supabase = getSupabase();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, name, ai_model, wallet_address, wins, losses, elo, total_wagered, total_won, created_at")
    .eq("id", req.agentId)
    .single();

  if (error || !agent) {
    res.status(500).json({ error: "Agent not found" });
    return;
  }

  const total = agent.wins + agent.losses;
  const win_rate = total > 0 ? agent.wins / total : 0;

  res.json({
    id: agent.id,
    name: agent.name,
    ai_model: agent.ai_model,
    wallet_address: agent.wallet_address,
    wins: agent.wins,
    losses: agent.losses,
    win_rate: Math.round(win_rate * 100) / 100,
    elo: agent.elo,
    total_wagered: agent.total_wagered,
    total_won: agent.total_won,
    created_at: agent.created_at,
  });
});

/**
 * GET /agents/me/matches
 * Riwayat match agent (read-only).
 */
router.get("/me/matches", requireAgentAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.agentId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const supabase = getSupabase();
  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, agent1_id, agent2_id, status, wager_amount, agent1_wins, agent2_wins, winner_agent_id, created_at")
    .or(`agent1_id.eq.${req.agentId},agent2_id.eq.${req.agentId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    res.status(500).json({ error: "Failed to fetch matches" });
    return;
  }

  res.json(matches ?? []);
});

export default router;
