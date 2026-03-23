import { Router, Request, Response } from "express";
import { getSupabase } from "../db/supabase";

const router = Router();

/**
 * GET /leaderboard
 * Query: ?sort=elo|wins (default elo), ?limit=20
 */
router.get("/", async (req: Request, res: Response) => {
  const sort = (req.query.sort as string) === "wins" ? "wins" : "elo";
  const limit = Math.min(parseInt(String(req.query.limit), 10) || 20, 100);

  const supabase = getSupabase();
  const { data: agents, error } = await supabase
    .from("agents")
    .select("id, name, wins, losses, elo")
    .order(sort, { ascending: false })
    .limit(limit);

  if (error) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
    return;
  }

  const withWinRate = (agents ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    wins: a.wins,
    losses: a.losses,
    elo: a.elo,
    win_rate: a.wins + a.losses > 0 ? (a.wins / (a.wins + a.losses)) * 100 : 0,
  }));

  res.json(withWinRate);
});

export default router;
