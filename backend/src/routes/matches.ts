import { Router, Request, Response } from "express";
import { getSupabase } from "../db/supabase";

const router = Router();

const VALID_STATUSES = ["waiting_deposits", "playing", "settled", "cancelled"] as const;

/**
 * GET /matches
 * List matches. Query: ?status=playing|waiting_deposits|settled|cancelled (optional), ?limit=20
 */
router.get("/", async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const limit = Math.min(parseInt(String(req.query.limit), 10) || 20, 100);

  const supabase = getSupabase();
  let query = supabase
    .from("matches")
    .select("id, agent1_id, agent2_id, status, wager_tier, wager_amount, agent1_wins, agent2_wins, winner_agent_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    query = query.eq("status", status);
  }

  const { data: matches, error } = await query;

  if (error) {
    res.status(500).json({ error: "Failed to fetch matches" });
    return;
  }

  const list = matches ?? [];
  if (list.length === 0) {
    res.json(list);
    return;
  }

  const agentIds = new Set<string>();
  for (const m of list) {
    agentIds.add(m.agent1_id);
    agentIds.add(m.agent2_id);
  }
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .in("id", Array.from(agentIds));
  const nameById = new Map((agents ?? []).map((a) => [a.id, a.name as string]));

  const withNames = list.map((m) => ({
    ...m,
    agent1_name: nameById.get(m.agent1_id) ?? null,
    agent2_name: nameById.get(m.agent2_id) ?? null,
  }));

  res.json(withNames);
});

/**
 * GET /matches/:id
 * Verifikasi hasil match: wager, winner, rounds, tx hashes (read-only).
 */
router.get("/:id", async (req: Request, res: Response) => {
  const matchId = req.params.id?.trim();
  if (!matchId) {
    res.status(400).json({ error: "Match id required" });
    return;
  }

  const supabase = getSupabase();
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select(
      "id, agent1_id, agent2_id, status, wager_tier, wager_amount, best_of, agent1_wins, agent2_wins, winner_agent_id, forfeit_agent_id, agent1_deposit_tx_hash, agent2_deposit_tx_hash, payout_tx_hash, created_at"
    )
    .eq("id", matchId)
    .single();

  if (matchError || !match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  const { data: rounds } = await supabase
    .from("rounds")
    .select("round_index, choice_agent1, choice_agent2, winner_agent_id")
    .eq("match_id", matchId)
    .order("round_index", { ascending: true });

  const { data: agents } = await supabase
    .from("agents")
    .select("id, name")
    .in("id", [match.agent1_id, match.agent2_id]);
  const agentById = new Map((agents ?? []).map((a) => [a.id, a.name as string]));
  const agent1_name = agentById.get(match.agent1_id) ?? null;
  const agent2_name = agentById.get(match.agent2_id) ?? null;

  res.json({
    id: match.id,
    agent1_id: match.agent1_id,
    agent2_id: match.agent2_id,
    agent1_name,
    agent2_name,
    status: match.status,
    wager_tier: match.wager_tier,
    wager_amount: match.wager_amount,
    best_of: match.best_of,
    agent1_wins: match.agent1_wins,
    agent2_wins: match.agent2_wins,
    winner_agent_id: match.winner_agent_id,
    forfeit_agent_id: match.forfeit_agent_id,
    agent1_deposit_tx_hash: match.agent1_deposit_tx_hash,
    agent2_deposit_tx_hash: match.agent2_deposit_tx_hash,
    payout_tx_hash: match.payout_tx_hash,
    rounds: rounds ?? [],
    created_at: match.created_at,
  });
});

export default router;
